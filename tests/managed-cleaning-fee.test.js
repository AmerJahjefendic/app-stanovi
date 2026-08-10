import test from "node:test";
import assert from "node:assert/strict";

import { FeeModels, Platforms } from "../js/shared/constants.js";
import {
  DEFAULT_MANAGED_CLEANING_FEE_EUR,
  LEGACY_AIRBNB_SPLIT_FEE_CLEANING_FEE_EUR,
  resolveManagedCleaningFeeValue,
} from "../js/shared/commission-rules.service.js";

test("MANAGED default Cleaning Fee remains 10 EUR when no override is configured", () => {
  assert.equal(DEFAULT_MANAGED_CLEANING_FEE_EUR, 10);
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.BOOKING,
      defaultCleaningFeeEur: DEFAULT_MANAGED_CLEANING_FEE_EUR,
    }),
    10
  );
});

test("Airbnb SINGLE_FEE override wins over apartment default Cleaning Fee", () => {
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.AIRBNB,
      feeModel: FeeModels.SINGLE_FEE,
      defaultCleaningFeeEur: 10,
      overrideCleaningFeeEur: 15,
    }),
    15
  );
});

test("Airbnb SINGLE_FEE falls back to apartment default when override is blank", () => {
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.AIRBNB,
      feeModel: FeeModels.SINGLE_FEE,
      defaultCleaningFeeEur: 10,
      overrideCleaningFeeEur: null,
    }),
    10
  );
});

test("Booking can override Cleaning Fee independently of Airbnb", () => {
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.BOOKING,
      defaultCleaningFeeEur: 10,
      overrideCleaningFeeEur: 12,
    }),
    12
  );
});

test("VRBO, Direct and Other inherit apartment default when no override exists", () => {
  for (const platform of [Platforms.VRBO, Platforms.DIRECT, Platforms.OTHER]) {
    assert.equal(
      resolveManagedCleaningFeeValue({
        platform,
        defaultCleaningFeeEur: 10,
      }),
      10
    );
  }
});

test("Airbnb SPLIT_FEE ignores default and overrides and remains locked to legacy 10 EUR", () => {
  assert.equal(LEGACY_AIRBNB_SPLIT_FEE_CLEANING_FEE_EUR, 10);
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.AIRBNB,
      feeModel: FeeModels.SPLIT_FEE,
      defaultCleaningFeeEur: 20,
      overrideCleaningFeeEur: 30,
    }),
    10
  );
});

test("invalid override does not replace a valid default Cleaning Fee", () => {
  assert.equal(
    resolveManagedCleaningFeeValue({
      platform: Platforms.BOOKING,
      defaultCleaningFeeEur: 10,
      overrideCleaningFeeEur: 0,
    }),
    10
  );
});
