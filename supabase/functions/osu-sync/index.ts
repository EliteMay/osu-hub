const OSU_BASE = 'https://osu.ppy.sh';
const TOKEN_KEY = 'default';
const UPSTREAM_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 60000;
const ALLOWED_MODES = new Set(['osu', 'taiko', 'fruits', 'mania']);
const syncCache = new Map<string, { expiresAt: number; payload: unknown }>();

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === 'https://elitemay.github.io') return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

async function readJson(req: Request) {
  const raw = await req.text();
  if (raw.length > 20000) throw new Error('Request body is too large.');
  return raw ? JSON.parse(raw) : {};
}

function serviceHeaders() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service environment is unavailable.');
  return { url, key };
}

async function getStoredToken() {
  const { url, key } = serviceHeaders();
  const response = await fetch(`${url}/rest/v1/osu_api_tokens?token_key=eq.${TOKEN_KEY}&select=access_token,token_type,scope,expires_at,updated_at&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Token store read failed (${response.status}).`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function storeToken(token: { accessToken: string; tokenType: string; scope: string; expiresIn: number }) {
  const { url, key } = serviceHeaders();
  const now = Date.now();
  const row = {
    token_key: TOKEN_KEY,
    access_token: token.accessToken,
    token_type: token.tokenType,
    scope: token.scope,
    expires_at: new Date(now + token.expiresIn * 1000).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  const response = await fetch(`${url}/rest/v1/osu_api_tokens?on_conflict=token_key`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Token store write failed (${response.status}).`);
  return row;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function retryAfter(response: Response) {
  const raw = response.headers.get('retry-after');
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.trunc(seconds) : null;
}

async function refreshToken(body: Record<string, unknown>, origin: string | null) {
  const clientId = String(body.clientId ?? '').trim();
  const clientSecret = String(body.clientSecret ?? '').trim();
  if (!/^\d+$/.test(clientId) || clientSecret.length < 16 || clientSecret.length > 500) {
    return jsonResponse({ ok: false, error: 'Invalid osu! OAuth credentials.' }, 400, origin);
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'public',
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(`${OSU_BASE}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse({ ok: false, error: 'osu! OAuth request timed out.' }, 504, origin);
    }
    throw error;
  }

  if (!response.ok) {
    const retry = retryAfter(response);
    return jsonResponse({
      ok: false,
      error: response.status === 429 ? 'osu! OAuth rate limit reached.' : `osu! OAuth failed (${response.status}).`,
      retryAfter: retry,
    }, response.status === 429 ? 429 : 502, origin, retry == null ? {} : { 'Retry-After': String(retry) });
  }

  const payload = await response.json().catch(() => ({}));
  const accessToken = String(payload?.access_token ?? '');
  const tokenType = String(payload?.token_type ?? '');
  const expiresIn = Number(payload?.expires_in);
  const scope = String(payload?.scope ?? 'public');
  if (tokenType.toLowerCase() !== 'bearer' || accessToken.length < 20 || !Number.isFinite(expiresIn) || expiresIn < 3600) {
    return jsonResponse({ ok: false, error: 'osu! OAuth returned an invalid token response.' }, 502, origin);
  }

  const stored = await storeToken({ accessToken, tokenType: 'Bearer', scope, expiresIn: Math.trunc(expiresIn) });
  return jsonResponse({
    ok: true,
    service: 'osu-hub-sync',
    tokenStored: true,
    expiresAt: stored.expires_at,
    expiresIn: Math.trunc(expiresIn),
  }, 200, origin);
}

function modeValue(value: unknown) {
  const mode = String(value ?? 'osu').trim();
  return ALLOWED_MODES.has(mode) ? mode : 'osu';
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fullOsuUrl(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
  if (raw.startsWith('/')) return `${OSU_BASE}${raw}`;
  return '';
}

function modsText(mods: unknown) {
  if (!Array.isArray(mods) || mods.length === 0) return 'NM';
  const names = mods.map((mod) => {
    if (typeof mod === 'string') return mod;
    if (mod && typeof mod === 'object' && 'acronym' in mod) return String((mod as { acronym?: unknown }).acronym ?? '');
    return '';
  }).filter(Boolean);
  return names.length ? names.join('') : 'NM';
}

function missCount(statistics: any) {
  return Number(statistics?.miss ?? statistics?.count_miss ?? 0) || 0;
}

function normalizeScore(score: any) {
  const beatmap = score?.beatmap ?? {};
  const beatmapset = score?.beatmapset ?? {};
  const artist = String(beatmapset?.artist_unicode || beatmapset?.artist || '');
  const title = String(beatmapset?.title_unicode || beatmapset?.title || '');
  const difficulty = String(beatmap?.version || '');
  const scoreId = String(score?.id ?? score?.legacy_score_id ?? '').trim();
  const accuracyRaw = Number(score?.accuracy ?? 0);
  const accuracy = accuracyRaw <= 1 ? accuracyRaw * 100 : accuracyRaw;
  return {
    id: `osu:${scoreId}`,
    osuScoreId: scoreId,
    beatmapId: safeNumber(beatmap?.id),
    beatmapsetId: safeNumber(beatmapset?.id ?? beatmap?.beatmapset_id),
    mapName: [artist && title ? `${artist} - ${title}` : title || artist || 'Unknown map', difficulty ? `[${difficulty}]` : ''].filter(Boolean).join(' '),
    artist,
    title,
    difficulty,
    mapper: String(beatmapset?.creator || ''),
    date: String(score?.ended_at || score?.created_at || '').slice(0, 10),
    playedAt: score?.ended_at || score?.created_at || null,
    accuracy,
    miss: missCount(score?.statistics),
    combo: Number(score?.max_combo ?? 0) || 0,
    pp: safeNumber(score?.pp),
    stars: safeNumber(beatmap?.difficulty_rating),
    bpm: safeNumber(beatmap?.bpm),
    ar: safeNumber(beatmap?.ar),
    od: safeNumber(beatmap?.accuracy),
    cs: safeNumber(beatmap?.cs),
    hp: safeNumber(beatmap?.drain),
    mods: modsText(score?.mods),
    rank: String(score?.rank || ''),
    passed: score?.passed !== false,
    hasReplay: Boolean(score?.has_replay),
    totalScore: Number(score?.total_score ?? score?.score ?? 0) || 0,
    coverUrl: String(beatmapset?.covers?.cover || beatmapset?.covers?.card || ''),
    beatmapUrl: fullOsuUrl(beatmap?.url) || (beatmap?.id ? `${OSU_BASE}/beatmaps/${beatmap.id}` : ''),
  };
}

async function osuApiFetch(path: string, token: string) {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${OSU_BASE}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const e = new Error('osu! API request timed out.');
      (e as any).status = 504;
      throw e;
    }
    throw error;
  }
  if (!response.ok) {
    const e = new Error(response.status === 429 ? 'osu! API rate limit reached.' : `osu! API request failed (${response.status}).`);
    (e as any).status = response.status;
    (e as any).retryAfter = retryAfter(response);
    throw e;
  }
  return response.json();
}

async function sync(body: Record<string, unknown>, origin: string | null) {
  const user = String(body.user ?? '').trim().slice(0, 64);
  if (!user) return jsonResponse({ ok: false, error: 'osu! User ID or username is required.' }, 400, origin);
  const mode = modeValue(body.mode);
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 100));
  const includeFails = body.includeFails !== false && body.includeFails !== 0 && body.includeFails !== '0';
  const cacheKey = `${user.toLowerCase()}|${mode}|${limit}|${includeFails ? 1 : 0}`;
  const cached = syncCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return jsonResponse(cached.payload, 200, origin);

  const tokenRow = await getStoredToken();
  const expiresAt = tokenRow?.expires_at ? Date.parse(tokenRow.expires_at) : 0;
  if (!tokenRow?.access_token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60000) {
    return jsonResponse({ ok: false, error: 'osu! API token is not configured or has expired.', code: 'token_unavailable' }, 503, origin);
  }

  try {
    const key = /^\d+$/.test(user) ? 'id' : 'username';
    const userData = await osuApiFetch(`/api/v2/users/${encodeURIComponent(user)}/${mode}?key=${key}`, tokenRow.access_token);
    const userId = Number(userData?.id);
    if (!Number.isFinite(userId) || userId <= 0) return jsonResponse({ ok: false, error: 'osu! user could not be resolved.' }, 404, origin);

    const scoreParams = new URLSearchParams({
      include_fails: includeFails ? '1' : '0',
      mode,
      limit: String(limit),
    });
    const rawScores = await osuApiFetch(`/api/v2/users/${userId}/scores/recent?${scoreParams}`, tokenRow.access_token);
    const scores = Array.isArray(rawScores) ? rawScores.map(normalizeScore).filter((row) => /^\d+$/.test(row.osuScoreId)) : [];
    const stats = userData?.statistics ?? {};
    const payload = {
      ok: true,
      service: 'osu-hub-sync',
      apiVersion: 1,
      provider: 'supabase-edge-function',
      syncedAt: new Date().toISOString(),
      user: {
        id: userId,
        username: String(userData?.username || user),
        avatarUrl: String(userData?.avatar_url || ''),
        countryCode: String(userData?.country_code || ''),
        ruleset: mode,
        pp: safeNumber(stats?.pp),
        globalRank: safeNumber(stats?.global_rank),
        countryRank: safeNumber(stats?.country_rank),
        hitAccuracy: safeNumber(stats?.hit_accuracy),
        playCount: safeNumber(stats?.play_count),
        maximumCombo: safeNumber(stats?.maximum_combo),
      },
      scores,
    };
    syncCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return jsonResponse(payload, 200, origin);
  } catch (error) {
    const status = Number((error as any)?.status) || 502;
    const retry = (error as any)?.retryAfter;
    return jsonResponse({ ok: false, error: String((error as Error)?.message || 'osu! API request failed.'), retryAfter: retry ?? null }, status === 401 ? 503 : status, origin, retry == null ? {} : { 'Retry-After': String(retry) });
  }
}

async function health(origin: string | null) {
  const token = await getStoredToken();
  const expiresAt = token?.expires_at ? Date.parse(token.expires_at) : 0;
  const configured = Boolean(token?.access_token && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60000);
  return jsonResponse({
    ok: true,
    service: 'osu-hub-sync',
    apiVersion: 1,
    provider: 'supabase-edge-function',
    configured,
    tokenExpiresAt: configured ? token.expires_at : null,
    browserOAuthRequired: false,
  }, 200, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, origin);
  if (origin && !isAllowedOrigin(origin)) return jsonResponse({ ok: false, error: 'Origin not allowed.' }, 403, origin);

  try {
    const body = await readJson(req) as Record<string, unknown>;
    const action = String(body.action ?? '').trim();
    if (action === 'health') return await health(origin);
    if (action === 'refresh') return await refreshToken(body, origin);
    if (action === 'sync') return await sync(body, origin);
    return jsonResponse({ ok: false, error: 'Unknown action.' }, 400, origin);
  } catch (error) {
    console.error('osu-sync request failed:', String((error as Error)?.message || error));
    return jsonResponse({ ok: false, error: 'Internal sync service error.' }, 500, origin);
  }
});
