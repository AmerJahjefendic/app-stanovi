import { dbGetAll } from "../db/db.js";
import { apartmentsListActive, shareSetsListActive } from "./apartments.service.js";

const LEGACY_SHARED_KEY = "AZ";
const LEGACY_APARTMENT_KEY = "N";

function clean(value) {
  return String(value ?? "").trim();
}

function bySortThenLabel(a, b) {
  return (Number(a.sort) || 0) - (Number(b.sort) || 0)
    || String(a.label || a.id).localeCompare(String(b.label || b.id), "bs");
}

function isLegacyAzShareSet(shareKey, members) {
  const ids = members.map((row) => clean(row?.id)).filter(Boolean).sort();
  return clean(shareKey) === "NIZE_BANJE_2"
    && ids.length === 2
    && ids[0] === "A"
    && ids[1] === "Z";
}

function storageKeyForShared(shareKey, members) {
  return isLegacyAzShareSet(shareKey, members)
    ? LEGACY_SHARED_KEY
    : `SHARE:${clean(shareKey)}`;
}

function storageKeyForApartment(apartment) {
  const id = clean(apartment?.id);
  return id === LEGACY_APARTMENT_KEY ? LEGACY_APARTMENT_KEY : `APT:${id}`;
}

/**
 * Returns inventory scopes derived from the active Apartment Registry.
 *
 * Shared apartments are represented once per shareKey. Solo apartments get
 * their own scope. Existing AZ/N shopping keys remain readable without a data
 * migration; every newly introduced scope uses a prefixed storage key so an
 * apartment id can never collide with a shareKey.
 */
export async function shoppingListActiveScopes({ includeOrphans = true } = {}) {
  const [apartments, shareSets, shoppingItems] = await Promise.all([
    apartmentsListActive(),
    shareSetsListActive(),
    includeOrphans ? dbGetAll("shopping_items") : Promise.resolve([]),
  ]);

  const shareSetById = new Map(shareSets.map((row) => [clean(row?.id), row]));
  const membersByShareKey = new Map();

  for (const apartment of apartments) {
    const shareKey = clean(apartment?.shareKey);
    if (!shareKey) continue;
    if (!membersByShareKey.has(shareKey)) membersByShareKey.set(shareKey, []);
    membersByShareKey.get(shareKey).push(apartment);
  }

  const scopes = [];

  for (const [shareKey, members] of membersByShareKey.entries()) {
    const shareSet = shareSetById.get(shareKey);
    const memberNames = members
      .slice()
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || clean(a.id).localeCompare(clean(b.id)))
      .map((row) => clean(row?.name) || clean(row?.id));
    const baseName = clean(shareSet?.name) || memberNames.join(" + ") || shareKey;
    const memberSuffix = memberNames.length && baseName !== memberNames.join(" + ")
      ? ` (${memberNames.join(" + ")})`
      : "";

    scopes.push({
      id: `SHARE:${shareKey}`,
      kind: "SHARED",
      shareKey,
      apartmentId: null,
      memberIds: members.map((row) => clean(row?.id)).filter(Boolean),
      storageKey: storageKeyForShared(shareKey, members),
      label: `${baseName}${memberSuffix}`,
      sort: Number(shareSet?.sort) || Math.min(...members.map((row) => Number(row?.sort) || 0)),
    });
  }

  for (const apartment of apartments) {
    if (clean(apartment?.shareKey)) continue;
    const id = clean(apartment?.id);
    if (!id) continue;
    scopes.push({
      id: `APT:${id}`,
      kind: "APARTMENT",
      shareKey: null,
      apartmentId: id,
      memberIds: [id],
      storageKey: storageKeyForApartment(apartment),
      label: clean(apartment?.name) || id,
      sort: Number(apartment?.sort) || 0,
    });
  }

  // Data-safety fallback: if an old backup contains shopping rows whose scope
  // no longer exists in the active registry, keep the list reachable instead
  // of silently hiding the stored data.
  if (includeOrphans) {
    const usedStorageKeys = new Set(scopes.map((scope) => scope.storageKey));
    const orphanKeys = [...new Set(shoppingItems.map((row) => clean(row?.group)).filter(Boolean))]
      .filter((key) => !usedStorageKeys.has(key));

    for (const key of orphanKeys) {
      scopes.push({
        id: `LEGACY:${key}`,
        kind: "LEGACY",
        shareKey: null,
        apartmentId: null,
        memberIds: [],
        storageKey: key,
        label: `Legacy lista (${key})`,
        sort: 999999,
      });
    }
  }

  return scopes.sort(bySortThenLabel);
}
