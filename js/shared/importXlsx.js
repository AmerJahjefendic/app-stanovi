// js/shared/importXlsx.js
import { makeId } from "../db/db.js";
import { parsePeriodFromFilename } from "./parseFilename.js";
import { mapExpenseCategory } from "./mappingConfig.js";
import { debug } from "./log.js";

const XLSX = window.XLSX;

const BAM_PER_EUR = 1.95583;
const toEUR = (bam) => (typeof bam === "number" ? bam / BAM_PER_EUR : 0);

// ---------- helpers ----------
function getCell(ws, addr) {
  const cell = ws?.[addr];
  if (!cell) return null;
  // nekad je v string, nekad number; nekad je "w" formatirani prikaz
  return cell.v ?? cell.w ?? null;
}

function toNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;

  // Excel ponekad vrati string tipa "€ 36,50" ili "1.234,56"
  if (typeof x === "string") {
    let s = x.trim();

    // ukloni valute i "nevidljive" razmake
    s = s.replace(/\u00A0/g, " "); // nbsp
    s = s.replace(/[€$KM]/g, "");
    s = s.replace(/\s+/g, "");

    // ako ima i tačku i zarez, pretpostavi: tačka = hiljade, zarez = decimal
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "");
      s = s.replace(",", ".");
    } else if (s.includes(",")) {
      // samo zarez -> decimal
      s = s.replace(",", ".");
    }

    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function isNonZeroNumber(x) {
  const n = toNumber(x);
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

function sumRange(ws, col, r1, r2) {
  let s = 0;
  for (let r = r1; r <= r2; r++) {
    const v = toNumber(getCell(ws, `${col}${r}`));
    if (typeof v === "number") s += v;
  }
  return s;
}

// ---------- parsers ----------
function parseTabelaPriliva(ws, period) {
  const items = [];

  function pushItem(apartment, amountCell, nightsCell, r) {
    const amount = toNumber(getCell(ws, `${amountCell}${r}`));
    const nights = toNumber(getCell(ws, `${nightsCell}${r}`));

    const hasAmount = typeof amount === "number" && amount !== 0;
    const hasNights = typeof nights === "number" && nights !== 0;
    if (!hasAmount && !hasNights) return;

    items.push({
      id: makeId("incit"),
      year: period.year,
      month: period.month,
      apartment,
      amount_eur: hasAmount ? amount : 0,
      nights: hasNights ? nights : 0,
      note: `Red ${r}`,
      source: "Tabela priliva",
    });
  }

  // Rows 2..18
  for (let r = 2; r <= 18; r++) {
    pushItem("A", "A", "B", r);
    pushItem("Z", "C", "D", r);
    pushItem("N", "E", "F", r);
  }

  // sum from items
  const sums = { A: { income: 0, nights: 0 }, Z: { income: 0, nights: 0 }, N: { income: 0, nights: 0 } };
  let incomeNRows = 0;

  for (const it of items) {
    sums[it.apartment].income += Number(it.amount_eur || 0);
    sums[it.apartment].nights += Number(it.nights || 0);

    if (it.apartment === "N" && Number(it.amount_eur || 0) > 0) incomeNRows++;
  }

  const incomeMonthly = ["A", "Z", "N"].map(apartment => ({
    id: makeId("inc"),
    year: period.year,
    month: period.month,
    apartment,
    income_eur: sums[apartment].income,
    nights: sums[apartment].nights,
    source: "Tabela priliva",
  }));

  return {
    incomeMonthly,
    incomeItems: items,
    incomeNTotal: sums.N.income,
    incomeNRows,
  };
}

function parseTabelaTroskovaShared(ws, period) {
  const expenses = [];

  const ref = ws["!ref"];
  if (!ref) return expenses;

  const range = XLSX.utils.decode_range(ref);
  const lastCol = range.e.c;         // zadnja kolona u sheetu
  const startRow = 1;                // row 2 (0-indexed)
  const endRow = Math.min(range.e.r, 15); // do reda 16 (kao do sada)

  // učitaj headere iz prvog reda (row 1 => r:0)
  const headers = [];
  for (let c = 0; c <= lastCol; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const h = getCell(ws, addr);
    headers[c] = h ? String(h).trim() : "";
  }

  // pronađi kolonu "Razno" (gdje god da je)
  const raznoCol = headers.findIndex(h => normSheetName(h) === "razno");
  const raznoDescCol = (raznoCol >= 0 && raznoCol + 1 <= lastCol) ? (raznoCol + 1) : -1;

  for (let r = startRow; r <= endRow; r++) {
    for (let c = 0; c <= lastCol; c++) {

      // preskoči "opis" kolonu koja ide odmah poslije Razno (da se ne tretira kao iznos)
      if (c === raznoDescCol) continue;

      const addr = XLSX.utils.encode_cell({ r, c });
      const v = getCell(ws, addr);
      if (!Number.isFinite(v) || v === 0) continue;

      // --- specijalno za Razno: kategorija = opis iz sljedeće kolone ---
      if (c === raznoCol && raznoDescCol !== -1) {
        const descAddr = XLSX.utils.encode_cell({ r, c: raznoDescCol });
        const desc = getCell(ws, descAddr);
        const rawDesc = desc !== null ? String(desc).trim() : "";

        // ako nema opisa, onda neka ostane "Razno"
        const rawCategory = rawDesc || "Razno";
        const category = mapExpenseCategory(rawCategory);

        expenses.push({
          id: makeId("exp"),
          year: period.year,
          month: period.month,
          scope: "SHARED",
          apartment: null,
          category,
          raw_category: rawCategory,
          amount_bam: v,
          amount_eur: toEUR(v),
          note: rawDesc,              // čuvamo originalni opis
          source: "Tabela troskova (Razno)",
        });
        continue;
      }

      // --- standardne kolone ---
      const rawCategory = headers[c] || "";
      const category = mapExpenseCategory(rawCategory);

      // stara logika za opis u M za kolonu L (ako je to još negdje u fajlovima)
      let note = "";
      // (opcionalno zadržiš ovu granu ako ti treba)
      // if (c === 11) { ... }

      expenses.push({
        id: makeId("exp"),
        year: period.year,
        month: period.month,
        scope: "SHARED",
        apartment: null,
        category,
        raw_category: rawCategory,
        amount_bam: v,
        amount_eur: toEUR(v),
        note,
        source: "Tabela troskova",
      });
    }
  }

  return expenses;
}

function parseAptN(ws, period) {
  // D1-I1 categories, D2-I20 amounts (BAM)
  // J(row) amount (BAM) + K(row) description
  const expenses = [];
  const apt = "N";

  const categoryByCol = {};
  for (const col of ["D", "E", "F", "G", "H", "I"]) {
    const header = getCell(ws, `${col}1`);
    categoryByCol[col] = header ? String(header).trim() : "";
  }

  for (let r = 2; r <= 20; r++) {
    // D..I pojedinačne kolone
    for (const col of ["D", "E", "F", "G", "H", "I"]) {
      const v = toNumber(getCell(ws, `${col}${r}`));
      if (typeof v === "number" && v !== 0) {
        const rawCategory = categoryByCol[col] || "";
        const category = mapExpenseCategory(rawCategory);

        expenses.push({
          id: makeId("exp"),
          year: period.year,
          month: period.month,
          scope: "APARTMENT",
          apartment: apt,
          category,
          raw_category: rawCategory,
          amount_bam: v,
          amount_eur: toEUR(v),
          note: "",
          source: "Apt N",
        });
      }
    }

    // J/K kombinacija po redu (Razno + Opis)
    const j = toNumber(getCell(ws, `J${r}`)); // iznos
    const k = getCell(ws, `K${r}`);          // opis

    const hasJ = typeof j === "number" && j !== 0;
    const descText =
      k !== null && String(k).trim() !== "" ? String(k).trim() : "";
    const hasK = !!descText;

    if (hasJ || hasK) {
      // Ako postoji opis, koristi opis kao kategoriju
      const rawCategory = descText || "Razno";
      const category = mapExpenseCategory(rawCategory);

      expenses.push({
        id: makeId("exp"),
        year: period.year,
        month: period.month,
        scope: "APARTMENT",
        apartment: apt,
        category,
        raw_category: rawCategory,
        amount_bam: hasJ ? j : 0,
        amount_eur: hasJ ? toEUR(j) : 0,
        note: descText ? "Razno" : "",
        source: "Apt N (Razno/Opis)",
      });
    }
  }

  return expenses;
}

function parseAptNIncomeAndCommission(ws) {
  let incomeNTotal = 0;
  let nightsNTotal = 0;
  let commissionSum = 0;

  // A = Priliv, B = Noći, C = Moja provizija
  for (let r = 2; r <= 20; r++) {
    const income = toNumber(getCell(ws, `A${r}`));
    const nights = toNumber(getCell(ws, `B${r}`));
    const com = toNumber(getCell(ws, `C${r}`));

    if (typeof income === "number" && income > 0) incomeNTotal += income;
    if (typeof nights === "number" && nights > 0) nightsNTotal += nights;
    if (typeof com === "number" && com > 0) commissionSum += com;
  }

  return { incomeNTotal, nightsNTotal, commissionSum };
}

// ---------- sheet finding ----------
function normSheetName(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replaceAll("š", "s")
    .replaceAll("đ", "d")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("ž", "z");
}

function findSheet(wb, expected) {
  const want = normSheetName(expected);
  const names = wb.SheetNames || [];

  for (const n of names) {
    if (normSheetName(n) === want) return wb.Sheets[n];
  }
  for (const n of names) {
    if (normSheetName(n).includes(want)) return wb.Sheets[n];
  }
  return null;
}

// ---------- main import ----------
export function importTroskovnikXlsx(file, arrayBuffer) {
  const period = parsePeriodFromFilename(file.name);
  if (!period) {
    throw new Error(
      `Ne mogu prepoznati period iz naziva fajla: "${file.name}". Očekujem "Troškovnik Mjesec godina".`
    );
  }

  const wb = XLSX.read(arrayBuffer, { type: "array" });
  debug("SheetNames:", wb.SheetNames);

  const wsIncome = findSheet(wb, "Tabela priliva");
  const wsCosts = findSheet(wb, "Tabela troskova");
  const wsAptN = findSheet(wb, "Apt N");

  if (!wsIncome) throw new Error(`Nedostaje sheet: "Tabela priliva"`);
  if (!wsCosts) throw new Error(`Nedostaje sheet: "Tabela troskova"`);

  // Apt N je opcionalan
  let expensesN = [];
  let aptNMeta = null;

  if (!wsAptN) {
    const ok = confirm(
      `U ovom fajlu nema taba "Apt N".\n` +
      `Import će se uraditi bez troškova i detalja za N.\n\nNastaviti?`
    );
    if (!ok) throw new Error("Import prekinut.");
  } else {
    expensesN = parseAptN(wsAptN, period);
    aptNMeta = parseAptNIncomeAndCommission(wsAptN);
  }

  const parsedIncome = parseTabelaPriliva(wsIncome, period);
  const expensesShared = parseTabelaTroskovaShared(wsCosts, period);

  let { incomeMonthly, incomeItems, incomeNTotal, incomeNRows } = parsedIncome;

  // Ako postoji Apt N, koristi njegove realne vrijednosti (priliv/noći/provizija)
  let commissionEur = null;

  if (aptNMeta && aptNMeta.incomeNTotal > 0) {
    // prepiši N row u incomeMonthly da KPI/noći budu tačni
    const nRow = incomeMonthly.find((x) => x.apartment === "N");
    if (nRow) {
      nRow.income_eur = aptNMeta.incomeNTotal;
      nRow.nights = aptNMeta.nightsNTotal;
    }

    incomeNTotal = aptNMeta.incomeNTotal;

    // ako imamo proviziju iz kolone C, koristi nju
    if (aptNMeta.commissionSum > 0) {
      commissionEur = aptNMeta.commissionSum;
    }
  }

  // fallback provizija (stara formula)
  if (commissionEur === null) {
    commissionEur = 0.25 * incomeNTotal + 10 * incomeNRows;
  }

  const importRecord = {
    id: makeId("imp"),
    filename: file.name,
    year: period.year,
    month: period.month,
    imported_at: new Date().toISOString(),
    bam_per_eur: BAM_PER_EUR,
  };

  const nCommission = {
    id: makeId("ncom"),
    year: period.year,
    month: period.month,
    incomeN_eur_total: incomeNTotal,
    commission_eur: commissionEur,
    rule:
      aptNMeta && aptNMeta.commissionSum > 0
        ? "Moja provizija (Apt N, kolona C)"
        : "0.25 * N_income + 10 * N_rows",
  };

  return {
  period,
  importRecord,
  incomeMonthly,
  incomeItems,
  expenses: [...expensesShared, ...expensesN],
  nCommission,
};
}
