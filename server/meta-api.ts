const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface MetaApiResponse<T> {
  data?: T;
  error?: MetaApiError;
  paging?: { cursors: { before: string; after: string }; next?: string };
}

async function metaFetch<T>(path: string, token: string, params: Record<string, string> = {}): Promise<MetaApiResponse<T>> {
  const url = new URL(`${META_GRAPH_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  const res = await fetch(url.toString());
  const json = await res.json() as any;

  if (json.error) {
    return { error: json.error };
  }

  if (json.data) {
    return { data: json.data, paging: json.paging };
  }

  return { data: json };
}

export async function validateToken(token: string): Promise<{
  valid: boolean;
  appId?: string;
  userId?: string;
  scopes?: string[];
  expiresAt?: number;
  error?: string;
}> {
  const res = await metaFetch<any>("/debug_token", token, {
    input_token: token,
  });

  if (res.error) {
    return { valid: false, error: res.error.message };
  }

  const d = (res.data as any)?.data || res.data;
  if (!d || !d.is_valid) {
    return { valid: false, error: d?.error?.message || "Token is not valid" };
  }

  return {
    valid: true,
    appId: d.app_id,
    userId: d.user_id,
    scopes: d.scopes || [],
    expiresAt: d.expires_at ? d.expires_at * 1000 : undefined,
  };
}

export async function smokeTestAdAccount(accountId: string, token: string): Promise<{
  accessible: boolean;
  accountName?: string;
  accountStatus?: number;
  error?: string;
  errorCode?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<any>(`/${actId}`, token, {
    fields: "name,account_status,business_name,currency,timezone_name",
  });

  if (res.error) {
    let errorCode = "API_ERROR";
    if (res.error.code === 190) errorCode = "TOKEN_EXPIRED";
    else if (res.error.code === 100) errorCode = "INVALID_PARAMETER";
    else if (res.error.code === 200) errorCode = "PERMISSION_ERROR";
    else if (res.error.code === 273) errorCode = "PERMISSION_ERROR";
    else if (res.error.code === 10) errorCode = "PERMISSION_ERROR";

    return { accessible: false, error: res.error.message, errorCode };
  }

  const data = res.data as any;
  return {
    accessible: true,
    accountName: data.name,
    accountStatus: data.account_status,
  };
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  creative?: {
    id: string;
  };
  adset_id?: string;
  campaign_id?: string;
}

export async function getAds(accountId: string, token: string, limit = 100): Promise<{
  ads?: MetaAd[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<MetaAd[]>(`/${actId}/ads`, token, {
    fields: "id,name,status,effective_status,creative{id},adset_id,campaign_id",
    limit: String(limit),
  });

  if (res.error) return { error: res.error.message };
  return { ads: res.data as MetaAd[] };
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  targeting?: any;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  promoted_object?: any;
}

export async function getAdSets(accountId: string, token: string, limit = 100): Promise<{
  adsets?: MetaAdSet[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<MetaAdSet[]>(`/${actId}/adsets`, token, {
    fields: "id,name,status,effective_status,targeting,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,promoted_object",
    limit: String(limit),
  });

  if (res.error) return { error: res.error.message };
  return { adsets: res.data as MetaAdSet[] };
}

export interface MetaCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_story_spec?: any;
  asset_feed_spec?: any;
  url_tags?: string;
  effective_object_story_id?: string;
}

export async function getAdCreatives(accountId: string, token: string, limit = 100): Promise<{
  creatives?: MetaCreative[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<MetaCreative[]>(`/${actId}/adcreatives`, token, {
    fields: "id,name,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec,url_tags,effective_object_story_id",
    limit: String(limit),
  });

  if (res.error) return { error: res.error.message };
  return { creatives: res.data as MetaCreative[] };
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  special_ad_categories?: string[];
}

export async function getCampaigns(accountId: string, token: string, limit = 100): Promise<{
  campaigns?: MetaCampaign[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<MetaCampaign[]>(`/${actId}/campaigns`, token, {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,special_ad_categories",
    limit: String(limit),
  });

  if (res.error) return { error: res.error.message };
  return { campaigns: res.data as MetaCampaign[] };
}

export async function getAccountPages(accountId: string, token: string): Promise<{
  pages?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<any[]>(`/${actId}/promote_pages`, token, {
    fields: "id,name",
  });

  if (res.error) return { error: res.error.message };
  return { pages: res.data as Array<{ id: string; name: string }> };
}

export function generateAppAccessToken(): string {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID and META_APP_SECRET required");
  return `${appId}|${appSecret}`;
}
