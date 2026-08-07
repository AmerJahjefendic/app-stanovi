// js/app/home.page.js
import { renderPeriodReportToPrintRoot, renderNOwnerReportToPrintRoot, printToPdf } from "../shared/pdf.js";
import { loadCategoryAliases } from "../shared/mappingConfig.js";
await loadCategoryAliases();

import { state } from "../shared/state.js";
import {
  dbGetAll,
  dbGetByIndex,
  dbGetOneByIndex,
  dbPutOne,
  dbPutMany,
  shoppingCountToBuy,
  dbDeleteByIndex,
} from "../db/db.js";

import { keyFromPeriod, periodKeyToYM } from "../shared/utils.js";
import { importTroskovnikXlsx } from "../shared/importXlsx.js";
import { periodLabel } from "../shared/parseFilename.js";
import { computePeriodReport, computeYearReport, computeRangeReport, computeNOwnerReport } from "../reports/metrics.service.js";
import { APARTMENTS, APT_LIST, LS_KEYS, APARTMENT_DEFS, APT_ROLE } from "../shared/constants.js";
import {
  renderKPIs,
  renderIncomeTable,
  renderExpenseTable,
  renderNNote,
  renderYearCalendar,
  setLoading,
  showError,
  withLoading,
  initMobileMenu
} from "../shared/ui.js";
import { getShareRule, setShareRule } from "../shared/settings.js";

import { setPickerLabel } from "./home.ui.js";
import { loadPeriodData } from "./home.data.js";
import { attachEvents } from "./home.events.js";
import { exportBackupFile, restoreBackupFileAtomic } from "../backup/backup.service.js";

const els = {
  mBtnBackup: document.getElementById("mBtnBackup"),
  mBackupInput: document.getElementById("mBackupInput"),
  mFileInput: document.getElementById("mFileInput"),
  mBtnPrint: document.getElementById("mBtnPrint"),

  fromBtn: document.getElementById("fromPeriodBtn"),
  toBtn: document.getElementById("toPeriodBtn"),
  fromPop: document.getElementById("fromCalPop"),
  toPop: document.getElementById("toCalPop"),
  btnShowRange: document.getElementById("btnShowRange"),
  btnClearRange: document.getElementById("btnClearRange"),

  periodList: document.getElementById("periodList"),

  btnBackup: document.getElementById("btnBackup"),
  backupInput: document.getElementById("backupInput"),
  fileInput: document.getElementById("fileInput"),
  btnPrint: document.getElementById("btnPrint"),

  status: document.getElementById("status"),
  aptFilter: document.getElementById("aptFilter"),
  shareRule: document.getElementById("shareRule"),

  kpiIncome: document.getElementById("kpiIncome"),
  kpiExpenses: document.getElementById("kpiExpenses"),
  kpiNet: document.getElementById("kpiNet"),
  kpiNights: document.getElementById("kpiNights"),
  kpiNetAvg: document.getElementById("kpiNetAvg"),
  kpiExpenseRatio: document.getElementById("kpiExpenseRatio"),
  incomeTable: document.getElementById("incomeTable"),
  expenseTable: document.getElementById("expenseTable"),
  nNote: document.getElementById("nNote"),
};

function loadSettings() {
  state.shareRule = getShareRule();
  if (els.shareRule) els.shareRule.value = state.shareRule;
}

function makeKeyRange(fromKey, toKey) {
  if (!fromKey || !toKey) return [];
  let a = fromKey, b = toKey;
  if (a > b) [a, b] = [b, a];
  let { year: y1, month: m1 } = periodKeyToYM(a);
  let { year: y2, month: m2 } = periodKeyToYM(b);
  const out = [];
  let y = y1, m = m1;
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(keyFromPeriod(y, m));
    m++;
    if (m === 13) { m = 1; y++; }
  }
  return out;
}

