import { storage } from "./storage";
import {
  validateToken,
  smokeTestAdAccount,
  getAds,
  getAdSets,
  getAccountPages,
  getImageMetadata,
  type MetaAd,
  type MetaAdSet,
  type MetaAdCreativeDetail,
} from "./meta-api";
import type { AdAccount, Credential, Client, InsertScanIssue } from "@shared/schema";
import { log } from "./index";

interface ScanResult {
  accountId: number;
  success: boolean;
  issuesFound: number;
  adsScanned: number;
  coverageUpdated: boolean;
  error?: string;
  errorCode?: string;
}

interface Finding {
  ruleId: string;
  severity: "blocker" | "high" | "medium" | "low";
  category: string;
  issueType: "ai_toggle" | "placement_fit" | "creative_integrity" | "tracking" | "access";
  message: string;
  whyItMatters: string;
  recommendedFix: string;
  evidence: Record<string, any>;
  adId?: string;
  adsetId?: string;
  campaignId?: string;
  previewUrl?: string;
}

const FEED_PLACEMENTS = ["feed", "facebook_feed", "instagram_feed", "marketplace"];
const STORY_PLACEMENTS = ["story", "stories", "instagram_stories", "facebook_stories", "reels", "instagram_reels", "facebook_reels"];

function resolveToken(credential: Credential): string {
  if (credential.credentialType === "system_user_token") {
    const envToken = process.env.META_SYSTEM_USER_TOKEN;
    if (envToken) return envToken;
  }
  return credential.tokenOwner;
}

function getAdPlacements(ad: MetaAd, adsetMap: Map<string, MetaAdSet>): { feed: boolean; story: boolean; all: string[] } {
  const adset = ad.adset_id ? adsetMap.get(ad.adset_id) : undefined;
  const targeting = adset?.targeting;
  const allPositions: string[] = [];

  if (targeting) {
    if (targeting.facebook_positions) allPositions.push(...targeting.facebook_positions);
    if (targeting.instagram_positions) allPositions.push(...targeting.instagram_positions);
  }

  const hasFeed = allPositions.some(p => FEED_PLACEMENTS.includes(p.toLowerCase()));
  const hasStory = allPositions.some(p => STORY_PLACEMENTS.includes(p.toLowerCase()));

  if (allPositions.length === 0) {
    return { feed: true, story: true, all: ["automatic"] };
  }

  return { feed: hasFeed, story: hasStory, all: allPositions };
}

function parseAspectRatio(width: number, height: number): string {
  if (width === 0 || height === 0) return "unknown";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.05) return "4:5";
  if (Math.abs(ratio - 0.5625) < 0.05) return "9:16";
  if (Math.abs(ratio - 1.91) < 0.1) return "1.91:1";
  if (Math.abs(ratio - 1.778) < 0.05) return "16:9";
  return `${width}:${height}`;
}

function isVertical(ratio: string): boolean {
  return ratio === "9:16";
}

