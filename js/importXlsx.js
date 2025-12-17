import { makeId } from "./db.js";
import { parsePeriodFromFilename } from "./parseFilename.js";

const XLSX = window.XLSX;

const BAM_PER_EUR = 1.95583;
const toEUR = (bam) => (typeof bam === "number" ? bam / BAM_PER_EUR : 0);

function getCell(ws, addr) {
  const cell = ws[addr];
  return cell ? cell.v : null;
}

function isNumber(x) {
  return typeof x === "number" && !Number.isNaN(x);
}

function sumRange(ws, col, r1, r2) {
  let s = 0;
  for (let r = r1; r <= r2; r++) {
    const v = getCell(ws, `${col}${r}`);
    if (isNumber(v)) s += v;
  }
  return s;
}

function parseTabelaPriliva(ws, period) {
  // Rows 2..18
  const incomeA = sumRange(ws, "A", 2, 18);
  const nightsA = sumRange(ws, "B", 2, 18);
  const incomeZ = sumRange(ws, "C", 2, 18);
  const nightsZ = sumRange(ws, "D", 2, 18);
  let incomeN = 0;
let nightsN = 0;
let incomeNRows = 0;

for (let r = 2; r <= 18; r++) {
  const v = getCell(ws, `E${r}`);
  const n = getCell(ws, `F${r}`);

  if (isNumber(v) && v > 0) {
    incomeN += v;
    incomeNRows++;      // BROJ REDOVA SA PRILIVOM
  }
  if (isNumber(n)) nightsN += n;
}


  const rows = [
    { apartment: "A", income_eur: incomeA, nights: nightsA },
    { apartment: "Z", income_eur: incomeZ, nights: nightsZ },
    { apartment: "N", income_eur: incomeN, nights: nightsN }
  ].map(x => ({
    id: makeId("inc"),
    year: period.year,
    month: period.month,
    apartment: x.apartment,
    income_eur: x.income_eur,
    nights: x.nights,
    source: "Tabela priliva"
  }));
  return {
  incomeMonthly: rows,
  incomeNTotal: incomeN,
  incomeNRows
};
}

function parseTabelaTroskovaShared(ws, period) {
  // A1-L1 categories, A2-L16 amounts (BAM), M description for column L
  const expenses = [];

  // headers A..L are row 1 => r:0
  const headers = [];
  for (let c = 0; c <= 11; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const h = getCell(ws, addr);
    headers[c] = h ? String(h).trim() : `Col${c}`;
  }

  // rows 2..16 => r:1..15
  for (let r = 1; r <= 15; r++) {
    for (let c = 0; c <= 11; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = getCell(ws, addr);
      if (isNumber(v) && v !== 0) {
        const category = headers[c] || `Col${c}`;

        let note = "";
        if (c === 11) { // L
          const descAddr = XLSX.utils.encode_cell({ r, c: 12 }); // M
          const desc = getCell(ws, descAddr);
          if (desc !== null && String(desc).trim() !== "") note = String(desc).trim();
        }

        expenses.push({
          id: makeId("exp"),
          year: period.year,
          month: period.month,
          scope: "SHARED",
          apartment: null,
          category,
          amount_bam: v,
          amount_eur: toEUR(v),
          note,
          source: "Tabela troskova"
        });
      }
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
    if (header) categoryByCol[col] = String(header).trim();
  }

  const headerJ = getCell(ws, "J1");
  const headerK = getCell(ws, "K1");
  const jkCategory =
    [headerJ, headerK].filter(Boolean).map(v => String(v).trim()).join(" / ") || "Ostalo";

  for (let r = 2; r <= 20; r++) {
    // D..I
    for (const col of ["D", "E", "F", "G", "H", "I"]) {
      const v = getCell(ws, `${col}${r}`);
      if (isNumber(v) && v !== 0) {
        expenses.push({
          id: makeId("exp"),
          year: period.year,
          month: period.month,
          scope: "APARTMENT",
          apartment: apt,
          category: categoryByCol[col] || `Col ${col}`,
          amount_bam: v,
          amount_eur: toEUR(v),
          note: "",
          source: "Apt N"
        });
      }
    }

    // J/K combined by row
    const j = getCell(ws, `J${r}`);
    const k = getCell(ws, `K${r}`);
    const hasJ = isNumber(j) && j !== 0;
    const hasK = k !== null && String(k).trim() !== "";

    if (hasJ || hasK) {
      expenses.push({
        id: makeId("exp"),
        year: period.year,
        month: period.month,
        scope: "APARTMENT",
        apartment: apt,
        category: jkCategory,
        amount_bam: hasJ ? j : 0,
        amount_eur: hasJ ? toEUR(j) : 0,
        note: hasK ? String(k).trim() : "",
        source: "Apt N (J/K)"
      });
    }
  }

  return expenses;
}
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

  // 1) exact normalized match
  for (const n of names) {
    if (normSheetName(n) === want) return wb.Sheets[n];
  }

  // 2) contains match (fallback)
  for (const n of names) {
    if (normSheetName(n).includes(want)) return wb.Sheets[n];
  }

  return null;
}

export function importTroskovnikXlsx(file, arrayBuffer) {
  const period = parsePeriodFromFilename(file.name);
  if (!period) {
    throw new Error(`Ne mogu prepoznati period iz naziva fajla: "${file.name}". Očekujem "Troškovnik Mjesec godina".`);
  }

  const wb = XLSX.read(arrayBuffer, { type: "array" });

  console.log("SheetNames:", wb.SheetNames);

const wsIncome = findSheet(wb, "Tabela priliva");
const wsCosts  = findSheet(wb, "Tabela troskova");   // pronaći će i "Tabela troškova"
const wsAptN   = findSheet(wb, "Apt N");

  if (!wsIncome) throw new Error(`Nedostaje sheet: "Tabela priliva"`);
  if (!wsCosts) throw new Error(`Nedostaje sheet: "Tabela troskova"`);
  if (!wsAptN) throw new Error(`Nedostaje sheet: "Apt N"`);

  const parsedIncome = parseTabelaPriliva(wsIncome, period);
const { incomeMonthly, incomeNTotal, incomeNRows } = parsedIncome;
  const expensesShared = parseTabelaTroskovaShared(wsCosts, period);
  const expensesN = parseAptN(wsAptN, period);

  const commissionEur = (0.25 * incomeNTotal) + (10 * parsedIncome.incomeNRows);

  const importRecord = {
    id: makeId("imp"),
    filename: file.name,
    year: period.year,
    month: period.month,
    imported_at: new Date().toISOString(),
    bam_per_eur: BAM_PER_EUR
  };

  const nCommission = {
    id: makeId("ncom"),
    year: period.year,
    month: period.month,
    incomeN_eur_total: incomeNTotal,
    commission_eur: commissionEur,
    rule: "0.25 * N_income + 10"
  };

  return {
    period,
    importRecord,
    incomeMonthly,
    expenses: [...expensesShared, ...expensesN],
    nCommission
  };
}
