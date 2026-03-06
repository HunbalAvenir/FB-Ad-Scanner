import { storage } from "./storage";
import {
  validateToken,
  smokeTestAdAccount,
  getAds,
  getAdSets,
  getAdCreatives,
  getCampaigns,
  getAccountPages,
  type MetaAd,
  type MetaAdSet,
  type MetaCreative,
  type MetaCampaign,
} from "./meta-api";
import type { AdAccount, Credential, Client, InsertScanIssue } from "@shared/schema";
import { log } from "./index";

interface ScanResult {
  accountId: number;
  success: boolean;
  issuesFound: number;
  coverageUpdated: boolean;
  error?: string;
  errorCode?: string;
}

function resolveToken(credential: Credential): string {
  if (credential.credentialType === "system_user_token") {
    const envToken = process.env.META_SYSTEM_USER_TOKEN;
    if (envToken) return envToken;
  }
  return credential.tokenOwner;
}

export async function scanAdAccount(adAccount: AdAccount, credential: Credential, client: Client): Promise<ScanResult> {
  const token = resolveToken(credential);

  log(`Scanning account ${adAccount.accountName} (${adAccount.accountId})`, "scanner");

  const smokeTest = await smokeTestAdAccount(adAccount.accountId, token);

  if (!smokeTest.accessible) {
    log(`Smoke test failed for ${adAccount.accountId}: ${smokeTest.error}`, "scanner");

    await storage.updateAdAccount(adAccount.id, {
      status: "degraded",
      lastScanError: smokeTest.error || "Account not accessible",
      lastScanErrorCode: smokeTest.errorCode || "SMOKE_TEST_FAILED",
    });

    if (credential.status === "active") {
      const tokenCheck = await validateToken(token);
      if (!tokenCheck.valid) {
        await storage.updateCredential(credential.id, {
          status: "expired",
          lastValidatedAt: new Date(),
        });
      }
    }

    await createAccessIssue(adAccount, client, smokeTest.error || "Account not accessible", smokeTest.errorCode || "SMOKE_TEST_FAILED");

    return {
      accountId: adAccount.id,
      success: false,
      issuesFound: 0,
      coverageUpdated: true,
      error: smokeTest.error,
      errorCode: smokeTest.errorCode,
    };
  }

  log(`Smoke test passed for ${adAccount.accountId}, pulling data...`, "scanner");

  const [adsResult, adSetsResult, creativesResult, campaignsResult, pagesResult] = await Promise.all([
    getAds(adAccount.accountId, token),
    getAdSets(adAccount.accountId, token),
    getAdCreatives(adAccount.accountId, token),
    getCampaigns(adAccount.accountId, token),
    getAccountPages(adAccount.accountId, token),
  ]);

  const coverageUpdate: Partial<typeof adAccount> = {
    identityChecksAvailable: !pagesResult.error && !!pagesResult.pages,
    creativeMetadataAvailable: !creativesResult.error && !!creativesResult.creatives,
    placementTogglesAvailable: !adSetsResult.error && !!adSetsResult.adsets,
    deliveryStatusAvailable: !adsResult.error && !!adsResult.ads,
    lastScanSuccessAt: new Date(),
    lastScanError: null,
    lastScanErrorCode: null,
    status: "healthy" as const,
  };

  await storage.updateAdAccount(adAccount.id, coverageUpdate);
  await storage.updateCredential(credential.id, {
    lastValidatedAt: new Date(),
    status: "active",
  });

  let issuesFound = 0;
  const newIssues: InsertScanIssue[] = [];

  if (adsResult.ads) {
    const adIssues = analyzeAds(adsResult.ads, adAccount, client);
    newIssues.push(...adIssues);
  }

  if (adSetsResult.adsets) {
    const adsetIssues = analyzeAdSets(adSetsResult.adsets, adAccount, client);
    newIssues.push(...adsetIssues);
  }

  if (creativesResult.creatives) {
    const creativeIssues = analyzeCreatives(creativesResult.creatives, adAccount, client);
    newIssues.push(...creativeIssues);
  }

  if (campaignsResult.campaigns) {
    const campaignIssues = analyzeCampaigns(campaignsResult.campaigns, adAccount, client);
    newIssues.push(...campaignIssues);
  }

  if (pagesResult.pages && client.allowedPageIds && client.allowedPageIds.length > 0) {
    const identityIssues = analyzeIdentity(pagesResult.pages, adAccount, client);
    newIssues.push(...identityIssues);
  }

  if (creativesResult.creatives && client.allowedDomains && client.allowedDomains.length > 0) {
    const utmIssues = analyzeUtmAndDomains(creativesResult.creatives, adAccount, client);
    newIssues.push(...utmIssues);
  }

  for (const issue of newIssues) {
    await storage.createIssue(issue);
    issuesFound++;
  }

  log(`Scan complete for ${adAccount.accountId}: ${issuesFound} issues found`, "scanner");

  return {
    accountId: adAccount.id,
    success: true,
    issuesFound,
    coverageUpdated: true,
  };
}

