// js/app.js
import { loadCategoryAliases } from "./mappingConfig.js";
await loadCategoryAliases();
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
import { computePeriodReport, computeYearReport, computeRangeReport } from "./metrics.js";
import { printToPdf } from "./pdf.js";
import {
  renderKPIs,
  renderIncomeTable,
  renderExpenseTable,
  renderNNote,
  renderYearCalendar
} from "./ui.js";

const els = {
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
  incomeTable: document.getElementById("incomeTable"),
  expenseTable: document.getElementById("expenseTable"),
  nNote: document.getElementById("nNote"),
  viewMode: document.getElementById("viewMode"),
  yearSelect: document.getElementById("yearSelect"),
  fromPeriod: document.getElementById("fromPeriod"),
  toPeriod: document.getElementById("toPeriod"),
  yearBlock: document.getElementById("yearBlock"),
  rangeBlock: document.getElementById("rangeBlock"),
};

function keyFromPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodKeyToYM(key) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function makeKeyRange(fromKey, toKey) {
  if (!fromKey || !toKey) return [];

  // osiguraj poredak
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

  // inicijalna godina za kalendar
  if (!state.selectedCalendarYear) {
    if (imports.length) {
      // uzmi godinu zadnjeg importovanog mjeseca
      state.selectedCalendarYear = imports[imports.length - 1].year;
    } else {
      // fallback – tekuća godina
      state.selectedCalendarYear = new Date().getFullYear();
    }
  }

  // napravi set mjeseci koji postoje za tu godinu
  const monthsSet = new Set(
    imports
      .filter(i => i.year === state.selectedCalendarYear)
      .map(i => i.month)
  );

  // render calendar u periodList container
  renderYearCalendar(els.periodList, {
    year: state.selectedCalendarYear,
    importedMonthsSet: monthsSet,
    selectedKey: state.selectedPeriodKey
  });

  const periods = imports.map((i) => ({
    year: i.year,
    month: i.month,
    label: periodLabel({ year: i.year, month: i.month }),
    filename: i.filename,
    imported_at: i.imported_at,

  }));

  // ================= RANGE (OD–DO) =================
  if (els.fromPeriod && els.toPeriod) {
    const options = periods.map(p => ({
      key: keyFromPeriod(p.year, p.month),
      label: p.label
    }));

    els.fromPeriod.innerHTML = options
      .map(o => `<option value="${o.key}">${o.label}</option>`)
      .join("");

    els.toPeriod.innerHTML = options
      .map(o => `<option value="${o.key}">${o.label}</option>`)
      .join("");

    // default: prvi → zadnji period
    if (!state.fromPeriodKey && options.length) {
      state.fromPeriodKey = options[0].key;
    }
    if (!state.toPeriodKey && options.length) {
      state.toPeriodKey = options[options.length - 1].key;
    }

    els.fromPeriod.value = state.fromPeriodKey;
    els.toPeriod.value = state.toPeriodKey;
  }

  // default selected month if none
  if (!state.selectedPeriodKey && periods.length) {
    const last = periods[periods.length - 1];
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  }

  await refreshYearSelect(imports);

  //renderPeriodList(els.periodList, periods, state.selectedPeriodKey);
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

function updateFilterVisibility() {
  const mode = state.viewMode || "MONTH";

  // YEAR vidljiv samo u YEAR modu
  if (els.yearBlock) {
    els.yearBlock.classList.toggle("is-open", mode === "YEAR");
  }

  // RANGE (od-do) vidljiv samo u RANGE modu
  if (els.rangeBlock) {
    els.rangeBlock.classList.toggle("is-open", mode === "RANGE");
  }
}

async function render() {
  await refreshPeriodList();
  updateFilterVisibility();

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

  // ================== RANGE VIEW ==================
  if (state.viewMode === "RANGE") {
    if (!imports.length) {
      els.status.textContent = "Nema importovanih perioda.";
      return;
    }

    const keys = makeKeyRange(state.fromPeriodKey, state.toPeriodKey);
    if (!keys.length) {
      els.status.textContent = "Odaberi 'Od' i 'Do' period.";
      return;
    }

    els.status.textContent = `Prikaz: Period ${state.fromPeriodKey} → ${state.toPeriodKey} — Apartman: ${state.aptFilter}`;

    const rowsByMonth = [];
    for (const key of keys) {
      const { year, month } = periodKeyToYM(key);

      const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [year, month]);
      const expenses = await dbGetByIndex("expenses", "by_period", [year, month]);
      const nCommission = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

      if (incomeMonthly.length || expenses.length || nCommission) {
        rowsByMonth.push({ incomeMonthly, expenses, nCommission });
      }
    }

    if (!rowsByMonth.length) {
      els.status.textContent = "U odabranom rasponu nema podataka.";
      return;
    }

    const report = computeRangeReport(rowsByMonth, {
      aptFilter: state.aptFilter,
      shareRule: state.shareRule
    });

    renderKPIs(report.kpi, els);
    renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
    renderExpenseTable(els.expenseTable, report, state.aptFilter);
    renderNNote(els.nNote, null);
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

async function exportBackup() {
  const data = {
    meta: { app: "AppStanovi", version: "1.0", exported_at: new Date().toISOString() },
    imports: await dbGetAll("imports"),
    income_monthly: await dbGetAll("income_monthly"),
    expenses: await dbGetAll("expenses"),
    n_commission: await dbGetAll("n_commission"),
  };

  const filename = `appstanovi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const jsonText = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });

  // 1) Desktop Chrome/Edge: Save As picker (File System Access API)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      // user cancelled -> samo prekini bez fallback-a
      if (e?.name === "AbortError") return;
      // u slučaju greške, nastavi na share/download
      console.warn("Save picker failed, fallback:", e);
    }
  }

  // 2) Android / mobile: Share sheet (Drive/Files/Cloud)
  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: "AppStanovi backup" });
      return;
    }
  } catch (e) {
    console.warn("Share failed, fallback:", e);
  }

  // 3) Fallback: download (Downloads)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function restoreBackupFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data || !data.meta || data.meta.app !== "AppStanovi") {
    throw new Error("Ovo nije validan AppStanovi backup fajl.");
  }

  // Opciono: pitaj da li da prepiše postojeće
  const ok = confirm("Restore će DODATI/PREPIŠE podatke iz backupa. Nastaviti?");
  if (!ok) return;

  // Prepiši po periodu: prvo obriši te periode, pa upiši
  const periods = new Set((data.imports || []).map(i => `${i.year}-${i.month}`));
  for (const key of periods) {
    const [y, m] = key.split("-");
    await deletePeriod(Number(y), Number(m));
  }

  // Upis
  if (data.imports?.length) await dbPutMany("imports", data.imports);
  if (data.income_monthly?.length) await dbPutMany("income_monthly", data.income_monthly);
  if (data.expenses?.length) await dbPutMany("expenses", data.expenses);
  if (data.n_commission?.length) await dbPutMany("n_commission", data.n_commission);

  // refresh UI
  state.viewMode = "MONTH";
  await render();
}

function attachEvents() {
  els.fromPeriod?.addEventListener("change", async () => {
    state.fromPeriodKey = els.fromPeriod.value;
    state.viewMode = "RANGE";
    if (els.viewMode) els.viewMode.value = "RANGE";
    await render();
  });

  els.toPeriod?.addEventListener("change", async () => {
    state.toPeriodKey = els.toPeriod.value;
    state.viewMode = "RANGE";
    if (els.viewMode) els.viewMode.value = "RANGE";
    await render();
  });

  els.btnBackup?.addEventListener("click", async () => {
    try { await exportBackup(); }
    catch (e) { console.error(e); alert(e.message || "Backup greška"); }
  });

  els.backupInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await restoreBackupFile(file); }
    catch (err) { console.error(err); alert(err.message || "Restore greška"); }
    finally { els.backupInput.value = ""; }
  });

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
    const prev = e.target.closest("[data-cal='prev']");
    const next = e.target.closest("[data-cal='next']");
    if (prev) {
      state.selectedCalendarYear -= 1;
      await render();
      return;
    }
    if (next) {
      state.selectedCalendarYear += 1;
      await render();
      return;
    }

    const cell = e.target.closest(".monthCell");
    if (!cell) return;

    // ako mjesec nije importovan (disabled), ne radi ništa
    if (cell.classList.contains("is-disabled")) return;

    const month = Number(cell.dataset.month);
    state.selectedPeriodKey = `${state.selectedCalendarYear}-${String(month).padStart(2, "0")}`;

    // klik na kalendar uvijek vodi na mjesečni izvještaj
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
    updateFilterVisibility();
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
