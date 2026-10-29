import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, KeyRound, ShieldCheck, Mail, Link2, Copy, Check, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type Role } from "@/hooks/use-auth";

interface TeamUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  hasPassword: boolean;
  invitePending: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<Role, string> = { user: "User", super_admin: "Super admin" };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange, disabled, compact, id }: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
      <SelectTrigger id={id} className={compact ? "h-8 w-[130px] text-xs" : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">{ROLE_LABELS.user}</SelectItem>
        <SelectItem value="super_admin">{ROLE_LABELS.super_admin}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function IconButton({ title, onClick, disabled, children }: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="icon" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Password updated" });
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err, "Failed to update password"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Password</CardTitle>
        <CardDescription>Change the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="current-password" label="Current password">
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field id="new-password" label="New password">
              <Input
                id="new-password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function InviteLinkBox({ email, link, onClose }: { email: string | null; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the field is selectable as a fallback.
    }
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Invite link for {email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valid for 7 days. Creating a new link replaces any older one.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button type="button" variant="secondary" onClick={copy} className="shrink-0 gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function AddUserForm({ emailConfigured, onInviteLink }: {
  emailConfigured: boolean;
  onInviteLink: (email: string, link: string) => void;
}) {
  const { toast } = useToast();
  const empty = { firstName: "", lastName: "", email: "", password: "", role: "user" as Role };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set = (key: "firstName" | "lastName" | "email" | "password") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // With email set up we always invite, so never send a password.
      const body = emailConfigured ? { ...form, password: "" } : form;
      const res = await apiRequest("POST", "/api/users", body);
      const data = (await res.json()) as { inviteLink?: string };
      toast({ title: emailConfigured ? `Invite sent to ${form.email}` : "User added" });
      if (data.inviteLink) onInviteLink(form.email, data.inviteLink);
      setForm(empty);
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err, "Failed to add user"), variant: "destructive" });
    } finally {
      // The user may exist even if the invite email failed.
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-6 border-t">
      <div>
        <p className="text-sm font-medium">{emailConfigured ? "Invite a user" : "Add a user"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {emailConfigured
            ? "They'll get an email with a link to set their password."
            : "Email isn't set up, so share the temporary password with them. They can change it after signing in."}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="new-first-name" label="First name">
          <Input id="new-first-name" value={form.firstName} onChange={set("firstName")} />
        </Field>
        <Field id="new-last-name" label="Last name">
          <Input id="new-last-name" value={form.lastName} onChange={set("lastName")} />
        </Field>
        <Field id="new-email" label="Email">
          <Input id="new-email" type="email" placeholder="name@company.com" required value={form.email} onChange={set("email")} />
        </Field>
        <Field id="new-role" label="Role">
          <RoleSelect id="new-role" value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))} />
        </Field>
        {!emailConfigured && (
          <Field id="new-user-password" label="Temporary password">
            <Input
              id="new-user-password"
              type="text"
              placeholder="At least 8 characters"
              autoComplete="off"
              minLength={8}
              required
              value={form.password}
              onChange={set("password")}
            />
          </Field>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="gap-2" data-testid="button-add-user">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : emailConfigured ? (
            <><Mail className="h-4 w-4" /> Send invite</>
          ) : (
            "Add user"
          )}
        </Button>
      </div>
    </form>
  );
}

function UsersCard({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ users: TeamUser[]; emailConfigured: boolean }>({ queryKey: ["/api/users"] });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ email: string | null; link: string } | null>(null);

  const users = data?.users ?? [];
  const emailConfigured = data?.emailConfigured ?? false;

  async function run(user: TeamUser, action: () => Promise<void>, errorMsg: string) {
    setBusyId(user.id);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err, errorMsg), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const changeRole = (user: TeamUser, role: Role) =>
    run(user, async () => {
      await apiRequest("PATCH", `/api/users/${user.id}`, { role });
      toast({ title: "Role updated" });
    }, "Update failed");

  function setPassword(user: TeamUser) {
    const password = window.prompt(`New password for ${user.email} (8+ characters):`);
    if (!password) return;
    run(user, async () => {
      await apiRequest("PATCH", `/api/users/${user.id}`, { password });
      toast({ title: "Password set" });
    }, "Update failed");
  }

  const emailInvite = (user: TeamUser) =>
    run(user, async () => {
      const res = await apiRequest("POST", `/api/users/${user.id}/invite`);
      const { link } = (await res.json()) as { link: string };
      setInviteLink({ email: user.email, link });
      toast({ title: `Invite sent to ${user.email}` });
    }, "Failed to send invite");

  const copyInviteLink = (user: TeamUser) =>
    run(user, async () => {
      const res = await apiRequest("POST", `/api/users/${user.id}/invite-link`);
      const { link } = (await res.json()) as { link: string };
      setInviteLink({ email: user.email, link });
      await navigator.clipboard.writeText(link).then(
        () => toast({ title: "Invite link copied" }),
        () => undefined,
      );
    }, "Failed to create link");

  function remove(user: TeamUser) {
    if (!window.confirm(`Remove ${user.email}? They will lose access immediately.`)) return;
    run(user, async () => {
      await apiRequest("DELETE", `/api/users/${user.id}`);
      if (inviteLink?.email === user.email) setInviteLink(null);
      toast({ title: "User removed" });
    }, "Failed to remove user");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Members</CardTitle>
        <CardDescription>Only super admins can see this. There is no public sign-up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <div className="divide-y">
            {users.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
              const isSelf = u.id === currentUserId;
              const busy = busyId === u.id;
              const initial = (name || u.email || "?")[0].toUpperCase();
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`row-user-${u.id}`}>
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-medium truncate">
                      {name || u.email}
                      {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    <div className="flex items-center gap-2 min-w-0">
                      {name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                      {!u.hasPassword && (
                        <Badge variant="secondary" className="text-[10px]">
                          {u.invitePending ? "Invite pending" : "No password"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <RoleSelect compact value={u.role} disabled={busy || isSelf} onChange={(role) => changeRole(u, role)} />
                  <div className="flex items-center">
                    {/* Empty slots on your own row keep the columns aligned. */}
                    {emailConfigured &&
                      (isSelf ? (
                        <div className="h-9 w-9" />
                      ) : (
                        <IconButton
                          title={u.hasPassword ? "Email a set-password link" : "Resend invite email"}
                          disabled={busy}
                          onClick={() => emailInvite(u)}
                        >
                          <Mail className="h-4 w-4" />
                        </IconButton>
                      ))}
                    {isSelf ? (
                      <div className="h-9 w-9" />
                    ) : (
                      <IconButton title="Copy invite link" disabled={busy} onClick={() => copyInviteLink(u)}>
                        <Link2 className="h-4 w-4" />
                      </IconButton>
                    )}
                    <IconButton title="Set password" disabled={busy} onClick={() => setPassword(u)}>
                      <KeyRound className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Remove user" disabled={busy || isSelf} onClick={() => remove(u)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {inviteLink && (
          <InviteLinkBox email={inviteLink.email} link={inviteLink.link} onClose={() => setInviteLink(null)} />
        )}
        <AddUserForm emailConfigured={emailConfigured} onInviteLink={(email, link) => setInviteLink({ email, link })} />
      </CardContent>
    </Card>
  );
}

export default function TeamPage() {
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage who can sign in to the scanner portal.</p>
      </div>

      <ChangePasswordCard />

      {user?.role === "super_admin" ? (
        <UsersCard currentUserId={user.id} />
      ) : (
        <Card>
          <CardContent className="py-6 flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Ask a super admin to add or remove team members.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