function analyzeAds(ads: MetaAd[], adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  const activeAds = ads.filter(a => a.effective_status === "ACTIVE");
  const pausedWithActiveParent = ads.filter(a => a.status === "ACTIVE" && a.effective_status !== "ACTIVE");
  const disapprovedAds = ads.filter(a => a.effective_status === "DISAPPROVED");

  if (disapprovedAds.length > 0) {
    issues.push({
      adAccountId: adAccount.id,
      clientId: client.id,
      issueType: "creative",
      severity: "critical",
      title: `${disapprovedAds.length} disapproved ad${disapprovedAds.length > 1 ? "s" : ""} detected`,
      description: `The following ads have been disapproved by Meta: ${disapprovedAds.map(a => a.name).join(", ")}. These ads are not delivering and require attention.`,
      status: "open",
      routeTo: "buyer",
    });
  }

  const adsWithoutCreative = activeAds.filter(a => !a.creative);
  if (adsWithoutCreative.length > 0) {
    issues.push({
      adAccountId: adAccount.id,
      clientId: client.id,
      issueType: "creative",
      severity: "warning",
      title: `${adsWithoutCreative.length} active ad${adsWithoutCreative.length > 1 ? "s" : ""} missing creative reference`,
      description: `Active ads without linked creative objects: ${adsWithoutCreative.map(a => a.name).join(", ")}.`,
      status: "open",
      routeTo: "buyer",
    });
  }

  if (ads.length === 0) {
    issues.push({
      adAccountId: adAccount.id,
      clientId: client.id,
      issueType: "delivery",
      severity: "info",
      title: "No ads found in this ad account",
      description: "This ad account has no ads. If campaigns are expected, verify the account ID is correct.",
      status: "open",
      routeTo: "account_manager",
    });
  }

  return issues;
}

function analyzeAdSets(adsets: MetaAdSet[], adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  const activeAdsets = adsets.filter(a => a.effective_status === "ACTIVE");

  for (const adset of activeAdsets) {
    if (!adset.daily_budget && !adset.lifetime_budget) {
      issues.push({
        adAccountId: adAccount.id,
        clientId: client.id,
        issueType: "delivery",
        severity: "warning",
        title: `Ad set "${adset.name}" has no budget set at ad set level`,
        description: `Ad set "${adset.name}" (${adset.id}) does not have a daily or lifetime budget configured at the ad set level. Budget may be managed at campaign level (CBO).`,
        status: "open",
        routeTo: "buyer",
      });
    }

    if (adset.targeting) {
      const targeting = adset.targeting;
      if (!targeting.geo_locations || (!targeting.geo_locations.countries && !targeting.geo_locations.regions && !targeting.geo_locations.cities)) {
        issues.push({
          adAccountId: adAccount.id,
          clientId: client.id,
          issueType: "targeting",
          severity: "warning",
          title: `Ad set "${adset.name}" has no geographic targeting`,
          description: `Ad set "${adset.name}" (${adset.id}) does not have specific geographic targeting configured. This may lead to unwanted spend in unintended regions.`,
          status: "open",
          routeTo: "buyer",
        });
      }
    }
  }

  return issues;
}

