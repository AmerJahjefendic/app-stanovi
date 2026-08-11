import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizeRestoredStoreRows } from "../js/backup/backup.service.js";

test("v15 DB timestamp migration is gated by a persistent meta marker and awaited before resolve", () => {
  const source = fs.readFileSync(new URL("../js/db/db.js", import.meta.url), "utf8");

  assert.match(source, /V15_TIMESTAMP_MIGRATION_KEY\s*=\s*"migration:v15:timestamps"/);
  assert.match(source, /await runV15TimestampMigration\(db\);\s*resolve\(db\);/s);
  assert.match(source, /if \(marker\?\.value === true\) return;/);
});

test("restore boundary normalizes legacy timestamp fields after one-time DB migration", () => {
  const fallback = "2026-08-11T00:00:00.000Z";
  const rows = normalizeRestoredStoreRows({
    income_items: [{
      id: "inc_1",
      created_at: "2025-04-01T00:00:00.000Z",
    }],
    imports: [{
      id: "imp_1",
      year: 2025,
      month: 4,
      created_at: "2025-04-02T00:00:00.000Z",
    }],
  }, fallback);

  assert.equal(rows.income_items[0].createdAt, "2025-04-01T00:00:00.000Z");
  assert.equal(rows.income_items[0].updatedAt, "2025-04-01T00:00:00.000Z");
  assert.equal("created_at" in rows.income_items[0], false);
  assert.equal("updated_at" in rows.income_items[0], false);

  assert.equal(rows.imports[0].imported_at, "2025-04-02T00:00:00.000Z");
  assert.equal("created_at" in rows.imports[0], false);
});

test("imports imported_at remains an intentional semantic exception during restore", () => {
  const rows = normalizeRestoredStoreRows({
    imports: [{ id: "imp_2", imported_at: "2025-06-01T00:00:00.000Z" }],
  }, "2026-08-11T00:00:00.000Z");

  assert.equal(rows.imports[0].imported_at, "2025-06-01T00:00:00.000Z");
  assert.equal(rows.imports[0].createdAt, undefined);
});

test("record timestamp helper is part of the PWA precache shell", () => {
  const source = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  assert.match(source, /"\.\/js\/shared\/record-timestamps\.js"/);
});


test("category_alias writes preserve createdAt and refresh updatedAt through shared helper", () => {
  const source = fs.readFileSync(new URL("../js/db/db.js", import.meta.url), "utf8");

  assert.match(source, /import \{ normalizeLegacyTimestamps, withCreateTimestamps \} from "\.\.\/shared\/record-timestamps\.js";/);
  const start = source.indexOf("export async function dbPutCategoryAlias");
  const end = source.indexOf("export async function dbDeleteCategoryAlias", start);
  const fnSource = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(fnSource, /const existing = await dbGetOne\("category_aliases", normalizedFrom\);/);
  assert.match(fnSource, /\.\.\.withCreateTimestamps\(existing\)/);
  assert.doesNotMatch(fnSource, /updatedAt:\s*new Date\(\)\.toISOString\(\)/);
});
