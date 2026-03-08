import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertClientSchema, insertCredentialSchema, insertAdAccountSchema, insertScanIssueSchema } from "@shared/schema";
import { z } from "zod";
import { scanAllAccounts, scanSingleAccount, auditAccountUrls } from "./scanner";
import { validateToken, smokeTestAdAccount, listAdAccounts } from "./meta-api";

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const META_APP_ID = process.env.META_APP_ID;
  const META_APP_SECRET = process.env.META_APP_SECRET;

  app.get("/api/auth/facebook/app-id", (_req, res) => {
    if (!META_APP_ID) return res.status(500).json({ message: "META_APP_ID not configured" });
    res.json({ appId: META_APP_ID });
  });

  app.post("/api/auth/facebook/token", async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ message: "Missing accessToken" });
    try {
      const userRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}&fields=name`);
      const userData = await userRes.json() as any;
      if (userData.error) return res.status(400).json({ message: userData.error.message });
      req.session.metaUserToken = accessToken;
      req.session.metaUserName = userData.name || "Unknown";
      res.json({ authenticated: true, name: req.session.metaUserName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/auth/facebook/status", (req, res) => {
    res.json({
      authenticated: !!req.session.metaUserToken,
      name: req.session.metaUserName || null,
    });
  });

  app.post("/api/auth/facebook/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Failed to logout" });
      res.json({ success: true });
    });
  });

  app.get("/api/meta/user-ad-accounts", async (req, res) => {
    const token = req.session.metaUserToken;
    if (!token) return res.status(401).json({ message: "Not authenticated. Please login with Facebook first." });
    const result = await listAdAccounts(token);
    if (result.error) return res.status(400).json({ message: result.error });
    const existingAccounts = await storage.getAllAdAccounts();
    const existingIds = new Set(existingAccounts.map(a => a.accountId));
    const accounts = (result.accounts || []).map(a => ({
      ...a,
      alreadyImported: existingIds.has(a.id),
    }));
    res.json(accounts);
  });

  app.get("/api/dashboard/stats", async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  app.get("/api/clients", async (_req, res) => {
    const clients = await storage.getClients();
    res.json(clients);
  });

  app.get("/api/clients/:id", async (req, res) => {
    const client = await storage.getClient(Number(req.params.id));
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.post("/api/clients", async (req, res) => {
    const { adAccountSelections, ...clientData } = req.body;
    const parsed = insertClientSchema.safeParse(clientData);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const client = await storage.createClient(parsed.data);

    if (Array.isArray(adAccountSelections) && adAccountSelections.length > 0) {
      for (const sel of adAccountSelections) {
        if (sel.accountId && sel.accountName) {
          const actId = sel.accountId.startsWith("act_") ? sel.accountId : `act_${sel.accountId}`;
          await storage.createAdAccount({
            clientId: client.id,
            accountId: actId,
            accountName: sel.accountName,
          });
        }
      }
    }

    res.status(201).json(client);
  });

  app.patch("/api/clients/:id", async (req, res) => {
    const updated = await storage.updateClient(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Client not found" });
    res.json(updated);
  });

  app.delete("/api/clients/:id", async (req, res) => {
    await storage.deleteClient(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/meta/ad-accounts", async (_req, res) => {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    if (!token) return res.status(500).json({ message: "META_SYSTEM_USER_TOKEN not configured" });
    const result = await listAdAccounts(token);
    if (result.error) return res.status(400).json({ message: result.error });
    const existingAccounts = await storage.getAllAdAccounts();
    const existingIds = new Set(existingAccounts.map(a => a.accountId));
    const accounts = (result.accounts || []).map(a => ({
      ...a,
      alreadyImported: existingIds.has(a.id),
    }));
    res.json(accounts);
  });

  app.post("/api/meta/verify-accounts", async (req, res) => {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    if (!token) return res.status(500).json({ message: "META_SYSTEM_USER_TOKEN not configured" });

    const schema = z.object({ accountIds: z.array(z.string().min(1)).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const existingAccounts = await storage.getAllAdAccounts();
    const existingIds = new Set(existingAccounts.map(a => a.accountId));

    const results = [];
    for (const rawId of parsed.data.accountIds) {
      const cleanId = rawId.replace(/\s/g, "");
      if (!cleanId) continue;
      const actId = cleanId.startsWith("act_") ? cleanId : `act_${cleanId}`;
      const check = await smokeTestAdAccount(actId, token);
      results.push({
        id: actId,
        name: check.accountName || actId,
        account_status: check.accountStatus || 0,
        accessible: check.accessible,
        error: check.error,
        alreadyImported: existingIds.has(actId),
      });
    }
    res.json(results);
  });

  const bulkImportSchema = z.object({
    accounts: z.array(z.object({
      metaAccountId: z.string().min(1),
      accountName: z.string().min(1),
      businessName: z.string().optional(),
      clientName: z.string().optional(),
    })).min(1, "At least one account is required"),
  });

  app.post("/api/clients/bulk-import", async (req, res) => {
    const parsed = bulkImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { accounts } = parsed.data;

    const created: Array<{ client: any; adAccount: any }> = [];
    const skipped: string[] = [];

    const existingAccounts = await storage.getAllAdAccounts();
    const existingIds = new Set(existingAccounts.map(a => a.accountId));

    for (const acct of accounts) {
      if (existingIds.has(acct.metaAccountId)) {
        skipped.push(acct.metaAccountId);
        continue;
      }

      const clientName = acct.clientName || acct.businessName || acct.accountName;
      const existingClients = await storage.getClients();
      let client = existingClients.find(c => c.name === clientName);

      if (!client) {
        client = await storage.createClient({
          name: clientName,
          accessMode: "partner",
          status: "onboarding",
          notes: acct.businessName ? `Business: ${acct.businessName}` : null,
          businessManagerIdOurs: null,
          businessManagerIdClient: null,
        });
      }

      const adAccount = await storage.createAdAccount({
        clientId: client.id,
        accountId: acct.metaAccountId,
        accountName: acct.accountName,
        status: "pending",
        credentialId: null,
        identityChecksAvailable: false,
        creativeMetadataAvailable: false,
        placementTogglesAvailable: false,
        deliveryStatusAvailable: false,
        lastScanSuccessAt: null,
        lastScanError: null,
        lastScanErrorCode: null,
      });

      existingIds.add(acct.metaAccountId);
      created.push({ client, adAccount });
    }

    res.status(201).json({ created: created.length, skipped: skipped.length });
  });

  app.get("/api/clients/:clientId/credentials", async (req, res) => {
    const creds = await storage.getCredentials(Number(req.params.clientId));
    res.json(creds);
  });

  app.get("/api/credentials", async (_req, res) => {
    const creds = await storage.getAllCredentials();
    res.json(creds);
  });

  app.post("/api/credentials", async (req, res) => {
    const parsed = insertCredentialSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const cred = await storage.createCredential(parsed.data);
    res.status(201).json(cred);
  });

  app.patch("/api/credentials/:id", async (req, res) => {
    const updated = await storage.updateCredential(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Credential not found" });
    res.json(updated);
  });

  app.delete("/api/credentials/:id", async (req, res) => {
    await storage.deleteCredential(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/clients/:clientId/ad-accounts", async (req, res) => {
    const accounts = await storage.getAdAccounts(Number(req.params.clientId));
    res.json(accounts);
  });

  app.get("/api/ad-accounts", async (_req, res) => {
    const accounts = await storage.getAllAdAccounts();
    res.json(accounts);
  });

  app.post("/api/ad-accounts", async (req, res) => {
    const parsed = insertAdAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const account = await storage.createAdAccount(parsed.data);
    res.status(201).json(account);
  });

  app.patch("/api/ad-accounts/:id", async (req, res) => {
    const updated = await storage.updateAdAccount(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Ad account not found" });
    res.json(updated);
  });

  app.delete("/api/ad-accounts/:id", async (req, res) => {
    await storage.deleteAdAccount(Number(req.params.id));
    res.status(204).send();
  });

  app.get("/api/issues", async (req, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const issues = await storage.getIssues(clientId);
    res.json(issues);
  });

  app.post("/api/issues", async (req, res) => {
    const parsed = insertScanIssueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const issue = await storage.createIssue(parsed.data);
    res.status(201).json(issue);
  });

  app.patch("/api/issues/bulk", async (req, res) => {
    const { ids, ruleId, adAccountId, currentStatus, status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });

    let updated = 0;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      updated = await storage.bulkUpdateIssues(ids, { status });
    } else if (ruleId && adAccountId) {
      updated = await storage.bulkUpdateIssuesByRule(ruleId, adAccountId, currentStatus || "", status);
    } else {
      return res.status(400).json({ message: "Provide ids array or ruleId+adAccountId" });
    }
    res.json({ updated });
  });

  app.patch("/api/issues/:id", async (req, res) => {
    const updated = await storage.updateIssue(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Issue not found" });
    res.json(updated);
  });

  app.delete("/api/issues/:id", async (req, res) => {
    await storage.deleteIssue(Number(req.params.id));
    res.status(204).send();
  });

  app.post("/api/scan/all", async (_req, res) => {
    try {
      const results = await scanAllAccounts();
      res.json({
        scanned: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalIssuesFound: results.reduce((sum, r) => sum + r.issuesFound, 0),
        results,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/scan/account/:id", async (req, res) => {
    try {
      const result = await scanSingleAccount(Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/ad-accounts/:id/urls", async (req, res) => {
    try {
      const result = await auditAccountUrls(Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ urls: [], error: err.message });
    }
  });

  app.post("/api/validate-token", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token required" });
    try {
      const result = await validateToken(token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/test-account-access", async (req, res) => {
    const { accountId, token } = req.body;
    if (!accountId || !token) return res.status(400).json({ message: "accountId and token required" });
    try {
      const result = await smokeTestAdAccount(accountId, token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
