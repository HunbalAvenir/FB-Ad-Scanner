import { storage } from "./storage";
import {
  validateToken,
  smokeTestAdAccount,
  getAds,
  getAdSets,
  getCampaigns,
  getAccountPages,
  getAccountInstagramAccounts,
  getImageMetadata,
  type MetaAd,
  type MetaAdSet,
  type MetaAdCreativeDetail,
  type MetaCampaign,
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
  description?: string;
  whyItMatters: string;
  recommendedFix: string;
  evidence: Record<string, any>;
  adId?: string;
  adsetId?: string;
  campaignId?: string;
  campaignObjective?: string;
  previewUrl?: string;
  adEffectiveStatus?: string;
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

  const [adsResult, adSetsResult, campaignsResult, pagesResult, igResult] = await Promise.all([
    getAds(adAccount.accountId, token),
    getAdSets(adAccount.accountId, token),
    getCampaigns(adAccount.accountId, token),
    getAccountPages(adAccount.accountId, token),
    getAccountInstagramAccounts(adAccount.accountId, token),
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
  const campaigns = campaignsResult.campaigns || [];
  const pages = pagesResult.pages || [];
  const igAccounts = igResult.igAccounts || [];

  const adsetMap = new Map<string, MetaAdSet>();
  for (const adset of adsets) {
    adsetMap.set(adset.id, adset);
  }

  const campaignMap = new Map<string, MetaCampaign>();
  for (const campaign of campaigns) {
    campaignMap.set(campaign.id, campaign);
  }

  const activeAds = ads.filter(a => a.effective_status === "ACTIVE" || a.effective_status === "PAUSED");

  const findings: Finding[] = [];

  for (const ad of activeAds) {
    const creative = ad.creative;
    if (!creative) continue;

    const placements = getAdPlacements(ad, adsetMap);
    const adPreviewUrl = ad.preview_shareable_link || undefined;
    const campaign = ad.campaign_id ? campaignMap.get(ad.campaign_id) : undefined;
    const objective = campaign?.objective || undefined;
    const adStatus = ad.effective_status;

    const aiFindings = checkAiToggles(ad, creative, client);
    findings.push(...aiFindings.map(f => ({ ...f, previewUrl: adPreviewUrl, campaignObjective: objective, adEffectiveStatus: adStatus })));

    const placementFindings = await checkPlacementFit(ad, creative, placements, client);
    findings.push(...placementFindings.map(f => ({ ...f, previewUrl: adPreviewUrl, campaignObjective: objective, adEffectiveStatus: adStatus })));

    const creativeFindings = checkCreativeIntegrity(ad, creative, client, pages, igAccounts);
    findings.push(...creativeFindings.map(f => ({ ...f, previewUrl: adPreviewUrl, campaignObjective: objective, adEffectiveStatus: adStatus })));

    const trackingFindings = checkTracking(ad, creative, client);
    findings.push(...trackingFindings.map(f => ({ ...f, previewUrl: adPreviewUrl, campaignObjective: objective, adEffectiveStatus: adStatus })));
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
      description: finding.description || finding.whyItMatters,
      ruleId: finding.ruleId,
      category: finding.category,
      recommendedFix: finding.recommendedFix,
      evidence: finding.evidence,
      whyItMatters: finding.whyItMatters,
      adId: finding.adId,
      adsetId: finding.adsetId,
      campaignId: finding.campaignId,
      campaignObjective: finding.campaignObjective,
      previewUrl: finding.previewUrl,
      adEffectiveStatus: finding.adEffectiveStatus || null,
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

  interface Enhancement {
    key: string;
    ruleId: string;
    label: string;
    severity: "high" | "medium";
    details: string[];
  }

  const enhancements: Enhancement[] = [];

  const advantageDetails: string[] = [];
  if (spec) {
    if (spec.link_data?.image_crops) advantageDetails.push("Image cropping");
    if (spec.link_data?.multi_share_optimized) advantageDetails.push("Multi-share optimization");
  }
  if (feedSpec) {
    if (feedSpec.ad_formats) advantageDetails.push(`Dynamic formats (${Array.isArray(feedSpec.ad_formats) ? feedSpec.ad_formats.join(", ") : feedSpec.ad_formats})`);
  }

  const dofSpec = feedSpec?.degrees_of_freedom_spec || creative.degrees_of_freedom_spec;
  if (dofSpec) {
    const creativeFeaturesSpec = dofSpec?.creative_features_spec;
    if (creativeFeaturesSpec) {
      const featureLabels: Record<string, string> = {
        image_background_gen: "AI Background Generation",
        image_uncrop: "Image Uncrop/Expand",
        image_auto_crop: "Auto Crop",
        image_templates: "Image Templates",
        image_touchup: "Image Touchup",
        image_touchups: "Image Touchups",
        text_optimizations: "Text Optimizations",
        image_brightness_and_contrast: "Brightness/Contrast",
        adapt_to_placement: "Adapt to Placement",
        media_liquidity: "Media Liquidity",
        site_extensions: "Site Extensions",
        text_generation: "AI Text Generation",
        describe_your_product: "Product Description",
        inline_comment: "Inline Comment",
        standard_enhancements: "Standard Enhancements",
        vc_rewrite: "Visual Copy Rewrite",
        image_enhancement: "Image Enhancement",
        carousel_to_video: "Carousel to Video",
        cv_transformation: "Carousel/Video Transformation",
        description_automation: "Description Automation",
        enhance_cta: "Enhanced CTA",
        image_animation: "Image Animation",
        pac_relaxation: "Placement Asset Customization",
        replace_media_text: "Replace Media Text",
        reveal_details_over_time: "Reveal Details Over Time",
        show_summary: "Show Summary",
        video_auto_crop: "Video Auto Crop",
        video_filtering: "Video Filtering",
        video_uncrop: "Video Uncrop/Expand",
        advantage_plus_creative: "Advantage+ Creative",
        text_translation: "Text Translation",
      };
      for (const [feature, config] of Object.entries(creativeFeaturesSpec)) {
        const cfg = config as any;
        if (cfg?.enroll_status === "OPT_IN" || cfg?.transformation_type) {
          advantageDetails.push(featureLabels[feature] || feature.replace(/_/g, " "));
        }
      }
    }
  }

  if (advantageDetails.length > 0) {
    enhancements.push({ key: "advantage_creative", ruleId: "AI_001", label: "Advantage creative enhancements", severity: "high", details: advantageDetails });
  }

  const dofFeatures = dofSpec?.creative_features_spec || {};

  const disallowedFeatures: Array<{ key: string; label: string; ruleId: string }> = [
    { key: "text_optimizations", label: "Text Improvements", ruleId: "AI_006" },
    { key: "description_automation", label: "Text Improvements (Description)", ruleId: "AI_006" },
    { key: "media_liquidity", label: "Flex Media", ruleId: "AI_007" },
    { key: "pac_relaxation", label: "Flex Media (Placement Relaxation)", ruleId: "AI_007" },
    { key: "describe_your_product", label: "Product Tags", ruleId: "AI_008" },
  ];

  const seenDisallowedRules = new Set<string>();
  for (const feat of disallowedFeatures) {
    const cfg = dofFeatures[feat.key] as any;
    if (cfg?.enroll_status === "OPT_IN" || cfg?.transformation_type) {
      if (seenDisallowedRules.has(feat.ruleId)) continue;
      seenDisallowedRules.add(feat.ruleId);
      const ruleLabels: Record<string, string> = {
        AI_006: "Text Improvements",
        AI_007: "Flex Media",
        AI_008: "Product Tags",
      };
      findings.push({
        ruleId: feat.ruleId,
        severity: "high",
        category: "AI_TOGGLE",
        issueType: "ai_toggle",
        message: `${ruleLabels[feat.ruleId]} enabled on ad "${ad.name}"`,
        whyItMatters: `${ruleLabels[feat.ruleId]} must be turned off. This feature allows Meta to automatically modify your ad content which can misrepresent the brand.`,
        recommendedFix: `Disable ${ruleLabels[feat.ruleId]!.toLowerCase()} in the ad's Advantage Creative settings.`,
        description: `${ruleLabels[feat.ruleId]} is enabled and must be turned off.`,
        evidence: { feature: feat.key, feature_label: feat.label, ad_name: ad.name },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  const siteExtCfg = dofFeatures.site_extensions as any;
  if (siteExtCfg?.enroll_status === "OPT_IN" || siteExtCfg?.transformation_type) {
    findings.push({
      ruleId: "AI_009",
      severity: "high",
      category: "AI_TOGGLE",
      issueType: "ai_toggle",
      message: `Sitelinks enabled on ad "${ad.name}"`,
      whyItMatters: "Sitelinks must be turned off. Meta auto-generates additional links that may direct users to unintended pages.",
      recommendedFix: "Disable sitelinks in the ad's creative setup section.",
      description: "Sitelinks are enabled and must be turned off.",
      evidence: { feature: "site_extensions", ad_name: ad.name },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  const hasProducts = (feedSpec?.shops_bundle && Object.keys(feedSpec.shops_bundle).length > 0)
    || (feedSpec?.product_set_id)
    || (Array.isArray(feedSpec?.retailer_item_ids) && feedSpec.retailer_item_ids.length > 0);
  if (hasProducts) {
    findings.push({
      ruleId: "AI_010",
      severity: "high",
      category: "AI_TOGGLE",
      issueType: "ai_toggle",
      message: `Products associated with ad "${ad.name}"`,
      whyItMatters: "Products must not be associated with the ad. Product catalog associations can cause Meta to modify the ad with product-specific content.",
      recommendedFix: "Remove the products association from the ad's creative setup section.",
      description: "Products are associated with this ad and must be removed.",
      evidence: { feature: "products_association", ad_name: ad.name },
      adId: ad.id,
      adsetId: ad.adset_id,
      campaignId: ad.campaign_id,
    });
  }

  if (feedSpec) {
    const imgTransformDetails: string[] = [];
    if (feedSpec.image_transformation_types?.includes("bg_gen")) imgTransformDetails.push("Background generation");
    if (feedSpec.image_transformation_types?.includes("expand")) imgTransformDetails.push("Image expansion");
    if (imgTransformDetails.length > 0) {
      enhancements.push({ key: "image_expansion", ruleId: "AI_002", label: "Image expansion", severity: "high", details: imgTransformDetails });
    }

    const textDetails: string[] = [];
    if (feedSpec.optimization_type === "DEGREE_OF_FREEDOM") textDetails.push("Degree of freedom optimization");
    if (feedSpec.text_optimization_type) textDetails.push(`Text optimization: ${feedSpec.text_optimization_type}`);
    if (textDetails.length > 0) {
      enhancements.push({ key: "auto_text", ruleId: "AI_003", label: "Auto text generation", severity: "medium", details: textDetails });
    }

    const mediaDetails: string[] = [];
    if (feedSpec.music_type) mediaDetails.push(`Music: ${feedSpec.music_type}`);
    if (feedSpec.video_filtering_type) mediaDetails.push(`Video filter: ${feedSpec.video_filtering_type}`);
    if (mediaDetails.length > 0) {
      enhancements.push({ key: "auto_music_filters", ruleId: "AI_004", label: "Auto music/filters", severity: "medium", details: mediaDetails });
    }
  }

  const seenRules = new Set<string>();
  for (const enh of enhancements) {
    if (seenRules.has(enh.ruleId)) continue;
    seenRules.add(enh.ruleId);

    const detailStr = enh.details.join(", ");
    findings.push({
      ruleId: enh.ruleId,
      severity: enh.severity,
      category: "AI_TOGGLE",
      issueType: "ai_toggle",
      message: `${enh.label} enabled on ad "${ad.name}"`,
      whyItMatters: "AI-modified creatives can alter your approved assets in unexpected ways, potentially misrepresenting the brand or product.",
      recommendedFix: `Disable ${enh.label.toLowerCase()} in ad settings or add "${enh.key}" to the client's allowed enhancements list.`,
      evidence: { enhancement_type: enh.key, active_features: enh.details, ad_name: ad.name },
      description: `Active AI features: ${detailStr}`,
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
          active_features: enh.details,
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

  if (isVertical(assetRatio)) {
    const nonStoryPlacements = placements.all.filter(p => !STORY_PLACEMENTS.includes(p.toLowerCase()));
    const isOnlyStories = placements.all.length > 0 && nonStoryPlacements.length === 0;

    if (!isOnlyStories) {
      findings.push({
        ruleId: "ASPECT_001",
        severity: "blocker",
        category: "PLACEMENT_FIT",
        issueType: "placement_fit",
        message: `9:16 asset in non-story placement on ad "${ad.name}"`,
        whyItMatters: "9:16 vertical assets can only be used in Stories and Reels placements. All other placements will crop the asset and make ads look broken.",
        recommendedFix: "Restrict this ad to Stories/Reels placements only, or upload a 1:1 or 4:5 version for other placements.",
        description: `9:16 asset found in: ${nonStoryPlacements.length > 0 ? nonStoryPlacements.join(", ") : "automatic (all placements)"}. Must be restricted to Stories/Reels only.`,
        evidence: { asset_ratio: assetRatio, non_story_placements: nonStoryPlacements, all_placements: placements.all, width: assetWidth, height: assetHeight },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  if (placements.story && isSquare(assetRatio)) {
    findings.push({
      ruleId: "ASPECT_002",
      severity: "medium",
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
  pages: Array<{ id: string; name: string }>,
  igAccounts: Array<{ id: string; username?: string; name?: string }>
): Finding[] {
  const findings: Finding[] = [];
  const spec = creative.object_story_spec;

  const isLinkAd = creative.object_type === "SHARE" || creative.link_url || spec?.link_data;
  if (isLinkAd && !creative.call_to_action_type) {
    const ctaFromSpec = spec?.link_data?.call_to_action?.type || spec?.video_data?.call_to_action?.type;
    const afs = creative.asset_feed_spec;
    const ctaFromAssetFeed = afs?.call_to_action_types?.length > 0
      || afs?.call_to_actions?.length > 0
      || afs?.link_urls?.some((lu: any) => lu.call_to_action?.type);
    if (!ctaFromSpec && !ctaFromAssetFeed) {
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
  if (pageId) {
    const accountPageIds = pages.map(p => p.id);
    const allowedPageIds = client.allowedPageIds || [];
    const normalizePageId = (id: string) => id.replace(/^page_/, "");
    const normalizedPageId = normalizePageId(pageId);
    const inAccountPages = accountPageIds.length > 0 && accountPageIds.some(id => normalizePageId(id) === normalizedPageId);
    const inAllowedList = allowedPageIds.length > 0 && allowedPageIds.some(id => normalizePageId(id) === normalizedPageId);
    const hasValidationData = accountPageIds.length > 0 || allowedPageIds.length > 0;
    const approved = inAccountPages || inAllowedList;
    if (hasValidationData && !approved) {
      const usedPage = pages.find(p => normalizePageId(p.id) === normalizedPageId);
      const accountPageNames = pages.map(p => p.name).filter(Boolean);
      findings.push({
        ruleId: "CREATIVE_003",
        severity: "high",
        category: "CREATIVE_INTEGRITY",
        issueType: "creative_integrity",
        message: `Wrong Facebook page on ad "${ad.name}"`,
        whyItMatters: "Ads running under a Facebook page not associated with this ad account misrepresent the brand identity.",
        recommendedFix: accountPageIds.length > 0
          ? `Update the ad to use one of the pages connected to this ad account: ${accountPageNames.join(", ") || accountPageIds.join(", ")}.`
          : `Update the ad to use an approved page ID: ${allowedPageIds.join(", ")}.`,
        evidence: { page_id: pageId, ad_name: ad.name, account_pages: accountPageNames.length > 0 ? accountPageNames : accountPageIds },
        adId: ad.id,
        adsetId: ad.adset_id,
        campaignId: ad.campaign_id,
      });
    }
  }

  const igActorId = creative.instagram_actor_id || spec?.instagram_user_id || spec?.instagram_actor_id;
  if (igActorId) {
    const normalizeIgId = (id: string) => id.replace(/^ig_/, "");
    const normalizedIgId = normalizeIgId(String(igActorId));
    const accountIgIds = igAccounts.map(a => a.id);
    const allowedIgIds = client.allowedIgActorIds || [];
    const inAccountIg = accountIgIds.length > 0 && accountIgIds.some(id => normalizeIgId(id) === normalizedIgId);
    const inAllowedIg = allowedIgIds.length > 0 && allowedIgIds.some(id => normalizeIgId(id) === normalizedIgId);
    const hasValidationData = accountIgIds.length > 0 || allowedIgIds.length > 0;
    const approved = inAccountIg || inAllowedIg;
    if (hasValidationData && !approved) {
      const accountIgNames = igAccounts.map(a => a.username || a.name).filter(Boolean);
      findings.push({
        ruleId: "CREATIVE_005",
        severity: "high",
        category: "CREATIVE_INTEGRITY",
        issueType: "creative_integrity",
        message: `Wrong Instagram account on ad "${ad.name}"`,
        whyItMatters: "Ads running under an Instagram account not associated with this ad account misrepresent the brand identity.",
        recommendedFix: accountIgIds.length > 0
          ? `Update the ad to use one of the Instagram accounts connected to this ad account: ${accountIgNames.join(", ") || accountIgIds.join(", ")}.`
          : `Update the ad to use an approved Instagram account ID: ${allowedIgIds.join(", ")}.`,
        description: `Instagram account ${igActorId} is not associated with this ad account.`,
        evidence: { instagram_actor_id: igActorId, ad_name: ad.name, account_ig_accounts: accountIgNames.length > 0 ? accountIgNames : accountIgIds },
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
