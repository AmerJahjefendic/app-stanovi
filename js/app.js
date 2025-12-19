// js/app.js
import { loadCategoryAliases } from "./mappingConfig.js";
await loadCategoryAliases();
import { computePeriodReport, computeYearReport, computeRangeReport } from "./metrics.js";
import { state } from "./state.js";
import {
  dbGetAll,
  dbGetByIndex,
  dbGetOneByIndex,
  dbPutOne,
  dbPutMany,
  dbDeleteByIndex,
} from "./db.js";

import { keyFromPeriod, periodKeyToYM } from "./utils.js";
import { importTroskovnikXlsx } from "./importXlsx.js";
import { periodLabel } from "./parseFilename.js";
import { printToPdf } from "./pdf.js";
import {
  renderKPIs,
  renderIncomeTable,
  renderExpenseTable,
  renderNNote,
  renderYearCalendar
} from "./ui.js";

const els = {
  fromPeriod: document.getElementById("fromPeriod"),
  toPeriod: document.getElementById("toPeriod"),
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
  incomeTable: document.getElementById("incomeTable"),
  expenseTable: document.getElementById("expenseTable"),
  nNote: document.getElementById("nNote"),
};

async function refreshPeriodCalendar() {
  const imports = await dbGetAll("imports");
  imports.sort((a, b) => a.year - b.year || a.month - b.month);

  // OD/DO options
  if (els.fromPeriod && els.toPeriod) {
    const options = imports.map(i => ({
      key: keyFromPeriod(i.year, i.month),
      label: periodLabel({ year: i.year, month: i.month }),
    }));

    els.fromPeriod.innerHTML = options.map(o => `<option value="${o.key}">${o.label}</option>`).join("");
    els.toPeriod.innerHTML = options.map(o => `<option value="${o.key}">${o.label}</option>`).join("");

    if (!state.fromPeriodKey && options.length) state.fromPeriodKey = options[0].key;
    if (!state.toPeriodKey && options.length) state.toPeriodKey = options[options.length - 1].key;

    els.fromPeriod.value = state.fromPeriodKey;
    els.toPeriod.value = state.toPeriodKey;
  }

  // default godina u kalendaru
  if (!state.selectedCalendarYear) {
    state.selectedCalendarYear = imports.length
      ? imports[imports.length - 1].year
      : new Date().getFullYear();
  }

  // default MONTH view (ali ne u YEAR/RANGE)
  if (!state.selectedPeriodKey && !state.isYearView && !state.isRangeView && imports.length) {
    const last = imports[imports.length - 1];
    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
  }

  const monthsSet = new Set(
    imports
      .filter(i => i.year === state.selectedCalendarYear)
      .map(i => i.month)
  );

  renderYearCalendar(els.periodList, {
    year: state.selectedCalendarYear,
    importedMonthsSet: monthsSet,
    selectedKey: state.selectedPeriodKey,
    isYearView: state.isYearView,
  });

  return imports;
}

async function loadPeriodData(year, month) {
  const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [year, month]);
  const expenses = await dbGetByIndex("expenses", "by_period", [year, month]);
  const nCommission = await dbGetOneByIndex("n_commission", "by_period", [year, month]);
  return { year, month, incomeMonthly, expenses, nCommission };
}

async function deletePeriod(year, month) {
  await dbDeleteByIndex("imports", "by_period", [year, month]);
  await dbDeleteByIndex("income_monthly", "by_period", [year, month]);
  await dbDeleteByIndex("income_items", "by_period", [year, month]).catch(() => { });
  await dbDeleteByIndex("expenses", "by_period", [year, month]);
  await dbDeleteByIndex("n_commission", "by_period", [year, month]);
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


async function render() {
  const imports = await refreshPeriodCalendar();

  if (!imports.length) {
    els.status.textContent = "Uvezi prvi “Troškovnik … .xlsx”.";
    return;
  }

  // =============== RANGE VIEW ===============
  if (state.isRangeView) {
    const keys = makeKeyRange(state.fromPeriodKey, state.toPeriodKey);
    if (!keys.length) {
      els.status.textContent = "Odaberi OD i DO period.";
      return;
    }

    els.status.textContent =
      `Prikaz: Period ${state.fromPeriodKey} → ${state.toPeriodKey} — Apartman: ${state.aptFilter}`;

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
      shareRule: state.shareRule,
    });

    renderKPIs(report.kpi, els);
    renderIncomeTable(els.incomeTable, report.perApt, state.aptFilter);
    renderExpenseTable(els.expenseTable, report, state.aptFilter);
    renderNNote(els.nNote, null);
    return;
  }

  // =============== YEAR VIEW ===============
  if (state.isYearView) {
    const year = state.selectedCalendarYear || new Date().getFullYear();
    els.status.textContent = `Prikaz: Godina ${year} — Apartman: ${state.aptFilter}`;

    const rowsByMonth = [];
    for (const imp of imports.filter(i => i.year === year)) {
      const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [imp.year, imp.month]);
      const expenses = await dbGetByIndex("expenses", "by_period", [imp.year, imp.month]);
      const nCommission = await dbGetOneByIndex("n_commission", "by_period", [imp.year, imp.month]);
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
    return;
  }

  // =============== MONTH VIEW ===============
  if (!state.selectedPeriodKey) {
    els.status.textContent = "Izaberi mjesec iz kalendara.";
    return;
  }

  const { year, month } = periodKeyToYM(state.selectedPeriodKey);
  const data = await loadPeriodData(year, month);

  els.status.textContent =
    `Prikaz: ${periodLabel({ year, month })} — Apartman: ${state.aptFilter}`;

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
  if (parsed.incomeItems?.length) await dbPutMany("income_items", parsed.incomeItems);
  await dbPutMany("expenses", parsed.expenses);
  await dbPutOne("n_commission", parsed.nCommission);

  // nakon importa: idi u MONTH view tog perioda
  state.isYearView = false;
  state.selectedCalendarYear = parsed.period.year;
  state.selectedPeriodKey = keyFromPeriod(parsed.period.year, parsed.period.month);

  await render();
}

