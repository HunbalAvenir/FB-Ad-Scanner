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

export interface MetaAdAccountInfo {
  id: string;
  name: string;
  account_status: number;
  business_name?: string;
  currency?: string;
  timezone_name?: string;
}

async function paginateAccounts(token: string, initialPath: string): Promise<{ accounts: MetaAdAccountInfo[]; error?: string }> {
  const allAccounts: MetaAdAccountInfo[] = [];
  let path = initialPath;
  const params: Record<string, string> = {
    fields: "name,account_status,business_name,currency,timezone_name",
    limit: "200",
  };

  while (true) {
    const res = await metaFetch<MetaAdAccountInfo[]>(path, token, params);
    if (res.error) {
      return { accounts: allAccounts, error: res.error.message };
    }
    if (Array.isArray(res.data)) {
      allAccounts.push(...res.data);
    }
    if (res.paging?.next) {
      const nextUrl = new URL(res.paging.next);
      path = nextUrl.pathname.replace("/v21.0", "");
      params.after = nextUrl.searchParams.get("after") || "";
      delete params.limit;
    } else {
      break;
    }
  }

  return { accounts: allAccounts };
}

export async function listAdAccounts(token: string): Promise<{ accounts?: MetaAdAccountInfo[]; error?: string }> {
  const primary = await paginateAccounts(token, "/me/adaccounts");
  if (primary.error && primary.accounts.length === 0) {
    return { error: primary.error };
  }
  let allAccounts = primary.accounts;

  if (allAccounts.length === 0) {
    const meRes = await metaFetch<any>("/me", token, { fields: "id" });
    if (meRes.error) {
      return { error: meRes.error.message };
    }
    const userId = (meRes.data as any)?.id;
    if (userId) {
      const bizRes = await metaFetch<any[]>(`/${userId}/businesses`, token, { fields: "id,name", limit: "100" });
      const businesses = Array.isArray(bizRes.data) ? bizRes.data : [];

      for (const biz of businesses) {
        const owned = await paginateAccounts(token, `/${biz.id}/owned_ad_accounts`);
        const client = await paginateAccounts(token, `/${biz.id}/client_ad_accounts`);
        allAccounts.push(...owned.accounts, ...client.accounts);
      }
    }
  }

  const seen = new Set<string>();
  const deduped = allAccounts.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return { accounts: deduped };
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

export interface MetaAdCreativeDetail {
  id: string;
  object_story_spec?: any;
  asset_feed_spec?: any;
  degrees_of_freedom_spec?: any;
  image_url?: string;
  image_hash?: string;
  thumbnail_url?: string;
  video_id?: string;
  call_to_action_type?: string;
  link_url?: string;
  instagram_actor_id?: string;
  object_type?: string;
  effective_object_story_id?: string;
  url_tags?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  creative?: MetaAdCreativeDetail;
  adset_id?: string;
  campaign_id?: string;
  tracking_specs?: any[];
  preview_shareable_link?: string;
}

export async function getAds(accountId: string, token: string, limit = 100): Promise<{
  ads?: MetaAd[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetch<MetaAd[]>(`/${actId}/ads`, token, {
    fields: "id,name,status,effective_status,creative{id,object_story_spec,asset_feed_spec,degrees_of_freedom_spec,image_url,image_hash,thumbnail_url,video_id,call_to_action_type,link_url,instagram_actor_id,object_type,effective_object_story_id,url_tags},adset_id,campaign_id,tracking_specs,preview_shareable_link",
    limit: String(limit),
  });

  if (res.error) return { error: res.error.message };
  return { ads: res.data as MetaAd[] };
}

export interface MetaAdSetTargeting {
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
  [key: string]: any;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  targeting?: MetaAdSetTargeting;
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
    fields: "id,name,status,effective_status,targeting{publisher_platforms,facebook_positions,instagram_positions,device_platforms},optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,promoted_object",
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

export interface ImageMetadata {
  width: number;
  height: number;
  aspect_ratio: string;
}

export async function getImageMetadata(imageUrl: string): Promise<ImageMetadata | null> {
  try {
    const res = await fetch(imageUrl, { method: "GET" });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    let width = 0;
    let height = 0;

    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          break;
        }
        const segLen = buffer.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
    }

    if (width === 0 || height === 0) return null;

    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const d = gcd(width, height);
    const aspect_ratio = `${width / d}:${height / d}`;

    return { width, height, aspect_ratio };
  } catch {
    return null;
  }
}

export async function getVideoThumbnail(videoId: string, token: string): Promise<{
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}> {
  const res = await metaFetch<any>(`/${videoId}`, token, {
    fields: "thumbnails{uri,width,height},source,picture",
  });

  if (res.error) return { error: res.error.message };

  const data = res.data as any;
  const thumb = data?.thumbnails?.data?.[0];
  if (thumb) {
    return {
      thumbnailUrl: thumb.uri,
      width: thumb.width,
      height: thumb.height,
    };
  }

  return { thumbnailUrl: data?.picture };
}


export function generateAppAccessToken(): string {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID and META_APP_SECRET required");
  return `${appId}|${appSecret}`;
}
