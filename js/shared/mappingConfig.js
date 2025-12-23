// js/shared/mappingConfig.js
import { dbGetAllCategoryAliases } from "../db/db.js";

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll("š", "s")
    .replaceAll("đ", "d")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("ž", "z")
    // 3 u 1 / 3u1 / 3 u1 / 3u 1 -> 3u1
    .replace(/(\d)\s*u\s*(\d)/g, "$1u$2")
    .replace(/\s+/g, " ");
}

function titleCase(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^| )(\p{L})/gu, (m) => m.toUpperCase());
}

// osnovni MAP
const MAP = {
  "parking": "Parking",
  "struja": "Struja",
  "plin": "Plin",
  "voda": "Voda",
  "odrzavanje": "Odrzavanje",
  "internet": "Internet",
  "sredstva za ciscenje": "Sredstva za čišćenje",
  "toalet papir i ubrusi": "Toalet papir i ubrusi",
  "sampon i sapun": "Šampon i sapun",
  "keksi i cokolade": "Keksi i čokolade",
  "razno": "Razno",
  "posteljine": "Posteljine",
  "posteljina": "Posteljine",

  // razno/opis primjeri
  "kahva": "Kahva",
  "kafa": "Kahva",
  "baterije": "Baterije",
  "carsaf": "Caršaf",
  "caršaf": "Caršaf",
  "voce": "Voće",
  "voće": "Voće",
  "vrece za smece": "Vreće za smeće",
  "vreće za smece": "Vreće za smeće",

  // 3u1 varijante (norm() će ih sve svesti na 3u1)
  "3u1": "Kahva 3/1",
  "kafa 3/1": "Kahva 3/1",

  "ciscenje": "Čišćenje",
  "lejla": "Čišćenje",
};

// ====== ALIAS CACHE (iz DB) ======
let ALIAS = {}; // norm(from) -> to

export async function loadCategoryAliases() {
  const rows = await dbGetAllCategoryAliases();
  const out = {};
  for (const r of rows) {
    const k = norm(r.from);
    if (k) out[k] = String(r.to || "").trim();
  }
  ALIAS = out;
  return ALIAS;
}

export function mapExpenseCategory(raw) {
  const rawStr = String(raw || "").trim();
  if (!rawStr) return "NEPOZNATO";

  const k = norm(rawStr);

  // 1) DB alias ima prioritet
  if (ALIAS[k]) return titleCase(ALIAS[k]);

  // 2) MAP
  if (MAP[k]) return MAP[k];

  // 3) fallback: original kao kategorija
  return titleCase(rawStr);
}
