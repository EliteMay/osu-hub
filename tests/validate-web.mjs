import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const site = json('data/site.json');
const projectMeta = json('project-meta.json');
const desktopPackage = json('package.json');
const desktopUpdate = json('version.json');

if (!/^\d+\.\d+\.\d+$/.test(String(site.siteVersion || ''))) fail('data/site.json siteVersion must use x.y.z format.');
if (projectMeta.guideVersion !== '1.6.0') fail(`project-meta.json guideVersion must be 1.6.0 (actual: ${projectMeta.guideVersion}).`);
for (const profile of ['STATIC', 'DATA', 'AI-HANDOFF', 'CLOUD', 'ELECTRON', 'TOOL']) {
  if (!projectMeta.profiles?.includes(profile)) fail(`project-meta.json is missing profile: ${profile}`);
}
if (projectMeta.sourcesOfTruth?.webVersion !== 'data/site.json#siteVersion') fail('Web version Source of Truth must be data/site.json#siteVersion.');
if (projectMeta.runtimePolicy?.stablePaths !== true || projectMeta.runtimePolicy?.versionedRuntimeFolders !== false) fail('project-meta.json must declare stable runtime paths and no versioned runtime folders.');
if (projectMeta.runtimePolicy?.rendererOwnsDom !== true) fail('project-meta.json must record Renderer owns its DOM policy.');
if (desktopPackage.version !== desktopUpdate.latestVersion || desktopPackage.version !== site.launcher?.version) {
  fail(`Desktop version mismatch: package=${desktopPackage.version}, version.json=${desktopUpdate.latestVersion}, site.json=${site.launcher?.version}`);
}
if (site.launcher?.latestReleaseUrl !== 'https://github.com/EliteMay/osu-hub/releases/latest') fail('launcher.latestReleaseUrl must point to GitHub Releases latest.');
if (site.launcher?.releasesUrl !== 'https://github.com/EliteMay/osu-hub/releases') fail('launcher.releasesUrl must point to GitHub Releases.');

if (site.osuApi?.provider !== 'Supabase Edge Functions') fail('osuApi.provider must be Supabase Edge Functions.');
const endpoint = String(site.osuApi?.endpointUrl || '');
if (!/^https:\/\/[^/]+\.supabase\.co\/functions\/v1\/osu-sync$/.test(endpoint)) fail('osuApi.endpointUrl must be the HTTPS Supabase osu-sync Edge Function URL.');
if ('workerUrl' in (site.osuApi || {})) fail('Legacy Cloudflare workerUrl must not remain in data/site.json.');
if ('clientSecret' in (site.osuApi || {}) || 'secret' in (site.osuApi || {})) fail('data/site.json must not contain secret fields.');
const scoreTypes = Array.isArray(site.osuApi?.scoreTypes) ? site.osuApi.scoreTypes : [];
if (!scoreTypes.includes('recent') || !scoreTypes.includes('best')) fail('osuApi.scoreTypes must include recent and best.');
if (Number(site.osuApi?.recentWindowHours) !== 24) fail('osuApi.recentWindowHours must be 24.');
if (site.osuApi?.autoSyncOnOpen !== true) fail('osuApi.autoSyncOnOpen must default to true.');
const autoMinutes = Number(site.osuApi?.autoSyncMinMinutes);
if (!Number.isFinite(autoMinutes) || autoMinutes < 1 || autoMinutes > 60) fail('osuApi.autoSyncMinMinutes must be between 1 and 60.');
const timeout = Number(site.osuApi?.requestTimeoutMs);
if (!Number.isFinite(timeout) || timeout < 3000 || timeout > 60000) fail('osuApi.requestTimeoutMs must be between 3000 and 60000.');

const htmlFiles = [
  'index.html',
  ...fs.readdirSync(path.join(root, 'pages')).filter((name) => name.endsWith('.html')).sort().map((name) => `pages/${name}`),
];

