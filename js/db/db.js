// js/db.js
const DB_NAME = "appstanovi_db";
const DB_VER = 8;

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

      // ===== SHOPPING ITEMS =====
      if (!db.objectStoreNames.contains("shopping_items")) {
        const s = db.createObjectStore("shopping_items", { keyPath: "id" });

        // Filtriranje i badge count:
        s.createIndex("by_group", "group", { unique: false });
        s.createIndex("by_status", "status", { unique: false });

        // Najkorisniji index: group + status
        s.createIndex("by_group_status", ["group", "status"], { unique: false });

        // Opcionalno za sortiranje po zadnjoj izmjeni
        s.createIndex("by_updated_at", "updated_at", { unique: false });
      }
    };

    req.onblocked = () => {
      console.warn("[db] Upgrade blocked. Zatvori druge AppStanovi tabove.");
    };

    req.onsuccess = () => {
      const db = req.result;

      // Ako druga stranica uradi upgrade DB-a, ova konekcija mora da se zatvori
      db.onversionchange = () => {
        try { db.close(); } catch { }
        _dbPromise = null; // reset cache da se sljedeći poziv ponovo otvori
        console.warn("[db] versionchange -> connection closed. Reload page / close other tabs.");
      };

      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

// Cached DB connection promise
let _dbPromise = null;
export function getDB() {
  if (!_dbPromise) _dbPromise = openDB();
  return _dbPromise;
}

function tx(db, store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

// ================== BASIC CRUD ==================
export async function dbPutMany(storeName, items) {
  let retries = 2;
  while (retries >= 0) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const t = db.transaction(storeName, "readwrite");
          const store = t.objectStore(storeName);
          for (const it of items) store.put(it);
          t.oncomplete = () => resolve(true);
          t.onerror = () => reject(t.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn(`DB error in dbPutMany (retries left: ${retries})`, err);
      if (retries > 0) {
        _dbPromise = null;
        retries--;
        // zadrži iste delay vrijednosti (100ms, 200ms) ali čitljiviji redoslijed
        await new Promise(r => setTimeout(r, 100 * (2 - retries)));
      } else {
        throw err;
      }
    }
  }
}

export async function dbPutOne(storeName, item) {
  let retries = 2;
  while (retries >= 0) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const t = db.transaction(storeName, "readwrite");
          t.objectStore(storeName).put(item);
          t.oncomplete = () => resolve(true);
          t.onerror = () => reject(t.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn(`DB error in dbPutOne (retries left: ${retries})`, err);
      if (retries > 0) {
        // Reset cache and retry
        _dbPromise = null;
        // Small delay before retry (same timing, clearer order)
        retries--;
        await new Promise(r => setTimeout(r, 100 * (2 - retries)));
      } else {
        throw err;
      }
    }
  }
}

export async function dbGetAll(storeName) {
  let retries = 2;
  while (retries >= 0) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const req = tx(db, storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn(`DB error in dbGetAll (retries left: ${retries})`, err);
      if (retries > 0) {
        _dbPromise = null;
        retries--;
        await new Promise(r => setTimeout(r, 100 * (2 - retries)));
      } else {
        throw err;
      }
    }
  }
}

export async function dbGetByIndex(storeName, indexName, key) {
  let retries = 2;
  while (retries >= 0) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const store = tx(db, storeName);
          const req = store.index(indexName).getAll(key);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn(`DB error in dbGetByIndex (retries left: ${retries})`, err);
      if (retries > 0) {
        _dbPromise = null;
        retries--;
        await new Promise(r => setTimeout(r, 100 * (2 - retries)));
      } else {
        throw err;
      }
    }
  }
}

export async function dbGetOneByIndex(storeName, indexName, key) {
  let retries = 2;
  while (retries >= 0) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const store = tx(db, storeName);
          const req = store.index(indexName).get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.warn(`DB error in dbGetOneByIndex (retries left: ${retries})`, err);
      if (retries > 0) {
        _dbPromise = null;
        retries--;
        await new Promise(r => setTimeout(r, 100 * (2 - retries)));
      } else {
        throw err;
      }
    }
  }
}

export async function dbDeleteByIndex(storeName, indexName, key) {
  const db = await getDB();

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
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, "readwrite");
    t.objectStore(storeName).delete(key);
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

export async function dbGetOne(storeName, key) {
  const db = await getDB();
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

// ================== SMART SHOPPING API ==================
const SHOP_STORE = "shopping_items";

export function shoppingGroupFromApartment(apartment) {
  // A i Z su shared
  return (apartment === "N") ? "N" : "AZ";
}

export async function shoppingAddItem({ group, name, note = "", unit = "pcs", status = "IN_STOCK" }) {
  const rec = {
    id: makeId("shop"),
    group,
    name: String(name || "").trim(),
    note: String(note || "").trim(),
    unit: String(unit || "pcs").trim(),
    status,
    updated_at: new Date().toISOString(),
  };
  if (!rec.name) throw new Error("Naziv artikla je prazan.");
  return dbPutOne(SHOP_STORE, rec);
}

export async function shoppingToggleStatus(id) {
  const row = await dbGetOne(SHOP_STORE, id);
  if (!row) return false;
  const next = (row.status === "TO_BUY") ? "IN_STOCK" : "TO_BUY";
  row.status = next;
  row.updated_at = new Date().toISOString();
  return dbPutOne(SHOP_STORE, row);
}

export async function shoppingDeleteItem(id) {
  return dbDelete(SHOP_STORE, id);
}

export async function shoppingListByGroup(group) {
  // ovo vrati sve u grupi (pa filtriraj na UI)
  return dbGetByIndex(SHOP_STORE, "by_group", group);
}

export async function shoppingListByGroupStatus(group, status) {
  return dbGetByIndex(SHOP_STORE, "by_group_status", [group, status]);
}

export async function shoppingCountToBuy(group) {
  const rows = await shoppingListByGroupStatus(group, "TO_BUY");
  return rows.length;
}
