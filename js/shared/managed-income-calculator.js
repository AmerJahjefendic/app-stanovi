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
