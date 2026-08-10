import test from "node:test";
import assert from "node:assert/strict";

import { allocateReservationByStay } from "../js/shared/stay-allocation.js";

function sum(segments, key) {
  return segments.reduce((total, segment) => total + Number(segment[key] || 0), 0);
}

test("31.07 → 07.08 allocates 1 night to July and 6 to August", () => {
  const segments = allocateReservationByStay({
    checkIn: "2026-07-31",
    checkOut: "2026-08-07",
    nights: 7,
    amountEur: 700,
    splitBaseEur: 700,
    ownerIncomeEur: 525,
    agencyCommissionEur: 185,
    cleaningFeeEur: 10,
    platformFeeEur: 70,
  });

  assert.deepEqual(
    segments.map(({ year, month, nights }) => ({ year, month, nights })),
    [
      { year: 2026, month: 7, nights: 1 },
      { year: 2026, month: 8, nights: 6 },
    ]
  );
  assert.equal(sum(segments, "amountEur"), 700);
  assert.equal(sum(segments, "splitBaseEur"), 700);
  assert.equal(sum(segments, "ownerIncomeEur"), 525);
  assert.equal(sum(segments, "agencyCommissionEur"), 185);
  assert.equal(sum(segments, "cleaningFeeEur"), 10);
  assert.equal(sum(segments, "platformFeeEur"), 70);
  assert.equal(segments[0].cleaningFeeEur, 10);
  assert.equal(segments[1].cleaningFeeEur, 0);
});

test("cross-year reservation allocates nights to December and January", () => {
  const segments = allocateReservationByStay({
    checkIn: "2026-12-31",
    checkOut: "2027-01-03",
    amountEur: 300,
  });

  assert.deepEqual(
    segments.map(({ year, month, nights }) => ({ year, month, nights })),
    [
      { year: 2026, month: 12, nights: 1 },
      { year: 2027, month: 1, nights: 2 },
    ]
  );
});

test("cent rounding is deterministic and never loses total", () => {
  const segments = allocateReservationByStay({
    checkIn: "2026-01-31",
    checkOut: "2026-02-03",
    amountEur: 100,
  });

  assert.equal(sum(segments, "amountEur"), 100);
  assert.equal(segments[0].amountEur, 33.34);
  assert.equal(segments[1].amountEur, 66.66);
});

test("invalid/missing stay dates use legacy month without reallocating", () => {
  const [segment] = allocateReservationByStay({
    fallbackYear: 2025,
    fallbackMonth: 12,
    nights: 5,
    amountEur: 123.45,
    splitBaseEur: 100.01,
    ownerIncomeEur: 75.01,
    agencyCommissionEur: 35,
    cleaningFeeEur: 10,
  });

  assert.equal(segment.allocationMode, "LEGACY_MONTH");
  assert.equal(segment.year, 2025);
  assert.equal(segment.month, 12);
  assert.equal(segment.nights, 5);
  assert.equal(segment.amountEur, 123.45);
  assert.equal(segment.splitBaseEur, 100.01);
});

test("cleaning fee cannot exceed total agency commission during stay allocation", () => {
  assert.throws(
    () => allocateReservationByStay({
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      agencyCommissionEur: 9,
      cleaningFeeEur: 10,
    }),
    /Cleaning fee ne može biti veći od agency commission iznosa/
  );
});
