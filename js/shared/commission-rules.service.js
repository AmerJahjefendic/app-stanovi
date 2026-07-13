// js/shared/commission-rules.service.js

import {
  dbGetByIndex,
  dbGetOne,
  dbPutOne,
} from "../db/db.js";

import {
  FeeModels,
  Platforms,
} from "./constants.js";

const STORE_NAME = "commission_rules";
const LEGACY_N_AIRBNB_RULE_ID = "N_AIRBNB_DEFAULT";

function normalizeApartmentId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Stari Airbnb zapisi bez feeModel uvijek se tretiraju kao SPLIT_FEE.
 * Nepoznata vrijednost također ne smije slučajno aktivirati SINGLE_FEE.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeAirbnbFeeModel(value) {
  return value === FeeModels.SINGLE_FEE
    ? FeeModels.SINGLE_FEE
    : FeeModels.SPLIT_FEE;
}

/**
 * Stabilan ID za nova Airbnb commission pravila.
 *
 * Legacy N_AIRBNB_DEFAULT ostaje podržan kroz lookup fallback.
 *
 * @param {string} apartmentId
 * @param {string} feeModel
 * @returns {string}
 */
export function makeCommissionRuleId(
  apartmentId,
  feeModel = FeeModels.SINGLE_FEE
) {
  const apartment = normalizeApartmentId(apartmentId);
  const model = normalizeAirbnbFeeModel(feeModel);

  if (!apartment) {
    throw new Error("Apartment ID je obavezan.");
  }

  return `${apartment}_AIRBNB_${model}`;
}

/**
 * Pronalazi commission rule po:
 * apartmentId + platform + feeModel.
 *
 * Za Airbnb SINGLE_FEE pravilo podržava legacy fallback
 * N_AIRBNB_DEFAULT radi kompatibilnosti sa Fazom 1.
 *
 * SPLIT_FEE obračun ne treba Cleaning Fee iz ovog pravila,
 * ali lookup može vratiti zapis radi administracije i kompatibilnosti.
 *
 * @param {Object} params
 * @param {string} params.apartmentId
 * @param {string} params.platform
 * @param {string} [params.feeModel]
 * @returns {Promise<Object|null>}
 */
export async function findCommissionRule({
  apartmentId,
  platform,
  feeModel,
} = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  const normalizedPlatform = normalizePlatform(platform);

  if (!apartment || !normalizedPlatform) {
    return null;
  }

  const normalizedFeeModel =
    normalizedPlatform === Platforms.AIRBNB
      ? normalizeAirbnbFeeModel(feeModel)
      : null;

  const apartmentRules = await dbGetByIndex(
    STORE_NAME,
    "apartmentId",
    apartment
  );

  const exactRule = apartmentRules.find((rule) => {
    if (normalizePlatform(rule?.platform) !== normalizedPlatform) {
      return false;
    }

    if (normalizedPlatform !== Platforms.AIRBNB) {
      return true;
    }

    return normalizeAirbnbFeeModel(rule?.feeModel) === normalizedFeeModel;
  });

  if (exactRule) {
    return exactRule;
  }

  // Kompatibilnost sa pravilom kreiranim u Fazi 1.
  if (
    apartment === "N" &&
    normalizedPlatform === Platforms.AIRBNB &&
    normalizedFeeModel === FeeModels.SPLIT_FEE
  ) {
    return dbGetOne(STORE_NAME, LEGACY_N_AIRBNB_RULE_ID);
  }

  return null;
}

/**
 * Vraća validan Cleaning Fee za Airbnb SINGLE_FEE.
 *
 * Za SPLIT_FEE se ova funkcija ne koristi jer je CF uvijek fiksnih 10 EUR.
 *
 * @param {Object} params
 * @param {string} params.apartmentId
 * @returns {Promise<number|null>}
 */
export async function getAirbnbSingleFeeCleaningFee({
  apartmentId,
} = {}) {
  const rule = await findCommissionRule({
    apartmentId,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
  });

  const cleaningFee = Number(rule?.cleaningFeeEur);

  return Number.isFinite(cleaningFee) && cleaningFee > 0
    ? cleaningFee
    : null;
}

/**
 * Kreira ili ažurira Airbnb SINGLE_FEE Cleaning Fee
 * za jedan MANAGED apartman.
 *
 * @param {Object} params
 * @param {string} params.apartmentId
 * @param {number|string} params.cleaningFeeEur
 * @param {number|string} [params.agencyPct=25]
 * @returns {Promise<Object>}
 */
export async function saveAirbnbSingleFeeRule({
  apartmentId,
  cleaningFeeEur,
  agencyPct = 25,
} = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  const cleaningFee = Number(cleaningFeeEur);
  const agency = Number(agencyPct);

  if (!apartment) {
    throw new Error("Apartment ID je obavezan.");
  }

  if (!Number.isFinite(cleaningFee) || cleaningFee <= 0) {
    throw new Error("Cleaning Fee mora biti broj veći od 0.");
  }

  if (!Number.isFinite(agency) || agency <= 0 || agency >= 100) {
    throw new Error("Agencijska provizija mora biti između 0 i 100%.");
  }

  const existingRule = await findCommissionRule({
    apartmentId: apartment,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
  });

  const now = new Date().toISOString();

  const id = makeCommissionRuleId(
    apartment,
    FeeModels.SINGLE_FEE
  );

  const reusableExistingRule =
    existingRule?.id === id
      ? existingRule
      : null;

  const rule = {
    ...(reusableExistingRule || {}),
    id,
    apartmentId: apartment,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
    platformFeePct: 15.5,
    cleaningFeeEur: cleaningFee,
    agencyPct: agency,
    ownerPct: 100 - agency,
    isDefault: true,
    createdAt: reusableExistingRule?.createdAt || now,
    updatedAt: now,
  };

  await dbPutOne(STORE_NAME, rule);

  return rule;
}
