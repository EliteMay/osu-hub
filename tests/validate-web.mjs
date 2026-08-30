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

const site = json('data/site.json');
const projectMeta = json('project-meta.json');
const desktopPackage = json('package.json');
const desktopUpdate = json('version.json');

if (!/^\d+\.\d+\.\d+$/.test(String(site.siteVersion || ''))) {
  fail('data/site.json siteVersion must use x.y.z format.');
}
if (projectMeta.guideVersion !== '1.2.0') {
  fail(`project-meta.json guideVersion must be 1.2.0 (actual: ${projectMeta.guideVersion}).`);
}
const requiredProfiles = ['STATIC', 'DATA', 'AI-HANDOFF', 'CLOUD', 'ELECTRON', 'TOOL'];
for (const profile of requiredProfiles) {
  if (!projectMeta.profiles?.includes(profile)) fail(`project-meta.json is missing profile: ${profile}`);
}
if (projectMeta.sourcesOfTruth?.webVersion !== 'data/site.json#siteVersion') {
  fail('Web version Source of Truth must be data/site.json#siteVersion.');
}
if (projectMeta.runtimePolicy?.stablePaths !== true || projectMeta.runtimePolicy?.versionedRuntimeFolders !== false) {
  fail('project-meta.json must declare stable runtime paths and no versioned runtime folders.');
}
if (projectMeta.runtimePolicy?.rendererOwnsDom !== true) {
  fail('project-meta.json must record Renderer owns its DOM policy.');
}
if (desktopPackage.version !== desktopUpdate.latestVersion || desktopPackage.version !== site.launcher?.version) {
  fail(`Desktop version mismatch: package=${desktopPackage.version}, version.json=${desktopUpdate.latestVersion}, site.json=${site.launcher?.version}`);
}
if (site.osuApi?.workerUrl && !String(site.osuApi.workerUrl).startsWith('https://')) {
  fail('Default production Worker URL must use HTTPS.');
}
const timeout = Number(site.osuApi?.requestTimeoutMs);
if (!Number.isFinite(timeout) || timeout < 3000 || timeout > 60000) {
  fail('osuApi.requestTimeoutMs must be between 3000 and 60000.');
}

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
  if (!/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*aria-label=/i.test(source)) {
    fail(`${file}: main nav must have aria-label.`);
  }
  if (!/data-site-version/.test(source)) fail(`${file}: footer must use data-site-version.`);
  if (/osu!\s*Hub\s+v\d+\.\d+\.\d+/i.test(source)) fail(`${file}: hardcoded web version found.`);

  const labelsWithoutFor = [...source.matchAll(/<label\b(?![^>]*\bfor=)[^>]*>/gi)];
  if (labelsWithoutFor.length) fail(`${file}: label without for attribute found.`);

  for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const target = localTarget(file, match[1]);
    if (target && !fs.existsSync(target)) fail(`${file}: missing local reference ${match[1]}`);
  }

  for (const match of source.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    const tag = match[0];
    if (!/rel=["'][^"']*noopener[^"']*["']/i.test(tag)) fail(`${file}: target=_blank link is missing noopener.`);
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
  if (/\bv\d{2,}[\\/]/i.test(file) || /(?:^|[-_.])v\d{2,}(?:[-_.]|$)/i.test(path.basename(file))) {
    fail(`${file}: versioned runtime path detected.`);
  }
}
for (const dir of ['js', 'css']) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (/^v\d+/i.test(name) || /(?:^|[-_.])v\d{2,}(?:[-_.]|$)/i.test(name)) {
      fail(`${dir}/${name}: versioned runtime path detected.`);
    }
  }
}

const storageSource = read('js/storage.js');
for (const marker of ['recoverySnapshot', 'verifyImported', 'replaceAllStores', 'Rollback']) {
  if (!storageSource.includes(marker)) fail(`js/storage.js: missing import recovery marker ${marker}.`);
}
if (!/const\s+SCHEMA_VERSION\s*=\s*1\b/.test(storageSource)) fail('js/storage.js: SCHEMA_VERSION must be explicit.');

const workerSource = read('cloudflare/worker/src/index.js');
for (const marker of ['caches.default', 'tokenRefreshPromise', 'SYNC_CACHE_TTL_SECONDS', 'Retry-After']) {
  if (!workerSource.includes(marker)) fail(`cloudflare/worker/src/index.js: missing rate-limit guard ${marker}.`);
}
if (!/SYNC_CACHE_TTL_SECONDS\s*=\s*60\b/.test(workerSource)) {
  fail('Worker sync cache TTL must remain at least the documented one-minute polling interval.');
}
if (!/response\.status\s*===\s*429/.test(workerSource)) {
  fail('Worker must handle upstream 429 responses explicitly.');
}

const deployWorkflow = read('.github/workflows/deploy-worker.yml');
if (!/push:\s*[\s\S]*branches:\s*[\s\S]*main/.test(deployWorkflow)) {
  fail('Worker deploy workflow must continuously deploy Worker changes from main.');
}
if (!/cloudflare\/worker\/\*\*/.test(deployWorkflow)) {
  fail('Worker deploy workflow must be path-scoped to cloudflare/worker/**.');
}

const publicFiles = [
  'index.html',
  ...htmlFiles.filter((file) => file !== 'index.html'),
  ...webJsFiles,
  'data/site.json',
];
const assignedSecret = /(?:OSU_CLIENT_SECRET|clientSecret|apiSecret)\s*[:=]\s*["'][^"']{4,}["']/i;
for (const file of publicFiles) {
  if (assignedSecret.test(read(file))) fail(`${file}: possible secret value found in public web files.`);
}
if ('clientSecret' in (site.osuApi || {}) || 'secret' in (site.osuApi || {})) {
  fail('data/site.json must not contain secret fields.');
}

for (const lockFile of ['package-lock.json', 'cloudflare/worker/package-lock.json']) {
  if (!fs.existsSync(path.join(root, lockFile))) warn(`${lockFile} is not tracked; create it during the next dependency install/update.`);
}

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (errors.length) {
  console.error('Validation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Validated ${htmlFiles.length} HTML files, project metadata, versions, Worker rate-limit guards, deployment policy, stable runtime paths, import recovery guards, and responsive/accessibility/security rules: OK`);
