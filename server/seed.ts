import { db } from "./db";
import { clients, metaCredentials, adAccounts, scanIssues } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existingClients = await db.select().from(clients);
  if (existingClients.length > 0) return;

  const [client1] = await db.insert(clients).values({
    name: "Apex Digital Marketing",
    accessMode: "partner",
    businessManagerIdOurs: "BM-9283746501",
    businessManagerIdClient: "BM-1029384756",
    allowedPageIds: ["page_10293847", "page_59384756"],
    allowedIgActorIds: ["ig_29384756"],
    allowedDomains: ["apexdigital.com", "apex-shop.com"],
    status: "active",
    notes: "Long-term partner, full access via system user token. Primary contact: Sarah Chen.",
  }).returning();

  const [client2] = await db.insert(clients).values({
    name: "Bloom & Grow Skincare",
    accessMode: "user",
    businessManagerIdOurs: "BM-9283746501",
    allowedPageIds: ["page_83746501"],
    allowedDomains: ["bloomandgrow.co"],
    status: "active",
    notes: "User token access via Maya (media buyer). Renewal needed quarterly.",
  }).returning();

  const [client3] = await db.insert(clients).values({
    name: "TechVault Solutions",
    accessMode: "both",
    businessManagerIdOurs: "BM-9283746501",
    businessManagerIdClient: "BM-6574839201",
    allowedPageIds: ["page_65748392", "page_19283746"],
    allowedIgActorIds: ["ig_65748392"],
    allowedDomains: ["techvault.io", "techvault-store.com"],
    status: "degraded",
    notes: "System user token expired 2 days ago. Falling back to user token.",
  }).returning();

  const [client4] = await db.insert(clients).values({
    name: "FreshBite Meal Kits",
    accessMode: "public_only",
    allowedDomains: ["freshbite.com"],
    status: "onboarding",
    notes: "New client, waiting for Business Manager access to be granted.",
  }).returning();

  const [client5] = await db.insert(clients).values({
    name: "Summit Athletics Gear",
    accessMode: "partner",
    businessManagerIdOurs: "BM-9283746501",
    businessManagerIdClient: "BM-8473625190",
    allowedPageIds: ["page_84736251"],
    allowedDomains: ["summitathletics.com"],
    status: "active",
    notes: "Clean setup, full system user coverage.",
  }).returning();

  const [cred1] = await db.insert(metaCredentials).values({
    clientId: client1.id,
    credentialType: "system_user_token",
    tokenOwner: "sys_user_apex_001",
    scopesGranted: ["ads_read", "pages_read_engagement", "instagram_basic"],
    status: "active",
    lastValidatedAt: new Date(Date.now() - 3600000),
    expiresAt: new Date(Date.now() + 86400000 * 60),
  }).returning();

  const [cred2] = await db.insert(metaCredentials).values({
    clientId: client2.id,
    credentialType: "user_token",
    tokenOwner: "maya.rodriguez@agency.com",
    scopesGranted: ["ads_read", "ads_management"],
    status: "active",
    lastValidatedAt: new Date(Date.now() - 7200000),
    expiresAt: new Date(Date.now() + 86400000 * 30),
  }).returning();

  const [cred3a] = await db.insert(metaCredentials).values({
    clientId: client3.id,
    credentialType: "system_user_token",
    tokenOwner: "sys_user_techvault_001",
    scopesGranted: ["ads_read"],
    status: "expired",
    lastValidatedAt: new Date(Date.now() - 86400000 * 2),
    expiresAt: new Date(Date.now() - 86400000 * 2),
  }).returning();

  const [cred3b] = await db.insert(metaCredentials).values({
    clientId: client3.id,
    credentialType: "user_token",
    tokenOwner: "james.park@agency.com",
    scopesGranted: ["ads_read"],
    status: "active",
    lastValidatedAt: new Date(Date.now() - 1800000),
    expiresAt: new Date(Date.now() + 86400000 * 14),
  }).returning();

  const [cred5] = await db.insert(metaCredentials).values({
    clientId: client5.id,
    credentialType: "system_user_token",
    tokenOwner: "sys_user_summit_001",
    scopesGranted: ["ads_read", "pages_read_engagement"],
    status: "active",
    lastValidatedAt: new Date(Date.now() - 900000),
    expiresAt: new Date(Date.now() + 86400000 * 90),
  }).returning();

  await db.insert(adAccounts).values([
    {
      clientId: client1.id,
      accountId: "act_192837465",
      accountName: "Apex - US Prospecting",
      credentialId: cred1.id,
      identityChecksAvailable: true,
      creativeMetadataAvailable: true,
      placementTogglesAvailable: true,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 1800000),
      status: "healthy",
    },
    {
      clientId: client1.id,
      accountId: "act_293847561",
      accountName: "Apex - EU Retargeting",
      credentialId: cred1.id,
      identityChecksAvailable: true,
      creativeMetadataAvailable: true,
      placementTogglesAvailable: true,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 3600000),
      status: "healthy",
    },
    {
      clientId: client2.id,
      accountId: "act_837465019",
      accountName: "Bloom - Brand Awareness",
      credentialId: cred2.id,
      identityChecksAvailable: false,
      creativeMetadataAvailable: true,
      placementTogglesAvailable: true,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 7200000),
      status: "healthy",
    },
    {
      clientId: client3.id,
      accountId: "act_657483920",
      accountName: "TechVault - Performance",
      credentialId: cred3b.id,
      identityChecksAvailable: false,
      creativeMetadataAvailable: true,
      placementTogglesAvailable: false,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 86400000 * 2),
      lastScanError: "System user token expired. Falling back to user token with limited scope.",
      lastScanErrorCode: "TOKEN_EXPIRED",
      status: "degraded",
    },
    {
      clientId: client3.id,
      accountId: "act_748392016",
      accountName: "TechVault - Remarketing",
      credentialId: cred3b.id,
      identityChecksAvailable: false,
      creativeMetadataAvailable: false,
      placementTogglesAvailable: false,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 86400000 * 2),
      lastScanError: "Insufficient permissions on fallback user token.",
      lastScanErrorCode: "INSUFFICIENT_PERMISSIONS",
      status: "error",
    },
    {
      clientId: client5.id,
      accountId: "act_847362519",
      accountName: "Summit - Spring Campaign",
      credentialId: cred5.id,
      identityChecksAvailable: true,
      creativeMetadataAvailable: true,
      placementTogglesAvailable: true,
      deliveryStatusAvailable: true,
      lastScanSuccessAt: new Date(Date.now() - 900000),
      status: "healthy",
    },
  ]);

  await db.insert(scanIssues).values([
    {
      adAccountId: 1,
      clientId: client1.id,
      issueType: "creative",
      severity: "warning",
      title: "Image text ratio exceeds 20% on 3 ads",
      description: "Ads in ad set 'US_Prospecting_LAL' have images where text covers more than 20% of the image area, which may reduce delivery.",
      status: "open",
      routeTo: "buyer",
    },
    {
      adAccountId: 1,
      clientId: client1.id,
      issueType: "utm",
      severity: "info",
      title: "Missing UTM parameters on 2 ad URLs",
      description: "Two active ads in 'EU_Retargeting_DABA' are missing utm_campaign parameters.",
      status: "open",
      routeTo: "buyer",
    },
    {
      adAccountId: 3,
      clientId: client2.id,
      issueType: "identity",
      severity: "warning",
      title: "Instagram actor ID mismatch",
      description: "Ad account is configured with IG actor 'ig_old_handle' but the approved list specifies 'ig_29384756'. Identity check cannot validate current ads.",
      status: "open",
      routeTo: "account_manager",
    },
    {
      adAccountId: 4,
      clientId: client3.id,
      issueType: "access",
      severity: "critical",
      title: "System user token expired",
      description: "The system user token for TechVault has expired. Scanner has fallen back to user token with reduced coverage. Placement and identity checks are unavailable.",
      status: "open",
      routeTo: "ops",
    },
    {
      adAccountId: 5,
      clientId: client3.id,
      issueType: "access",
      severity: "critical",
      title: "Insufficient permissions on fallback token",
      description: "User token for james.park@agency.com does not have sufficient permissions to scan creative metadata or placement toggles on the Remarketing account.",
      status: "open",
      routeTo: "ops",
    },
    {
      adAccountId: 4,
      clientId: client3.id,
      issueType: "delivery",
      severity: "warning",
      title: "Campaign budget hitting daily cap before noon",
      description: "Performance campaign is exhausting daily budget by 11am consistently for the past 3 days, potentially missing afternoon traffic.",
      status: "acknowledged",
      routeTo: "buyer",
    },
    {
      adAccountId: 6,
      clientId: client5.id,
      issueType: "placement",
      severity: "info",
      title: "Audience Network placement enabled but underperforming",
      description: "Audience Network is enabled on the Spring Campaign but delivering less than 1% of impressions at 3x the CPM of other placements.",
      status: "open",
      routeTo: "buyer",
    },
  ]);

  console.log("Database seeded successfully");
}