function isSquare(ratio: string): boolean {
  return ratio === "1:1";
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

    if (credential.id !== 0 && credential.status === "active") {
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
      adsScanned: 0,
      coverageUpdated: true,
      error: smokeTest.error,
      errorCode: smokeTest.errorCode,
    };
  }

  log(`Smoke test passed for ${adAccount.accountId}, pulling data...`, "scanner");

  const [adsResult, adSetsResult, pagesResult] = await Promise.all([
    getAds(adAccount.accountId, token),
    getAdSets(adAccount.accountId, token),
    getAccountPages(adAccount.accountId, token),
  ]);

  const coverageUpdate: Partial<typeof adAccount> = {
    identityChecksAvailable: !pagesResult.error && !!pagesResult.pages,
    creativeMetadataAvailable: !adsResult.error && !!adsResult.ads,
    placementTogglesAvailable: !adSetsResult.error && !!adSetsResult.adsets,
    deliveryStatusAvailable: !adsResult.error && !!adsResult.ads,
    lastScanSuccessAt: new Date(),
    lastScanError: null,
    lastScanErrorCode: null,
    status: "healthy" as const,
  };

  await storage.updateAdAccount(adAccount.id, coverageUpdate);
  if (credential.id !== 0) {
    await storage.updateCredential(credential.id, {
      lastValidatedAt: new Date(),
      status: "active",
    });
  }

  const ads = adsResult.ads || [];
  const adsets = adSetsResult.adsets || [];
  const pages = pagesResult.pages || [];

  const adsetMap = new Map<string, MetaAdSet>();
  for (const adset of adsets) {
    adsetMap.set(adset.id, adset);
  }

  const activeAds = ads.filter(a => a.effective_status === "ACTIVE" || a.effective_status === "PAUSED");

  const findings: Finding[] = [];

  for (const ad of activeAds) {
    const creative = ad.creative;
    if (!creative) continue;

    const placements = getAdPlacements(ad, adsetMap);
    const adPreviewUrl = ad.preview_shareable_link || undefined;

    const aiFindings = checkAiToggles(ad, creative, client);
    findings.push(...aiFindings.map(f => ({ ...f, previewUrl: adPreviewUrl })));

    const placementFindings = await checkPlacementFit(ad, creative, placements, client);
    findings.push(...placementFindings.map(f => ({ ...f, previewUrl: adPreviewUrl })));

    const creativeFindings = checkCreativeIntegrity(ad, creative, client, pages);
    findings.push(...creativeFindings.map(f => ({ ...f, previewUrl: adPreviewUrl })));

    const trackingFindings = checkTracking(ad, creative, client);
    findings.push(...trackingFindings.map(f => ({ ...f, previewUrl: adPreviewUrl })));
  }

  await storage.deleteIssuesByAdAccount(adAccount.id);

  let issuesFound = 0;
  for (const finding of findings) {
    const issue: InsertScanIssue = {
      adAccountId: adAccount.id,
      clientId: client.id,
      issueType: finding.issueType,
      severity: finding.severity,
      message: finding.message,
      description: finding.whyItMatters,
      ruleId: finding.ruleId,
      category: finding.category,
      recommendedFix: finding.recommendedFix,
      evidence: finding.evidence,
      whyItMatters: finding.whyItMatters,
      adId: finding.adId,
      adsetId: finding.adsetId,
      campaignId: finding.campaignId,
      previewUrl: finding.previewUrl,
      status: "open",
      routeTo: "buyer",
    };
    await storage.createIssue(issue);
    issuesFound++;
  }

  log(`Scan complete for ${adAccount.accountId}: ${issuesFound} issues from ${activeAds.length} ads`, "scanner");

  return {
    accountId: adAccount.id,
    success: true,
    issuesFound,
    adsScanned: activeAds.length,
    coverageUpdated: true,
  };
}

