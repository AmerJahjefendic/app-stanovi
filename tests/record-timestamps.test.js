import test from "node:test";
import assert from "node:assert/strict";

import {
  withCreateTimestamps,
  stampNewRecords,
  normalizeLegacyTimestamps,
} from "../js/shared/record-timestamps.js";

test("withCreateTimestamps: new record gets createdAt = updatedAt = now", () => {
  const now = "2026-08-10T12:00:00.000Z";
  const result = withCreateTimestamps(null, now);
  assert.deepEqual(result, { createdAt: now, updatedAt: now });
});

test("withCreateTimestamps: editing preserves camelCase createdAt, refreshes updatedAt", () => {
  const now = "2026-08-10T12:00:00.000Z";
  const existing = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
  const result = withCreateTimestamps(existing, now);
  assert.equal(result.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.updatedAt, now);
});

test("withCreateTimestamps: editing a legacy snake_case record still preserves original createdAt", () => {
  const now = "2026-08-10T12:00:00.000Z";
  const existing = { created_at: "2025-05-01T00:00:00.000Z" };
  const result = withCreateTimestamps(existing, now);
  assert.equal(result.createdAt, "2025-05-01T00:00:00.000Z");
  assert.equal(result.updatedAt, now);
});

test("stampNewRecords: fills missing timestamps without touching other fields", () => {
  const now = "2026-08-10T12:00:00.000Z";
  const records = [
    { id: "inc_1", apartment: "A", amount_eur: 120 },
    { id: "inc_2", apartment: "Z", amount_eur: 80, createdAt: "2026-05-01T00:00:00.000Z" },
  ];
  const result = stampNewRecords(records, now);

  assert.equal(result[0].createdAt, now);
  assert.equal(result[0].updatedAt, now);
  assert.equal(result[0].amount_eur, 120);

  // pre-existing createdAt on a record is never clobbered
  assert.equal(result[1].createdAt, "2026-05-01T00:00:00.000Z");
  assert.equal(result[1].updatedAt, now);
});

test("normalizeLegacyTimestamps: XLSX-imported record with neither field falls back to migration date", () => {
  // Matches the real shape of imported income_monthly rows in the backup (no timestamps at all).
  const record = { id: "inc_123", year: 2025, month: 6, apartment: "A", income_eur: 900, nights: 12, source: "Tabela priliva" };
  const fallback = "2026-08-10T15:00:00.000Z";
  const result = normalizeLegacyTimestamps(record, fallback);

  assert.equal(result.createdAt, fallback);
  assert.equal(result.updatedAt, fallback);
  assert.equal(result.id, "inc_123");
  assert.equal(result.income_eur, 900);
});

test("normalizeLegacyTimestamps: manual-entry record with legacy snake_case fields is converted, not duplicated", () => {
  // Matches the real shape of manually-added income_items/expenses in the backup.
  const record = { id: "exp_1", amount_eur: 50, created_at: "2025-03-01T00:00:00.000Z", updated_at: "2025-03-02T00:00:00.000Z" };
  const result = normalizeLegacyTimestamps(record, "2026-08-10T15:00:00.000Z");

  assert.equal(result.createdAt, "2025-03-01T00:00:00.000Z");
  assert.equal(result.updatedAt, "2025-03-02T00:00:00.000Z");
  assert.equal("created_at" in result, false);
  assert.equal("updated_at" in result, false);
});

test("normalizeLegacyTimestamps: already-camelCase record (e.g. apartments) passes through unchanged", () => {
  const record = { id: "A", name: "Apartment A", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" };
  const result = normalizeLegacyTimestamps(record, "2026-08-10T15:00:00.000Z");

  assert.equal(result.createdAt, "2025-01-01T00:00:00.000Z");
  assert.equal(result.updatedAt, "2025-01-01T00:00:00.000Z");
});

test("normalizeLegacyTimestamps: created-only legacy record does not fake a migration-day edit", () => {
  const record = { id: "exp_2", amount_eur: 30, created_at: "2025-04-01T00:00:00.000Z" };
  const result = normalizeLegacyTimestamps(record, "2026-08-10T15:00:00.000Z");

  assert.equal(result.createdAt, "2025-04-01T00:00:00.000Z");
  assert.equal(result.updatedAt, "2025-04-01T00:00:00.000Z");
});

test("normalizeLegacyTimestamps: camelCase createdAt without updatedAt also inherits creation time", () => {
  const record = { id: "inc_legacy", createdAt: "2025-07-01T00:00:00.000Z" };
  const result = normalizeLegacyTimestamps(record, "2026-08-10T15:00:00.000Z");

  assert.equal(result.createdAt, "2025-07-01T00:00:00.000Z");
  assert.equal(result.updatedAt, "2025-07-01T00:00:00.000Z");
});

test("withCreateTimestamps: n_commission (no existing record) gets fresh createdAt/updatedAt on import", () => {
  const now = "2026-08-10T15:00:00.000Z";
  const nCommission = { id: "ncom_1", year: 2025, month: 4, incomeN_eur_total: 1011.93, commission_eur: 272.98 };
  const result = { ...nCommission, ...withCreateTimestamps(null, now) };

  assert.equal(result.createdAt, now);
  assert.equal(result.updatedAt, now);
  assert.equal(result.commission_eur, 272.98);
});
