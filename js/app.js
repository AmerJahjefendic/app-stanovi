// js/app.js
import { state } from "./state.js";
import {
  dbGetAll,
  dbGetByIndex,
  dbGetOneByIndex,
  dbPutOne,
  dbPutMany,
  dbDeleteByIndex,
} from "./db.js";

import { importTroskovnikXlsx } from "./importXlsx.js";
import { periodLabel } from "./parseFilename.js";
import { computePeriodReport, computeYearReport } from "./metrics.js";
import { printToPdf } from "./pdf.js";
import {
  renderPeriodList,
  renderKPIs,
  renderIncomeTable,
  renderExpenseTable,
  renderNNote,
} from "./ui.js";

const els = {
  fileInput: document.getElementById("fileInput"),
  btnPrint: document.getElementById("btnPrint"),
  periodList: document.getElementById("periodList"),
  status: document.getElementById("status"),
  aptFilter: document.getElementById("aptFilter"),
  shareRule: document.getElementById("shareRule"),
  kpiIncome: document.getElementById("kpiIncome"),
  kpiExpenses: document.getElementById("kpiExpenses"),
  kpiNet: document.getElementById("kpiNet"),
  kpiNights: document.getElementById("kpiNights"),
  incomeTable: document.getElementById("incomeTable"),
  expenseTable: document.getElementById("expenseTable"),
  nNote: document.getElementById("nNote"),
  viewMode: document.getElementById("viewMode"),
  yearSelect: document.getElementById("yearSelect"),
};

function keyFromPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function refreshYearSelect(imports) {
  if (!els.yearSelect) return;

  const years = [...new Set(imports.map((i) => i.year))].sort((a, b) => a - b);

  els.yearSelect.innerHTML = years
    .map((y) => `<option value="${y}">${y}</option>`)
    .join("");

  if (!state.selectedYear && years.length) {
    state.selectedYear = years[years.length - 1];
  }
  if (years.length && !years.includes(state.selectedYear)) {
    state.selectedYear = years[years.length - 1];
  }

  if (state.selectedYear) els.yearSelect.value = String(state.selectedYear);
}

async function refreshPeriodList() {
  const imports = await dbGetAll("imports");
  imports.sort((a, b) => a.year - b.year || a.month - b.month);

  const periods = imports.map((i) => ({
    year: i.year,
    month: i.month,
    label: periodLabel({ year: i.year, month: i.month }),
    filename: i.filename,
    imported_at: i.imported_at,
  }));

  // default selected month if none
  if (!state.selectedPeriodKey && periods.length) {
    const last = periods[periods.length - 1];
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  }

  await refreshYearSelect(imports);

  renderPeriodList(els.periodList, periods, state.selectedPeriodKey);
}

async function loadPeriodData() {
  if (!state.selectedPeriodKey) return null;

  const [yearStr, monthStr] = state.selectedPeriodKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [
    year,
    month,
  ]);
  const expenses = await dbGetByIndex("expenses", "by_period", [year, month]);
  const nCommission = await dbGetOneByIndex("n_commission", "by_period", [
    year,
    month,
  ]);

  return { year, month, incomeMonthly, expenses, nCommission };
}

async function deletePeriod(year, month) {
  await dbDeleteByIndex("imports", "by_period", [year, month]);
  await dbDeleteByIndex("income_monthly", "by_period", [year, month]);
  await dbDeleteByIndex("expenses", "by_period", [year, month]);
  await dbDeleteByIndex("n_commission", "by_period", [year, month]);
}

async function render() {
  await refreshPeriodList();

  const imports = await dbGetAll("imports");
  if (!imports.length) {
    els.status.textContent = "Uvezi prvi “Troškovnik … .xlsx”.";
    return;
  }

  // ================== MONTH VIEW ==================
  if (state.viewMode === "MONTH") {
    const data = await loadPeriodData();
    if (!data) return;

    els.status.textContent = `Prikaz: ${periodLabel({
      year: data.year,
      month: data.month,
    })} — Apartman: ${state.aptFilter}`;

    const report = computePeriodReport(
      {
        incomeMonthly: data.incomeMonthly,
        expenses: data.expenses,
        nCommission: data.nCommission,
      },
      { aptFilter: state.aptFilter, shareRule: state.shareRule }
    );

    renderKPIs(report.kpi, els);
    renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
    renderExpenseTable(els.expenseTable, report, state.aptFilter);
    renderNNote(els.nNote, data.nCommission);
    return;
  }

  // ================== YEAR VIEW ==================
  const year = state.selectedYear || new Date().getFullYear();

  els.status.textContent = `Prikaz: Godina ${year} — Apartman: ${state.aptFilter}`;

  const rowsByMonth = [];
  for (const imp of imports.filter((i) => i.year === year)) {
    const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [
      imp.year,
      imp.month,
    ]);
    const expenses = await dbGetByIndex("expenses", "by_period", [
      imp.year,
      imp.month,
    ]);
    const nCommission = await dbGetOneByIndex("n_commission", "by_period", [
      imp.year,
      imp.month,
    ]);

    rowsByMonth.push({ incomeMonthly, expenses, nCommission });
  }

  const report = computeYearReport(rowsByMonth, {
    aptFilter: state.aptFilter,
    shareRule: state.shareRule,
  });

  renderKPIs(report.kpi, els);
  renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
  renderExpenseTable(els.expenseTable, report, state.aptFilter);
  renderNNote(els.nNote, null);
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
    await deletePeriod(parsed.period.year, parsed.period.month);
  }

  await dbPutOne("imports", parsed.importRecord);
  await dbPutMany("income_monthly", parsed.incomeMonthly);
  await dbPutMany("expenses", parsed.expenses);
  await dbPutOne("n_commission", parsed.nCommission);

  state.selectedPeriodKey = keyFromPeriod(parsed.period.year, parsed.period.month);
  state.viewMode = "MONTH";
  if (els.viewMode) els.viewMode.value = "MONTH";

  // Ako nema selectedYear, setuj ga
  if (!state.selectedYear) state.selectedYear = parsed.period.year;
  if (els.yearSelect) els.yearSelect.value = String(state.selectedYear);

  await render();
}

function attachEvents() {
  els.fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await handleImport(file);
    } catch (err) {
      console.error(err);
      alert(err.message || "Greška pri importu.");
    } finally {
      els.fileInput.value = "";
    }
  });

  els.periodList?.addEventListener("click", async (e) => {
    const item = e.target.closest(".listItem");
    if (!item) return;

    state.selectedPeriodKey = item.dataset.key;
    state.viewMode = "MONTH";
    if (els.viewMode) els.viewMode.value = "MONTH";
    await render();
  });

  els.aptFilter?.addEventListener("change", async () => {
    state.aptFilter = els.aptFilter.value;
    await render();
  });

  els.shareRule?.addEventListener("change", async () => {
    state.shareRule = els.shareRule.value;
    await render();
  });

  els.viewMode?.addEventListener("change", async () => {
    state.viewMode = els.viewMode.value;
    await render();
  });

  els.yearSelect?.addEventListener("change", async () => {
    state.selectedYear = Number(els.yearSelect.value);
    state.viewMode = "YEAR";
    if (els.viewMode) els.viewMode.value = "YEAR";
    await render();
  });

  els.btnPrint?.addEventListener("click", () => printToPdf());
}

attachEvents();
render();
