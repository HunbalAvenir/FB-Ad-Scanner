export const RULE_LABELS: Record<string, string> = {
  AI_001: "AI Creative Enhancements On",
  AI_002: "Image Expansion On",
  AI_003: "Auto Text Generation On",
  AI_004: "Auto Music/Filters On",
  AI_005: "AI Policy Violation",
  ASPECT_001: "9:16 Vertical in Feed",
  ASPECT_002: "Square in Stories/Reels",
  ASPECT_003: "Missing Placement Assets",
  ASPECT_004: "Extreme Crop Risk",
  CREATIVE_001: "Missing CTA",
  CREATIVE_002: "Unapproved Domain",
  CREATIVE_003: "Wrong Facebook Page",
  CREATIVE_004: "Missing Video Thumbnail",
  TRACK_001: "Missing UTM Parameters",
  TRACK_002: "Invalid Pixel",
  ACCESS_001: "Account Access Error",
};

export const TYPE_LABELS: Record<string, string> = {
  ai_toggle: "AI Toggle",
  placement_fit: "Placement Fit",
  creative_integrity: "Creative Integrity",
  tracking: "Tracking",
  access: "Access",
};

export const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_LEADS: "Lead Generation",
  OUTCOME_SALES: "Sales",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_APP_PROMOTION: "App Promotion",
  CONVERSIONS: "Conversions",
  LINK_CLICKS: "Traffic",
  LEAD_GENERATION: "Lead Generation",
  BRAND_AWARENESS: "Awareness",
  REACH: "Reach",
  POST_ENGAGEMENT: "Engagement",
  VIDEO_VIEWS: "Video Views",
  MESSAGES: "Messages",
  CATALOG_SALES: "Catalog Sales",
  STORE_VISITS: "Store Visits",
  APP_INSTALLS: "App Installs",
};

export function ruleLabel(ruleId: string | null | undefined): string {
  if (!ruleId) return "";
  return RULE_LABELS[ruleId] || ruleId;
}

export function typeLabel(issueType: string): string {
  return TYPE_LABELS[issueType] || issueType.replace(/_/g, " ");
}

export function objectiveLabel(objective: string | null | undefined): string {
  if (!objective) return "";
  return OBJECTIVE_LABELS[objective] || objective.replace(/^OUTCOME_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
