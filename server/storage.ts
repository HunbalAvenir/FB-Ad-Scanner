import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  clients, metaCredentials, adAccounts, scanIssues,
  type Client, type InsertClient,
  type Credential, type InsertCredential,
  type AdAccount, type InsertAdAccount,
  type ScanIssue, type InsertScanIssue,
} from "@shared/schema";

export interface IStorage {
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<void>;

  getCredentials(clientId: number): Promise<Credential[]>;
  getAllCredentials(): Promise<Credential[]>;
  getCredential(id: number): Promise<Credential | undefined>;
  createCredential(cred: InsertCredential): Promise<Credential>;
  updateCredential(id: number, data: Partial<InsertCredential>): Promise<Credential | undefined>;
  deleteCredential(id: number): Promise<void>;

  getAdAccounts(clientId: number): Promise<AdAccount[]>;
  getAllAdAccounts(): Promise<AdAccount[]>;
  getAdAccount(id: number): Promise<AdAccount | undefined>;
  createAdAccount(account: InsertAdAccount): Promise<AdAccount>;
  updateAdAccount(id: number, data: Partial<InsertAdAccount>): Promise<AdAccount | undefined>;
  deleteAdAccount(id: number): Promise<void>;

  getIssues(clientId?: number): Promise<ScanIssue[]>;
  getIssue(id: number): Promise<ScanIssue | undefined>;
  createIssue(issue: InsertScanIssue): Promise<ScanIssue>;
  updateIssue(id: number, data: Partial<InsertScanIssue>): Promise<ScanIssue | undefined>;
  deleteIssue(id: number): Promise<void>;

  getDashboardStats(): Promise<{
    totalClients: number;
    activeClients: number;
    degradedAccounts: number;
    openIssues: number;
    blockerIssues: number;
    highIssues: number;
    mediumIssues: number;
  }>;

  deleteIssuesByAdAccount(adAccountId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(scanIssues).where(eq(scanIssues.clientId, id));
    await db.delete(adAccounts).where(eq(adAccounts.clientId, id));
    await db.delete(metaCredentials).where(eq(metaCredentials.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getCredentials(clientId: number): Promise<Credential[]> {
    return db.select().from(metaCredentials).where(eq(metaCredentials.clientId, clientId)).orderBy(desc(metaCredentials.createdAt));
  }

  async getAllCredentials(): Promise<Credential[]> {
    return db.select().from(metaCredentials).orderBy(desc(metaCredentials.createdAt));
  }

  async getCredential(id: number): Promise<Credential | undefined> {
    const [cred] = await db.select().from(metaCredentials).where(eq(metaCredentials.id, id));
    return cred;
  }

  async createCredential(cred: InsertCredential): Promise<Credential> {
    const [created] = await db.insert(metaCredentials).values(cred).returning();
    return created;
  }

  async updateCredential(id: number, data: Partial<InsertCredential>): Promise<Credential | undefined> {
    const [updated] = await db.update(metaCredentials).set(data).where(eq(metaCredentials.id, id)).returning();
    return updated;
  }

  async deleteCredential(id: number): Promise<void> {
    await db.delete(metaCredentials).where(eq(metaCredentials.id, id));
  }

  async getAdAccounts(clientId: number): Promise<AdAccount[]> {
    return db.select().from(adAccounts).where(eq(adAccounts.clientId, clientId)).orderBy(desc(adAccounts.createdAt));
  }

  async getAllAdAccounts(): Promise<AdAccount[]> {
    return db.select().from(adAccounts).orderBy(desc(adAccounts.createdAt));
  }

  async getAdAccount(id: number): Promise<AdAccount | undefined> {
    const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, id));
    return account;
  }

  async createAdAccount(account: InsertAdAccount): Promise<AdAccount> {
    const [created] = await db.insert(adAccounts).values(account).returning();
    return created;
  }

  async updateAdAccount(id: number, data: Partial<InsertAdAccount>): Promise<AdAccount | undefined> {
    const [updated] = await db.update(adAccounts).set(data).where(eq(adAccounts.id, id)).returning();
    return updated;
  }

  async deleteAdAccount(id: number): Promise<void> {
    await db.delete(adAccounts).where(eq(adAccounts.id, id));
  }

  async getIssues(clientId?: number): Promise<ScanIssue[]> {
    if (clientId) {
      return db.select().from(scanIssues).where(eq(scanIssues.clientId, clientId)).orderBy(desc(scanIssues.createdAt));
    }
    return db.select().from(scanIssues).orderBy(desc(scanIssues.createdAt));
  }

  async getIssue(id: number): Promise<ScanIssue | undefined> {
    const [issue] = await db.select().from(scanIssues).where(eq(scanIssues.id, id));
    return issue;
  }

  async createIssue(issue: InsertScanIssue): Promise<ScanIssue> {
    const [created] = await db.insert(scanIssues).values(issue).returning();
    return created;
  }

  async updateIssue(id: number, data: Partial<InsertScanIssue>): Promise<ScanIssue | undefined> {
    const [updated] = await db.update(scanIssues).set(data).where(eq(scanIssues.id, id)).returning();
    return updated;
  }

  async deleteIssue(id: number): Promise<void> {
    await db.delete(scanIssues).where(eq(scanIssues.id, id));
  }

  async getDashboardStats() {
    const allClients = await this.getClients();
    const allAccounts = await this.getAllAdAccounts();
    const allIssues = await this.getIssues();
    const openIssues = allIssues.filter(i => i.status === "open");

    return {
      totalClients: allClients.length,
      activeClients: allClients.filter(c => c.status === "active").length,
      degradedAccounts: allAccounts.filter(a => a.status === "degraded" || a.status === "error").length,
      openIssues: openIssues.length,
      blockerIssues: openIssues.filter(i => i.severity === "blocker").length,
      highIssues: openIssues.filter(i => i.severity === "high").length,
      mediumIssues: openIssues.filter(i => i.severity === "medium").length,
    };
  }

  async deleteIssuesByAdAccount(adAccountId: number): Promise<void> {
    await db.delete(scanIssues).where(eq(scanIssues.adAccountId, adAccountId));
  }
}

export const storage = new DatabaseStorage();
