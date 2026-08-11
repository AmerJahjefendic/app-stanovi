// js/shared/record-timestamps.js
//
// Shared timestamp helpers for record write paths and legacy normalization.
//
// Historically some stores (apartments, commission_rules, groups, share_sets)
// used camelCase createdAt/updatedAt, while others (income_items, expenses,
// shopping_items) used snake_case created_at/updated_at — and large parts of
// income_items/income_monthly/expenses (mostly XLSX-imported rows) had no
// timestamp fields at all. New/updated Income, Expense, import and migration
// paths use these helpers. Some established registry/configuration services
// still manage their own camelCase timestamps directly.

/** Current time as ISO string. Kept as a function so tests can inject a fixed clock. */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Build createdAt/updatedAt for a record being created or edited via a form.
 * - On create: createdAt = now, updatedAt = now.
 * - On edit: createdAt is preserved from the existing record (checking both
 *   camelCase and legacy snake_case), updatedAt = now.
 *
 * @param {object|null|undefined} existing Existing record being edited, or null/undefined for a new one.
 * @param {string} [now] ISO timestamp to use (defaults to nowIso()).
 * @returns {{createdAt: string, updatedAt: string}}
 */
export function withCreateTimestamps(existing, now = nowIso()) {
  const createdAt = existing?.createdAt || existing?.created_at || now;
  return { createdAt, updatedAt: now };
}

/**
 * Stamp a freshly-built batch of records (e.g. from an XLSX import) with
 * createdAt/updatedAt, without overwriting values a caller already set.
 *
 * @param {object[]} records
 * @param {string} [now] ISO timestamp to use (defaults to nowIso()).
 * @returns {object[]} new array, records are shallow-copied
 */
export function stampNewRecords(records, now = nowIso()) {
  return (records || []).map((r) => ({
    ...r,
    createdAt: r?.createdAt || now,
    updatedAt: r?.updatedAt || now,
  }));
}

/**
 * Migration helper: normalize a legacy record's timestamp fields to
 * camelCase, preferring (in order): existing camelCase, existing legacy
 * snake_case, then the provided fallback. If updatedAt is missing but a
 * creation timestamp exists, updatedAt inherits that creation timestamp rather
 * than pretending the record was edited on migration day. Legacy snake_case
 * keys are removed from the result so stores don't end up with both.
 *
 * @param {object} record
 * @param {string} fallbackIso ISO timestamp to use when neither field exists.
 * @returns {object} new record object with normalized createdAt/updatedAt
 */
export function normalizeLegacyTimestamps(record, fallbackIso) {
  const { created_at, updated_at, ...rest } = record || {};
  const createdAt = record?.createdAt || created_at || fallbackIso;
  const updatedAt = record?.updatedAt || updated_at || createdAt || fallbackIso;
  return { ...rest, createdAt, updatedAt };
}
