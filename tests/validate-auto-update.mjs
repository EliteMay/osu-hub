import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const errors = [];
const requireText = (source, marker, label) => {
  if (!source.includes(marker)) errors.push(`${label}: missing ${marker}`);
};

const pkg = json('package.json');
const bootstrap = read('src/bootstrap.js');
const updater = read('src/updater.js');
const renderer = read('src/renderer/index.html');
const workflow = read('.github/workflows/build-windows.yml');
const config = json('data/config.json');

if (pkg.main !== 'src/bootstrap.js') errors.push('package.json main must use src/bootstrap.js.');
if (!pkg.dependencies?.['electron-updater']) errors.push('electron-updater must be a production dependency.');
if (!Array.isArray(pkg.build?.publish) || pkg.build.publish[0]?.provider !== 'github') errors.push('electron-builder publish provider must be GitHub.');
if (pkg.build?.publish?.[0]?.owner !== 'EliteMay' || pkg.build?.publish?.[0]?.repo !== 'osu-hub') errors.push('GitHub update provider must target EliteMay/osu-hub.');
if (!JSON.stringify(pkg.build?.win?.target || '').includes('nsis')) errors.push('Windows auto-update target must remain NSIS.');

requireText(bootstrap, 'require("./main")', 'src/bootstrap.js');
requireText(bootstrap, 'require("./updater")', 'src/bootstrap.js');

for (const marker of [
  'autoUpdater.autoDownload = false',
  'autoUpdater.checkForUpdates()',
  'autoUpdater.downloadUpdate()',
  'autoUpdater.quitAndInstall(false, true)',
  'app.isPackaged',
  'readAutoCheckEnabled',
  '今すぐ更新',
  'Releaseページを開く',
  'update:check',
  'update:open',
  'https://github.com/EliteMay/osu-hub/releases/latest'
]) requireText(updater, marker, 'src/updater.js');

if (!/ipcMain\.handle\("update:open",\s*async\s*\(\)\s*=>/.test(updater)) errors.push('update:open must not accept an arbitrary renderer URL.');
if (/ipcMain\.handle\("update:open"[^]*?shell\.openExternal\([^)]*url/i.test(updater)) errors.push('update:open must use the fixed GitHub Releases fallback URL.');

if (config.updateCheck?.enabled !== true) errors.push('Startup update checks must default to enabled.');
if (!/id=["']openUpdateButton["'][^>]*>今すぐ更新</.test(renderer)) errors.push('Renderer must expose an 今すぐ更新 button.');
if (!/起動時にGitHub Releasesを確認/.test(renderer)) errors.push('Renderer must explain startup update checks.');

for (const marker of [
  'node --check src/bootstrap.js',
  'node --check src/updater.js',
  'node tests/validate-auto-update.mjs',
  'dist/latest.yml',
  '.blockmap',
  'UPDATE_METADATA_PATH',
  'UPDATE_BLOCKMAP_PATH',
  'gh release upload'
]) requireText(workflow, marker, '.github/workflows/build-windows.yml');

if (errors.length) {
  console.error('Auto-update validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Auto-update bootstrap, fixed GitHub provider/fallback, one-click flow, release metadata, and regression guards: OK');
