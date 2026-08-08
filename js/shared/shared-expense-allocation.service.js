import { APARTMENTS, SHARE_RULE, SCOPE } from "./constants.js";

export const LEGACY_SHARED_KEY = "NIZE_BANJE_2";
export const LEGACY_SHARED_MEMBERS = Object.freeze([APARTMENTS.A, APARTMENTS.Z]);

function uniqueApartmentIds(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function resolveSharedExpenseMembers(expense) {
  const snapshot = uniqueApartmentIds(expense?.sharedMembers);
  if (snapshot.length) return snapshot;

  // Backward compatibility: historical SHARED expenses predate shareKey/snapshot
  // and always represented the original A+Z shared pair.
  if (!String(expense?.shareKey || "").trim()) {
    return [...LEGACY_SHARED_MEMBERS];
  }

  return [];
}

export function allocateSharedExpense(expense, basisByApartment = {}, shareRule = SHARE_RULE.INCOME) {
  const members = resolveSharedExpenseMembers(expense);
  if (!members.length) return [];

  const basisKey = shareRule === SHARE_RULE.NIGHTS ? "nights" : "income";
  const bases = members.map((apartment) => {
    const row = basisByApartment?.[apartment] || {};
    const value = Number(row?.[basisKey] || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const denominator = bases.reduce((sum, value) => sum + value, 0);
  const ratios = denominator > 0
    ? bases.map((value) => value / denominator)
    : members.map(() => 1 / members.length);

  const amount = Number(expense?.amount_eur || 0) || 0;
  let allocated = 0;

  return members.map((apartment, index) => {
    const isLast = index === members.length - 1;
    const amountEur = isLast ? amount - allocated : amount * ratios[index];
    allocated += amountEur;

    return {
      ...expense,
      scope: SCOPE.SHARED_SPLIT,
      derived_from: expense?.id,
      apartment,
      amount_eur: amountEur,
      shareRatio: ratios[index],
    };
  });
}