function analyzeCreatives(creatives: MetaCreative[], adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  for (const creative of creatives) {
    if (creative.object_story_spec) {
      const spec = creative.object_story_spec;
      const callToAction = spec.link_data?.call_to_action || spec.video_data?.call_to_action;
      const link = spec.link_data?.link || spec.video_data?.link || "";

      if (link && !link.startsWith("http")) {
        issues.push({
          adAccountId: adAccount.id,
          clientId: client.id,
          issueType: "creative",
          severity: "warning",
          title: `Creative "${creative.name || creative.id}" has malformed URL`,
          description: `The destination URL "${link}" does not start with http/https. This may cause click-through failures.`,
          status: "open",
          routeTo: "buyer",
        });
      }
    }

    if (creative.asset_feed_spec) {
      const feedSpec = creative.asset_feed_spec;
      if (feedSpec.bodies && feedSpec.bodies.length > 5) {
        issues.push({
          adAccountId: adAccount.id,
          clientId: client.id,
          issueType: "creative",
          severity: "info",
          title: `Creative "${creative.name || creative.id}" has ${feedSpec.bodies.length} body variations`,
          description: `Dynamic creative has a large number of body copy variations (${feedSpec.bodies.length}). Consider reviewing performance of individual variations.`,
          status: "open",
          routeTo: "buyer",
        });
      }
    }
  }

  return issues;
}

function analyzeCampaigns(campaigns: MetaCampaign[], adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  const activeCampaigns = campaigns.filter(c => c.effective_status === "ACTIVE");

  for (const campaign of activeCampaigns) {
    if (campaign.special_ad_categories && campaign.special_ad_categories.length > 0) {
      issues.push({
        adAccountId: adAccount.id,
        clientId: client.id,
        issueType: "delivery",
        severity: "info",
        title: `Campaign "${campaign.name}" uses special ad categories`,
        description: `Campaign "${campaign.name}" (${campaign.id}) is flagged with special ad categories: ${campaign.special_ad_categories.join(", ")}. Targeting restrictions apply.`,
        status: "open",
        routeTo: "buyer",
      });
    }
  }

  return issues;
}

function analyzeIdentity(pages: Array<{ id: string; name: string }>, adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  if (client.allowedPageIds && client.allowedPageIds.length > 0) {
    const pageIds = pages.map(p => p.id);
    const unauthorizedPages = pageIds.filter(id => !client.allowedPageIds!.includes(id) && !client.allowedPageIds!.includes(`page_${id}`));

    if (unauthorizedPages.length > 0) {
      issues.push({
        adAccountId: adAccount.id,
        clientId: client.id,
        issueType: "identity",
        severity: "warning",
        title: `${unauthorizedPages.length} page${unauthorizedPages.length > 1 ? "s" : ""} not in approved list`,
        description: `The following Page IDs are being used but are not in the client's approved list: ${unauthorizedPages.join(", ")}. Verify these are authorized.`,
        status: "open",
        routeTo: "account_manager",
      });
    }
  }

  return issues;
}

