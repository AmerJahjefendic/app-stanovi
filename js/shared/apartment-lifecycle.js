// js/shared/apartment-lifecycle.js
// Pure helpers for Apartment Registry lifecycle and delete-safety checks.

export const APARTMENT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
});

const VALID_STATUSES = new Set(Object.values(APARTMENT_STATUS));

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeApartmentStatus(apartment) {
  const explicit = clean(apartment?.lifecycleStatus).toUpperCase();
  if (VALID_STATUSES.has(explicit)) return explicit;
  return apartment?.isActive === false
    ? APARTMENT_STATUS.INACTIVE
    : APARTMENT_STATUS.ACTIVE;
}

export function isApartmentActive(apartment) {
  return normalizeApartmentStatus(apartment) === APARTMENT_STATUS.ACTIVE;
}

export function isApartmentArchived(apartment) {
  return normalizeApartmentStatus(apartment) === APARTMENT_STATUS.ARCHIVED;
}

export function withApartmentStatus(apartment, status) {
  const normalized = clean(status).toUpperCase();
  if (!VALID_STATUSES.has(normalized)) {
    throw new Error(`Nepoznat status apartmana: "${status}".`);
  }

  return {
    ...apartment,
    lifecycleStatus: normalized,
    // Keep legacy consumers/backups compatible. Only ACTIVE maps to true.
    isActive: normalized === APARTMENT_STATUS.ACTIVE,
  };
}

export function filterApartmentsForRegistry(rows, { includeArchived = true } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return includeArchived
    ? list.slice()
    : list.filter((row) => !isApartmentArchived(row));
}

export function findApartmentReferencesInData(apartmentId, data = {}) {
  const id = clean(apartmentId);
  if (!id) return [];

  const refs = [];
  const add = (store, label, count) => {
    if (count > 0) refs.push({ store, label, count });
  };

  const incomeItems = Array.isArray(data.income_items) ? data.income_items : [];
  add(
    "income_items",
    "prihodi",
    incomeItems.filter((row) => clean(row?.apartment) === id).length
  );

  const incomeMonthly = Array.isArray(data.income_monthly) ? data.income_monthly : [];
  add(
    "income_monthly",
    "mjesečni prihodi",
    incomeMonthly.filter((row) => clean(row?.apartment) === id).length
  );

  const expenses = Array.isArray(data.expenses) ? data.expenses : [];
  add(
    "expenses",
    "troškovi",
    expenses.filter((row) => {
      if (clean(row?.apartment) === id) return true;
      const members = Array.isArray(row?.sharedMembers) ? row.sharedMembers : [];
      return members.some((memberId) => clean(memberId) === id);
    }).length
  );

  const shoppingItems = Array.isArray(data.shopping_items) ? data.shopping_items : [];
  const directShoppingKeys = new Set([`APT:${id}`]);
  // Existing apartment N keeps its historical unprefixed shopping key.
  if (id === "N") directShoppingKeys.add("N");
  add(
    "shopping_items",
    "shopping artikli",
    shoppingItems.filter((row) => directShoppingKeys.has(clean(row?.group))).length
  );

  return refs;
}

export function apartmentDeleteBlockMessage(apartmentId, references) {
  const id = clean(apartmentId);
  const refs = Array.isArray(references) ? references.filter((ref) => Number(ref?.count) > 0) : [];
  if (!refs.length) return "";

  const details = refs
    .map((ref) => `${ref.label || ref.store}: ${Number(ref.count)}`)
    .join(", ");

  return `Apartman "${id}" ima postojeće podatke (${details}) i ne može se trajno obrisati. Arhiviraj ga umjesto brisanja.`;
}
