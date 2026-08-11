// js/app/home.events.js
import { keyFromPeriod, periodKeyToYM } from "../shared/utils.js";
import { showPop, hidePops, setPickerLabel } from "./home.ui.js";
import { loadPeriodData } from "./home.data.js";
import { dbGetAll, dbDeleteByIndex } from "../db/db.js";
import { state } from "../shared/state.js";
import { setShareRule } from "../shared/settings.js";
import { periodLabel } from "../shared/parseFilename.js";
import { printMonthlyReport } from "./report-print.action.js";
import { saveReportContext } from "./report-context.js";
import { apartmentsListAll } from "../shared/apartments.service.js"; // regression guard: owner metadata source remains full registry

export function attachEvents(els, handlers) {
  const { render, handleImport, exportBackup, restoreBackupFile } = handlers;

  // RANGE popover open
  els.fromBtn?.addEventListener("click", (e) => { e.stopPropagation(); showPop(els, "FROM"); });
  els.toBtn?.addEventListener("click", (e) => { e.stopPropagation(); showPop(els, "TO"); });

  // click outside closes
  document.addEventListener("click", () => hidePops(els));
  els.fromPop?.addEventListener("click", (e) => e.stopPropagation());
  els.toPop?.addEventListener("click", (e) => e.stopPropagation());

  // FROM pop: prev/next year + month pick
  els.fromPop?.addEventListener("click", async (e) => {
    const prev = e.target.closest("[data-cal='prev']");
    const next = e.target.closest("[data-cal='next']");
    if (prev || next) {
      state.rangeFromYear += prev ? -1 : 1;
      await render();
      return;
    }

    const cell = e.target.closest(".monthCell");
    if (!cell || cell.classList.contains("is-disabled")) return;

    const m = Number(cell.dataset.month);
    state.fromPeriodKey = keyFromPeriod(state.rangeFromYear, m);
    setPickerLabel(els.fromBtn, state.fromPeriodKey);
    hidePops(els);
  });

  // TO pop: prev/next year + month pick
  els.toPop?.addEventListener("click", async (e) => {
    const prev = e.target.closest("[data-cal='prev']");
    const next = e.target.closest("[data-cal='next']");
    if (prev || next) {
      state.rangeToYear += prev ? -1 : 1;
      await render();
      return;
    }

    const cell = e.target.closest(".monthCell");
    if (!cell || cell.classList.contains("is-disabled")) return;

    const m = Number(cell.dataset.month);
    state.toPeriodKey = keyFromPeriod(state.rangeToYear, m);
    setPickerLabel(els.toBtn, state.toPeriodKey);
    hidePops(els);
  });

  // RANGE actions
  els.btnShowRange?.addEventListener("click", async () => {
    state.isRangeView = true;
    state.isYearView = false;
    state.selectedPeriodKey = null;
    await render();
  });

  els.btnClearRange?.addEventListener("click", async () => {
    state.isRangeView = false;

    const imports = await dbGetAll("imports");
    imports.sort((a, b) => a.year - b.year || a.month - b.month);
    const last = imports[imports.length - 1];
    if (last) {
      state.selectedCalendarYear = last.year;
      state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
    }
    await render();
  });

  // Topbar backup/export
  els.btnBackup?.addEventListener("click", async () => {
    try { await exportBackup(); }
    catch (e) { console.error(e); alert(e.message || "Backup greška"); }
  });

  // Restore file input
  els.backupInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await restoreBackupFile(file); }
    catch (err) { console.error(err); alert(err.message || "Restore greška"); }
    finally { els.backupInput.value = ""; }
  });

  // Import XLSX input
  els.fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await handleImport(file); }
    catch (err) { console.error(err); alert(err.message || "Greška pri importu."); }
    finally { els.fileInput.value = ""; }
  });

  // Filters
  els.aptFilter?.addEventListener("change", async () => {
    state.aptFilter = els.aptFilter.value;
    saveReportContext({ selectedPeriodKey: state.selectedPeriodKey, aptFilter: state.aptFilter });
    await render();
  });

  els.shareRule?.addEventListener("change", async () => {
    const val = els.shareRule.value;
    setShareRule(val);
    state.shareRule = val;
    await render();
  });

  // Sidebar calendar click
  els.periodList?.addEventListener("click", async (e) => {
    const yearClick = e.target.closest("[data-cal='year']");
    if (yearClick) {
      state.isRangeView = false;
      state.isYearView = !state.isYearView;
      if (state.isYearView) state.selectedPeriodKey = null;
      await render();
      return;
    }

    const prev = e.target.closest("[data-cal='prev']");
    const next = e.target.closest("[data-cal='next']");
    if (prev) { state.selectedCalendarYear--; await render(); return; }
    if (next) { state.selectedCalendarYear++; await render(); return; }

    const cell = e.target.closest(".monthCell");
    if (!cell || cell.classList.contains("is-disabled")) return;

    const month = Number(cell.dataset.month);
    state.isRangeView = false;
    state.isYearView = false;
    state.selectedPeriodKey = keyFromPeriod(state.selectedCalendarYear, month);
    saveReportContext({ selectedPeriodKey: state.selectedPeriodKey, aptFilter: state.aptFilter });
    await render();
  });

  // Print
  els.btnPrint?.addEventListener("click", async () => {
    try {
      await printMonthlyReport({
        selectedPeriodKey: state.selectedPeriodKey,
        aptFilter: state.aptFilter,
        shareRule: state.shareRule,
      });
    } catch (err) {
      console.error(err);
      alert(err?.message || "Greška prilikom pripreme PDF-a.");
    }
  });

  // Mobile mirror events
  els.mBtnBackup?.addEventListener("click", async () => {
    try { await exportBackup(); }
    catch (e) { console.error(e); alert(e.message || "Backup greška"); }
  });

  els.mBackupInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await restoreBackupFile(file); }
    catch (err) { console.error(err); alert(err.message || "Restore greška"); }
    finally { els.mBackupInput.value = ""; }
  });

  els.mFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await handleImport(file); }
    catch (err) { console.error(err); alert(err.message || "Greška pri importu."); }
    finally { els.mFileInput.value = ""; }
  });

  els.mBtnPrint?.addEventListener("click", () => printToPdf());
}
