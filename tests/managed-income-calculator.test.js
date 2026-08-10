import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateAirbnbSplitFee,
  calculateAirbnbSplitFeeFromPayout,
  calculateAirbnbSingleFee,
  calculateBooking,
  calculateVrbo,
  calculateManagedReservation,
} from "../js/shared/managed-income-calculator.js";
import { FeeModels, Platforms } from "../js/shared/constants.js";

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be approximately ${expected}`
  );
}

test("Airbnb SPLIT_FEE payout keeps locked legacy CF=10 and 75/25 split", () => {
  const result = calculateAirbnbSplitFeeFromPayout({ payoutAmount: 971.10 });

  assert.equal(result.platform, Platforms.AIRBNB);
  assert.equal(result.feeModel, FeeModels.SPLIT_FEE);
  assert.equal(result.cleaningFee, 10);
  assert.equal(result.platformFee, 0);
  approx(result.splitBase, 961.10);
  approx(result.ownerAmount, 720.825);
  approx(result.agencyAmount, 250.275);
});

test("Airbnb SPLIT_FEE gross calculation preserves legacy 3% rule", () => {
  const result = calculateAirbnbSplitFee({ grossAmount: 1000 });

  assert.equal(result.cleaningFee, 10);
  approx(result.platformFee, 30.3);
  approx(result.payoutAmount, 979.7);
  approx(result.splitBase, 969.7);
  approx(result.ownerAmount, 727.275);
  approx(result.agencyAmount, 252.425);
});

test("Airbnb SINGLE_FEE treats entered gross as total including CF", () => {
  const result = calculateAirbnbSingleFee({
    grossAmount: 115,
    cleaningFee: 15,
  });

  assert.equal(result.grossAmount, 115);
  approx(result.platformFee, 17.825);
  approx(result.payoutAmount, 97.175);
  approx(result.splitBase, 82.175);
  approx(result.ownerAmount, 61.63125);
  approx(result.agencyAmount, 35.54375);
});

test("Airbnb SINGLE_FEE never adds CF a second time to entered total", () => {
  const result = calculateAirbnbSingleFee({
    grossAmount: 100,
    cleaningFee: 15,
  });

  approx(result.platformFee, 15.5);
  approx(result.payoutAmount, 84.5);
  approx(result.splitBase, 69.5);
});

test("Booking MANAGED calculation subtracts explicit platform fee and supplied CF", () => {
  const result = calculateBooking({
    grossAmount: 500,
    platformFee: 75,
    cleaningFee: 10,
  });

  assert.equal(result.platform, Platforms.BOOKING);
  approx(result.payoutAmount, 425);
  approx(result.splitBase, 415);
  approx(result.ownerAmount, 311.25);
  approx(result.agencyAmount, 113.75);
});

test("VRBO converts USD payout to EUR before subtracting supplied CF", () => {
  const result = calculateVrbo({
    amountUsd: 600,
    fxUsdEur: 0.9,
    cleaningFee: 10,
  });

  approx(result.grossAmount, 540);
  approx(result.splitBase, 530);
  approx(result.ownerAmount, 397.5);
  approx(result.agencyAmount, 142.5);
});

test("custom MANAGED share is respected instead of default 75/25", () => {
  const result = calculateBooking({
    grossAmount: 500,
    platformFee: 50,
    cleaningFee: 10,
    ownerShare: 0.7,
    agencyShare: 0.3,
  });

  approx(result.splitBase, 440);
  approx(result.ownerAmount, 308);
  approx(result.agencyAmount, 142);
});

test("dispatcher routes SINGLE_FEE Airbnb to the same calculation", () => {
  const direct = calculateAirbnbSingleFee({ grossAmount: 300, cleaningFee: 15 });
  const dispatched = calculateManagedReservation({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
    grossAmount: 300,
    cleaningFee: 15,
  });

  assert.deepEqual(dispatched, direct);
});

test("invalid managed split base is rejected", () => {
  assert.throws(
    () => calculateBooking({ grossAmount: 20, platformFee: 5, cleaningFee: 15 }),
    /Osnovica za raspodjelu mora biti veća od 0/
  );
});
