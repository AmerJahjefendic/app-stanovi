// js/shared/constants.js

export const APARTMENTS = {
  A: "A",
  Z: "Z",
  N: "N",
};

export const APT_LIST = [APARTMENTS.A, APARTMENTS.Z, APARTMENTS.N];
export const APT_FILTERS = ["ALL", ...APT_LIST];

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
export const LS_KEYS = {
  shareRule: "appstanovi_shareRule",
};