import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8');
const context = {
  window: {},
  Blob,
  indexedDB: {},
  console,
  setTimeout,
  clearTimeout,
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/storage.js' });

const DB = context.window.OsuDB;
if (!DB) throw new Error('OsuDB was not initialized.');
if (DB.DB_VERSION !== 2 || DB.SCHEMA_VERSION !== 2) {
  throw new Error(`Expected DB/Schema version 2, got DB=${DB.DB_VERSION} Schema=${DB.SCHEMA_VERSION}`);
}
if (!DB.STORES.includes('sessions')) throw new Error('sessions store is missing from schema v2.');

const legacy = {
  schemaVersion: 1,
  stores: {
    results: [{ id: 'manual-1', source: 'manual', accuracy: 98.5, miss: 1, combo: 500, pp: 100, stars: 5.5, bpm: 180 }],
    coaching: [],
    practice: [{ id: 'practice-1', title: 'Accuracy practice', category: 'Accuracy', minutes: 15, date: '2026-09-01', done: false, note: 'legacy memo' }],
    settings: [{ key: 'player', playerName: 'test' }],
  },
};

const prepared = DB.validateImportPayload(legacy);
if (!Array.isArray(prepared.sessions) || prepared.sessions.length !== 0) {
  throw new Error('Schema v1 import must add an empty sessions store.');
}
const practice = prepared.practice[0];
if (practice.schemaVersion !== 2 || practice.status !== 'planned') {
  throw new Error('Legacy practice was not normalized to schema v2 planned lifecycle.');
}
if (practice.theme !== 'Accuracy' || practice.action !== 'Accuracy practice' || practice.issue !== 'legacy memo') {
  throw new Error('Legacy practice fields were not preserved during normalization.');
}

let futureRejected = false;
try {
  DB.validateImportPayload({ schemaVersion: 99, stores: {} });
} catch {
  futureRejected = true;
}
if (!futureRejected) throw new Error('Unsupported future schema must be rejected.');

let unknownStoreRejected = false;
try {
  DB.validateImportPayload({ schemaVersion: 2, stores: { results: [], sessions: [], coaching: [], practice: [], settings: [], unknown: [] } });
} catch {
  unknownStoreRejected = true;
}
if (!unknownStoreRejected) throw new Error('Unknown store must be rejected before import.');

console.log('Storage migration regression: schema v1 -> v2, practice normalization, and rejection guards: OK');
