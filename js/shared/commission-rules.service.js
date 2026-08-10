// js/shared/commission-rules.service.js

import {
  dbGetByIndex,
  dbGetOne,
  dbPutOne,
  dbDelete,
} from "../db/db.js";

import {
  FeeModels,
  Platforms,
} from "./constants.js";

const STORE_NAME = "commission_rules";
const LEGACY_N_AIRBNB_RULE_ID = "N_AIRBNB_DEFAULT";

export const DEFAULT_MANAGED_CLEANING_FEE_EUR = 10;
export const LEGACY_AIRBNB_SPLIT_FEE_CLEANING_FEE_EUR = 10;

const CLEANING_DEFAULT_PLATFORM = "default";

function makeDefaultCleaningFeeRuleId(apartmentId) {
  const apartment = normalizeApartmentId(apartmentId);
  if (!apartment) throw new Error("Apartment ID je obavezan.");
  return `${apartment}_CLEANING_DEFAULT`;
}

function makeCleaningFeeOverrideRuleId(apartmentId, platform) {
  const apartment = normalizeApartmentId(apartmentId);
  const normalizedPlatform = normalizePlatform(platform);
  if (!apartment || !normalizedPlatform) {
    throw new Error("Apartment ID i platforma su obavezni.");
  }
  return `${apartment}_${normalizedPlatform.toUpperCase()}_CLEANING_OVERRIDE`;
}

function validPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pure resolver used by tests and runtime.
 * SPLIT_FEE is intentionally locked to the legacy 10 EUR rule.
 * Other platforms use an explicit override when present, otherwise apartment default.
 */
export function resolveManagedCleaningFeeValue({
  platform,
  feeModel = null,
  defaultCleaningFeeEur,
  overrideCleaningFeeEur = null,
} = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedFeeModel =
    normalizedPlatform === Platforms.AIRBNB
      ? normalizeAirbnbFeeModel(feeModel)
      : null;

  if (
    normalizedPlatform === Platforms.AIRBNB &&
    normalizedFeeModel === FeeModels.SPLIT_FEE
  ) {
    return LEGACY_AIRBNB_SPLIT_FEE_CLEANING_FEE_EUR;
  }

  const override = validPositiveNumber(overrideCleaningFeeEur);
  if (override !== null) return override;

  return validPositiveNumber(defaultCleaningFeeEur);
}

function normalizeApartmentId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Sva commission pravila prolaze isključivo kroz ovaj servis.

 * Ne pristupati commission_rules store direktno iz UI koda.

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
 * Za Airbnb SPLIT_FEE pravilo podržava legacy fallback
 * N_AIRBNB_DEFAULT radi kompatibilnosti sa Fazom 1.
 *
 * SINGLE_FEE mora imati zasebno eksplicitno pravilo.
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
 * Vraća commission konfiguraciju za apartment/platform/feeModel kombinaciju.
 *
 * @param {Object} params
 * @param {string} params.apartmentId
 * @param {string} params.platform
 * @param {string} [params.feeModel]
 * @returns {Promise<{platformFeePct:number|null,cleaningFeeEur:number|null}|null>}
 */
export async function getCommissionConfig({
  apartmentId,
  platform,
  feeModel,
} = {}) {
  const rule = await findCommissionRule({
    apartmentId,
    platform,
    feeModel,
  });

  if (!rule) {
    return null;
  }

  const platformFeePct = Number(rule?.platformFeePct);
  const cleaningFeeEur = Number(rule?.cleaningFeeEur);

  const normalizedFeeModel =
    normalizePlatform(platform) === Platforms.AIRBNB
      ? normalizeAirbnbFeeModel(feeModel)
      : null;

  // Since v1.5.1 Cleaning Fee can inherit the apartment default, an Airbnb
  // SINGLE_FEE rule remains valid even when its platform-specific CF override
  // is empty. Callers can still read platformFeePct while CF is resolved by
  // resolveConfiguredManagedCleaningFee().

  return {
    platformFeePct: Number.isFinite(platformFeePct)
      ? platformFeePct
      : null,
    cleaningFeeEur: Number.isFinite(cleaningFeeEur)
      ? cleaningFeeEur
      : null,
  };
}

/**
 * Kreira ili ažurira Airbnb SINGLE_FEE Cleaning Fee
 * za jedan MANAGED apartman.
 *
 * @param {Object} params
 * @param {string} params.apartmentId
 * @param {number|string} params.cleaningFeeEur
 * @returns {Promise<Object>}
 */
export async function saveAirbnbSingleFeeRule({
  apartmentId,
  cleaningFeeEur,
} = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  const cleaningFee = Number(cleaningFeeEur);

  if (!apartment) {
    throw new Error("Apartment ID je obavezan.");
  }

  if (!Number.isFinite(cleaningFee) || cleaningFee <= 0) {
    throw new Error("Cleaning Fee mora biti broj veći od 0.");
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
    isDefault: true,
    createdAt: reusableExistingRule?.createdAt || now,
    updatedAt: now,
  };

  await dbPutOne(STORE_NAME, rule);

  return rule;
}


/**
 * Returns Cleaning Fee settings for one MANAGED apartment.
 * Existing AIRBNB SINGLE_FEE rule is treated as the Airbnb-specific override
 * for backward compatibility with v1.5.0 Settings.
 */
