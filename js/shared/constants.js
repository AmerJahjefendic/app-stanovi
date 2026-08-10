// js/shared/constants.js

export const APARTMENTS = {
  A: "A",
  Z: "Z",
  N: "N",
  // sutra: N2: "N2", ...
};


export const SCOPE = {
  SHARED: "SHARED",
  APARTMENT: "APARTMENT",
  SHARED_SPLIT: "SHARED_SPLIT",
};

export const SHARE_RULE = {
  INCOME: "INCOME",
  NIGHTS: "NIGHTS",
};

export const FX = {
  FX_KEY: "fxRateBamPerEur",
  DEFAULT_EUR_TO_BAM: 1.95583,
};

export const GROUP_IDS = {
  SHARED: "AZ",
  SOLO: "O",
  MANAGED_LEGACY: "N",
};

export const ALLOWED_NEW_GROUPS = [GROUP_IDS.SHARED, GROUP_IDS.SOLO];

export const FeeModels = Object.freeze({
  SPLIT_FEE: "SPLIT_FEE",
  SINGLE_FEE: "SINGLE_FEE",
});

export const Platforms = Object.freeze({
  AIRBNB: "airbnb",
  BOOKING: "booking",
  VRBO: "vrbo",
  DIRECT: "direct",
  OTHER: "other",
});

export const LS_KEYS = {
  shareRule: "appstanovi_shareRule",
};
