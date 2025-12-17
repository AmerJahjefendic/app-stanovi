const DB_NAME = "appstanovi_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("imports")) {
        const s = db.createObjectStore("imports", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"], { unique: true });
      }
      if (!db.objectStoreNames.contains("income_monthly")) {
        const s = db.createObjectStore("income_monthly", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"]);
        s.createIndex("by_period_apt", ["year", "month", "apartment"]);
      }
      if (!db.objectStoreNames.contains("expenses")) {
        const s = db.createObjectStore("expenses", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"]);
        s.createIndex("by_period_scope", ["year", "month", "scope"]);
        s.createIndex("by_period_apt", ["year", "month", "apartment"]);
      }
      if (!db.objectStoreNames.contains("n_commission")) {
        const s = db.createObjectStore("n_commission", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"], { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

export async function dbPutMany(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    const store = t.objectStore(storeName);
    for (const it of items) store.put(it);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function dbPutOne(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    t.objectStore(storeName).put(item);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByIndex(storeName, indexName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName);
    const req = store.index(indexName).getAll(key);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetOneByIndex(storeName, indexName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, storeName);
    const req = store.index(indexName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function dbDeleteByIndex(storeName, indexName, key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const idx = store.index(indexName);

    const req = idx.openCursor(IDBKeyRange.only(key));

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
