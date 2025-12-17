// js/mappingConfig.js

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll("š", "s")
    .replaceAll("đ", "d")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("ž", "z");
}

// Ovdje dodaš svoje "poznate" nazive kroz godine (sinonime)
const EXPENSE_CATEGORY_ALIASES = {
  // primjer:
  // "KOMUNALIJE": ["komunalije", "rezije", "racuni", "voda", "struja"],
  // "ODRZAVANJE": ["odrzavanje", "servis", "popravke", "majstor"],
};

export function mapExpenseCategory(rawCategory) {
  const n = norm(rawCategory);
  if (!n) return "NEPOZNATO";

  for (const [canon, list] of Object.entries(EXPENSE_CATEGORY_ALIASES)) {
    if (list.map(norm).includes(n)) return canon;
  }

  // ako nema u aliasima, ostavi NEPOZNATO
  return "NEPOZNATO";
}
