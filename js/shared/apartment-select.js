// js/shared/apartment-select.js
// Shared UI helper for apartment selectors. Apartment Registry remains the source of truth.
import { apartmentsGet, apartmentsListActive } from "./apartments.service.js";

function apartmentLabel(apartment) {
  const id = String(apartment?.id ?? "").trim();
  const name = String(apartment?.name ?? "").trim();
  if (!id) return name;
  if (!name || name === id) return id;
  return `${name} (${id})`;
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

/**
 * Populates an apartment <select> from the existing Apartment Registry.
 * New-entry selectors show active apartments only. When editing an existing
 * record, includeApartmentId keeps a now-inactive apartment selectable.
 */
export async function populateApartmentSelect(
  selectEl,
  { includeAll = false, allLabel = "Svi", includeApartmentId = null, preserveValue = true } = {}
) {
  if (!selectEl) return [];

  const previousValue = preserveValue ? String(selectEl.value || "") : "";
  const active = await apartmentsListActive();
  const rows = active.slice();
  const knownIds = new Set(rows.map((row) => String(row.id)));

  const extraId = String(includeApartmentId || "").trim();
  if (extraId && !knownIds.has(extraId)) {
    const inactive = await apartmentsGet(extraId);
    if (inactive) rows.push(inactive);
  }

  selectEl.innerHTML = "";
  if (includeAll) selectEl.appendChild(makeOption("ALL", allLabel));

  for (const apartment of rows) {
    selectEl.appendChild(makeOption(String(apartment.id), apartmentLabel(apartment)));
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
