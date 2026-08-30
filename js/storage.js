(() => {
  const DB_NAME = 'osuHubDB';
  const DB_VERSION = 1;
  const STORES = ['results', 'coaching', 'practice', 'settings'];
  let dbPromise;

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
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      try { request = action(store); } catch (error) { reject(error); return; }
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      }
    });
  }

  const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
  const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
  const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
  const remove = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
  const clear = (store) => tx(store, 'readwrite', (s) => s.clear());

  async function exportAll() {
    const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), stores: {} };
    for (const store of STORES) data.stores[store] = await getAll(store);
    return data;
  }

  async function importAll(payload, replace = false) {
    if (!payload || payload.schemaVersion !== 1 || !payload.stores) throw new Error('対応していないバックアップ形式です。');
    for (const store of STORES) {
      if (replace) await clear(store);
      const rows = Array.isArray(payload.stores[store]) ? payload.stores[store] : [];
      for (const row of rows) await put(store, row);
    }
  }

  window.OsuDB = { STORES, openDB, put, get, getAll, remove, clear, exportAll, importAll };
})();