function localTarget(file, value) {
  if (!value || /^(#|https?:|mailto:|data:|javascript:)/i.test(value)) return null;
  const clean = value.split('#')[0].split('?')[0];
  if (!clean) return null;
  return path.resolve(path.dirname(path.join(root, file)), clean);
}

for (const file of htmlFiles) {
  const source = read(file);
  const ids = [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) fail(`${file}: duplicate id(s): ${[...new Set(duplicates)].join(', ')}`);
  if (!/<html\b[^>]*\blang=["']ja["']/i.test(source)) fail(`${file}: html lang="ja" is required.`);
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(source)) fail(`${file}: viewport meta is required.`);
  if (!/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*aria-label=/i.test(source)) fail(`${file}: main nav must have aria-label.`);
  if (!/data-site-version/.test(source)) fail(`${file}: footer must use data-site-version.`);
  if (/osu!\s*Hub\s+v\d+\.\d+\.\d+/i.test(source)) fail(`${file}: hardcoded web version found.`);
  if ([...source.matchAll(/<label\b(?![^>]*\bfor=)[^>]*>/gi)].length) fail(`${file}: label without for attribute found.`);
  for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const target = localTarget(file, match[1]);
    if (target && !fs.existsSync(target)) fail(`${file}: missing local reference ${match[1]}`);
  }
  for (const match of source.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/rel=["'][^"']*noopener[^"']*["']/i.test(match[0])) fail(`${file}: target=_blank link is missing noopener.`);
  }
}

const css = read('css/styles.css');
if (/\.nav\s*\{[^}]*display\s*:\s*none/is.test(css)) fail('Navigation must not disappear on small screens.');
if (!/:focus-visible/.test(css)) fail('styles.css must provide focus-visible styling.');
if (!/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/.test(css)) fail('styles.css must respect prefers-reduced-motion.');

const webJsFiles = fs.readdirSync(path.join(root, 'js')).filter((name) => name.endsWith('.js')).map((name) => `js/${name}`);
for (const file of webJsFiles) {
  const source = read(file);
  if (/\bMutationObserver\b/.test(source)) fail(`${file}: MutationObserver DOM patching is not allowed in the stable runtime.`);
  if (/\bv\d{2,}[\\/]/i.test(file) || /(?:^|[-_.])v\d{2,}(?:[-_.]|$)/i.test(path.basename(file))) fail(`${file}: versioned runtime path detected.`);
}
for (const dir of ['js', 'css']) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (/^v\d+/i.test(name) || /(?:^|[-_.])v\d{2,}(?:[-_.]|$)/i.test(name)) fail(`${dir}/${name}: versioned runtime path detected.`);
  }
}

const storageSource = read('js/storage.js');
for (const marker of ['recoverySnapshot', 'verifyImported', 'replaceAllStores', 'Rollback']) {
  if (!storageSource.includes(marker)) fail(`js/storage.js: missing import recovery marker ${marker}.`);
}
if (!/const\s+SCHEMA_VERSION\s*=\s*1\b/.test(storageSource)) fail('js/storage.js: SCHEMA_VERSION must be explicit.');

const accountSyncSource = read('js/osu-sync.js');
for (const marker of ['endpointUrl', 'serviceFetch', "action: 'health'", "action: 'sync'", 'supabase-edge-function', 'browserOAuthRequired', 'scoreType', 'autoSyncOnOpen', 'lastRecentSyncAt', 'lastBestSyncAt', 'syncKinds']) {
  if (!accountSyncSource.includes(marker)) fail(`js/osu-sync.js: missing Supabase sync guard ${marker}.`);
}
if (!/Recent Plays \(24h\)/.test(accountSyncSource) || !/Best Scores/.test(accountSyncSource)) fail('Account Sync runtime must distinguish Recent Plays (24h) and Best Scores.');
if (/Cloudflare Worker|workerFetch\(|normalizeWorkerUrl\(/.test(accountSyncSource)) fail('js/osu-sync.js must not use the legacy Cloudflare Worker runtime.');
if (/clientSecret|OSU_CLIENT_SECRET/.test(accountSyncSource)) fail('Browser Account Sync runtime must not contain osu! Client Secret handling.');

const accountHtml = read('pages/account.html');
if (!/ブラウザへのosu! Secret入力は不要/.test(accountHtml)) fail('Account Sync page must explain that browser secret input is not required.');
if (!/Supabase Edge Function/.test(accountHtml)) fail('Account Sync page must identify the Supabase provider.');
if (!/Recent Plays \(24h\)/.test(accountHtml) || !/Best Scores/.test(accountHtml) || !/自動蓄積/.test(accountHtml)) fail('Account Sync page must expose Recent 24h, Best, and automatic accumulation controls.');
if (/Cloudflare Worker/.test(accountHtml)) fail('Account Sync page must not present Cloudflare as the active provider.');
if (/id=["'](?:clientId|clientSecret|osuClientId|osuClientSecret)["']/i.test(accountHtml)) fail('Account Sync page must not expose Client ID / Secret input fields.');

const toolsHtml = read('pages/tools.html');
if (!/href=["']https:\/\/github\.com\/EliteMay\/osu-hub\/releases\/latest["']/.test(toolsHtml)) fail('Desktop Tools download button must point to the latest GitHub Release.');
const launcherVersionPattern = new RegExp(`(?:配布中|配布版):\\s*v${escapeRegex(site.launcher?.version)}`);
if (!launcherVersionPattern.test(toolsHtml)) fail('Desktop Tools must show the current published launcher version from site metadata.');
if (/Setup\.exeの初回配布は未確認/.test(toolsHtml)) fail('Desktop Tools must not show the old unreleased notice after publication.');
if (!/One-click Update/.test(toolsHtml) || !/v0\.18\.2だけはSetup\.exeを一度手動/.test(toolsHtml)) fail('Desktop Tools must explain the v0.18.2 one-time manual install and future one-click updates.');

const refreshWorkflow = read('.github/workflows/refresh-osu-token.yml');
for (const marker of ['OSU_CLIENT_ID', 'OSU_CLIENT_SECRET', 'data/site.json', 'action: "refresh"', 'action":"health', 'supabase-edge-function', 'scoreType":"recent', 'scoreType":"best', 'Recent Plays smoke', 'Best Scores smoke']) {
  if (!refreshWorkflow.includes(marker)) fail(`refresh-osu-token.yml: missing Supabase token lifecycle guard ${marker}.`);
}
if (!/cron:\s*["']17 \*\/12 \* \* \*["']/.test(refreshWorkflow)) fail('osu! token refresh workflow must run every 12 hours.');
if (/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|wrangler-action/.test(refreshWorkflow)) fail('Token refresh workflow must not depend on Cloudflare.');

const checkWorkflow = read('.github/workflows/check-web.yml');
if (!/\.github\/workflows\/refresh-osu-token\.yml/.test(checkWorkflow)) fail('Check web path filters must include refresh-osu-token.yml.');
if (!/supabase\/functions\/\*\*/.test(checkWorkflow)) fail('Check web path filters must include supabase/functions/**.');

if (!fs.existsSync(path.join(root, '.github/workflows/build-windows.yml'))) fail('Windows build/release workflow must exist.');
const windowsWorkflow = fs.existsSync(path.join(root, '.github/workflows/build-windows.yml')) ? read('.github/workflows/build-windows.yml') : '';
for (const marker of ['pull_request:', 'contents: write', 'Check Electron JavaScript syntax', 'node --check src/main.js', 'node --check src/updater.js', 'Check auto-update regression guards', 'dist/latest.yml', '.blockmap', 'Verify installer', "github.event_name != 'pull_request'", 'gh release create', 'gh release upload', 'osu_setup_${version}_setup.exe']) {
  if (windowsWorkflow && !windowsWorkflow.includes(marker)) fail(`build-windows.yml: missing release/build guard ${marker}.`);
}

const desktopMain = read('src/main.js');
for (const marker of ['verifySvclDefaultAliases', 'DefaultRenderDevice', 'DefaultRenderDeviceMulti', 'DefaultRenderDeviceComm', '/GetColumnValue', 'Windows標準Fallback']) {
  if (!desktopMain.includes(marker)) fail(`src/main.js: missing audio verification guard ${marker}.`);
}
const audioFallback = read('tools/switch_audio_device.ps1');
for (const marker of ['SetDefaultRenderDevice', 'GetRenderDevices', 'VERIFIED_DEFAULT', 'Default verification failed']) {
  if (!audioFallback.includes(marker)) fail(`switch_audio_device.ps1: missing fallback verification guard ${marker}.`);
}

if (desktopPackage.main !== 'src/bootstrap.js') fail('Desktop package main must use the updater bootstrap.');
if (!desktopPackage.dependencies?.['electron-updater']) fail('electron-updater must be a production dependency.');
const updaterSource = read('src/updater.js');
for (const marker of ['autoUpdater.checkForUpdates()', 'autoUpdater.downloadUpdate()', 'autoUpdater.quitAndInstall(false, true)', '今すぐ更新', 'Releaseページを開く']) {
  if (!updaterSource.includes(marker)) fail(`src/updater.js: missing one-click update guard ${marker}.`);
}

const publicFiles = ['index.html', ...htmlFiles.filter((file) => file !== 'index.html'), ...webJsFiles, 'data/site.json'];
const assignedSecret = /(?:OSU_CLIENT_SECRET|clientSecret|apiSecret)\s*[:=]\s*["'][^"']{4,}["']/i;
for (const file of publicFiles) {
  if (assignedSecret.test(read(file))) fail(`${file}: possible secret value found in public web files.`);
}

if (fs.existsSync(path.join(root, '.github/workflows/deploy-worker.yml'))) fail('Legacy Cloudflare deploy workflow must be removed from the active repository.');
if (fs.existsSync(path.join(root, 'cloudflare/worker'))) fail('Legacy Cloudflare Worker runtime must be removed after Supabase migration.');

if (!fs.existsSync(path.join(root, 'supabase/functions/osu-sync/index.ts'))) fail('Supabase Edge Function source must be tracked in GitHub.');
const functionSource = fs.existsSync(path.join(root, 'supabase/functions/osu-sync/index.ts')) ? read('supabase/functions/osu-sync/index.ts') : '';
for (const marker of ['osu_api_tokens', 'SUPABASE_SERVICE_ROLE_KEY', 'action === \'refresh\'', 'action === \'sync\'', 'action === \'health\'', 'CACHE_TTL_MS = 60000', 'Retry-After', 'ALLOWED_SCORE_TYPES', "['recent', 'best']", '/scores/${scoreType}', 'supportedScoreTypes', 'recentWindowHours']) {
  if (functionSource && !functionSource.includes(marker)) fail(`Supabase osu-sync function: missing guard ${marker}.`);
}
if (functionSource && /console\.log\([^\n]*(clientSecret|accessToken)/.test(functionSource)) fail('Supabase function must not log OAuth secrets or access tokens.');

if (!fs.existsSync(path.join(root, 'package-lock.json'))) warn('package-lock.json is not tracked; dependency changes should generate and track it.');

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((message) => console.log(`- ${message}`));
}
if (errors.length) {
  console.error('Validation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML files, project metadata, versions, launcher release/audio/auto-update guards, Recent/Best Supabase Account Sync guards, auto accumulation, token refresh policy, stable runtime paths, import recovery guards, and responsive/accessibility/security rules: OK`);
