import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`Audio interop validation failed: ${message}`);
  process.exit(1);
};

const audioSwitcher = read('tools/AudioSwitcher.cs');
const fallbackScript = read('tools/switch_audio_device.ps1');
const windowsWorkflow = read('.github/workflows/build-windows.yml');

const correctCollectionIid = '0BD7A1BE-7A1A-44DB-8397-CC5392387B5E';
const brokenCollectionIid = '0BD7A1BE-7A1A-44DB-8397-C0A53CAD458F';

if (!audioSwitcher.includes(correctCollectionIid)) {
  fail(`IMMDeviceCollection IID must be ${correctCollectionIid}.`);
}
if (audioSwitcher.includes(brokenCollectionIid)) {
  fail('The previously broken IMMDeviceCollection IID is present.');
}

for (const marker of [
  'DefaultRenderDeviceMulti',
  'DefaultRenderDevice',
  'DefaultRenderDeviceComm',
  '/GetColumnValue',
  'VERIFIED_DEFAULT_SVCL',
  'GetRenderDevices',
  'SetDefaultRenderDevice',
  'VERIFIED_DEFAULT',
  'Get-AudioTokens',
  'Get-AudioDeviceMatchScore',
  'Find-BestRenderDeviceMatch',
  'MATCHED_CORE_AUDIO',
  'AUDIO_MATCH_SELF_TEST_OK',
  "Speakers (FxSound Audio Enhancer)",
  "FxSound Speakers"
]) {
  if (!fallbackScript.includes(marker)) fail(`switch_audio_device.ps1 is missing marker: ${marker}`);
}

if (/&\s+\$svclPath\s+\/Stdout\s+\/GetColumnValue/i.test(fallbackScript)) {
  fail('SVCL /GetColumnValue fallback must use the documented direct command form without /Stdout.');
}

if (!windowsWorkflow.includes('switch_audio_device.ps1 -SelfTest')) {
  fail('Windows installer workflow must execute the audio matcher self-test.');
}

console.log('Audio interop validation: OK');
