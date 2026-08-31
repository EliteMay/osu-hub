import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { canonicalDeviceId, isSvclEndpointDevice, chooseSvclDevice } = require('../src/audio-matcher.js');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`Audio interop validation failed: ${message}`);
  process.exit(1);
};

const audioSwitcher = read('tools/AudioSwitcher.cs');
const fallbackScript = read('tools/switch_audio_device.ps1');
const windowsWorkflow = read('.github/workflows/build-windows.yml');
const desktopMain = read('src/main.js');
const audioMatcher = read('src/audio-matcher.js');

const correctCollectionIid = '0BD7A1BE-7A1A-44DB-8397-CC5392387B5E';
const brokenCollectionIid = '0BD7A1BE-7A1A-44DB-8397-C0A53CAD458F';

if (!audioSwitcher.includes(correctCollectionIid)) {
  fail(`IMMDeviceCollection IID must be ${correctCollectionIid}.`);
}
if (audioSwitcher.includes(brokenCollectionIid)) {
  fail('The previously broken IMMDeviceCollection IID is present.');
}

for (const marker of [
  'GetRenderDevicesAll',
  'GetRenderDeviceById',
  'DeviceState State',
  'bool IsActive',
  'SetDefaultRenderDevice'
]) {
  if (!audioSwitcher.includes(marker)) fail(`AudioSwitcher.cs is missing inactive-endpoint marker: ${marker}`);
}

for (const marker of [
  'DefaultRenderDeviceMulti',
  'DefaultRenderDevice',
  'DefaultRenderDeviceComm',
  '/GetColumnValue',
  'VERIFIED_DEFAULT_SVCL',
  'GetRenderDevicesAll',
  'SetDefaultRenderDevice',
  'VERIFIED_DEFAULT',
  'Get-AudioTokens',
  'Get-AudioDeviceMatchScore',
  'Find-BestRenderDeviceMatch',
  'MATCHED_CORE_AUDIO',
  'MATCHED_CORE_AUDIO_INACTIVE',
  'MATCH_TOKENS',
  'AVAILABLE_DEVICES',
  'SVCL_TARGET_STATE',
  'SVCL_ENABLE_ATTEMPT',
  'FXSOUND_PROCESS',
  'Ensure-FxSoundProcess',
  'Target endpoint is not active',
  'AUDIO_MATCH_SELF_TEST_OK',
  'Localized Output (FxSound Audio Enhancer)',
  'Speakers (FxSound Audio Enhancer)',
  'FxSound Speakers',
  "'speaker', 'speakers'"
]) {
  if (!fallbackScript.includes(marker)) fail(`switch_audio_device.ps1 is missing marker: ${marker}`);
}

for (const marker of [
  'require("./audio-matcher")',
  '.filter(isSvclEndpointDevice)',
  'chooseSvclDevice(before.items, target)',
  '複数の再生デバイスが同じ強さで一致したため'
]) {
  if (!desktopMain.includes(marker)) fail(`src/main.js is missing endpoint-selection guard: ${marker}`);
}

for (const marker of [
  '\\application\\',
  'isSvclEndpointDevice',
  'chooseSvclDevice',
  'stateBonus',
  'ambiguous',
  'replace(/[¥￥]/g'
]) {
  if (!audioMatcher.includes(marker)) fail(`src/audio-matcher.js is missing marker: ${marker}`);
}

if (/&\s+\$svclPath\s+\/Stdout\s+\/GetColumnValue/i.test(fallbackScript)) {
  fail('SVCL /GetColumnValue fallback must use the documented direct command form without /Stdout.');
}

if (!/\/Enable\s+\$matched\.Id/.test(fallbackScript)) {
  fail('Inactive disabled endpoints must have an SVCL /Enable recovery attempt.');
}

if (!windowsWorkflow.includes('switch_audio_device.ps1 -SelfTest')) {
  fail('Windows installer workflow must execute the audio matcher self-test.');
}

