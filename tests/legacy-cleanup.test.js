import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy apartment metadata with personal data is removed from runtime constants", async () => {
  const source = await read("js/shared/constants.js");
  for (const token of ["APARTMENT_DEFS", "APARTMENT_META", "APT_ROLE", "APT_LIST", "APT_FILTERS", "ownerName", "propertyName"]) {
    assert.equal(source.includes(token), false, `constants.js still contains ${token}`);
  }
});

test("new Income CRUD no longer maintains the legacy n_commission aggregate", async () => {
  const source = await read("js/income/income.page.js");
  assert.equal(source.includes("rebuildNCommissionForPeriod"), false);
  assert.equal(source.includes('"n_commission"'), false);
});

test("n_commission remains supported for legacy DB, backup and reporting compatibility", async () => {
  const [db, backup, metrics] = await Promise.all([
    read("js/db/db.js"),
    read("js/backup/backup.service.js"),
    read("js/reports/metrics.service.js"),
  ]);
  assert.match(db, /n_commission/);
  assert.match(backup, /n_commission/);
  assert.match(metrics, /nCommission/);
});

test("dead N-specific owner-report alias is removed while generic owner report remains", async () => {
  const source = await read("js/reports/metrics.service.js");
  assert.equal(source.includes("computeNOwnerReport"), false);
  assert.match(source, /export function computeOwnerReport/);
});