async function refreshPeriodCalendar() {
  const imports = await dbGetAll("imports");
  imports.sort((a, b) => a.year - b.year || a.month - b.month);

  const fallbackYear = new Date().getFullYear();

  if (!state.selectedCalendarYear) {
    state.selectedCalendarYear = imports.length ? imports[imports.length - 1].year : fallbackYear;
  }

  if (!state.selectedPeriodKey && !state.isYearView && !state.isRangeView && imports.length) {
    const last = imports[imports.length - 1];
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  }

  if (!state.rangeFromYear) state.rangeFromYear = state.selectedCalendarYear;
  if (!state.rangeToYear) state.rangeToYear = state.selectedCalendarYear;

  const fromMonths = new Set(imports.filter(i => i.year === state.rangeFromYear).map(i => i.month));
  renderYearCalendar(els.fromPop, {
    year: state.rangeFromYear,
    importedMonthsSet: fromMonths,
    selectedKey: state.fromPeriodKey,
    isYearView: false,
  });

  const toMonths = new Set(imports.filter(i => i.year === state.rangeToYear).map(i => i.month));
  renderYearCalendar(els.toPop, {
    year: state.rangeToYear,
    importedMonthsSet: toMonths,
    selectedKey: state.toPeriodKey,
    isYearView: false,
  });

  setPickerLabel(els.fromBtn, state.fromPeriodKey);
  setPickerLabel(els.toBtn, state.toPeriodKey);

  const monthsSet = new Set(imports.filter(i => i.year === state.selectedCalendarYear).map(i => i.month));
  renderYearCalendar(els.periodList, {
    year: state.selectedCalendarYear,
    importedMonthsSet: monthsSet,
    selectedKey: state.selectedPeriodKey,
    isYearView: state.isYearView,
  });

  return imports;
}

//Novo za KPI
function addAvgFieldsToKpi(kpi, monthsCount) {
  const income = Number(kpi?.income || 0);
  const expenses = Number(kpi?.expenses || 0);
  const net = Number(kpi?.net || 0);

  const m = Number(monthsCount || 0);

  return {
    ...kpi,
    net_avg: (m > 0) ? (net / m) : null,
    expense_ratio: (income > 0) ? (expenses / income) : null, // 0..1
  };
}
//Kraj novo za KPI

