import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FeeModels, Platforms } from "../js/shared/constants.js";
import { calculateAirbnbSplitFeeFromPayout, calculateManagedReservation } from "../js/shared/managed-income-calculator.js";
import { isManagedReservation, resolveReservationAgencyShare, resolveReservationOwnerShare, resolveReservationFinancialTotals } from "../js/shared/reservation-financial.service.js";
import { normalizeAirbnbFeeModel } from "../js/shared/commission-rules.service.js";
import { withCreateTimestamps } from "../js/shared/record-timestamps.js";

// Exercise the real save handler with form/storage doubles and real financial
// services. No browser DOM or IndexedDB integration is claimed by these tests.
const source = fs.readFileSync(new URL("../js/income/income.page.js", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function apartmentConfig("), source.indexOf("// ---------- helpers ----------"));
const saveHandler = source.slice(source.indexOf("async function handleAddIncomeItem("), source.indexOf("// ---------- load/render ----------"));

function reservation(overrides = {}) {
  return { id: "old", apartment: "M1", ownerType: "MANAGED", agencyPct: 25, ownerPct: 75,
    platform: "booking", amount_eur: 90, gross_eur: 120, platform_fee_eur: 20,
    cleaningFeeEur: 10, checkin: "2026-09-01", checkout: "2026-09-04", createdAt: "2026-08-01T00:00:00.000Z", ...overrides };
}

async function save(existing, { apartment = "M1", platform = existing?.platform || "booking", registryPct = 30 } = {}) {
  let written;
  const value = value => ({ value });
  const context = vm.createContext({
    CF_EUR: 10, OWNER_TYPE: { MANAGED: "MANAGED", OWNED: "OWNED" }, FeeModels, Platforms,
    apartmentMap: new Map([[apartment, { ownerType: "MANAGED", agencyPct: registryPct }]]),
    state: { editingIncomeItemId: existing?.id || null },
    els: { incAddApt: value(apartment), incAddPlatform: value(platform), incAddAmount: value(existing?.gross_eur ?? 120),
      incAddBookingFee: value(20), incAddFeeModel: value(existing?.feeModel || FeeModels.SINGLE_FEE),
      incAddAmountUsd: value(150), incAddFxRate: value(0.8), incAddCheckin: value("2026-09-01"),
      incAddCheckout: value("2026-09-04"), incAddNote: value("Changed note"), incAddPaid: { checked: true } },
    dbGetAll: async () => existing ? [existing] : [], dbPutOne: async (_, item) => { written = item; },
    resolveConfiguredManagedCleaningFee: async () => 15,
    getCommissionConfig: async () => ({ platformFeePct: 15.5 }),
    calculateAirbnbSplitFeeFromPayout, calculateManagedReservation, normalizeAirbnbFeeModel,
    isManagedReservation, resolveReservationAgencyShare, resolveReservationOwnerShare,
    withCreateTimestamps, round2: n => Math.round((n + Number.EPSILON) * 100) / 100,
    safeDate: s => new Date(s), nightsFromDates: () => 3, todayISO: () => "2026-09-29",
    periodFromInputsOrSelected: () => ({ year: 2026, month: 9 }), keyFromPeriod: () => "2026-09",
    makeId: () => "new", ensureIncomeItemAllocationPeriods: async () => {},
    resetIncomeForm() {}, closeModal() {}, render: async () => {}, debug() {}, console,
    alert: message => { throw new Error(message); },
  });
  vm.runInContext(helpers + "\n" + saveHandler, context);
  await context.handleAddIncomeItem();
  assert.ok(written, "save must persist a record");
  return written;
}

for (const platform of ["booking", "airbnb", "vrbo", "direct", "other"]) {
  test(`${platform} edit keeps historical shares after Settings changes`, async () => {
    const existing = reservation({ platform, feeModel: FeeModels.SINGLE_FEE });
    const result = await save(existing);
    assert.equal(result.agencyPct, 25);
    assert.equal(result.ownerPct, 75);
    assert.equal(result.cleaningFeeEur, 10);
    assert.equal(result.note, "Changed note");
    assert.equal(result.createdAt, existing.createdAt);
  });
}

test("note-only Booking edit preserves owner and agency financial totals", async () => {
  const existing = reservation();
  const before = resolveReservationFinancialTotals(existing);
  const after = resolveReservationFinancialTotals(await save(existing));
  assert.equal(after.ownerIncomeEur, before.ownerIncomeEur);
  assert.equal(after.agencyCommissionEur, before.agencyCommissionEur);
});

for (const pct of [0, 17.5, 100]) {
  test(`edit preserves a valid ${pct}% snapshot`, async () => {
    const result = await save(reservation({ agencyPct: pct, ownerPct: 100 - pct }));
    assert.equal(result.agencyPct, pct);
    assert.equal(result.ownerPct, 100 - pct);
  });
}

test("new reservation uses current apartment share", async () => {
  const result = await save(null);
  assert.equal(result.agencyPct, 30);
  assert.equal(result.ownerPct, 70);
});

test("moving a reservation to another apartment uses destination share", async () => {
  const result = await save(reservation(), { apartment: "M2", registryPct: 40 });
  assert.equal(result.agencyPct, 40);
  assert.equal(result.ownerPct, 60);
});

test("legacy N without share fields preserves reporting's historical default", async () => {
  const existing = reservation({ apartment: "N", ownerType: undefined, agencyPct: undefined, ownerPct: undefined });
  const result = await save(existing, { apartment: "N", registryPct: 40 });
  assert.equal(result.agencyPct, 25);
  assert.equal(result.ownerPct, 75);
});
