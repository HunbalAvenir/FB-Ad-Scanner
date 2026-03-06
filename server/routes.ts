import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClientSchema, insertCredentialSchema, insertAdAccountSchema, insertScanIssueSchema } from "@shared/schema";
import { scanAllAccounts, scanSingleAccount, auditAccountUrls } from "./scanner";
import { validateToken, smokeTestAdAccount } from "./meta-api";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const client = await storage.createClient(parsed.data);
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
