import {
  BACKUP_STORE_NAMES,
  DB_VER,
  STORE_KEY_PATHS,
  dbGetAll,
  dbPutStoreMapAtomic,
} from "../db/db.js";
import "../shared/app-version.js";
import { normalizeLegacyTimestamps } from "../shared/record-timestamps.js";

export const BACKUP_FORMAT_VERSION = 2;
export const DATA_SCHEMA_VERSION = 1;

const APP_ID = "appstanovi";
const LEGACY_APP_NAME = "AppStanovi";

const TIMESTAMPED_RESTORE_STORES = new Set([
  "income_items",
  "income_monthly",
  "expenses",
  "shopping_items",
  "category_aliases",
  "n_commission",
]);

/**
 * Normalize legacy timestamp shapes at the restore boundary. This is required
 * because the v15 DB backfill is one-time; an older backup restored later must
 * not reintroduce created_at/updated_at fields after the migration marker is set.
 * `imports.imported_at` remains an intentional semantic exception.
 */
export function normalizeRestoredStoreRows(storeRows, fallbackIso = new Date().toISOString()) {
  const normalized = {};

  for (const [storeName, rows] of Object.entries(storeRows || {})) {
    if (TIMESTAMPED_RESTORE_STORES.has(storeName)) {
      normalized[storeName] = (rows || []).map((row) => normalizeLegacyTimestamps(row, fallbackIso));
      continue;
    }

    if (storeName === "imports") {
      normalized[storeName] = (rows || []).map((row) => {
        if (row?.imported_at) return { ...row };
        const { created_at, ...rest } = row || {};
        return { ...rest, imported_at: created_at || fallbackIso };
      });
      continue;
    }

    normalized[storeName] = rows;
  }

  return normalized;
}

function appVersion() {
  return String(globalThis.APPSTANOVI_APP_VERSION || "unknown");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRows(storeName, rows) {
  assert(Array.isArray(rows), `Backup store '${storeName}' mora biti lista.`);

  const keyPath = STORE_KEY_PATHS[storeName];
  const seen = new Set();

  rows.forEach((row, index) => {
    assert(isPlainObject(row), `Neispravan zapis u store-u '${storeName}' (red ${index + 1}).`);
    if (!keyPath) return;

    const key = row[keyPath];
    assert(
      key !== undefined && key !== null && key !== "",
      `Zapis u store-u '${storeName}' nema obavezni ključ '${keyPath}' (red ${index + 1}).`
    );

    const token = `${typeof key}:${String(key)}`;
    assert(!seen.has(token), `Dupliran ključ '${String(key)}' u store-u '${storeName}'.`);
    seen.add(token);
  });
}

function validateCurrentBackup(raw) {
  const meta = raw.meta;
  assert(isPlainObject(meta), "Backup nema validne metapodatke.");
  assert(meta.appId === APP_ID, "Ovo nije AppStanovi backup fajl.");
  assert(
    Number(meta.backupFormatVersion) === BACKUP_FORMAT_VERSION,
    `Backup format ${String(meta.backupFormatVersion)} nije podržan. Podržan je format ${BACKUP_FORMAT_VERSION}.`
  );
  const dataSchemaVersion = Number(meta.dataSchemaVersion);
  assert(
    Number.isInteger(dataSchemaVersion) && dataSchemaVersion >= 1 && dataSchemaVersion <= DATA_SCHEMA_VERSION,
    `Data schema verzija '${String(meta.dataSchemaVersion)}' nije podržana.`
  );
  assert(isPlainObject(raw.data), "Backup nema validnu data sekciju.");
  assert(Array.isArray(meta.stores), "Backup nema listu store-ova.");

  const missing = BACKUP_STORE_NAMES.filter((name) => !meta.stores.includes(name) || !Array.isArray(raw.data[name]));
  assert(!missing.length, `Backup je nepotpun. Nedostaju store-ovi: ${missing.join(", ")}.`);

  const storeRows = {};
  for (const storeName of BACKUP_STORE_NAMES) {
    const rows = raw.data[storeName];
    validateRows(storeName, rows);
    storeRows[storeName] = rows;
  }

  return {
    kind: "current",
    sourceAppVersion: String(meta.appVersion || "unknown"),
    sourceDatabaseVersion: Number(meta.databaseVersion) || null,
    sourceDataSchemaVersion: dataSchemaVersion,
    exportedAt: meta.exportedAt || null,
    storeRows,
  };
}

function legacyArray(raw, field, fallback = []) {
  if (raw[field] === undefined || raw[field] === null) return fallback;
  assert(Array.isArray(raw[field]), `Legacy backup polje '${field}' mora biti lista.`);
  return raw[field];
}

function validateLegacyBackup(raw) {
  const meta = raw.meta;
  assert(isPlainObject(meta) && meta.app === LEGACY_APP_NAME, "Ovo nije validan AppStanovi backup fajl.");

  // Historical backups predate a formal format version. The known v1 shape
  // used meta.version = "1.0". Unknown future/foreign shapes are rejected.
  if (meta.version !== undefined) {
    assert(String(meta.version) === "1.0", `Legacy backup verzija '${String(meta.version)}' nije podržana.`);
  }

  const expenses = Array.isArray(raw.expenses_v2)
    ? raw.expenses_v2
    : legacyArray(raw, "expenses");

  const storeRows = {
    apartments: legacyArray(raw, "apartments"),
    groups: legacyArray(raw, "groups"),
    share_sets: legacyArray(raw, "share_sets"),
    commission_rules: legacyArray(raw, "commission_rules"),
    meta: legacyArray(raw, "settings_meta"),
    shopping_items: legacyArray(raw, "shopping_items"),
    category_aliases: legacyArray(raw, "category_aliases"),
    imports: legacyArray(raw, "imports"),
    income_monthly: legacyArray(raw, "income_monthly"),
    income_items: legacyArray(raw, "income_items"),
    expenses,
    n_commission: legacyArray(raw, "n_commission"),
  };

  // The obsolete legacy root field `income` is intentionally ignored: no
  // corresponding IndexedDB store exists in the current schema.
  for (const [storeName, rows] of Object.entries(storeRows)) {
    validateRows(storeName, rows);
  }

  return {
    kind: "legacy",
    sourceAppVersion: "legacy",
    sourceDatabaseVersion: Number(meta.schema_version) || null,
    sourceDataSchemaVersion: null,
    exportedAt: meta.exported_at || null,
    storeRows,
  };
}

export function parseAndValidateBackupText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Backup nije validan JSON fajl.");
  }

  assert(isPlainObject(raw), "Backup mora sadržavati JSON objekt.");

  if (raw.meta?.appId === APP_ID || raw.meta?.backupFormatVersion !== undefined) {
    return validateCurrentBackup(raw);
  }

  return validateLegacyBackup(raw);
}

