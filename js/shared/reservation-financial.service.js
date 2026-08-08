import { FeeModels, Platforms } from "./constants.js";
import { allocateReservationByStay } from "./stay-allocation.js";

const DEFAULT_CLEANING_FEE_EUR = 10;
const DEFAULT_OWNER_SHARE = 0.75;
const DEFAULT_AGENCY_SHARE = 0.25;

export function roundReservationMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeReservationPlatform(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeReservationFeeModel(value) {
  return value === FeeModels.SINGLE_FEE
    ? FeeModels.SINGLE_FEE
    : FeeModels.SPLIT_FEE;
}

export function isManagedReservation(item) {
  // New/manual records persist ownerType as a financial snapshot.
  // Legacy N records predate that snapshot and must remain MANAGED.
  if (item?.ownerType === "MANAGED") return true;
  if (item?.ownerType === "OWNED") return false;
  return item?.apartment === "N";
}

export function resolveReservationAgencyShare(item) {
  const pct = Number(item?.agencyPct);
  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
    return pct / 100;
  }

  // Backward compatibility for legacy N records without snapshot fields.
  return DEFAULT_AGENCY_SHARE;
}

export function resolveReservationOwnerShare(item) {
  const pct = Number(item?.ownerPct);
  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
    return pct / 100;
  }
  return 1 - resolveReservationAgencyShare(item);
}

export function resolveReservationCleaningFee(item) {
  const platform = normalizeReservationPlatform(item?.platform);

  if (platform === Platforms.AIRBNB) {
    const feeModel = normalizeReservationFeeModel(item?.feeModel);

    if (feeModel === FeeModels.SINGLE_FEE) {
      const cleaningFee = Number(item?.cleaningFeeEur);
      return Number.isFinite(cleaningFee) && cleaningFee > 0
        ? cleaningFee
        : null;
    }

    return DEFAULT_CLEANING_FEE_EUR;
  }

  const rawCleaningFee = item?.cleaningFeeEur;
  if (rawCleaningFee === null || rawCleaningFee === undefined || rawCleaningFee === "") {
    return DEFAULT_CLEANING_FEE_EUR;
  }

  const storedCleaningFee = Number(rawCleaningFee);
  return Number.isFinite(storedCleaningFee) && storedCleaningFee >= 0
    ? storedCleaningFee
    : DEFAULT_CLEANING_FEE_EUR;
}

export function resolveReservationSplitBase(item) {
  const amount = Number(item?.amount_eur || 0) || 0;
  const platform = normalizeReservationPlatform(item?.platform);

  if (platform === Platforms.DIRECT || platform === Platforms.OTHER) {
    const cleaningFee = resolveReservationCleaningFee(item);
    return Number.isFinite(cleaningFee) ? amount - cleaningFee : NaN;
  }

  return amount;
}

export function resolveReservationFinancialTotals(item) {
  const managed = isManagedReservation(item);
  const cleaningFeeEur = managed ? resolveReservationCleaningFee(item) : 0;
  const splitBaseEur = managed ? resolveReservationSplitBase(item) : 0;

  if (
    managed &&
    (!Number.isFinite(splitBaseEur) || splitBaseEur < 0 || !Number.isFinite(cleaningFeeEur))
  ) {
    throw new RangeError("MANAGED prihod nema ispravne finansijske vrijednosti.");
  }

  const agencyShare = managed ? resolveReservationAgencyShare(item) : 0;
  const ownerShare = managed ? resolveReservationOwnerShare(item) : 0;

  const ownerIncomeEur = managed
    ? roundReservationMoney(splitBaseEur * ownerShare)
    : 0;
  const agencyCommissionEur = managed
    ? roundReservationMoney(splitBaseEur * agencyShare + cleaningFeeEur)
    : 0;

  return {
    isManaged: managed,
    amountEur: managed ? 0 : Number(item?.amount_eur || 0) || 0,
    splitBaseEur,
    ownerIncomeEur,
    agencyCommissionEur,
    cleaningFeeEur,
    agencyShare,
    ownerShare,
    platformFeeEur: Number(item?.platform_fee_eur || 0) || 0,
  };
}

export function buildReservationAllocationInput(item, totals = null) {
  const financialTotals = totals || resolveReservationFinancialTotals(item);

  return {
    checkIn: item?.checkin,
    checkOut: item?.checkout,
    fallbackYear: item?.year,
    fallbackMonth: item?.month,
    nights: item?.nights,
    ...financialTotals,
  };
}

export function indexReservationSegments(segments = []) {
  const segmentsByPeriod = new Map();
  const periodKeys = new Set();

  for (const segment of segments) {
    const key = `${segment.year}-${segment.month}`;
    periodKeys.add(key);
    segmentsByPeriod.set(key, segment);
  }

  return { periodKeys, segmentsByPeriod };
}

export function buildReservationFinancial(item) {
  const totals = resolveReservationFinancialTotals(item);
  const allocationInput = buildReservationAllocationInput(item, totals);
  const segments = allocateReservationByStay(allocationInput);
  const { periodKeys, segmentsByPeriod } = indexReservationSegments(segments);

  return {
    reservation: item,
    platform: normalizeReservationPlatform(item?.platform),
    feeModel: normalizeReservationFeeModel(item?.feeModel),
    totals,
    allocationInput,
    segments,
    periodKeys,
    segmentsByPeriod,
  };
}

export function getReservationSegmentForPeriod(financial, year, month) {
  return financial?.segmentsByPeriod?.get(`${Number(year)}-${Number(month)}`) || null;
}

export function buildReservationFinancials(items = [], { onError } = {}) {
  const financials = [];

  for (const item of items) {
    try {
      financials.push(buildReservationFinancial(item));
    } catch (error) {
      if (typeof onError === "function") onError(item, error);
    }
  }

  return financials;
}