export async function getManagedCleaningFeeSettings({ apartmentId } = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  if (!apartment) throw new Error("Apartment ID je obavezan.");

  const defaultRule = await dbGetOne(
    STORE_NAME,
    makeDefaultCleaningFeeRuleId(apartment)
  );

  const defaultCleaningFeeEur =
    validPositiveNumber(defaultRule?.cleaningFeeEur) ??
    DEFAULT_MANAGED_CLEANING_FEE_EUR;

  const airbnbRule = await findCommissionRule({
    apartmentId: apartment,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
  });

  const readOverride = async (platform) => {
    const rule = await dbGetOne(
      STORE_NAME,
      makeCleaningFeeOverrideRuleId(apartment, platform)
    );
    return validPositiveNumber(rule?.cleaningFeeEur);
  };

  return {
    defaultCleaningFeeEur,
    overrides: {
      airbnbSingleFee: validPositiveNumber(airbnbRule?.cleaningFeeEur),
      booking: await readOverride(Platforms.BOOKING),
      vrbo: await readOverride(Platforms.VRBO),
      direct: await readOverride(Platforms.DIRECT),
      other: await readOverride(Platforms.OTHER),
    },
  };
}

/**
 * Resolves current configured Cleaning Fee for a new MANAGED reservation.
 */
export async function resolveConfiguredManagedCleaningFee({
  apartmentId,
  platform,
  feeModel = null,
} = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  const normalizedPlatform = normalizePlatform(platform);
  if (!apartment || !normalizedPlatform) return null;

  if (
    normalizedPlatform === Platforms.AIRBNB &&
    normalizeAirbnbFeeModel(feeModel) === FeeModels.SPLIT_FEE
  ) {
    return LEGACY_AIRBNB_SPLIT_FEE_CLEANING_FEE_EUR;
  }

  const settings = await getManagedCleaningFeeSettings({ apartmentId: apartment });
  let override = null;

  if (normalizedPlatform === Platforms.AIRBNB) {
    override = settings.overrides.airbnbSingleFee;
  } else if (Object.prototype.hasOwnProperty.call(settings.overrides, normalizedPlatform)) {
    override = settings.overrides[normalizedPlatform];
  }

  return resolveManagedCleaningFeeValue({
    platform: normalizedPlatform,
    feeModel,
    defaultCleaningFeeEur: settings.defaultCleaningFeeEur,
    overrideCleaningFeeEur: override,
  });
}

/**
 * Persists default Cleaning Fee and optional platform-specific overrides.
 * Blank/null override means: inherit apartment default.
 */
export async function saveManagedCleaningFeeSettings({
  apartmentId,
  defaultCleaningFeeEur,
  overrides = {},
} = {}) {
  const apartment = normalizeApartmentId(apartmentId);
  const defaultFee = validPositiveNumber(defaultCleaningFeeEur);

  if (!apartment) throw new Error("Apartment ID je obavezan.");
  if (defaultFee === null) {
    throw new Error("Default Cleaning Fee mora biti broj veći od 0.");
  }

  const now = new Date().toISOString();
  const defaultId = makeDefaultCleaningFeeRuleId(apartment);
  const existingDefault = await dbGetOne(STORE_NAME, defaultId);

  await dbPutOne(STORE_NAME, {
    ...(existingDefault || {}),
    id: defaultId,
    apartmentId: apartment,
    platform: CLEANING_DEFAULT_PLATFORM,
    feeModel: null,
    ruleType: "CLEANING_FEE_DEFAULT",
    cleaningFeeEur: defaultFee,
    createdAt: existingDefault?.createdAt || now,
    updatedAt: now,
  });

  // Airbnb SINGLE_FEE keeps the existing commission-rule record because it also
  // owns the current platform fee percentage. Null CF means inherit default.
  const existingAirbnb = await findCommissionRule({
    apartmentId: apartment,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
  });
  const airbnbId = makeCommissionRuleId(apartment, FeeModels.SINGLE_FEE);
  const airbnbOverride = validPositiveNumber(overrides?.airbnbSingleFee);

  await dbPutOne(STORE_NAME, {
    ...(existingAirbnb?.id === airbnbId ? existingAirbnb : {}),
    id: airbnbId,
    apartmentId: apartment,
    platform: Platforms.AIRBNB,
    feeModel: FeeModels.SINGLE_FEE,
    platformFeePct: validPositiveNumber(existingAirbnb?.platformFeePct) ?? 15.5,
    cleaningFeeEur: airbnbOverride,
    isDefault: true,
    createdAt: existingAirbnb?.createdAt || now,
    updatedAt: now,
  });

  for (const platform of [
    Platforms.BOOKING,
    Platforms.VRBO,
    Platforms.DIRECT,
    Platforms.OTHER,
  ]) {
    const id = makeCleaningFeeOverrideRuleId(apartment, platform);
    const value = validPositiveNumber(overrides?.[platform]);

    if (value === null) {
      await dbDelete(STORE_NAME, id);
      continue;
    }

    const existing = await dbGetOne(STORE_NAME, id);
    await dbPutOne(STORE_NAME, {
      ...(existing || {}),
      id,
      apartmentId: apartment,
      platform,
      feeModel: null,
      ruleType: "CLEANING_FEE_OVERRIDE",
      cleaningFeeEur: value,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  return getManagedCleaningFeeSettings({ apartmentId: apartment });
}
