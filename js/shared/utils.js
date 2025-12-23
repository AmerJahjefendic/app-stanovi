// js/utils.js - Shared utility functions

export function keyFromPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodKeyToYM(key) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function fmtEUR(x, options = {}) {
  if (options.dashIfNull && (x === null || x === undefined)) return "—";
  return new Intl.NumberFormat("bs-BA", { style: "currency", currency: "EUR" }).format(Number(x || 0));
}

export function fmtNum(x, options = {}) {
  if (options.dashIfNull && (x === null || x === undefined)) return "—";
  return new Intl.NumberFormat("bs-BA").format(Number(x || 0));
}