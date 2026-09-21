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
const main = read('src/main.js');
const renderer = read('src/renderer/index.html');
const workflow = read('.github/workflows/build-windows.yml');
const config = json('data/config.json');

if (pkg.main !== 'src/bootstrap.js') errors.push('package.json main must use src/bootstrap.js.');
if (!pkg.dependencies?.['electron-updater']) errors.push('electron-updater must be a production dependency.');
if (!Array.isArray(pkg.build?.publish) || pkg.build.publish[0]?.provider !== 'github') errors.push('electron-builder publish provider must be GitHub.');
if (pkg.build?.publish?.[0]?.owner !== 'EliteMay' || pkg.build?.publish?.[0]?.repo !== 'osu-hub') errors.push('GitHub update provider must target EliteMay/osu-hub.');
if (!JSON.stringify(pkg.build?.win?.target || '').includes('nsis')) errors.push('Windows auto-update target must remain NSIS.');
const appIcon = pkg.build?.win?.icon;
if (appIcon !== 'src/assets/app-icon.ico') errors.push('Windows app icon must use src/assets/app-icon.ico.');
if (pkg.build?.win?.signAndEditExecutable === false) errors.push('Windows executable resource editing must not be disabled because it prevents app icon embedding.');
if (pkg.build?.nsis?.installerIcon !== appIcon || pkg.build?.nsis?.uninstallerIcon !== appIcon) errors.push('NSIS installer/uninstaller icons must match the Windows app icon.');
const appIconPath = appIcon ? path.join(root, appIcon) : '';
if (!appIcon || !fs.existsSync(appIconPath) || fs.statSync(appIconPath).size < 1024) {
  errors.push('App icon file is missing or unexpectedly small.');
} else {
  const iconBytes = fs.readFileSync(appIconPath);
  if (!(iconBytes[0] === 0 && iconBytes[1] === 0 && iconBytes[2] === 1 && iconBytes[3] === 0)) errors.push('App icon must be a valid ICO resource.');
}
requireText(main, 'const APP_ICON_PATH = path.join(APP_ROOT, "src", "assets", "app-icon.ico")', 'src/main.js');
requireText(main, 'icon: APP_ICON_PATH', 'src/main.js');

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
if (/shell\.openExternal\(\s*(?:url|target)\s*\)/i.test(updater) || /String\(url\)/.test(updater)) errors.push('update:open must not forward an arbitrary renderer URL.');
if (!/shell\.openExternal\(RELEASE_URL\)/.test(updater)) errors.push('Manual update fallback must use the fixed RELEASE_URL.');

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