const observedFixtures = [
  {
    name: 'Firefox',
    id: 'High Definition Audio Device\\Application\\Firefox',
    itemId: '',
    direction: 'Render',
    type: 'Application',
    state: 'Active'
  },
  {
    name: 'スピーカー',
    id: 'High Definition Audio Device\\Device\\Speakers\\Render',
    itemId: '{speaker-endpoint}',
    direction: 'Render',
    type: 'Device',
    state: 'Active'
  },
  {
    name: 'ヘッドホン',
    id: 'High Definition Audio Device\\Device\\Headphones\\Render',
    itemId: '{headphone-endpoint}',
    direction: 'Render',
    type: 'Device',
    state: 'NotPresent'
  },
  {
    name: 'FxSound Speakers',
    id: 'FxSound Audio Enhancer\\Device\\FxSound Speakers\\Render',
    itemId: '{fxsound-endpoint}',
    direction: 'Render',
    type: 'Device',
    state: 'Active'
  },
  {
    name: '2- Arctis GameBuds',
    id: '2- Arctis GameBuds\\Device\\Render',
    itemId: '{arctis-endpoint}',
    direction: 'Render',
    type: 'Device',
    state: 'Active'
  }
];

if (isSvclEndpointDevice(observedFixtures[0])) {
  fail('Application audio sessions like Firefox must never be treated as output device endpoints.');
}

const genericHighDefinition = chooseSvclDevice(observedFixtures, 'High Definition Audio Device');
if (!genericHighDefinition.ok || genericHighDefinition.item?.id !== 'High Definition Audio Device\\Device\\Speakers\\Render') {
  fail('The observed High Definition Audio Device query must select the active Speakers endpoint, not Firefox or an inactive endpoint.');
}

const exactHighDefinition = chooseSvclDevice(observedFixtures, 'High Definition Audio Device\\Device\\Speakers\\Render');
if (!exactHighDefinition.ok || exactHighDefinition.item?.name !== 'スピーカー') {
  fail('The full High Definition Audio Device endpoint ID must select the Speakers endpoint exactly.');
}

const japaneseYenHighDefinition = chooseSvclDevice(observedFixtures, 'High Definition Audio Device¥Device¥Speakers¥Render');
if (!japaneseYenHighDefinition.ok || japaneseYenHighDefinition.item?.name !== 'スピーカー') {
  fail('Japanese yen-sign path separators must normalize to the same endpoint ID as backslashes.');
}
if (canonicalDeviceId('High Definition Audio Device￥Device￥Speakers￥Render') !== canonicalDeviceId('High Definition Audio Device\\Device\\Speakers\\Render')) {
  fail('Full-width yen separators must normalize to Windows backslashes.');
}

const blankTypeRenderEndpoint = {
  name: 'スピーカー',
  id: 'High Definition Audio Device\\Device\\Speakers\\Render',
  itemId: '{speaker-endpoint-blank-type}',
  direction: 'Render',
  type: '',
  state: 'Active'
};
if (!isSvclEndpointDevice(blankTypeRenderEndpoint)) {
  fail('A Render endpoint with a valid Device path must remain selectable even when SVCL Type is blank.');
}

const applicationWithoutType = {
  name: 'Firefox',
  id: 'High Definition Audio Device\\Application\\Firefox',
  itemId: '',
  direction: 'Render',
  type: '',
  state: 'Active'
};
if (isSvclEndpointDevice(applicationWithoutType)) {
  fail('Application sessions must be rejected by ID even when SVCL Type is blank.');
}

const fxSound = chooseSvclDevice(observedFixtures, 'FxSound Speakers');
if (!fxSound.ok || fxSound.item?.name !== 'FxSound Speakers') {
  fail('FxSound exact-name selection must remain supported.');
}

const ambiguousFixtures = [
  {
    name: 'Output A',
    id: 'Same Provider\\Device\\SpeakersA\\Render',
    direction: 'Render',
    type: 'Device',
    state: 'Active'
  },
  {
    name: 'Output B',
    id: 'Same Provider\\Device\\SpeakersB\\Render',
    direction: 'Render',
    type: 'Device',
    state: 'Active'
  }
];
const ambiguous = chooseSvclDevice(ambiguousFixtures, 'Same Provider');
if (ambiguous.ok || ambiguous.reason !== 'ambiguous') {
  fail('Equal-strength endpoint matches must stop as ambiguous instead of selecting arbitrarily.');
}

console.log('Audio interop validation: OK');
