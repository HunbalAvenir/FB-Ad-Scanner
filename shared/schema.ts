import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  accessMode: text("access_mode", { enum: ["partner", "user", "both", "public_only", "unknown"] }).notNull().default("unknown"),
  businessManagerIdOurs: text("business_manager_id_ours"),
  businessManagerIdClient: text("business_manager_id_client"),
  allowedPageIds: text("allowed_page_ids").array(),
  allowedIgActorIds: text("allowed_ig_actor_ids").array(),
  allowedDomains: text("allowed_domains").array(),
  utmTemplateId: text("utm_template_id"),
  allowedAiEnhancements: text("allowed_ai_enhancements").array(),
  requiredUtm: boolean("required_utm").default(false),
  allowedAspectRatios: jsonb("allowed_aspect_ratios"),
  status: text("status", { enum: ["active", "onboarding", "paused", "degraded"] }).notNull().default("onboarding"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const metaCredentials = pgTable("meta_credentials", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull(),
  credentialType: text("credential_type", { enum: ["system_user_token", "user_token"] }).notNull(),
  tokenOwner: text("token_owner").notNull(),
  scopesGranted: text("scopes_granted").array(),
  status: text("status", { enum: ["active", "expired", "revoked", "insufficient_permissions"] }).notNull().default("active"),
  lastValidatedAt: timestamp("last_validated_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCredentialSchema = createInsertSchema(metaCredentials).omit({ id: true, createdAt: true });
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Credential = typeof metaCredentials.$inferSelect;

export const adAccounts = pgTable("ad_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull(),
  accountId: text("account_id").notNull(),
  accountName: text("account_name").notNull(),
  credentialId: integer("credential_id"),
  identityChecksAvailable: boolean("identity_checks_available").default(false).notNull(),
  creativeMetadataAvailable: boolean("creative_metadata_available").default(false).notNull(),
  placementTogglesAvailable: boolean("placement_toggles_available").default(false).notNull(),
  deliveryStatusAvailable: boolean("delivery_status_available").default(false).notNull(),
  lastScanSuccessAt: timestamp("last_scan_success_at"),
  lastScanError: text("last_scan_error"),
  lastScanErrorCode: text("last_scan_error_code"),
  status: text("status", { enum: ["healthy", "degraded", "error", "pending"] }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdAccountSchema = createInsertSchema(adAccounts).omit({ id: true, createdAt: true });
export type InsertAdAccount = z.infer<typeof insertAdAccountSchema>;
export type AdAccount = typeof adAccounts.$inferSelect;

export const scanIssues = pgTable("scan_issues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  adAccountId: integer("ad_account_id").notNull(),
  clientId: integer("client_id").notNull(),
  issueType: text("issue_type", { enum: ["ai_toggle", "placement_fit", "creative_integrity", "tracking", "access"] }).notNull(),
  severity: text("severity", { enum: ["blocker", "high", "medium", "low"] }).notNull(),
  message: text("message").notNull(),
  description: text("description").notNull(),
  ruleId: text("rule_id"),
  category: text("category"),
  recommendedFix: text("recommended_fix"),
  evidence: jsonb("evidence"),
  whyItMatters: text("why_it_matters"),
  adId: text("ad_id"),
  adsetId: text("adset_id"),
  campaignId: text("campaign_id"),
  campaignObjective: text("campaign_objective"),
  previewUrl: text("preview_url"),
  status: text("status", { enum: ["open", "acknowledged", "resolved", "dismissed"] }).notNull().default("open"),
  routeTo: text("route_to", { enum: ["ops", "account_manager", "buyer", "client"] }).notNull().default("buyer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScanIssueSchema = createInsertSchema(scanIssues).omit({ id: true, createdAt: true });
export type InsertScanIssue = z.infer<typeof insertScanIssueSchema>;
export type ScanIssue = typeof scanIssues.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
