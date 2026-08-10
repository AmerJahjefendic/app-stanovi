import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReservationFinancial,
  isManagedReservation,
  resolveReservationCleaningFee,
  resolveReservationFinancialTotals,
} from "../js/shared/reservation-financial.service.js";
import { FeeModels, Platforms } from "../js/shared/constants.js";

function baseManaged(overrides = {}) {
  return {
    apartment: "M1",
    ownerType: "MANAGED",
    agencyPct: 25,
    ownerPct: 75,
    year: 2026,
    month: 8,
    nights: 3,
    checkin: "2026-08-10",
    checkout: "2026-08-13",
    platform: Platforms.BOOKING,
    amount_eur: 300,
    cleaningFeeEur: 10,
    platform_fee_eur: 50,
    ...overrides,
  };
}

test("MANAGED totals use persisted snapshot fields for reporting", () => {
  const totals = resolveReservationFinancialTotals(baseManaged());

  assert.equal(totals.isManaged, true);
  assert.equal(totals.splitBaseEur, 300);
  assert.equal(totals.cleaningFeeEur, 10);
  assert.equal(totals.ownerIncomeEur, 225);
  assert.equal(totals.agencyCommissionEur, 85);
  assert.equal(totals.platformFeeEur, 50);
});

test("custom agencyPct snapshot survives reporting reconstruction", () => {
  const totals = resolveReservationFinancialTotals(
    baseManaged({ agencyPct: 30, ownerPct: 70 })
  );

  assert.equal(totals.ownerShare, 0.7);
  assert.equal(totals.agencyShare, 0.3);
  assert.equal(totals.ownerIncomeEur, 210);
  assert.equal(totals.agencyCommissionEur, 100);
});

test("non-Airbnb historical cleaningFeeEur remains immutable snapshot", () => {
  assert.equal(resolveReservationCleaningFee(baseManaged({ cleaningFeeEur: 15 })), 15);
  assert.equal(resolveReservationCleaningFee(baseManaged({ cleaningFeeEur: 10 })), 10);
});

test("legacy Airbnb SPLIT_FEE resolves locked CF=10", () => {
  const item = baseManaged({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SPLIT_FEE,
    cleaningFeeEur: 99,
  });

  assert.equal(resolveReservationCleaningFee(item), 10);
});

test("Airbnb SINGLE_FEE requires a valid persisted cleaning fee snapshot", () => {
  const item = baseManaged({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
    cleaningFeeEur: 15,
  });
  assert.equal(resolveReservationCleaningFee(item), 15);

  assert.throws(
    () => resolveReservationFinancialTotals({ ...item, cleaningFeeEur: null }),
    /MANAGED prihod nema ispravne finansijske vrijednosti/
  );
});

test("legacy apartment N without ownerType remains MANAGED", () => {
  assert.equal(isManagedReservation({ apartment: "N" }), true);
  assert.equal(isManagedReservation({ apartment: "A" }), false);
});

test("Direct/Other amount_eur is reconstructed by subtracting stored CF", () => {
  const totals = resolveReservationFinancialTotals(
    baseManaged({
      platform: Platforms.DIRECT,
      amount_eur: 200,
      cleaningFeeEur: 15,
      platform_fee_eur: 0,
    })
  );

  assert.equal(totals.splitBaseEur, 185);
  assert.equal(totals.ownerIncomeEur, 138.75);
  assert.equal(totals.agencyCommissionEur, 61.25);
});

test("buildReservationFinancial indexes cross-month reservation segments", () => {
  const financial = buildReservationFinancial(
    baseManaged({
      checkin: "2026-07-31",
      checkout: "2026-08-07",
      year: 2026,
      month: 7,
      nights: 7,
      amount_eur: 700,
      cleaningFeeEur: 14,
    })
  );

  assert.equal(financial.segments.length, 2);
  assert.deepEqual([...financial.periodKeys], ["2026-7", "2026-8"]);
  assert.equal(financial.segmentsByPeriod.get("2026-7").nights, 1);
  assert.equal(financial.segmentsByPeriod.get("2026-8").nights, 6);
});
