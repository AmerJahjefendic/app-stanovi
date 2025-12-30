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

// Meta podaci za PDF izvještaje po apartmanu
export const APARTMENT_META = {
  A: {
    propertyName: "Apartment A",
    ownerName: "Ime vlasnika A",
    agencyName: "Sarajevo from A to Z",
  },
  Z: {
    propertyName: "Apartment Z", 
    ownerName: "Ime vlasnika Z",
    agencyName: "Sarajevo from A to Z",
  },
  N: {
    propertyName: "Lux City Center",
    ownerName: "Nermin Ćeman",
    agencyName: "Sarajevo from A to Z",
  },
};