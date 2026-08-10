import test from "node:test";
import assert from "node:assert/strict";

import {
  APARTMENT_STATUS,
  apartmentDeleteBlockMessage,
  filterApartmentsForRegistry,
  findApartmentReferencesInData,
  isApartmentActive,
  normalizeApartmentStatus,
  withApartmentStatus,
} from "../js/shared/apartment-lifecycle.js";

test("legacy apartment rows map isActive to ACTIVE/INACTIVE without migration", () => {
  assert.equal(normalizeApartmentStatus({ id: "A" }), APARTMENT_STATUS.ACTIVE);
  assert.equal(normalizeApartmentStatus({ id: "B", isActive: true }), APARTMENT_STATUS.ACTIVE);
  assert.equal(normalizeApartmentStatus({ id: "C", isActive: false }), APARTMENT_STATUS.INACTIVE);
});

test("explicit ARCHIVED status wins over legacy isActive flag", () => {
  const row = { id: "OLD", lifecycleStatus: "ARCHIVED", isActive: true };
  assert.equal(normalizeApartmentStatus(row), APARTMENT_STATUS.ARCHIVED);
  assert.equal(isApartmentActive(row), false);
});

test("status transition keeps legacy isActive compatibility field aligned", () => {
  const active = withApartmentStatus({ id: "X" }, APARTMENT_STATUS.ACTIVE);
  const inactive = withApartmentStatus(active, APARTMENT_STATUS.INACTIVE);
  const archived = withApartmentStatus(inactive, APARTMENT_STATUS.ARCHIVED);

  assert.equal(active.isActive, true);
  assert.equal(inactive.isActive, false);
  assert.equal(archived.isActive, false);
});

test("archived apartments are hidden from normal Settings list but can be requested", () => {
  const rows = [
    { id: "A", lifecycleStatus: "ACTIVE" },
    { id: "B", lifecycleStatus: "INACTIVE" },
    { id: "C", lifecycleStatus: "ARCHIVED" },
  ];

  assert.deepEqual(
    filterApartmentsForRegistry(rows, { includeArchived: false }).map((row) => row.id),
    ["A", "B"]
  );
  assert.deepEqual(
    filterApartmentsForRegistry(rows, { includeArchived: true }).map((row) => row.id),
    ["A", "B", "C"]
  );
});

test("delete protection detects direct income, monthly income and expense history", () => {
  const refs = findApartmentReferencesInData("B", {
    income_items: [
      { id: "i1", apartment: "B" },
      { id: "i2", apartment: "A" },
    ],
    income_monthly: [{ id: "m1", apartment: "B" }],
    expenses: [{ id: "e1", apartment: "B" }],
    shopping_items: [],
  });

  assert.deepEqual(refs.map((ref) => [ref.store, ref.count]), [
    ["income_items", 1],
    ["income_monthly", 1],
    ["expenses", 1],
  ]);
});

test("delete protection treats shared expense member snapshot as apartment history", () => {
  const refs = findApartmentReferencesInData("H", {
    expenses: [
      { id: "e1", scope: "SHARED", sharedMembers: ["F", "H"] },
      { id: "e2", scope: "SHARED", sharedMembers: ["A", "Z"] },
    ],
  });

  assert.deepEqual(refs, [{ store: "expenses", label: "troškovi", count: 1 }]);
});

test("delete protection detects direct shopping scope including legacy N key", () => {
  assert.deepEqual(
    findApartmentReferencesInData("B", {
      shopping_items: [{ id: "s1", group: "APT:B" }],
    }),
    [{ store: "shopping_items", label: "shopping artikli", count: 1 }]
  );

  assert.deepEqual(
    findApartmentReferencesInData("N", {
      shopping_items: [{ id: "s2", group: "N" }],
    }),
    [{ store: "shopping_items", label: "shopping artikli", count: 1 }]
  );
});

test("apartment with no stored references remains eligible for hard delete", () => {
  const refs = findApartmentReferencesInData("EMPTY", {
    income_items: [],
    income_monthly: [],
    expenses: [],
    shopping_items: [],
  });

  assert.deepEqual(refs, []);
  assert.equal(apartmentDeleteBlockMessage("EMPTY", refs), "");
});

test("delete block message directs historical apartment to archive", () => {
  const message = apartmentDeleteBlockMessage("OLD", [
    { store: "income_items", label: "prihodi", count: 4 },
    { store: "expenses", label: "troškovi", count: 2 },
  ]);

  assert.match(message, /ne može se trajno obrisati/i);
  assert.match(message, /Arhiviraj/i);
  assert.match(message, /prihodi: 4/);
  assert.match(message, /troškovi: 2/);
});
