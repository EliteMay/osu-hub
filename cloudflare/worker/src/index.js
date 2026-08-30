const API_VERSION = 1;
const RULESETS = new Set(['osu', 'taiko', 'fruits', 'mania']);
const UPSTREAM_TIMEOUT_MS = 12000;
const SYNC_CACHE_TTL_SECONDS = 60;
const OSU_ORIGIN = 'https://osu.ppy.sh';
const USER_AGENT = 'osu-hub/0.2.4 (+https://github.com/EliteMay/osu-hub)';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://elitemay.github.io,http://localhost:8000,http://127.0.0.1:8000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = allowedOrigins(env);
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanUser(value) {
  const user = String(value || '').trim();
  if (!user || user.length > 64) throw new Error('osu!ユーザー名またはUser IDを指定してください。');
  if (/[/\\?#]/.test(user)) throw new Error('ユーザー名に使用できない文字が含まれています。');
  return user;
}

function safeText(value, max = 300) {
  return String(value ?? '').slice(0, max);
}

function cacheAvailable() {
  return typeof caches !== 'undefined' && caches?.default;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('osu!への接続がタイムアウトしました。');
      timeoutError.status = 504;
      throw timeoutError;
    }
    const networkError = new Error('osu!へ接続できませんでした。');
    networkError.status = 502;
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
}

async function osuPublicResponse(path, accept = 'application/json') {
  const response = await fetchWithTimeout(`${OSU_ORIGIN}${path}`, {
    headers: {
      Accept: accept,
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
  });

  if (response.ok) return response;

  const retryAfter = response.headers.get('Retry-After') || '';
  if (response.status === 429) {
    const error = new Error('osu!側のアクセス制限に達しました。少し待ってから再試行してください。');
    error.status = 429;
    error.retryAfter = retryAfter;
    throw error;
  }
  if (response.status === 404) {
    const error = new Error('osu!ユーザーまたは公開データが見つかりませんでした。');
    error.status = 404;
    throw error;
  }

  const error = new Error(`osu!公開データの取得に失敗しました (${response.status})`);
  error.status = response.status >= 500 ? 502 : response.status;
  error.retryAfter = retryAfter;
  throw error;
}

async function osuPublicJson(path) {
  const response = await osuPublicResponse(path, 'application/json');
  const payload = await response.json().catch(() => null);
  if (payload == null) {
    const error = new Error('osu!公開データの応答形式が正しくありません。');
    error.status = 502;
    throw error;
  }
  return payload;
}

async function fetchPublicProfile(userInput, ruleset) {
  const response = await osuPublicResponse(`/users/${encodeURIComponent(userInput)}/${ruleset}`, 'text/html');
  let initialDataText = '';

  if (typeof HTMLRewriter === 'undefined') {
    const error = new Error('Worker RuntimeがHTMLRewriterに対応していません。');
    error.status = 500;
    throw error;
  }

  const rewriter = new HTMLRewriter().on('[data-react="profile-page"]', {
    element(element) {
      if (!initialDataText) initialDataText = element.getAttribute('data-initial-data') || '';
    },
  });

  await rewriter.transform(response).text();
  if (!initialDataText) {
    const error = new Error('osu!プロフィール情報を読み取れませんでした。');
    error.status = 502;
    throw error;
  }

  const initialData = JSON.parse(initialDataText);
  if (!initialData?.user) {
    const error = new Error('osu!プロフィール情報の形式が正しくありません。');
    error.status = 502;
    throw error;
  }
  return initialData.user;
}

function modAcronyms(mods) {
  if (!Array.isArray(mods) || mods.length === 0) return 'NM';
  const values = mods
    .map((mod) => (typeof mod === 'string' ? mod : mod?.acronym))
    .filter(Boolean)
    .map((value) => safeText(value, 8));
  return values.length ? values.join('').slice(0, 64) : 'NM';
}

function missCount(statistics) {
  if (!statistics || typeof statistics !== 'object') return 0;
  return Number(statistics.miss ?? statistics.count_miss ?? 0) || 0;
}

function normalizeScore(score) {
  const beatmap = score?.beatmap || {};
  const set = score?.beatmapset || {};
  const difficulty = safeText(beatmap.version || 'Unknown', 160);
  const artist = safeText(set.artist_unicode || set.artist || 'Unknown Artist', 160);
  const title = safeText(set.title_unicode || set.title || 'Unknown Title', 200);
  const mapName = `${artist} - ${title} [${difficulty}]`.slice(0, 500);
  const endedAt = score?.ended_at || score?.created_at || null;
  const scoreId = String(score?.id ?? '').trim();
  if (!/^\d+$/.test(scoreId)) throw new Error('osu!から不正なScore IDが返されました。');

  return {
    id: `osu:${scoreId}`,
    source: 'osu-api',
    osuScoreId: scoreId,
    beatmapId: score.beatmap_id ?? beatmap.id ?? null,
    beatmapsetId: set.id ?? beatmap.beatmapset_id ?? null,
    mapName,
    artist,
    title,
    difficulty,
    mapper: safeText(set.creator || '', 120),
    date: endedAt ? String(endedAt).slice(0, 10) : '',
    playedAt: endedAt ? safeText(endedAt, 64) : null,
    accuracy: Number(((Number(score.accuracy || 0)) * 100).toFixed(4)),
    miss: Math.max(0, missCount(score.statistics)),
    combo: Math.max(0, Number(score.max_combo || 0)),
    pp: score.pp == null ? null : Number(score.pp),
    stars: beatmap.difficulty_rating == null ? null : Number(beatmap.difficulty_rating),
    bpm: beatmap.bpm == null ? null : Number(beatmap.bpm),
    ar: beatmap.ar == null ? null : Number(beatmap.ar),
    od: beatmap.accuracy == null ? null : Number(beatmap.accuracy),
    cs: beatmap.cs == null ? null : Number(beatmap.cs),
    hp: beatmap.drain == null ? null : Number(beatmap.drain),
    mods: modAcronyms(score.mods),
    rank: safeText(score.rank || '', 16),
    passed: Boolean(score.passed),
    hasReplay: Boolean(score.has_replay),
    totalScore: Math.max(0, Number(score.total_score ?? score.score ?? 0)),
    coverUrl: safeText(set.covers?.cover || set.covers?.['cover@2x'] || '', 500),
    beatmapUrl: beatmap.id ? `https://osu.ppy.sh/beatmaps/${beatmap.id}` : '',
  };
}

function normalizeUser(user, ruleset) {
  if (!user || !Number.isFinite(Number(user.id)) || !String(user.username || '').trim()) {
    throw new Error('osu!から不正なユーザー情報が返されました。');
  }
  const stats = user.statistics || {};
  return {
    id: Number(user.id),
    username: safeText(user.username, 64),
    avatarUrl: safeText(user.avatar_url || '', 500),
    countryCode: safeText(user.country_code || '', 8),
    ruleset,
    pp: stats.pp == null ? null : Number(stats.pp),
    globalRank: stats.global_rank ?? null,
    countryRank: stats.country_rank ?? null,
    hitAccuracy: stats.hit_accuracy == null ? null : Number(stats.hit_accuracy),
    playCount: stats.play_count ?? null,
    maximumCombo: stats.maximum_combo ?? null,
  };
}

async function handleSync(url) {
  const userInput = cleanUser(url.searchParams.get('user'));
  const ruleset = String(url.searchParams.get('mode') || 'osu');
  if (!RULESETS.has(ruleset)) throw new Error('未対応のrulesetです。');

  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 100);
  const includeFails = url.searchParams.get('include_fails') !== '0';
  const profile = await fetchPublicProfile(userInput, ruleset);
  const user = normalizeUser(profile, ruleset);

  const params = new URLSearchParams({
    include_fails: includeFails ? '1' : '0',
    mode: ruleset,
    limit: String(limit),
    offset: '0',
  });
  const scores = await osuPublicJson(`/users/${user.id}/scores/recent?${params}`);
  if (!Array.isArray(scores)) {
    const error = new Error('osu!のRecent Scores応答形式が正しくありません。');
    error.status = 502;
    throw error;
  }

  return {
    apiVersion: API_VERSION,
    upstreamMode: 'public-web',
    syncedAt: new Date().toISOString(),
    user,
    scores: scores.slice(0, limit).map(normalizeScore),
  };
}

function syncCacheRequest(url) {
  const params = new URLSearchParams(url.searchParams);
  params.sort();
  return new Request(`https://osu-hub-cache.internal/sync-v2?${params.toString()}`);
}

async function handleSyncWithCache(url) {
  const key = syncCacheRequest(url);
  if (cacheAvailable()) {
    try {
      const cached = await caches.default.match(key);
      if (cached) return await cached.json();
    } catch {
      // Cache is an optimization; fall through to osu! when unavailable.
    }
  }

  const payload = await handleSync(url);
  if (cacheAvailable()) {
    try {
      await caches.default.put(key, new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `max-age=${SYNC_CACHE_TTL_SECONDS}`,
        },
      }));
    } catch {
      // Do not fail a successful sync because cache write failed.
    }
  }
  return payload;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ ok: false, error: 'Origin is not allowed.' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors || {} });
    }
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'Method not allowed.' }, 405, cors || {});
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({
          ok: true,
          service: 'osu-hub-api',
          apiVersion: API_VERSION,
          configured: true,
          upstreamMode: 'public-web',
          oauthRequired: false,
        }, 200, cors || {});
      }

      if (url.pathname === '/api/sync') {
        const payload = await handleSyncWithCache(url);
        return json(payload, 200, cors || {});
      }

      return json({ ok: false, error: 'Not found.' }, 404, cors || {});
    } catch (error) {
      const retryAfter = String(error?.retryAfter || '').trim();
      return json({
        ok: false,
        error: error?.message || 'Unexpected error.',
        ...(retryAfter ? { retryAfter } : {}),
      }, Number(error?.status) || 400, {
        ...(cors || {}),
        ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
      });
    }
  },
};