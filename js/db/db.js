// js/db.js
const DB_NAME = "appstanovi_db";
const DB_VER = 6;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;

      // ===== CATEGORY ALIASES (merge kategorija) =====
      // Jedan "from" -> jedan "to"
      if (!db.objectStoreNames.contains("category_aliases")) {
        const s = db.createObjectStore("category_aliases", { keyPath: "from" });
        s.createIndex("by_from", "from", { unique: true });
      }

      // ===== IMPORTS =====
      if (!db.objectStoreNames.contains("imports")) {
        const s = db.createObjectStore("imports", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"], { unique: true });
      }

      // ===== INCOME =====
      if (!db.objectStoreNames.contains("income_monthly")) {
        const s = db.createObjectStore("income_monthly", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"]);
        s.createIndex("by_period_apt", ["year", "month", "apartment"]);
      }

      // ===== INCOME ITEMS (taksativne stavke prihoda) =====
      if (!db.objectStoreNames.contains("income_items")) {
        const s = db.createObjectStore("income_items", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"]);
        s.createIndex("by_period_apt", ["year", "month", "apartment"]);
      }

      // ===== EXPENSES =====
      if (!db.objectStoreNames.contains("expenses")) {
        const s = db.createObjectStore("expenses", { keyPath: "id" });
        s.createIndex("by_period", ["year", "month"]);
        s.createIndex("by_period_scope", ["year", "month", "scope"]);
        s.createIndex("by_period_apt", ["year", "month", "apartment"]);
      }

      // ===== N COMMISSION =====
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

// ================== BASIC CRUD ==================
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

export async function dbDeleteByIndex(storeName, indexName, key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    const store = t.objectStore(storeName);
    const idx = store.index(indexName);

    const req = idx.openCursor(IDBKeyRange.only(key));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    t.objectStore(storeName).delete(key);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function dbGetOne(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ================== CATEGORY ALIASES API ==================
export async function dbGetAllCategoryAliases() {
  return dbGetAll("category_aliases");
}

export async function dbPutCategoryAlias(from, to) {
  const rec = {
    from: String(from || "").trim(),
    to: String(to || "").trim(),
    updated_at: new Date().toISOString(),
  };
  if (!rec.from) throw new Error("Alias 'from' je prazan.");
  if (!rec.to) throw new Error("Alias 'to' je prazan.");
  return dbPutOne("category_aliases", rec); // keyPath = from => upsert radi
}

export async function dbDeleteCategoryAlias(from) {
  const key = String(from || "").trim();
  if (!key) return true;
  return dbDelete("category_aliases", key); // briše po keyPath ("from")
}

export async function dbResolveCategoryAlias(from) {
  const key = String(from || "").trim();
  if (!key) return null;
  const row = await dbGetOne("category_aliases", key);
  return row?.to || null;
}
