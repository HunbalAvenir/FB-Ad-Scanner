const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

// A stalled request would otherwise hang a whole scan.
const META_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 15_000;

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  is_transient?: boolean;
  fbtrace_id?: string;
}

export interface MetaApiResponse<T> {
  data?: T;
  error?: MetaApiError;
  paging?: { cursors: { before: string; after: string }; next?: string };
}

function metaUrl(path: string, token: string, params: Record<string, string>): string {
  const url = new URL(`${META_GRAPH_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  return url.toString();
}

async function metaFetch<T>(path: string, token: string, params: Record<string, string> = {}): Promise<MetaApiResponse<T>> {
  return metaRequest<T>(metaUrl(path, token, params));
}

async function metaRequest<T>(url: string): Promise<MetaApiResponse<T>> {
  let json: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(META_TIMEOUT_MS) });
    json = await res.json();
  } catch (err: any) {
    // Timeouts and network failures are reported like Meta's own transient errors, so they get retried.
    return { error: { message: `Meta request failed: ${err?.message ?? err}`, type: "network", code: 2, is_transient: true } };
  }

  if (json.error) {
    return { error: json.error };
  }

  if (json.data) {
    return { data: json.data, paging: json.paging };
  }

  return { data: json };
}

// Large accounts regularly get "An unexpected error has occurred. Please retry
// your request later." on some page; retrying that page usually succeeds.
async function metaRequestWithRetry<T>(url: string, retries = 2): Promise<MetaApiResponse<T>> {
  for (let attempt = 0; ; attempt++) {
    const res = await metaRequest<T>(url);
    const transient = res.error && (res.error.is_transient || res.error.code === 1 || res.error.code === 2);
    if (!transient || attempt >= retries) return res;
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}

// Follows paging.next until every page is fetched. If a page still fails after
// retries, returns the items fetched so far along with the error.
async function metaFetchAll<T>(path: string, token: string, params: Record<string, string> = {}): Promise<{ data: T[]; error?: string }> {
  const all: T[] = [];
  let res = await metaRequestWithRetry<T[]>(metaUrl(path, token, params));

  while (true) {
    if (res.error) return { data: all, error: res.error.message };
    if (Array.isArray(res.data)) all.push(...res.data);
    if (!res.paging?.next) return { data: all };
    res = await metaRequestWithRetry<T[]>(res.paging.next);
  }
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

async function paginateAccounts(token: string, path: string): Promise<{ accounts: MetaAdAccountInfo[]; error?: string }> {
  const res = await metaFetchAll<MetaAdAccountInfo>(path, token, {
    fields: "name,account_status,business_name,currency,timezone_name",
    limit: "200",
  });
  return { accounts: res.data, error: res.error };
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

// effectiveStatuses filters on Meta's side. Big accounts hold thousands of archived
// ads, so fetching only the statuses you need saves most of the time and rate limit.
export async function getAds(accountId: string, token: string, effectiveStatuses?: string[]): Promise<{
  ads?: MetaAd[];
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params: Record<string, string> = {
    fields: "id,name,status,effective_status,creative{id,object_story_spec,asset_feed_spec,degrees_of_freedom_spec,image_url,image_hash,thumbnail_url,video_id,call_to_action_type,link_url,instagram_actor_id,object_type,effective_object_story_id,url_tags},adset_id,campaign_id,tracking_specs,preview_shareable_link",
    limit: "100",
  };
  if (effectiveStatuses) {
    params.filtering = JSON.stringify([{ field: "effective_status", operator: "IN", value: effectiveStatuses }]);
  }
  const res = await metaFetchAll<MetaAd>(`/${actId}/ads`, token, params);

  return { ads: res.data, error: res.error };
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
  const res = await metaFetchAll<MetaAdSet>(`/${actId}/adsets`, token, {
    fields: "id,name,status,effective_status,targeting{publisher_platforms,facebook_positions,instagram_positions,device_platforms},optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,promoted_object",
    limit: String(limit),
  });

  return { adsets: res.data, error: res.error };
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
  const res = await metaFetchAll<MetaCreative>(`/${actId}/adcreatives`, token, {
    fields: "id,name,title,body,image_url,thumbnail_url,object_story_spec,asset_feed_spec,url_tags,effective_object_story_id",
    limit: String(limit),
  });

  return { creatives: res.data, error: res.error };
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
  const res = await metaFetchAll<MetaCampaign>(`/${actId}/campaigns`, token, {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,special_ad_categories",
    limit: String(limit),
  });

  return { campaigns: res.data, error: res.error };
}

export async function getAccountPages(accountId: string, token: string): Promise<{
  pages?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetchAll<{ id: string; name: string }>(`/${actId}/promote_pages`, token, {
    fields: "id,name",
    limit: "100",
  });

  return { pages: res.data, error: res.error };
}

export async function getAccountInstagramAccounts(accountId: string, token: string): Promise<{
  igAccounts?: Array<{ id: string; username?: string; name?: string }>;
  error?: string;
}> {
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const res = await metaFetchAll<{ id: string; username?: string; name?: string }>(`/${actId}/instagram_accounts`, token, {
    fields: "id,username,name",
    limit: "100",
  });

  return { igAccounts: res.data, error: res.error };
}

export interface ImageMetadata {
  width: number;
  height: number;
  aspect_ratio: string;
}

export async function getImageMetadata(imageUrl: string): Promise<ImageMetadata | null> {
  try {
    const res = await fetch(imageUrl, { method: "GET", signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
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