function round2(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function fmtDateISO(iso) {
  if (!iso) return "";
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

async function render() {
  const imports = await refreshPeriodCalendar();

  if (!imports.length) {
    els.status.textContent = "Uvezi prvi “Troškovnik … .xlsx”.";
    renderKPIs({ income: null, expenses: null, net: null, nights: null }, els);
    els.incomeTable.innerHTML = "";
    els.expenseTable.innerHTML = "";
    els.nNote.textContent = "";
    return;
  }

  const allIncomeItems = await dbGetAll("income_items").catch(() => []);

  if (state.isRangeView) {
    const keys = makeKeyRange(state.fromPeriodKey, state.toPeriodKey);

    if (!keys.length) {
      els.status.textContent = "Odaberi OD i DO period pa klikni Prikaži.";
      renderKPIs({ income: null, expenses: null, net: null, nights: null }, els);
      els.incomeTable.innerHTML = "";
      els.expenseTable.innerHTML = "";
      els.nNote.textContent = "";
      return;
    }

    els.status.textContent =
      `Prikaz: Period ${state.fromPeriodKey} → ${state.toPeriodKey} — Apartman: ${state.aptFilter}`;

    const rowsByMonth = [];
    for (const key of keys) {
      const { year, month } = periodKeyToYM(key);

      const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [year, month]);
      const incomeItems = await dbGetByIndex("income_items", "by_period", [year, month]).catch(() => []);
      const expenses = await dbGetByIndex("expenses", "by_period", [year, month]);
      const nCommission = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

      if (incomeMonthly.length || incomeItems.length || expenses.length || nCommission) {
        rowsByMonth.push({ year, month, incomeMonthly, incomeItems, allIncomeItems, expenses, nCommission });
      }
    }

    if (!rowsByMonth.length) {
      els.status.textContent = "U odabranom rasponu nema podataka.";
      renderKPIs({ income: null, expenses: null, net: null, nights: null }, els);
      els.incomeTable.innerHTML = "";
      els.expenseTable.innerHTML = "";
      els.nNote.textContent = "";
      return;
    }

    const report = computeRangeReport(rowsByMonth, {
      aptFilter: state.aptFilter,
      shareRule: state.shareRule,
    });

    renderKPIs(report.kpi, els);
    const monthsCount = rowsByMonth.length;
    const kpi2 = addAvgFieldsToKpi(report.kpi, monthsCount);
    renderKPIs(kpi2, els);
    renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
    renderExpenseTable(els.expenseTable, report, state.aptFilter);
    renderNNote(els.nNote, null);
    return;
  }

  if (state.isYearView) {
    const year = state.selectedCalendarYear || new Date().getFullYear();
    els.status.textContent = `Prikaz: Godina ${year} — Apartman: ${state.aptFilter}`;

    const rowsByMonth = [];
    for (const imp of imports.filter(i => i.year === year)) {
      const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [imp.year, imp.month]);
      const incomeItems = await dbGetByIndex("income_items", "by_period", [imp.year, imp.month]).catch(() => []);
      const expenses = await dbGetByIndex("expenses", "by_period", [imp.year, imp.month]);
      const nCommission = await dbGetOneByIndex("n_commission", "by_period", [imp.year, imp.month]);
      rowsByMonth.push({ year: imp.year, month: imp.month, incomeMonthly, incomeItems, allIncomeItems, expenses, nCommission });
    }

    const report = computeYearReport(rowsByMonth, {
      aptFilter: state.aptFilter,
      shareRule: state.shareRule,
    });

    renderKPIs(report.kpi, els);
    const monthsCount = rowsByMonth.length;
    const kpi2 = addAvgFieldsToKpi(report.kpi, monthsCount);
    renderKPIs(kpi2, els);
    renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
    renderExpenseTable(els.expenseTable, report, state.aptFilter);
    renderNNote(els.nNote, null);
    return;
  }

  if (!state.selectedPeriodKey) {
    const last = imports[imports.length - 1];
    state.selectedCalendarYear = last.year;
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  }

  const { year, month } = periodKeyToYM(state.selectedPeriodKey);
  const data = await loadPeriodData(year, month);

  els.status.textContent =
    `Prikaz: ${periodLabel({ year, month })} — Apartman: ${state.aptFilter}`;

  const report = computePeriodReport(
    {
      incomeMonthly: data.incomeMonthly,
      incomeItems: data.incomeItems,
      allIncomeItems: data.allIncomeItems,
      expenses: data.expenses,
      nCommission: data.nCommission,
      year,
      month,
    },
    { aptFilter: state.aptFilter, shareRule: state.shareRule }
  );
  console.log("Period report dto", JSON.parse(JSON.stringify(report)));

  renderKPIs(report.kpi, els);
  const kpi2 = addAvgFieldsToKpi(report.kpi, 1);
  renderKPIs(kpi2, els);
  renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
  renderExpenseTable(els.expenseTable, report, state.aptFilter);
  renderNNote(els.nNote, data.nCommission);

  // Auto-refresh print-root sa trenutnim report podacima
  const monthNames = ["Januar", "Februar", "Mart", "April", "Maj", "Juni", "Juli", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar"];
  const monthLabel = monthNames[month - 1];

  const def = APARTMENT_DEFS[state.aptFilter];

  if (def?.role === APT_ROLE.OWNER) {
    const core = computeNOwnerReport(
      { allIncomeItems: data.allIncomeItems, incomeItems: data.incomeItems, nCommission: data.nCommission },
      { year, month, def: { ...def, apartment: state.aptFilter } }
    );

    const ownerDto = {
      meta: { monthLabel, year, ...def.meta },
      rows: core.rows,
      stats: core.stats,
    };

    renderNOwnerReportToPrintRoot(ownerDto, {
      title: `Izvještaj za vlasnika – ${monthLabel} ${year}`,
    });
  } else {
    const printTitle = `Mjesečni izvještaj – ${monthLabel} ${year}`;
    renderPeriodReportToPrintRoot(report, { title: printTitle, aptFilter: state.aptFilter, shareRule: state.shareRule });
  }
}

async function handleImport(file) {
  const buf = await file.arrayBuffer();
  const parsed = importTroskovnikXlsx(file, buf);

  const existing = await dbGetOneByIndex("imports", "by_period", [
    parsed.period.year,
    parsed.period.month,
  ]);

  if (existing) {
    const ok = confirm(
      `Period ${periodLabel(parsed.period)} je već importovan.\n\n` +
      `Želiš li da PREPIŠEŠ postojeće podatke za ovaj mjesec?`
    );
    if (!ok) return;
    await dbDeleteByIndex("imports", "by_period", [parsed.period.year, parsed.period.month]);
    await dbDeleteByIndex("income_monthly", "by_period", [parsed.period.year, parsed.period.month]);
    await dbDeleteByIndex("income_items", "by_period", [parsed.period.year, parsed.period.month]).catch(() => { });
    await dbDeleteByIndex("expenses", "by_period", [parsed.period.year, parsed.period.month]);
    await dbDeleteByIndex("n_commission", "by_period", [parsed.period.year, parsed.period.month]);
  }

  await dbPutOne("imports", parsed.importRecord);
  await dbPutMany("income_monthly", parsed.incomeMonthly);
  if (parsed.incomeItems?.length) await dbPutMany("income_items", parsed.incomeItems);
  await dbPutMany("expenses", parsed.expenses);
  await dbPutOne("n_commission", parsed.nCommission);

  state.isRangeView = false;
  state.isYearView = false;
  state.selectedCalendarYear = parsed.period.year;
  state.selectedPeriodKey = keyFromPeriod(parsed.period.year, parsed.period.month);

  if (!state.fromPeriodKey) state.fromPeriodKey = state.selectedPeriodKey;
  if (!state.toPeriodKey) state.toPeriodKey = state.selectedPeriodKey;

  await render();
}

async function exportBackup() {
  return exportBackupFile();
}

async function restoreBackupFile(file) {
  const result = await restoreBackupFileAtomic(file);
  if (!result) return;

  await loadCategoryAliases();

  const imports = await dbGetAll("imports");
  imports.sort((a, b) => a.year - b.year || a.month - b.month);

  if (imports.length) {
    const last = imports[imports.length - 1];
    state.selectedCalendarYear = last.year;
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  } else {
    state.selectedCalendarYear = new Date().getFullYear();
    state.selectedPeriodKey = null;
  }

  state.isRangeView = false;
  state.isYearView = false;

  await render();
}

attachEvents(els, { render, handleImport, exportBackup, restoreBackupFile });
loadSettings();

// Shopping badges refresh
async function refreshShoppingBadges() {
  try {
    const az = await shoppingCountToBuy("AZ");
    const n = await shoppingCountToBuy("N");

    const elAZ = document.getElementById("shopBadgeAZ");
    const elN = document.getElementById("shopBadgeN");

    if (elAZ) elAZ.textContent = az;
    if (elN) elN.textContent = n;
  } catch (e) {
    console.warn("[shopping] badge error", e);
  }
}

// Preslušaj promjene shareRule iz drugih tabova ili iz same stranice (synthetic event)
window.addEventListener("storage", (e) => {
  if (e.key === LS_KEYS.shareRule) {
    state.shareRule = getShareRule();
    if (els.shareRule) els.shareRule.value = state.shareRule;
    render();
  }
});

withLoading(async () => {
  await render();
  await refreshShoppingBadges();
  initMobileMenu();
});
