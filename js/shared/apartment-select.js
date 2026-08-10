// js/shared/apartment-select.js
// Shared UI helper for apartment selectors. Apartment Registry remains the source of truth.
import { apartmentsGet, apartmentsListActive, apartmentsListAll } from "./apartments.service.js";
import { APARTMENT_STATUS, normalizeApartmentStatus } from "./apartment-lifecycle.js";

function apartmentLabel(apartment, { showStatus = false } = {}) {
  const id = String(apartment?.id ?? "").trim();
  const name = String(apartment?.name ?? "").trim();
  const base = !id ? name : (!name || name === id ? id : `${name} (${id})`);
  if (!showStatus) return base;

  const status = normalizeApartmentStatus(apartment);
  if (status === APARTMENT_STATUS.INACTIVE) return `${base} — neaktivan`;
  if (status === APARTMENT_STATUS.ARCHIVED) return `${base} — arhiviran`;
  return base;
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

/**
 * Populates an apartment <select> from Apartment Registry.
 *
 * - New-entry selectors use ACTIVE apartments only.
 * - Historical filters (includeAll=true) keep INACTIVE/ARCHIVED apartments
 *   selectable so old data and owner reports remain reachable.
 * - Editing an existing record can always include its apartment id.
 */
export async function populateApartmentSelect(
  selectEl,
  { includeAll = false, allLabel = "Svi", includeApartmentId = null, preserveValue = true } = {}
) {
  if (!selectEl) return [];

  const previousValue = preserveValue ? String(selectEl.value || "") : "";
  const rows = includeAll ? await apartmentsListAll() : await apartmentsListActive();
  if (includeAll) {
    const rank = {
      [APARTMENT_STATUS.ACTIVE]: 0,
      [APARTMENT_STATUS.INACTIVE]: 1,
      [APARTMENT_STATUS.ARCHIVED]: 2,
    };
    rows.sort((a, b) =>
      (rank[normalizeApartmentStatus(a)] ?? 9) - (rank[normalizeApartmentStatus(b)] ?? 9)
      || (Number(a?.sort) || 0) - (Number(b?.sort) || 0)
      || String(a?.id || "").localeCompare(String(b?.id || ""))
    );
  }
  const knownIds = new Set(rows.map((row) => String(row.id)));

  const extraId = String(includeApartmentId || "").trim();
  if (extraId && !knownIds.has(extraId)) {
    const historical = await apartmentsGet(extraId);
    if (historical) rows.push(historical);
  }

  selectEl.innerHTML = "";
  if (includeAll) selectEl.appendChild(makeOption("ALL", allLabel));

  for (const apartment of rows) {
    selectEl.appendChild(makeOption(
      String(apartment.id),
      apartmentLabel(apartment, { showStatus: includeAll || normalizeApartmentStatus(apartment) !== APARTMENT_STATUS.ACTIVE })
    ));
  }

  const preferred = extraId || previousValue;
  if (preferred && Array.from(selectEl.options).some((option) => option.value === preferred)) {
    selectEl.value = preferred;
  } else if (includeAll) {
    selectEl.value = "ALL";
  } else if (selectEl.options.length) {
    selectEl.selectedIndex = 0;
  }

  return rows;
}
