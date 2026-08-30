(() => {
  const DB_NAME = 'osuHubDB';
  const DB_VERSION = 1;
  const SCHEMA_VERSION = 1;
  const STORES = ['results', 'coaching', 'practice', 'settings'];
  let dbPromise;

  const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const cloneJson = (value) => JSON.parse(JSON.stringify(value));

  function keyFor(storeName, row) {
    return storeName === 'settings' ? row.key : row.id;
  }

  function validateRow(storeName, row, index) {
    if (!isRecord(row)) throw new Error(`${storeName}[${index}] がObjectではありません。`);
    const value = cloneJson(row);
    const keyName = storeName === 'settings' ? 'key' : 'id';
    const key = String(value[keyName] ?? '').trim();
    if (!key || key.length > 200) throw new Error(`${storeName}[${index}] の${keyName}が不正です。`);
    value[keyName] = key;

    if (storeName === 'results' && value.source === 'osu-api') {
      const scoreId = String(value.osuScoreId ?? '').trim();
      if (!/^\d+$/.test(scoreId)) throw new Error(`${storeName}[${index}] のosuScoreIdが不正です。`);
      const expectedId = `osu:${scoreId}`;
      if (value.id !== expectedId) throw new Error(`${storeName}[${index}] のScore IDが整合していません。`);
    }

    return value;
  }

  function validateImportPayload(payload) {
    if (!isRecord(payload) || payload.schemaVersion !== SCHEMA_VERSION || !isRecord(payload.stores)) {
      throw new Error('対応していないバックアップ形式です。');
    }

    const prepared = {};
    for (const storeName of STORES) {
      const rows = payload.stores[storeName] ?? [];
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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDBを開けませんでした。'));
      req.onblocked = () => reject(new Error('IndexedDB更新が他のタブによりブロックされています。'));
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
    transaction.objectStore(storeName).put(value);
    return value;
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
    for (const storeName of STORES) data.stores[storeName] = await getAll(storeName);
    return data;
  }

  async function importAll(payload, replace = false) {
    const prepared = validateImportPayload(payload);
    await writeTransaction(STORES, (transaction) => {
      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        if (replace) store.clear();
        for (const row of prepared[storeName]) store.put(row);
      }
    });
    return { imported: Object.fromEntries(STORES.map((name) => [name, prepared[name].length])) };
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
  };
})();
