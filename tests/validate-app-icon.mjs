import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const errors = [];

const pkg = json('package.json');
const main = read('src/main.js');
const workflow = read('.github/workflows/build-windows.yml');
const iconPath = path.join(root, 'assets', 'osu-hub.ico');

if (!fs.existsSync(iconPath)) {
  errors.push('assets/osu-hub.ico must exist.');
} else {
  const icon = fs.readFileSync(iconPath);
  if (icon.length < 1024) errors.push('assets/osu-hub.ico is unexpectedly small.');
  if (icon[0] !== 0x00 || icon[1] !== 0x00 || icon[2] !== 0x01 || icon[3] !== 0x00) {
    errors.push('assets/osu-hub.ico does not have a valid ICO header.');
  }
}

if (pkg.build?.win?.icon !== 'assets/osu-hub.ico') errors.push('Windows app icon must use assets/osu-hub.ico.');
if (pkg.build?.win?.signAndEditExecutable === false) errors.push('signAndEditExecutable=false disables executable icon resource editing.');
if (!pkg.build?.files?.includes('assets/**/*')) errors.push('Packaged app must include assets/**/* for the runtime window icon.');
if (pkg.build?.nsis?.installerIcon !== 'assets/osu-hub.ico') errors.push('NSIS installer icon must use assets/osu-hub.ico.');
if (pkg.build?.nsis?.uninstallerIcon !== 'assets/osu-hub.ico') errors.push('NSIS uninstaller icon must use assets/osu-hub.ico.');

for (const marker of [
  'const APP_ICON_PATH = path.join(__dirname, "..", "assets", "osu-hub.ico")',
  'icon: APP_ICON_PATH',
  'app.setAppUserModelId("local.osu.setup.launcher")'
]) {
  if (!main.includes(marker)) errors.push(`src/main.js: missing ${marker}`);
}

if (!workflow.includes('"assets/**"')) errors.push('Windows workflow must run when assets/** changes.');
if (!workflow.includes('"tests/validate-app-icon.mjs"')) errors.push('Windows workflow must run when app icon validation changes.');
if (!workflow.includes('node tests/validate-app-icon.mjs')) errors.push('Windows workflow must execute app icon validation.');

if (errors.length) {
  console.error('App icon validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Windows app, runtime window, shortcut/NSIS icon configuration, ICO asset, and CI guards: OK');