async function exportBackup() {
  const data = {
    meta: { app: "AppStanovi", version: "1.0", exported_at: new Date().toISOString() },
    imports: await dbGetAll("imports"),
    income_monthly: await dbGetAll("income_monthly"),
    income_items: await dbGetAll("income_items").catch(() => []),
    expenses: await dbGetAll("expenses"),
    n_commission: await dbGetAll("n_commission"),
  };

  const filename = `appstanovi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const jsonText = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });

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
      if (e?.name === "AbortError") return;
      console.warn("Save picker failed, fallback:", e);
    }
  }

  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: "AppStanovi backup" });
      return;
    }
  } catch (e) {
    console.warn("Share failed, fallback:", e);
  }

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

  if (!data?.meta || data.meta.app !== "AppStanovi") {
    throw new Error("Ovo nije validan AppStanovi backup fajl.");
  }

  const ok = confirm("Restore će DODATI/PREPIŠE podatke iz backupa. Nastaviti?");
  if (!ok) return;

  const periods = new Set((data.imports || []).map(i => `${i.year}-${i.month}`));
  for (const key of periods) {
    const [y, m] = key.split("-");
    await deletePeriod(Number(y), Number(m));
  }

  if (data.imports?.length) await dbPutMany("imports", data.imports);
  if (data.income_monthly?.length) await dbPutMany("income_monthly", data.income_monthly);
  if (data.income_items?.length) await dbPutMany("income_items", data.income_items);
  if (data.expenses?.length) await dbPutMany("expenses", data.expenses);
  if (data.n_commission?.length) await dbPutMany("n_commission", data.n_commission);

  // nakon restore: idi na YEAR view tekuće (ili zadnje) godine
  state.selectedPeriodKey = null;
  state.isYearView = true;
  state.selectedCalendarYear = state.selectedCalendarYear || new Date().getFullYear();

  await render();
}

function attachEvents() {
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
    try { await handleImport(file); }
    catch (err) { console.error(err); alert(err.message || "Greška pri importu."); }
    finally { els.fileInput.value = ""; }
  });

  els.aptFilter?.addEventListener("change", async () => {
    state.aptFilter = els.aptFilter.value;
    await render();
  });

  els.shareRule?.addEventListener("change", async () => {
    state.shareRule = els.shareRule.value;
    await render();
  });

  els.fromPeriod?.addEventListener("change", async () => {
    state.fromPeriodKey = els.fromPeriod.value;
    await render();
  });

  els.toPeriod?.addEventListener("change", async () => {
    state.toPeriodKey = els.toPeriod.value;
    await render();
  });

  els.btnShowRange?.addEventListener("click", async () => {
    state.isRangeView = true;
    state.isYearView = false;
    state.selectedPeriodKey = null;
    await render();
  });

  els.btnClearRange?.addEventListener("click", async () => {
    state.isRangeView = false;
    await render();
  });


  els.periodList?.addEventListener("click", async (e) => {
    // klik na GODINU: toggle YEAR/MONTH
    const yearClick = e.target.closest("[data-cal='year']");
    if (yearClick) {
      state.isRangeView = false;
      state.isYearView = !state.isYearView;
      state.selectedPeriodKey = state.isYearView ? null : state.selectedPeriodKey;
      await render();
      return;
    }

    // strelice: mijenjaju godinu u kalendaru
    const prev = e.target.closest("[data-cal='prev']");
    const next = e.target.closest("[data-cal='next']");
    if (prev) { state.selectedCalendarYear--; await render(); return; }
    if (next) { state.selectedCalendarYear++; await render(); return; }

    // klik na MJESEC: MONTH view
    const cell = e.target.closest(".monthCell");
    if (!cell || cell.classList.contains("is-disabled")) return;

    const month = Number(cell.dataset.month);
    state.isRangeView = false;
    state.isYearView = false;
    state.selectedPeriodKey = keyFromPeriod(state.selectedCalendarYear, month);
    await render();
  });

  els.btnPrint?.addEventListener("click", () => printToPdf());
}

attachEvents();
render();
