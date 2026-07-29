import { FeeModels, Platforms } from "./constants.js";

const SPLIT_FEE_CLEANING_FEE = 10;
const DEFAULT_MANAGED_CLEANING_FEE = 10;
const DEFAULT_AGENCY_SHARE = 0.25;
const DEFAULT_OWNER_SHARE = 0.75;
const AIRBNB_SPLIT_FEE_RATE = 0.03;
const AIRBNB_SINGLE_FEE_RATE = 0.155;

function toFiniteNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${fieldName} mora biti ispravan broj.`);
  }
  return number;
}

function assertPositive(value, fieldName) {
  const number = toFiniteNumber(value, fieldName);
  if (number <= 0) {
    throw new RangeError(`${fieldName} mora biti veći od 0.`);
  }
  return number;
}

function assertNonNegative(value, fieldName) {
  const number = toFiniteNumber(value, fieldName);
  if (number < 0) {
    throw new RangeError(`${fieldName} ne može biti negativan.`);
  }
  return number;
}

function buildResult({
  platform,
  feeModel = null,
  grossAmount,
  cleaningFee,
  platformFee,
  payoutAmount,
  splitBase,
  agencyShare,
  ownerShare,
}) {
  if (splitBase <= 0) {
    throw new RangeError("Osnovica za raspodjelu mora biti veća od 0.");
  }

  return {
    platform,
    feeModel,
    grossAmount,
    cleaningFee,
    platformFee,
    payoutAmount,
    splitBase,
    ownerAmount: splitBase * ownerShare,
    agencyAmount: splitBase * agencyShare + cleaningFee,
  };
}

/**
 * Calculate legacy AIRBNB SPLIT_FEE from the actual Airbnb payout entered by
 * the user. This preserves the existing AppStanovi workflow:
 * payout includes the fixed CF, so the split base is payout - CF.
 *
 * The Airbnb platform fee cannot be reconstructed reliably from payout alone,
 * therefore it remains 0 in the persisted snapshot, exactly as before.
 *
 * @param {Object} [params]
 * @param {number} params.payoutAmount Actual Airbnb payout including CF.
 * @param {number} [params.agencyShare=0.25] Agency share as decimal.
 * @param {number} [params.ownerShare=0.75] Owner share as decimal.
 */
export function calculateAirbnbSplitFeeFromPayout({
  payoutAmount,
  agencyShare = DEFAULT_AGENCY_SHARE,
  ownerShare = DEFAULT_OWNER_SHARE,
} = {}) {
  const payout = assertPositive(payoutAmount, "Airbnb payout");
  const cleaningFee = SPLIT_FEE_CLEANING_FEE;
  const splitBase = payout - cleaningFee;

  return buildResult({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SPLIT_FEE,
    grossAmount: payout,
    cleaningFee,
    platformFee: 0,
    payoutAmount: payout,
    splitBase,
    agencyShare,
    ownerShare,
  });
}

/**
 * Calculate AIRBNB reservation using SPLIT_FEE model from reservation gross.
 *
 * @param {Object} [params]
 * @param {number} params.grossAmount Reservation amount without cleaning fee.
 * @param {number} [params.agencyShare=0.25] Agency share as decimal.
 * @param {number} [params.ownerShare=0.75] Owner share as decimal.
 */
export function calculateAirbnbSplitFee({
  grossAmount,
  agencyShare = DEFAULT_AGENCY_SHARE,
  ownerShare = DEFAULT_OWNER_SHARE,
} = {}) {
  const gross = assertPositive(
    grossAmount,
    "Airbnb iznos rezervacije"
  );

  const cleaningFee = SPLIT_FEE_CLEANING_FEE;
  const platformFee =
    (gross + cleaningFee) * AIRBNB_SPLIT_FEE_RATE;

  const payoutAmount =
    gross + cleaningFee - platformFee;

  // Legacy obračun ostaje 1:1.
  // CF se ne oduzima iz gross iznosa jer nije dio unesene rezervacije.
  const splitBase =
    gross - platformFee;

  return buildResult({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SPLIT_FEE,
    grossAmount: gross,
    cleaningFee,
    platformFee,
    payoutAmount,
    splitBase,
    agencyShare,
    ownerShare,
  });
}

/**
 * Calculate AIRBNB reservation using SINGLE_FEE model.
 *
 * @param {Object} [params]
 * @param {number} params.grossAmount Reservation amount without cleaning fee.
 * @param {number} params.cleaningFee Cleaning fee that must be provided.
 * @param {number} [params.agencyShare=0.25] Agency share as decimal.
 * @param {number} [params.ownerShare=0.75] Owner share as decimal.
 * @returns {{platform:string,feeModel:string|null,grossAmount:number,cleaningFee:number,platformFee:number,payoutAmount:number,splitBase:number,ownerAmount:number,agencyAmount:number}}
 */
export function calculateAirbnbSingleFee({
  grossAmount,
  cleaningFee,
  agencyShare = DEFAULT_AGENCY_SHARE,
  ownerShare = DEFAULT_OWNER_SHARE,
} = {}) {
  const gross = assertPositive(grossAmount, "Airbnb iznos rezervacije");
  const cleaning = assertPositive(cleaningFee, "Cleaning fee za Single Fee");
  const platformFee = (gross + cleaning) * AIRBNB_SINGLE_FEE_RATE;
  const payoutAmount = gross + cleaning - platformFee;
  const splitBase = payoutAmount - cleaning;

  return buildResult({
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
    grossAmount: gross,
    cleaningFee: cleaning,
    platformFee,
    payoutAmount,
    splitBase,
    agencyShare,
    ownerShare,
  });
}

/**
 * Calculate BOOKING reservation for managed apartment flow.
 *
 * @param {Object} [params]
 * @param {number} params.grossAmount Gross reservation amount.
 * @param {number} params.platformFee Booking platform fee.
 * @param {number} [params.cleaningFee=10] Cleaning fee in EUR.
 * @param {number} [params.agencyShare=0.25] Agency share as decimal.
 * @param {number} [params.ownerShare=0.75] Owner share as decimal.
 * @returns {{platform:string,feeModel:string|null,grossAmount:number,cleaningFee:number,platformFee:number,payoutAmount:number,splitBase:number,ownerAmount:number,agencyAmount:number}}
 */
export function calculateBooking({
  grossAmount,
  platformFee,
  cleaningFee = DEFAULT_MANAGED_CLEANING_FEE,
  agencyShare = DEFAULT_AGENCY_SHARE,
  ownerShare = DEFAULT_OWNER_SHARE,
} = {}) {
  const grossAmountValue = assertPositive(grossAmount, "Booking iznos rezervacije");
  const platformFeeValue = assertNonNegative(platformFee, "Booking fee");
  const cleaningFeeValue = assertNonNegative(cleaningFee, "Cleaning fee");
  const payoutAmount = grossAmountValue - platformFeeValue;
  const splitBase = payoutAmount - cleaningFeeValue;

  return buildResult({
    platform: Platforms.BOOKING,
    grossAmount: grossAmountValue,
    cleaningFee: cleaningFeeValue,
    platformFee: platformFeeValue,
    payoutAmount,
    splitBase,
    agencyShare,
    ownerShare,
  });
}

/**
 * Calculate VRBO reservation from USD amount and FX rate.
 *
 * @param {Object} [params]
 * @param {number} params.amountUsd Reservation amount in USD.
 * @param {number} params.fxUsdEur USD to EUR exchange rate.
 * @param {number} [params.cleaningFee=10] Cleaning fee in EUR.
 * @param {number} [params.agencyShare=0.25] Agency share as decimal.
 * @param {number} [params.ownerShare=0.75] Owner share as decimal.
 * @returns {{platform:string,feeModel:string|null,grossAmount:number,cleaningFee:number,platformFee:number,payoutAmount:number,splitBase:number,ownerAmount:number,agencyAmount:number}}
 */
export function calculateVrbo({
  amountUsd,
  fxUsdEur,
  cleaningFee = DEFAULT_MANAGED_CLEANING_FEE,
  agencyShare = DEFAULT_AGENCY_SHARE,
  ownerShare = DEFAULT_OWNER_SHARE,
} = {}) {
  const usd = assertPositive(amountUsd, "VRBO iznos");
  const rate = assertPositive(fxUsdEur, "USD→EUR kurs");
  const cleaning = assertNonNegative(cleaningFee, "Cleaning fee");
  const grossAmount = usd * rate;
  const platformFee = 0;
  const payoutAmount = grossAmount;
  const splitBase = payoutAmount - cleaning;

  return buildResult({
    platform: Platforms.VRBO,
    grossAmount,
    cleaningFee: cleaning,
    platformFee,
    payoutAmount,
    splitBase,
    agencyShare,
    ownerShare,
  });
}

/**
 * Dispatch managed reservation calculation by platform and fee model.
 *
 * @param {Object} [params]
 * @param {string} params.platform Platform identifier (airbnb, booking, vrbo).
 * @param {string} [params.feeModel] Airbnb fee model, defaults to SPLIT_FEE.
 * @param {...any} [params.input] Remaining calculator-specific fields.
 * @returns {{platform:string,feeModel:string|null,grossAmount:number,cleaningFee:number,platformFee:number,payoutAmount:number,splitBase:number,ownerAmount:number,agencyAmount:number}}
 */
export function calculateManagedReservation({ platform, feeModel, ...input } = {}) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();

  if (normalizedPlatform === Platforms.AIRBNB) {
    const normalizedFeeModel = feeModel || FeeModels.SPLIT_FEE;
    if (normalizedFeeModel === FeeModels.SPLIT_FEE) {
      return calculateAirbnbSplitFee(input);
    }
    if (normalizedFeeModel === FeeModels.SINGLE_FEE) {
      return calculateAirbnbSingleFee(input);
    }
    throw new RangeError(`Nepoznat Airbnb fee model: ${normalizedFeeModel}`);
  }

  if (normalizedPlatform === Platforms.BOOKING) {
    return calculateBooking(input);
  }

  if (normalizedPlatform === Platforms.VRBO) {
    return calculateVrbo(input);
  }

  throw new RangeError(`Nepodržana MANAGED platforma: ${platform || "(prazno)"}`);
}
