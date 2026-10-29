import crypto from "crypto";
import { promisify } from "util";
import type { Express, Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";
import { storage } from "./storage";
import { pool } from "./db";
import { inviteEmail, isEmailConfigured, resetEmail, sendEmail } from "./email";

export type Role = "super_admin" | "user";

// These accounts are always super admins. Their first password comes from
// SUPER_ADMIN_INITIAL_PASSWORD; they should change it from the Team page.
export const SUPER_ADMIN_EMAILS = [
  "renny@infinitymediala.com",
  "hunbal.codeavenir@gmail.com",
];

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: Role;
}

declare global {
  namespace Express {
    interface User extends SessionUser {}

    interface Request {
      user?: User | undefined;
    }
  }
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role === "super_admin" ? "super_admin" : "user",
  };
}

// ── Passwords (scrypt) ───────────────────────────────────────────────────────

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Invite / reset link tokens ───────────────────────────────────────────────

const INVITE_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL = 60 * 60 * 1000;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Stores only the hash; returns the raw token to put in the emailed link.
// Each new token replaces the previous one, so older links stop working.
async function createLinkToken(userId: string, ttlMs: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await storage.updateUser(userId, {
    resetTokenHash: sha256(token),
    resetTokenExpiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

async function findUserByLinkToken(token: string): Promise<User | null> {
  if (!token) return null;
  const user = await storage.getUserByResetTokenHash(sha256(token));
  if (!user?.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) return null;
  return user;
}

// Base URL for links in emails: APP_URL if set, otherwise the URL the request came in on.
function getAppUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

async function createInviteLink(req: Request, userId: string): Promise<string> {
  const token = await createLinkToken(userId, INVITE_TOKEN_TTL);
  return `${getAppUrl(req)}/reset-password?token=${token}`;
}

async function sendInvite(req: Request, userId: string, email: string): Promise<string> {
  const link = await createInviteLink(req, userId);
  const { subject, html } = inviteEmail(link);
  await sendEmail(email, subject, html);
  return link;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

// New session id on sign-in, so a session id set before login can't be reused.
function signIn(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return next();

  const user = await storage.getUser(userId);
  if (user) {
    req.user = toSessionUser(user);
  } else {
    delete req.session.userId;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Not signed in" });
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin") return res.status(403).json({ message: "Super admin only" });
  next();
}

// ── Table setup ──────────────────────────────────────────────────────────────

// Creates the auth tables on startup so a deploy works without a manual db:push.
// Must match shared/schema.ts exactly, so a later db:push finds nothing to change.
export async function ensureAuthTables(): Promise<void> {
  // The original template's users table (username/password) was never used.
  const legacy = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'`,
  );
  if (legacy.rowCount) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users`);
    if (rows[0].n > 0) throw new Error("Legacy users table has rows; migrate it by hand before starting");
    await pool.query(`DROP TABLE users`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid" varchar PRIMARY KEY NOT NULL,
      "sess" jsonb NOT NULL,
      "expire" timestamp (6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
    CREATE TABLE IF NOT EXISTS "users" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "email" varchar,
      "first_name" varchar,
      "last_name" varchar,
      "password_hash" varchar,
      "role" varchar DEFAULT 'user' NOT NULL,
      "reset_token_hash" varchar,
      "reset_token_expires_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "users_email_unique" UNIQUE("email")
    );
  `);
}

// ── Super admin seeding ──────────────────────────────────────────────────────

export async function ensureSuperAdmins(): Promise<void> {
  const initialPassword = process.env.SUPER_ADMIN_INITIAL_PASSWORD;

  for (const email of SUPER_ADMIN_EMAILS) {
    const existing = await storage.getUserByEmail(email);
    const passwordHash =
      !existing?.passwordHash && initialPassword ? await hashPassword(initialPassword) : undefined;

    if (existing) {
      if (existing.role !== "super_admin" || passwordHash) {
        await storage.updateUser(existing.id, { role: "super_admin", ...(passwordHash ? { passwordHash } : {}) });
      }
    } else {
      await storage.createUser({ email, role: "super_admin", passwordHash });
    }

    if (!existing?.passwordHash && !passwordHash) {
      console.warn(`Super admin ${email} has no password; set SUPER_ADMIN_INITIAL_PASSWORD and restart`);
    }
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Basic brute-force guard: at most MAX_ATTEMPTS failed logins per email per window.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

function isLockedOut(email: string): boolean {
  const entry = failedAttempts.get(email);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(email);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(email: string) {
  const entry = failedAttempts.get(email);
  if (!entry || Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(email, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
}

function parseRole(value: unknown): Role | null {
  return value === "super_admin" || value === "user" ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Registers the public auth routes, then locks every other /api route behind a
// signed-in user. Must run before registerRoutes().
export function registerAuthRoutes(app: Express) {
  app.use(authMiddleware);

  app.get("/api/auth/user", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalized = normalizeEmail(email);
    if (isLockedOut(normalized)) {
      return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    }

    const user = await storage.getUserByEmail(normalized);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailure(normalized);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    failedAttempts.delete(normalized);
    await signIn(req, user.id);
    res.json({ user: toSessionUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // Always answers ok so the form doesn't reveal which emails have accounts.
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || !email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await storage.getUserByEmail(normalizeEmail(email));

    // At most one email per minute per user.
    const lastSentAt = user?.resetTokenExpiresAt
      ? user.resetTokenExpiresAt.getTime() - RESET_TOKEN_TTL
      : 0;

    if (user?.email && Date.now() - lastSentAt > 60_000) {
      const token = await createLinkToken(user.id, RESET_TOKEN_TTL);
      const link = `${getAppUrl(req)}/reset-password?token=${token}`;
      if (isEmailConfigured()) {
        const { subject, html } = resetEmail(link);
        await sendEmail(user.email, subject, html).catch((err) =>
          console.error("Password reset email failed:", err),
        );
      } else if (process.env.NODE_ENV !== "production") {
        console.warn(`Email not configured; password reset link: ${link}`);
      }
    }

    res.json({ ok: true });
  });

  app.get("/api/auth/reset-password", async (req, res) => {
    const user = await findUserByLinkToken(String(req.query.token ?? ""));
    res.json(user ? { valid: true, email: user.email } : { valid: false });
  });

  // Used by both invite links and password reset links. Signs the user in.
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await findUserByLinkToken(String(token ?? ""));
    if (!user) {
      return res.status(400).json({ message: "This link is invalid or has expired" });
    }

    await storage.updateUser(user.id, {
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });
    await storage.deleteSessionsForUser(user.id);

    await signIn(req, user.id);
    res.json({ user: toSessionUser(user) });
  });

  // Everything below requires a signed-in user.
  app.use("/api", requireAuth);

  app.post("/api/auth/change-password", async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await storage.getUser(req.user!.id);
    if (!user || !(await verifyPassword(String(currentPassword ?? ""), user.passwordHash))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    await storage.updateUser(user.id, { passwordHash: await hashPassword(newPassword) });
    res.json({ ok: true });
  });

  // ── Team management (super admins only) ──
  app.use("/api/users", requireSuperAdmin);

  app.get("/api/users", async (_req, res) => {
    const rows = await storage.getUsers();
    res.json({
      emailConfigured: isEmailConfigured(),
      users: rows.map((u) => ({
        ...toSessionUser(u),
        hasPassword: !!u.passwordHash,
        invitePending: !u.passwordHash && !!u.resetTokenExpiresAt && u.resetTokenExpiresAt > new Date(),
        createdAt: u.createdAt,
      })),
    });
  });

  // With a password: account is ready to use. Without one: an invite email is sent.
  app.post("/api/users", async (req, res) => {
    const { email, password, firstName, lastName, role } = req.body ?? {};
    const parsedRole = parseRole(role ?? "user");

    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email is required" });
    }
    const invite = password === undefined || password === "";
    if (invite && !isEmailConfigured()) {
      return res.status(400).json({ message: "Email isn't set up yet. Enter a temporary password instead." });
    }
    if (!invite && (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (!parsedRole) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const normalized = normalizeEmail(email);
    if (await storage.getUserByEmail(normalized)) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const user = await storage.createUser({
      email: normalized,
      firstName: optionalString(firstName),
      lastName: optionalString(lastName),
      role: parsedRole,
      passwordHash: invite ? null : await hashPassword(password),
    });

    let inviteLink: string | undefined;
    if (invite) {
      try {
        inviteLink = await sendInvite(req, user.id, normalized);
      } catch {
        return res.status(502).json({ message: "User added, but the invite email failed. Try resending the invite." });
      }
    }

    res.status(201).json({ user: toSessionUser(user), invited: invite, inviteLink });
  });

  app.post("/api/users/:id/invite", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user?.email) return res.status(404).json({ message: "User not found" });
    if (!isEmailConfigured()) return res.status(400).json({ message: "Email isn't set up yet" });

    try {
      const link = await sendInvite(req, user.id, user.email);
      res.json({ ok: true, link });
    } catch {
      res.status(502).json({ message: "Failed to send invite email" });
    }
  });

  // Creates a set-password link to share by hand (no email sent).
  app.post("/api/users/:id/invite-link", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ link: await createInviteLink(req, user.id) });
  });

  // Change role and/or set password.
  app.patch("/api/users/:id", async (req, res) => {
    const { role, password } = req.body ?? {};
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const updates: Partial<User> = {};

    if (role !== undefined) {
      const parsedRole = parseRole(role);
      if (!parsedRole) return res.status(400).json({ message: "Invalid role" });
      if (parsedRole !== "super_admin" && SUPER_ADMIN_EMAILS.includes(user.email ?? "")) {
        return res.status(400).json({ message: "This account is always a super admin" });
      }
      if (parsedRole !== "super_admin" && user.id === req.user!.id) {
        return res.status(400).json({ message: "You can't remove your own super admin role" });
      }
      updates.role = parsedRole;
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      updates.passwordHash = await hashPassword(password);
    }

    const updated = await storage.updateUser(user.id, updates);

    // A password reset signs the user out everywhere.
    if (updates.passwordHash && user.id !== req.user!.id) {
      await storage.deleteSessionsForUser(user.id);
    }

    res.json({ user: toSessionUser(updated!) });
  });

  app.delete("/api/users/:id", async (req, res) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }

    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (SUPER_ADMIN_EMAILS.includes(user.email ?? "")) {
      return res.status(400).json({ message: "This account can't be deleted" });
    }

    await storage.deleteSessionsForUser(user.id);
    await storage.deleteUser(user.id);
    res.json({ ok: true });
  });
}
