// js/shared/constants.js

export const APT_ROLE = {
  OWNED: "OWNED",     // tvoji stanovi (A, Z...) - shared logika
  OWNER: "OWNER",     // stanovi gdje praviš izvještaj za vlasnika (N, N2...)
};

export const APARTMENTS = {
  A: "A",
  Z: "Z",
  N: "N",
  // sutra: N2: "N2", ...
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

// Definicije apartmana (meta + role + pravila)
export const APARTMENT_DEFS = {
  [APARTMENTS.A]: {
    role: APT_ROLE.OWNED,
    meta: { propertyName: "Apartment A", ownerName: "Amer", agencyName: "Sarajevo from A to Z" },
  },
  [APARTMENTS.Z]: {
    role: APT_ROLE.OWNED,
    meta: { propertyName: "Apartment Z", ownerName: "Amer", agencyName: "Sarajevo from A to Z" },
  },
  [APARTMENTS.N]: {
    role: APT_ROLE.OWNER,
    meta: { propertyName: "Gajev trg 2/3", ownerName: "Nermin Ćeman", agencyName: "Sarajevo from A to Z" },

    // pravila za vlasnički izvještaj:
    ownerShare: 0.75,
    agencyShare: 0.25,

    // bitno za DIRECT: u owner izvještaju se koristi amount_eur (bez CF)
    ownerReportIncomeField: "amount_eur",
    directCleaningFeeEur: 10,
  },
};

// Legacy alias za kompatibilnost
export const APARTMENT_META = Object.fromEntries(
  Object.entries(APARTMENT_DEFS).map(([apt, def]) => [apt, def.meta])
);