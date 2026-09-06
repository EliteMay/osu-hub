(() => {
  const DB_NAME = 'osuHubDB';
  const DB_VERSION = 2;
  const SCHEMA_VERSION = 2;
  const STORES = ['results', 'sessions', 'coaching', 'practice', 'settings'];
  const MAX_RECORD_JSON_BYTES = 2_000_000;
  const PRACTICE_STATUSES = new Set(['planned', 'active', 'completed']);
  let dbPromise;

  const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const cloneJson = (value) => JSON.parse(JSON.stringify(value));
  const toText = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

  function keyFor(storeName, row) {
    return storeName === 'settings' ? row.key : row.id;
  }

  function finiteInRange(value, min, max) {
    if (value === null || value === undefined || value === '') return true;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max;
  }

  function normalizePracticeRecord(row) {
    const value = cloneJson(row || {});
    const status = PRACTICE_STATUSES.has(value.status)
      ? value.status
      : value.done ? 'completed' : 'planned';
    const startDate = toText(value.startDate || value.date || new Date().toISOString().slice(0, 10), 32);
    return {
      ...value,
      schemaVersion: 2,
      status,
      done: status === 'completed',
      theme: toText(value.theme || value.category || value.title || 'Practice', 200),
      issue: toText(value.issue || value.reason || value.note || '', 1200),
      goal: toText(value.goal || '', 1200),
      action: toText(value.action || value.title || '', 1600),
      startDate,
      date: value.date || startDate,
      durationDays: Math.min(365, Math.max(1, Number(value.durationDays) || 7)),
      minutes: Math.min(24 * 60, Math.max(0, Number(value.minutes) || 15)),
      linkedAnalysis: isRecord(value.linkedAnalysis) ? value.linkedAnalysis : null,
      before: isRecord(value.before) ? value.before : null,
      after: isRecord(value.after) ? value.after : null,
      review: toText(value.review || '', 4000),
      updatedAt: value.updatedAt || value.createdAt || new Date().toISOString(),
    };
  }

  function normalizeSessionRecord(row) {
    const value = cloneJson(row || {});
    const resultIds = Array.isArray(value.resultIds)
      ? [...new Set(value.resultIds.map((id) => toText(id, 200)).filter(Boolean))].slice(0, 1000)
      : [];
    return {
      ...value,
      schemaVersion: 1,
      source: value.source === 'manual' ? 'manual' : 'auto',
      resultIds,
      playCount: Math.max(0, Number(value.playCount) || resultIds.length),
      averageAccuracy: value.averageAccuracy == null ? null : Number(value.averageAccuracy),
      totalMiss: Math.max(0, Number(value.totalMiss) || 0),
      averagePp: value.averagePp == null ? null : Number(value.averagePp),
      selfReview: toText(value.selfReview || '', 4000),
      memo: toText(value.memo || '', 4000),
      updatedAt: value.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeCoachingRecord(row) {
    const value = cloneJson(row || {});
    return {
      ...value,
      schemaVersion: Number(value.schemaVersion) || 1,
    };
  }

  function normalizeRow(storeName, row) {
    if (storeName === 'practice') return normalizePracticeRecord(row);
    if (storeName === 'sessions') return normalizeSessionRecord(row);
    if (storeName === 'coaching') return normalizeCoachingRecord(row);
    return cloneJson(row);
  }

  function validateRow(storeName, row, index) {
    if (!isRecord(row)) throw new Error(`${storeName}[${index}] がObjectではありません。`);
    const value = normalizeRow(storeName, row);
    const serialized = JSON.stringify(value);
    if (new Blob([serialized]).size > MAX_RECORD_JSON_BYTES) {
      throw new Error(`${storeName}[${index}] が大きすぎます。`);
    }

    const keyName = storeName === 'settings' ? 'key' : 'id';
    const key = String(value[keyName] ?? '').trim();
    if (!key || key.length > 200) throw new Error(`${storeName}[${index}] の${keyName}が不正です。`);
    value[keyName] = key;

    if (storeName === 'results') {
      if (!finiteInRange(value.accuracy, 0, 100)) throw new Error(`${storeName}[${index}] のAccuracyが不正です。`);
      if (!finiteInRange(value.miss, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`${storeName}[${index}] のMissが不正です。`);
      if (!finiteInRange(value.combo, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`${storeName}[${index}] のComboが不正です。`);
      if (!finiteInRange(value.pp, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`${storeName}[${index}] のPPが不正です。`);
      if (!finiteInRange(value.stars, 0, 100)) throw new Error(`${storeName}[${index}] のStar Ratingが不正です。`);
      if (!finiteInRange(value.bpm, 0, 5000)) throw new Error(`${storeName}[${index}] のBPMが不正です。`);
      if (!finiteInRange(value.ar, 0, 20) || !finiteInRange(value.od, 0, 20) || !finiteInRange(value.cs, 0, 20)) {
        throw new Error(`${storeName}[${index}] のBeatmap属性が不正です。`);
      }

      if (value.source === 'osu-api') {
        const scoreId = String(value.osuScoreId ?? '').trim();
        if (!/^\d+$/.test(scoreId)) throw new Error(`${storeName}[${index}] のosuScoreIdが不正です。`);
        const expectedId = `osu:${scoreId}`;
        if (value.id !== expectedId) throw new Error(`${storeName}[${index}] のScore IDが整合していません。`);
      }
    }

    if (storeName === 'sessions') {
      if (!Array.isArray(value.resultIds)) throw new Error(`${storeName}[${index}] のresultIdsが配列ではありません。`);
      if (!finiteInRange(value.playCount, 0, 100000)) throw new Error(`${storeName}[${index}] のplayCountが不正です。`);
      if (!finiteInRange(value.averageAccuracy, 0, 100)) throw new Error(`${storeName}[${index}] のaverageAccuracyが不正です。`);
      if (!finiteInRange(value.totalMiss, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`${storeName}[${index}] のtotalMissが不正です。`);
      if (!finiteInRange(value.averagePp, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`${storeName}[${index}] のaveragePpが不正です。`);
    }

    if (storeName === 'practice') {
      if (!PRACTICE_STATUSES.has(value.status)) throw new Error(`${storeName}[${index}] のstatusが不正です。`);
      if (!finiteInRange(value.minutes, 0, 24 * 60)) throw new Error(`${storeName}[${index}] のminutesが不正です。`);
      if (!finiteInRange(value.durationDays, 1, 365)) throw new Error(`${storeName}[${index}] のdurationDaysが不正です。`);
    }

    return value;
  }

  function migrateImportPayload(payload) {
    if (!isRecord(payload) || !isRecord(payload.stores)) {
      throw new Error('対応していないバックアップ形式です。');
    }
    const version = Number(payload.schemaVersion || 0);
    if (![1, 2].includes(version)) throw new Error('対応していないバックアップSchemaです。');
    const stores = cloneJson(payload.stores);
    if (version === 1 && !Array.isArray(stores.sessions)) stores.sessions = [];
    return { schemaVersion: SCHEMA_VERSION, stores };
  }

  function validateImportPayload(payload) {
    const migrated = migrateImportPayload(payload);
    const unexpectedStores = Object.keys(migrated.stores).filter((name) => !STORES.includes(name));
    if (unexpectedStores.length) throw new Error(`未対応Storeがあります: ${unexpectedStores.join(', ')}`);

    const prepared = {};
    for (const storeName of STORES) {
      const rows = migrated.stores[storeName] ?? [];
      if (!Array.isArray(rows)) throw new Error(`${storeName} が配列ではありません。`);
      const seen = new Set();
      prepared[storeName] = rows.map((row, index) => {
        const value = validateRow(storeName, row, index);
        const key = String(keyFor(storeName, value));
        if (seen.has(key)) throw new Error(`${storeName} に重複IDがあります: ${key}`);
        seen.add(key);
        return value;
      });
    }
    return prepared;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
          }
        });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = undefined;
        reject(req.error || new Error('IndexedDBを開けませんでした。'));
      };
      req.onblocked = () => {
        dbPromise = undefined;
        reject(new Error('IndexedDB更新が他のタブによりブロックされています。別タブを閉じて再読み込みしてください。'));
      };
    });
    return dbPromise;
  }

  async function writeTransaction(storeNames, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      let result;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error || transaction.error || new Error('IndexedDB書き込みに失敗しました。'));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('IndexedDB処理が中断されました。'));
      try {
        result = action(transaction);
      } catch (error) {
        try { transaction.abort(); } catch {}
        fail(error);
      }
    });
  }

  async function readRequest(storeName, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      let request;
      try {
        request = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB読み込みに失敗しました。'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB読み込みが中断されました。'));
    });
  }

  const put = (storeName, value) => writeTransaction([storeName], (transaction) => {
    if (!STORES.includes(storeName)) throw new Error(`未対応Storeです: ${storeName}`);
    const normalized = validateRow(storeName, value, 0);
    transaction.objectStore(storeName).put(normalized);
    return normalized;
  });
  const get = (storeName, key) => readRequest(storeName, (store) => store.get(key));
  const getAll = (storeName) => readRequest(storeName, (store) => store.getAll());
  const remove = (storeName, key) => writeTransaction([storeName], (transaction) => {
    transaction.objectStore(storeName).delete(key);
  });
  const clear = (storeName) => writeTransaction([storeName], (transaction) => {
    transaction.objectStore(storeName).clear();
  });

  async function exportAll() {
    const data = { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores: {} };
    for (const storeName of STORES) {
      const rows = await getAll(storeName);
      data.stores[storeName] = rows.map((row) => normalizeRow(storeName, row));
    }
    return data;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (isRecord(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
    }
    return value;
  }

  function sameRecord(a, b) {
    return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
  }

  async function mergePrepared(prepared) {
    await writeTransaction(STORES, (transaction) => {
      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        for (const row of prepared[storeName]) store.put(row);
      }
    });
  }

  async function replaceAllStores(stores) {
    await writeTransaction(STORES, (transaction) => {
      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const row of stores[storeName] || []) store.put(normalizeRow(storeName, row));
      }
    });
  }

  async function verifyImported(prepared) {
    for (const storeName of STORES) {
      const current = await getAll(storeName);
      const byKey = new Map(current.map((row) => [String(keyFor(storeName, row)), row]));
      for (const expected of prepared[storeName]) {
        const key = String(keyFor(storeName, expected));
        const actual = byKey.get(key);
        if (!actual || !sameRecord(actual, expected)) {
          throw new Error(`${storeName} の読み戻し検証に失敗しました: ${key}`);
        }
      }
    }
  }

  async function importAll(payload) {
    const prepared = validateImportPayload(payload);
    const recoverySnapshot = await exportAll();

    try {
      await mergePrepared(prepared);
      await verifyImported(prepared);
    } catch (error) {
      try {
        await replaceAllStores(recoverySnapshot.stores);
      } catch (rollbackError) {
        throw new Error(`Import失敗後のRollbackにも失敗しました: ${rollbackError.message || rollbackError}`);
      }
      throw new Error(`Importに失敗したため元データへRollbackしました: ${error.message || error}`);
    }

    return {
      imported: Object.fromEntries(STORES.map((name) => [name, prepared[name].length])),
      recoverySnapshot,
    };
  }

  window.OsuDB = {
    DB_NAME,
    DB_VERSION,
    SCHEMA_VERSION,
    STORES,
    openDB,
    put,
    get,
    getAll,
    remove,
    clear,
    exportAll,
    importAll,
    validateImportPayload,
    normalizePracticeRecord,
  };
})();
