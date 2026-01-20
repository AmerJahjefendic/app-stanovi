// js/db.js
const DB_NAME = "appstanovi_db";
const DB_VER = 13;

// helper: create store if missing
function ensureStore(db, name, opts, indexDefs = []) {
  if (!db.objectStoreNames.contains(name)) {
    const store = db.createObjectStore(name, opts);
    for (const idx of indexDefs) {
      store.createIndex(idx.name, idx.keyPath, idx.options || {});
    }
  }
}

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

      // ===== NEW STORES (multi-apartment support) =====

      // 1) meta store (schemaVersion)
      ensureStore(db, "meta", { keyPath: "key" });

      // 2) groups
      ensureStore(db, "groups", { keyPath: "id" });

      // 3) apartments
      ensureStore(
        db,
        "apartments",
        { keyPath: "id" },
        [
          { name: "groupId", keyPath: "groupId", options: { unique: false } },
          { name: "ownerType", keyPath: "ownerType", options: { unique: false } },
          { name: "isActive", keyPath: "isActive", options: { unique: false } },
          { name: "sort", keyPath: "sort", options: { unique: false } },
          { name: "agencyPct", keyPath: "agencyPct", options: { unique: false } },
          { name: "shareKey", keyPath: "shareKey", options: { unique: false } },
        ]
      );

      // Dodaj shareKey index ako store već postoji (upgrade scenario)
      if (db.objectStoreNames.contains("apartments")) {
        const apt = req.transaction.objectStore("apartments");
        if (!apt.indexNames.contains("shareKey")) {
          apt.createIndex("shareKey", "shareKey", { unique: false });
        }
      }

      // 4) commission_rules (za kasnije)
      ensureStore(
        db,
        "commission_rules",
        { keyPath: "id" },
        [
          { name: "groupId", keyPath: "groupId", options: { unique: false } },
          { name: "apartmentId", keyPath: "apartmentId", options: { unique: false } },
          { name: "platform", keyPath: "platform", options: { unique: false } },
        ]
      );

      // 5) share_sets (shared clusters)
      ensureStore(
        db,
        "share_sets",
        { keyPath: "id" },
        [
          { name: "isActive", keyPath: "isActive", options: { unique: false } },
          { name: "sort", keyPath: "sort", options: { unique: false } },
        ]
      );

      // ===== SEED DEFAULTS (safe, only if empty/missing) =====
      // NOTE: onupgradeneeded runs inside a versionchange transaction
      const t = req.transaction;

      function putIfMissing(storeName, key, obj) {
        const s = t.objectStore(storeName);
        const getReq = s.get(key);
        getReq.onsuccess = () => {
          if (!getReq.result) s.put(obj);
        };
      }

      function seedIfEmpty(storeName, rows) {
        const s = t.objectStore(storeName);
        const cReq = s.count();
        cReq.onsuccess = () => {
          const n = cReq.result || 0;
          if (n === 0) {
            for (const r of rows) s.put(r);
          }
        };
      }

      // 1) META: schemaVersion
      putIfMissing("meta", "schemaVersion", { key: "schemaVersion", value: 1 });

      // 2) GROUPS
      function ensureSystemGroup(id, name, type) {
        const s = t.objectStore("groups");
        const gReq = s.get(id);
        gReq.onsuccess = () => {
          const cur = gReq.result;

          // Ako ne postoji -> kreiraj
          if (!cur) {
            s.put({ id, name, type, isSystem: true, updatedAt: new Date().toISOString() });
            return;
          }

          // Ako postoji -> updejtuj samo system polja (name/type/isSystem)
          // (Ovo je "DA" koje si tražio: automatski preimenuje na nove nazive.)
          const next = {
            ...cur,
            id,
            name,
            type,
            isSystem: true,
            updatedAt: new Date().toISOString(),
          };
          s.put(next);
        };
      }

      ensureSystemGroup("AZ", "Shared", "OWNED_SHARED");
      ensureSystemGroup("O",  "Solo", "OWNED_SOLO");
      ensureSystemGroup("N",  "Managed", "MANAGED");

      // 3) SHARE_SETS (prvo kreiraj share set)
      const now = new Date().toISOString();
      putIfMissing("share_sets", "NIZE_BANJE_2", {
        id: "NIZE_BANJE_2",
        name: "Niže banje 2",
        address: "Niže banje 2",
        isActive: true,
        sort: 10,
        createdAt: now,
        updatedAt: now,
      });

      // 4) APARTMENTS (A/Z OWNED, N MANAGED with 25%)
      seedIfEmpty("apartments", [
        {
          id: "A",
          name: "A",
          groupId: "AZ",
          ownerType: "OWNED",
          agencyPct: null, // OWNED => null
          isActive: true,
          sort: 10,
          legacyCode: "A",
          shareKey: "NIZE_BANJE_2",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "Z",
          name: "Z",
          groupId: "AZ",
          ownerType: "OWNED",
          agencyPct: null,
          isActive: true,
          sort: 20,
          legacyCode: "Z",
          shareKey: "NIZE_BANJE_2",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "N",
          name: "N",
          groupId: "N",
          ownerType: "MANAGED",
          agencyPct: 25, // MANAGED => required, default 25
          isActive: true,
          sort: 30,
          legacyCode: "N",
          shareKey: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // ===== MIGRATION: Patch existing apartments =====
      function patchApartment(id, patchFn) {
        const s = t.objectStore("apartments");
        const r = s.get(id);
        r.onsuccess = () => {
          const cur = r.result;
          if (!cur) return;
          const next = patchFn(cur);
          if (next) s.put(next);
        };
      }

      // Ako A/Z nemaju shareKey -> setuj na NIZE_BANJE_2
      patchApartment("A", (cur) => {
        if (cur.groupId === "AZ" && !cur.shareKey) {
          return { ...cur, shareKey: "NIZE_BANJE_2", updatedAt: new Date().toISOString() };
        }
        return null;
      });

      patchApartment("Z", (cur) => {
        if (cur.groupId === "AZ" && !cur.shareKey) {
          return { ...cur, shareKey: "NIZE_BANJE_2", updatedAt: new Date().toISOString() };
        }
        return null;
      });
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

      // Run post-upgrade migrations asynchronously
      runPostUpgradeMigrations(db).catch(err => {
        console.error("[db] Post-upgrade migration failed:", err);
      });

      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ===== POST-UPGRADE MIGRATIONS =====
// Migrations that run after DB is opened (not in onupgradeneeded transaction)
async function runPostUpgradeMigrations(db) {
  await patchShareSetsTimestamps(db);
  await patchSystemGroupNames();
}

async function patchSystemGroupNames() {
  const now = new Date().toISOString();

  const gAZ = await dbGetOne("groups", "AZ");
  if (gAZ && gAZ.isSystem && gAZ.name !== "Shared") {
    await dbPutOne("groups", { ...gAZ, name: "Shared", updatedAt: now });
  }

  const gO = await dbGetOne("groups", "O");
  if (gO && gO.isSystem && gO.name !== "Solo") {
    await dbPutOne("groups", { ...gO, name: "Solo", updatedAt: now });
  }

  const gN = await dbGetOne("groups", "N");
  if (gN && gN.isSystem && gN.name !== "Managed") {
    await dbPutOne("groups", { ...gN, name: "Managed", updatedAt: now });
  }
}

async function patchShareSetsTimestamps(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("share_sets", "readwrite");
    const store = tx.objectStore("share_sets");
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const all = getAllReq.result || [];
      const now = new Date().toISOString();

      for (const s of all) {
        let changed = false;
        const rec = { ...s };

        // Migrate snake_case to camelCase
        if (rec.updated_at && !rec.updatedAt) {
          rec.updatedAt = rec.updated_at;
          delete rec.updated_at;
          changed = true;
        }

        // Ensure updatedAt exists
        if (!rec.updatedAt) {
          rec.updatedAt = now;
          changed = true;
        }

        // Ensure createdAt exists
        if (!rec.createdAt) {
          rec.createdAt = rec.updatedAt || now;
          changed = true;
        }

        if (changed) {
          store.put(rec);
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

function _normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function shoppingExistsByName(group, name) {
  const rows = await shoppingListByGroup(group);
  const target = _normName(name);
  return rows.some(r => _normName(r.name) === target);
}

export async function shoppingAddItem({ group, name, note = "", unit = "pcs", qty = null, status = "IN_STOCK" }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Naziv artikla je prazan.");

  // ✅ duplikat provjera po group-u (AZ i N odvojeno)
  const exists = await shoppingExistsByName(group, cleanName);
  if (exists) throw new Error(`Stavka "${cleanName}" već postoji u ovoj listi (${group}).`);

  const q = (qty === "" || qty === null || qty === undefined) ? null : Number(qty);

  const rec = {
    id: makeId("shop"),
    group,
    name: cleanName,
    note: String(note || "").trim(),
    unit: String(unit || "pcs").trim(),
    qty: Number.isFinite(q) && q > 0 ? q : null, // opcionalno, samo >0
    status,
    updated_at: new Date().toISOString(),
  };

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

export async function shoppingBumpQty(id, delta) {
  const row = await dbGetOne(SHOP_STORE, id);
  if (!row) return false;

  const cur = Number(row.qty);
  const base = Number.isFinite(cur) && cur > 0 ? cur : 0;
  const next = base + Number(delta || 0);

  // Pravilo: ako padne na 0 ili manje -> qty = null (nije obavezno polje)
  row.qty = next > 0 ? next : null;
  row.updated_at = new Date().toISOString();

  return dbPutOne(SHOP_STORE, row);
}