function checkAiToggles(ad: MetaAd, creative: MetaAdCreativeDetail, client: Client): Finding[] {
  const findings: Finding[] = [];
  const spec = creative.object_story_spec;
  const feedSpec = creative.asset_feed_spec;

  const enhancements: Array<{ key: string; ruleId: string; label: string; severity: "high" | "medium" }> = [];

  if (spec) {
    if (spec.link_data?.image_crops || spec.link_data?.multi_share_optimized) {
      enhancements.push({ key: "advantage_creative", ruleId: "AI_001", label: "Advantage creative enhancements", severity: "high" });
    }
  }

  if (feedSpec) {
    if (feedSpec.ad_formats) {
      enhancements.push({ key: "advantage_creative", ruleId: "AI_001", label: "Advantage creative enhancements", severity: "high" });
    }

    if (feedSpec.image_transformation_types?.includes("bg_gen") ||
        feedSpec.image_transformation_types?.includes("expand")) {
      enhancements.push({ key: "image_expansion", ruleId: "AI_002", label: "Image expansion", severity: "high" });
    }

    if (feedSpec.optimization_type === "DEGREE_OF_FREEDOM" ||
        feedSpec.text_optimization_type) {
      enhancements.push({ key: "auto_text", ruleId: "AI_003", label: "Auto text generation", severity: "medium" });
    }

    if (feedSpec.music_type || feedSpec.video_filtering_type) {
      enhancements.push({ key: "auto_music_filters", ruleId: "AI_004", label: "Auto music/filters", severity: "medium" });
    }
  }

  const seenRules = new Set<string>();
  for (const enh of enhancements) {
    if (seenRules.has(enh.ruleId)) continue;
    seenRules.add(enh.ruleId);

    findings.push({
      ruleId: enh.ruleId,
      severity: enh.severity,
      category: "AI_TOGGLE",
      issueType: "ai_toggle",
      message: `${enh.label} enabled on ad "${ad.name}"`,
      whyItMatters: "AI-modified creatives can alter your approved assets in unexpected ways, potentially misrepresenting the brand or product.",
      recommendedFix: `Disable ${enh.label.toLowerCase()} in ad settings or add "${enh.key}" to the client's allowed enhancements list.`,
      evidence: { enhancement_type: enh.key, ad_name: ad.name },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });

    if (client.allowedAiEnhancements && !client.allowedAiEnhancements.includes(enh.key)) {
      findings.push({
        ruleId: "AI_005",
        severity: "high",
        category: "AI_TOGGLE",
        issueType: "ai_toggle",
        message: `Enhancement "${enh.label}" not allowed by client policy on ad "${ad.name}"`,
        whyItMatters: "This enhancement is not in the client's approved list. Using unapproved AI modifications could violate client agreements.",
        recommendedFix: `Disable ${enh.label.toLowerCase()} or get client approval to add it to allowed enhancements.`,
        evidence: {
          enhancement_type: enh.key,
          allowed_enhancements: client.allowedAiEnhancements || [],
          ad_name: ad.name,
        },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  return findings;
}

async function checkPlacementFit(
  ad: MetaAd,
  creative: MetaAdCreativeDetail,
  placements: { feed: boolean; story: boolean; all: string[] },
  client: Client
): Promise<Finding[]> {
  const findings: Finding[] = [];

  let assetRatio: string | null = null;
  let assetWidth = 0;
  let assetHeight = 0;

  if (creative.image_url) {
    try {
      const meta = await getImageMetadata(creative.image_url);
      if (meta) {
        assetWidth = meta.width;
        assetHeight = meta.height;
        assetRatio = meta.aspect_ratio;
      }
    } catch {
    }
  }

  if (!assetRatio && creative.thumbnail_url) {
    try {
      const meta = await getImageMetadata(creative.thumbnail_url);
      if (meta) {
        assetWidth = meta.width;
        assetHeight = meta.height;
        assetRatio = meta.aspect_ratio;
      }
    } catch {
    }
  }

  if (!assetRatio) return findings;

  if (placements.feed && isVertical(assetRatio)) {
    findings.push({
      ruleId: "ASPECT_001",
      severity: "blocker",
      category: "PLACEMENT_FIT",
      issueType: "placement_fit",
      message: `9:16 asset detected in Feed placement on ad "${ad.name}"`,
      whyItMatters: "Feed placements crop vertical assets and make ads look broken.",
      recommendedFix: "Upload a 1:1 or 4:5 version or remove Feed placements.",
      evidence: { asset_ratio: assetRatio, placements: placements.all, width: assetWidth, height: assetHeight },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  if (placements.story && isSquare(assetRatio)) {
    findings.push({
      ruleId: "ASPECT_002",
      severity: "high",
      category: "PLACEMENT_FIT",
      issueType: "placement_fit",
      message: `Square asset in Stories/Reels placement on ad "${ad.name}"`,
      whyItMatters: "Stories and Reels expect 9:16 vertical assets. Square assets leave large black bars and look unprofessional.",
      recommendedFix: "Upload a 9:16 version for Stories/Reels or remove those placements.",
      evidence: { asset_ratio: assetRatio, placements: placements.all, width: assetWidth, height: assetHeight },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  const hasMultiplePlacementGroups = placements.feed && placements.story;
  const feedSpec = creative.asset_feed_spec;
  const hasSingleAsset = !feedSpec || !feedSpec.images || feedSpec.images.length <= 1;

  if (hasMultiplePlacementGroups && hasSingleAsset) {
    findings.push({
      ruleId: "ASPECT_003",
      severity: "high",
      category: "PLACEMENT_FIT",
      issueType: "placement_fit",
      message: `Missing placement-specific assets on ad "${ad.name}"`,
      whyItMatters: "Using one creative asset across Feed and Stories means at least one placement will display a poorly-fitting asset.",
      recommendedFix: "Upload separate assets for Feed (1:1 or 4:5) and Stories (9:16).",
      evidence: { asset_ratio: assetRatio, placement_groups: ["feed", "story"], asset_count: 1 },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  const ratio = assetWidth / assetHeight;
  const safeMin = 0.5;
  const safeMax = 2.0;
  if (ratio < safeMin || ratio > safeMax) {
    findings.push({
      ruleId: "ASPECT_004",
      severity: "medium",
      category: "PLACEMENT_FIT",
      issueType: "placement_fit",
      message: `Extreme crop risk on ad "${ad.name}"`,
      whyItMatters: "Assets with extreme aspect ratios may be heavily cropped across most placements, resulting in cut-off content.",
      recommendedFix: "Use a standard aspect ratio (1:1, 4:5, 9:16, or 1.91:1).",
      evidence: { asset_ratio: assetRatio, width: assetWidth, height: assetHeight },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  return findings;
}

function checkCreativeIntegrity(
  ad: MetaAd,
  creative: MetaAdCreativeDetail,
  client: Client,
  pages: Array<{ id: string; name: string }>
): Finding[] {
  const findings: Finding[] = [];
  const spec = creative.object_story_spec;

  const isLinkAd = creative.object_type === "SHARE" || creative.link_url || spec?.link_data;
  if (isLinkAd && !creative.call_to_action_type) {
    const ctaFromSpec = spec?.link_data?.call_to_action?.type || spec?.video_data?.call_to_action?.type;
    if (!ctaFromSpec) {
      findings.push({
        ruleId: "CREATIVE_001",
        severity: "medium",
        category: "CREATIVE_INTEGRITY",
        issueType: "creative_integrity",
        message: `Missing CTA on link ad "${ad.name}"`,
        whyItMatters: "Link ads without a call-to-action button have lower click-through rates.",
        recommendedFix: "Add a CTA button (Learn More, Shop Now, Sign Up, etc.).",
        evidence: { ad_name: ad.name, object_type: creative.object_type },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  const linkUrl = creative.link_url || spec?.link_data?.link || spec?.video_data?.link || "";
  if (linkUrl && client.allowedDomains && client.allowedDomains.length > 0) {
    try {
      const hostname = new URL(linkUrl).hostname.replace("www.", "");
      const approved = client.allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
      if (!approved) {
        findings.push({
          ruleId: "CREATIVE_002",
          severity: "high",
          category: "CREATIVE_INTEGRITY",
          issueType: "creative_integrity",
          message: `Unapproved domain on ad "${ad.name}"`,
          whyItMatters: "Ads linking to unapproved domains could send traffic to the wrong site or violate client agreements.",
          recommendedFix: `Update the destination URL to use an approved domain: ${client.allowedDomains.join(", ")}.`,
          evidence: { link_url: linkUrl, domain: hostname, approved_domains: client.allowedDomains },
          adId: ad.id,
          adsetId: ad.adset_id,
          campaignId: ad.campaign_id,
        });
      }
    } catch {
    }
  }

  const pageId = spec?.page_id || creative.effective_object_story_id?.split("_")[0];
  if (pageId && client.allowedPageIds && client.allowedPageIds.length > 0) {
    const approved = client.allowedPageIds.some(id => id === pageId || id === `page_${pageId}` || `page_${id}` === pageId);
    if (!approved) {
      findings.push({
        ruleId: "CREATIVE_003",
        severity: "high",
        category: "CREATIVE_INTEGRITY",
        issueType: "creative_integrity",
        message: `Wrong Facebook page on ad "${ad.name}"`,
        whyItMatters: "Ads running under an unapproved page misrepresent the brand identity.",
        recommendedFix: `Update the ad to use an approved page ID: ${client.allowedPageIds.join(", ")}.`,
        evidence: { page_id: pageId, approved_pages: client.allowedPageIds, ad_name: ad.name },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  if (creative.video_id && !creative.thumbnail_url) {
    findings.push({
      ruleId: "CREATIVE_004",
      severity: "medium",
      category: "CREATIVE_INTEGRITY",
      issueType: "creative_integrity",
      message: `Missing video thumbnail on ad "${ad.name}"`,
      whyItMatters: "Videos without a custom thumbnail use an auto-generated frame which may not represent the content well.",
      recommendedFix: "Upload a custom video thumbnail image.",
      evidence: { video_id: creative.video_id, ad_name: ad.name },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  return findings;
}

function checkTracking(ad: MetaAd, creative: MetaAdCreativeDetail, client: Client): Finding[] {
  const findings: Finding[] = [];
  const spec = creative.object_story_spec;

  const linkUrl = creative.link_url || spec?.link_data?.link || spec?.video_data?.link || "";

  if (linkUrl && (client.requiredUtm === true || client.requiredUtm === null)) {
    try {
      const url = new URL(linkUrl);
      const hasUtm = url.searchParams.has("utm_source") || url.searchParams.has("utm_campaign");
      if (!hasUtm) {
        findings.push({
          ruleId: "TRACK_001",
          severity: "high",
          category: "TRACKING",
          issueType: "tracking",
          message: `Missing UTM parameters on ad "${ad.name}"`,
          whyItMatters: "Without UTM parameters, you cannot properly attribute traffic and conversions from this ad in analytics.",
          recommendedFix: "Add utm_source, utm_medium, and utm_campaign parameters to the destination URL.",
          evidence: { link_url: linkUrl, ad_name: ad.name },
          adId: ad.id,
          adsetId: ad.adset_id,
          campaignId: ad.campaign_id,
        });
      }
    } catch {
    }
  }

  if (ad.tracking_specs && Array.isArray(ad.tracking_specs)) {
    const hasPixel = ad.tracking_specs.some((spec: any) =>
      spec.fb_pixel || spec.pixel || (spec.action_type && spec.fb_pixel)
    );
    if (!hasPixel && linkUrl) {
      findings.push({
        ruleId: "TRACK_002",
        severity: "high",
        category: "TRACKING",
        issueType: "tracking",
        message: `No pixel tracking configured on ad "${ad.name}"`,
        whyItMatters: "Without a pixel, conversion events from this ad cannot be tracked, making optimization and attribution impossible.",
        recommendedFix: "Add a Meta pixel to the ad's tracking specs or verify the pixel is configured at the ad set or campaign level.",
        evidence: { tracking_specs: ad.tracking_specs, ad_name: ad.name },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  return findings;
}

async function createAccessIssue(adAccount: AdAccount, client: Client, error: string, errorCode: string) {
  let message = "Cannot scan account - unknown error";
  let description = error;
  let routeTo: "ops" | "account_manager" | "buyer" | "client" = "ops";

  if (errorCode === "TOKEN_EXPIRED") {
    message = "Token expired - cannot scan account";
    description = `The access token has expired for account "${adAccount.accountName}" (${adAccount.accountId}). ${error}`;
  } else if (errorCode === "PERMISSION_ERROR") {
    message = "Missing permissions - cannot scan account";
    description = `Insufficient permissions to access account "${adAccount.accountName}" (${adAccount.accountId}). ${error}`;
    routeTo = "account_manager";
  } else if (errorCode === "INVALID_PARAMETER") {
    message = "Invalid account ID";
    description = `The ad account ID "${adAccount.accountId}" appears to be invalid. ${error}`;
    routeTo = "account_manager";
  } else {
    message = `Scan failed for "${adAccount.accountName}"`;
    description = `Error scanning account ${adAccount.accountId}: ${error}`;
  }

  await storage.createIssue({
    adAccountId: adAccount.id,
    clientId: client.id,
    issueType: "access",
    severity: "high",
    message,
    description,
    ruleId: "ACCESS_001",
    category: "ACCESS",
    recommendedFix: errorCode === "TOKEN_EXPIRED"
      ? "Generate a new system user token and update credentials."
      : "Verify account access and permissions in Business Manager.",
    whyItMatters: "Without account access, the scanner cannot detect ad issues.",
    evidence: { error, errorCode, accountId: adAccount.accountId },
    status: "open",
    routeTo,
  });
}

export async function scanAllAccounts(): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const allClients = await storage.getClients();

  for (const client of allClients) {
    if (client.status === "paused") continue;

    const accounts = await storage.getAdAccounts(client.id);
    const credentials = await storage.getCredentials(client.id);

    let activeCredential = credentials.find(c => c.status === "active");

    if (!activeCredential && process.env.META_SYSTEM_USER_TOKEN) {
      activeCredential = {
        id: 0,
        clientId: client.id,
        credentialType: "system_user_token",
        tokenOwner: "env_system_user",
        scopesGranted: ["ads_read", "pages_read_engagement"],
        status: "active",
        lastValidatedAt: new Date(),
        expiresAt: null,
        createdAt: new Date(),
      } as any;
    }

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
          adsScanned: 0,
          coverageUpdated: false,
          error: err.message,
        });
      }
    }
  }

  return results;
}

export interface AdUrlEntry {
  adId: string;
  adName: string;
  adsetId?: string;
  campaignId?: string;
  destinationUrl: string;
  domain: string;
  hasUtm: boolean;
  utmParams: Record<string, string>;
  urlTags?: string;
  previewUrl?: string;
  effectiveStatus: string;
  sourceType: "link_url" | "link_data" | "video_data" | "carousel" | "shared_post" | "asset_feed";
}

export async function auditAccountUrls(adAccountId: number): Promise<{ urls: AdUrlEntry[]; error?: string }> {
  const account = await storage.getAdAccount(adAccountId);
  if (!account) throw new Error("Ad account not found");

  const client = await storage.getClient(account.clientId);
  if (!client) throw new Error("Client not found");

  const credentials = await storage.getCredentials(client.id);
  let activeCredential = credentials.find(c => c.status === "active");

  if (!activeCredential && process.env.META_SYSTEM_USER_TOKEN) {
    activeCredential = {
      id: 0,
      clientId: client.id,
      credentialType: "system_user_token",
      tokenOwner: "env_system_user",
      scopesGranted: ["ads_read", "pages_read_engagement"],
      status: "active",
      lastValidatedAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
    } as any;
  }

  if (!activeCredential) {
    return { urls: [], error: "No active credential for this client." };
  }

  const token = resolveToken(activeCredential);
  const adsResult = await getAds(account.accountId, token);

  if (adsResult.error || !adsResult.ads) {
    return { urls: [], error: adsResult.error || "Failed to fetch ads" };
  }

  const urls: AdUrlEntry[] = [];

  for (const ad of adsResult.ads) {
    const creative = ad.creative;
    if (!creative) continue;

    const spec = creative.object_story_spec;
    const urlSources: Array<{ url: string; sourceType: AdUrlEntry["sourceType"] }> = [];

    if (creative.link_url) {
      urlSources.push({ url: creative.link_url, sourceType: "link_url" });
    }
    if (spec?.link_data?.link) {
      urlSources.push({ url: spec.link_data.link, sourceType: "link_data" });
    }
    if (spec?.video_data?.link) {
      urlSources.push({ url: spec.video_data.link, sourceType: "video_data" });
    }
    if (spec?.link_data?.child_attachments) {
      for (const child of spec.link_data.child_attachments) {
        if (child.link) urlSources.push({ url: child.link, sourceType: "carousel" });
      }
    }
    if (creative.asset_feed_spec?.link_urls) {
      for (const linkObj of creative.asset_feed_spec.link_urls) {
        const linkUrl = typeof linkObj === "string" ? linkObj : linkObj?.website_url;
        if (linkUrl) urlSources.push({ url: linkUrl, sourceType: "asset_feed" });
      }
    }

    if (urlSources.length === 0 && creative.effective_object_story_id) {
      const postId = creative.effective_object_story_id;
      const pageId = postId.split("_")[0];
      const postUrl = `https://www.facebook.com/${pageId}/posts/${postId.split("_")[1]}`;
      const urlTagsStr = creative.url_tags || "";
      const utmFromTags: Record<string, string> = {};
      const hasUtmInTags = urlTagsStr.includes("utm_");

      if (urlTagsStr) {
        try {
          const tagParams = new URLSearchParams(urlTagsStr);
          for (const [key, val] of tagParams.entries()) {
            if (key.startsWith("utm_")) {
              utmFromTags[key] = val;
            }
          }
        } catch {}
      }

      urls.push({
        adId: ad.id,
        adName: ad.name,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
        destinationUrl: postUrl,
        domain: "facebook.com (shared post)",
        hasUtm: hasUtmInTags,
        utmParams: utmFromTags,
        urlTags: urlTagsStr || undefined,
        previewUrl: ad.preview_shareable_link,
        effectiveStatus: ad.effective_status,
        sourceType: "shared_post",
      });
      continue;
    }

    const seen = new Set<string>();
    for (const { url: rawUrl, sourceType } of urlSources) {
      if (seen.has(rawUrl)) continue;
      seen.add(rawUrl);

      try {
        const parsed = new URL(rawUrl);
        const utmParams: Record<string, string> = {};
        for (const [key, val] of parsed.searchParams.entries()) {
          if (key.startsWith("utm_")) {
            utmParams[key] = val;
          }
        }

        const urlTagsUtm = creative.url_tags?.includes("utm_") || false;

        urls.push({
          adId: ad.id,
          adName: ad.name,
          adsetId: ad.adset_id,
          campaignId: ad.campaign_id,
          destinationUrl: rawUrl,
          domain: parsed.hostname.replace("www.", ""),
          hasUtm: Object.keys(utmParams).length > 0 || urlTagsUtm,
          utmParams,
          urlTags: creative.url_tags || undefined,
          previewUrl: ad.preview_shareable_link,
          effectiveStatus: ad.effective_status,
          sourceType,
        });
      } catch {
        urls.push({
          adId: ad.id,
          adName: ad.name,
          adsetId: ad.adset_id,
          campaignId: ad.campaign_id,
          destinationUrl: rawUrl,
          domain: "INVALID_URL",
          hasUtm: false,
          utmParams: {},
          previewUrl: ad.preview_shareable_link,
          effectiveStatus: ad.effective_status,
          sourceType,
        });
      }
    }
  }

  return { urls };
}

export async function scanSingleAccount(adAccountId: number): Promise<ScanResult> {
  const account = await storage.getAdAccount(adAccountId);
  if (!account) throw new Error("Ad account not found");

  const client = await storage.getClient(account.clientId);
  if (!client) throw new Error("Client not found");

  const credentials = await storage.getCredentials(client.id);
  let activeCredential = credentials.find(c => c.status === "active");

  if (!activeCredential && process.env.META_SYSTEM_USER_TOKEN) {
    activeCredential = {
      id: 0,
      clientId: client.id,
      credentialType: "system_user_token",
      tokenOwner: "env_system_user",
      scopesGranted: ["ads_read", "pages_read_engagement"],
      status: "active",
      lastValidatedAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
    } as any;
  }

  if (!activeCredential) {
    throw new Error("No active credential for this client. Add a credential or set META_SYSTEM_USER_TOKEN.");
  }

  return scanAdAccount(account, activeCredential, client);
}