function analyzeUtmAndDomains(creatives: MetaCreative[], adAccount: AdAccount, client: Client): InsertScanIssue[] {
  const issues: InsertScanIssue[] = [];

  const creativesWithUrls: Array<{ name: string; url: string }> = [];

  for (const creative of creatives) {
    let url = "";
    if (creative.object_story_spec) {
      url = creative.object_story_spec.link_data?.link ||
            creative.object_story_spec.video_data?.link || "";
    }
    if (url) {
      creativesWithUrls.push({ name: creative.name || creative.id, url });
    }
  }

  if (client.allowedDomains && client.allowedDomains.length > 0) {
    const wrongDomainCreatives = creativesWithUrls.filter(c => {
      try {
        const hostname = new URL(c.url).hostname.replace("www.", "");
        return !client.allowedDomains!.some(d => hostname === d || hostname.endsWith(`.${d}`));
      } catch {
        return false;
      }
    });

    if (wrongDomainCreatives.length > 0) {
      issues.push({
        adAccountId: adAccount.id,
        clientId: client.id,
        issueType: "utm",
        severity: "warning",
        title: `${wrongDomainCreatives.length} creative${wrongDomainCreatives.length > 1 ? "s" : ""} linking to unapproved domains`,
        description: `Creatives linking to domains not in the approved list: ${wrongDomainCreatives.map(c => `${c.name} -> ${c.url}`).join("; ")}. Approved domains: ${client.allowedDomains!.join(", ")}.`,
        status: "open",
        routeTo: "buyer",
      });
    }
  }

  const missingUtm = creativesWithUrls.filter(c => {
    try {
      const url = new URL(c.url);
      return !url.searchParams.has("utm_source") && !url.searchParams.has("utm_campaign");
    } catch {
      return false;
    }
  });

  if (missingUtm.length > 0) {
    issues.push({
      adAccountId: adAccount.id,
      clientId: client.id,
      issueType: "utm",
      severity: "info",
      title: `${missingUtm.length} creative${missingUtm.length > 1 ? "s" : ""} missing UTM parameters`,
      description: `The following creatives have destination URLs without UTM tracking parameters: ${missingUtm.map(c => c.name).join(", ")}.`,
      status: "open",
      routeTo: "buyer",
    });
  }

  return issues;
}

async function createAccessIssue(adAccount: AdAccount, client: Client, error: string, errorCode: string) {
  let title = "Cannot scan account - unknown error";
  let description = error;
  let routeTo: "ops" | "account_manager" | "buyer" | "client" = "ops";

  if (errorCode === "TOKEN_EXPIRED") {
    title = "Token expired - cannot scan account";
    description = `The access token has expired for account "${adAccount.accountName}" (${adAccount.accountId}). ${error}`;
  } else if (errorCode === "PERMISSION_ERROR") {
    title = "Missing permissions - cannot scan account";
    description = `Insufficient permissions to access account "${adAccount.accountName}" (${adAccount.accountId}). The token may need additional scopes or the ad account may not be shared properly. ${error}`;
    routeTo = "account_manager";
  } else if (errorCode === "INVALID_PARAMETER") {
    title = "Invalid account ID";
    description = `The ad account ID "${adAccount.accountId}" appears to be invalid. ${error}`;
    routeTo = "account_manager";
  } else {
    title = `Scan failed for "${adAccount.accountName}"`;
    description = `Error scanning account ${adAccount.accountId}: ${error}`;
  }

  await storage.createIssue({
    adAccountId: adAccount.id,
    clientId: client.id,
    issueType: "access",
    severity: "critical",
    title,
    description,
    status: "open",
    routeTo,
  });
}

export async function scanAllAccounts(): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const clients = await storage.getClients();

  for (const client of clients) {
    if (client.status === "paused") continue;

    const accounts = await storage.getAdAccounts(client.id);
    const credentials = await storage.getCredentials(client.id);

    const activeCredential = credentials.find(c => c.status === "active");

    if (!activeCredential) {
      log(`No active credential for client ${client.name}, skipping`, "scanner");
      for (const account of accounts) {
        await storage.updateAdAccount(account.id, {
          status: "degraded",
          lastScanError: "No active credential available",
          lastScanErrorCode: "NO_CREDENTIAL",
        });
      }
      continue;
    }

    for (const account of accounts) {
      try {
        const result = await scanAdAccount(account, activeCredential, client);
        results.push(result);
      } catch (err: any) {
        log(`Error scanning ${account.accountId}: ${err.message}`, "scanner");
        results.push({
          accountId: account.id,
          success: false,
          issuesFound: 0,
          coverageUpdated: false,
          error: err.message,
        });
      }
    }
  }

  return results;
}

export async function scanSingleAccount(adAccountId: number): Promise<ScanResult> {
  const account = await storage.getAdAccount(adAccountId);
  if (!account) throw new Error("Ad account not found");

  const client = await storage.getClient(account.clientId);
  if (!client) throw new Error("Client not found");

  const credentials = await storage.getCredentials(client.id);
  const activeCredential = credentials.find(c => c.status === "active");

  if (!activeCredential) {
    throw new Error("No active credential for this client");
  }

  return scanAdAccount(account, activeCredential, client);
}