export async function buildBackupData() {
  const exportedAt = new Date().toISOString();
  const data = {};

  // A failed store read must fail the entire export. Silent omissions can make
  // a backup look successful while losing data.
  for (const storeName of BACKUP_STORE_NAMES) {
    data[storeName] = await dbGetAll(storeName);
  }

  return {
    meta: {
      appId: APP_ID,
      app: LEGACY_APP_NAME,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      appVersion: appVersion(),
      databaseVersion: DB_VER,
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      exportedAt,
      stores: [...BACKUP_STORE_NAMES],
    },
    data,
  };
}

export async function exportBackupFile() {
  const backup = await buildBackupData();
  const nowIso = backup.meta.exportedAt;
  const filename = `appstanovi-backup-${nowIso.slice(0, 10)}.json`;
  const jsonText = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { filename, backup };
    } catch (e) {
      if (e?.name === "AbortError") return null;
      console.warn("Save picker failed, fallback:", e);
    }
  }

  if (navigator.share) {
    try {
      const file = new File([blob], filename, { type: "application/json" });
      await navigator.share({ files: [file], title: "AppStanovi backup" });
      return { filename, backup };
    } catch (e) {
      console.warn("Share API failed, fallback to download:", e);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { filename, backup };
}

export async function restoreBackupFileAtomic(file) {
  const text = await file.text();
  const normalized = parseAndValidateBackupText(text);

  const label = normalized.kind === "legacy"
    ? "Stariji podržani AppStanovi backup je validan."
    : `AppStanovi backup ${normalized.sourceAppVersion} je validan.`;

  const ok = confirm(`${label}\n\nRestore će DODATI/PREPISATI podatke iz backupa. Postojeći podaci se neće brisati. Nastaviti?`);
  if (!ok) return null;

  const restoreRows = normalizeRestoredStoreRows(normalized.storeRows);
  await dbPutStoreMapAtomic(restoreRows);
  return { ...normalized, storeRows: restoreRows };
}
