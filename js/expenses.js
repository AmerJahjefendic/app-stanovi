// js/expenses.js
import { keyFromPeriod, periodKeyToYM } from "./utils.js";
import { renderYearCalendar } from "./ui.js";
import { dbGetAll, dbPutCategoryAlias, dbPutOne, makeId } from "./db.js";
import { periodLabel } from "./parseFilename.js";
import { loadCategoryAliases, mapExpenseCategory } from "./mappingConfig.js";
import { renderYearBreakdownTable } from "./expensesUi.js";
import {
    renderExpensesByCategory,
    renderExpensesList,
    renderExpenseFilters,
} from "./expensesUi.js";

const els = {
    calendar: document.getElementById("expCalendar"),

    // ===== MODAL elements =====
    btnOpenExpenseModal: document.getElementById("btnOpenExpenseModal"),
    expModal: document.getElementById("expModal"),
    btnCloseExpenseModal: document.getElementById("btnCloseExpenseModal"),
    btnCancelExpense: document.getElementById("btnCancelExpense"),
    btnSaveExpense: document.getElementById("btnSaveExpense"),

    expAddAmountBam: document.getElementById("expAddAmountBam"),
    expAddCategory: document.getElementById("expAddCategory"),
    btnAddCategory: document.getElementById("btnAddCategory"),
    expAddScope: document.getElementById("expAddScope"),
    expAptWrap: document.getElementById("expAptWrap"),
    expAddApt: document.getElementById("expAddApt"),
    expAddDate: document.getElementById("expAddDate"),
    expAddNote: document.getElementById("expAddNote"),

    status: document.getElementById("expStatus"),
    expApt: document.getElementById("expApt"),
    expCat: document.getElementById("expCat"),
    byCat: document.getElementById("expByCat"),
    list: document.getElementById("expList"),

    yearBreakdown: document.getElementById("yearBreakdown"),
    yearBreakdownTable: document.getElementById("yearBreakdownTable"),

    listWrap: document.getElementById("expListWrap"),
    listToggle: document.getElementById("expListToggle"),

    mergeFrom: document.getElementById("mergeFrom"),
    mergeTo: document.getElementById("mergeTo"),
    mergeSave: document.getElementById("mergeSave"),
    mergeMsg: document.getElementById("mergeMsg"),
};
// Debug log removed

const state = {
    apt: "ALL",
    cat: "ALL",
    selectedCalendarYear: null,
    selectedPeriodKey: null,
    isYearView: false,
};

// ---------- helpers ----------
function normCat(exp) {
    const raw =
        (exp.category && String(exp.category).trim()) ? String(exp.category).trim()
            : (exp.raw_category && String(exp.raw_category).trim()) ? String(exp.raw_category).trim()
                : "NEPOZNATO";
    return mapExpenseCategory(raw);
}

function periodKey(y, m) {
    return `${y}-${String(m).padStart(2, "0")}`;
}

function getShareRule() {
    const direct =
        localStorage.getItem("shareRule") ||
        localStorage.getItem("appstanovi_shareRule");

    if (direct === "INCOME" || direct === "NIGHTS") return direct;
    return "NIGHTS";
}

function buildYearSeries(expenses, year, category, apt) {
    const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, eur: 0 }));

    for (const e of expenses) {
        if (e.year !== year) continue;
        if (apt !== "ALL" && e.apartment !== apt) continue;
        if (category !== "ALL" && e.category !== category) continue;

        out[e.month - 1].eur += Number(e.amount_eur || 0);
    }
    return out;
}

function buildIncomeMap(incomeMonthlyRows) {
    const map = new Map();
    for (const r of incomeMonthlyRows) {
        if (r.apartment !== "A" && r.apartment !== "Z") continue;

        const key = periodKey(r.year, r.month);
        if (!map.has(key)) {
            map.set(key, {
                A: { income: 0, nights: 0 },
                Z: { income: 0, nights: 0 },
            });
        }
        const slot = map.get(key)[r.apartment];
        slot.income += Number(r.income_eur || 0);
        slot.nights += Number(r.nights || 0);
    }
    return map;
}

function splitSharedExpense(exp, az, shareRule) {
    const aBase = shareRule === "INCOME" ? az.A.income : az.A.nights;
    const zBase = shareRule === "INCOME" ? az.Z.income : az.Z.nights;
    const denom = aBase + zBase;

    const ratioA = denom > 0 ? aBase / denom : 0.5;
    const ratioZ = 1 - ratioA;

    const amount = Number(exp.amount_eur || 0);
    const base = { ...exp, scope: "SHARED_SPLIT", derived_from: exp.id };

    return [
        { ...base, apartment: "A", amount_eur: amount * ratioA },
        { ...base, apartment: "Z", amount_eur: amount * ratioZ },
    ];
}

function buildRenderableExpenses(rawExpenses, incomeMonthlyRows, shareRule) {
    const incMap = buildIncomeMap(incomeMonthlyRows);
    const out = [];

    for (const e of rawExpenses) {
        if (e.scope === "SHARED") {
            const key = periodKey(e.year, e.month);
            const az = incMap.get(key) || { A: { income: 0, nights: 0 }, Z: { income: 0, nights: 0 } };
            out.push(...splitSharedExpense(e, az, shareRule));
        } else {
            out.push(e);
        }
    }
    return out;
}

function round2(x) {
    return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

// FX: 1 EUR = 1.95583 BAM (default). Možeš kasnije staviti settings.
const FX_KEY = "fxRateBamPerEur";
function getFxRate() {
    const v = Number(localStorage.getItem(FX_KEY));
    return Number.isFinite(v) && v > 0 ? v : 1.95583;
}

function openModal() {
    els.expModal?.classList.remove("is-hidden");
    els.expModal?.setAttribute("aria-hidden", "false");
    setTimeout(() => els.expAddAmountBam?.focus(), 0);
}

function closeModal() {
    els.expModal?.classList.add("is-hidden");
    els.expModal?.setAttribute("aria-hidden", "true");
}

function syncScopeUI() {
    const sc = els.expAddScope?.value || "SHARED";
    const showApt = sc === "APARTMENT";
    els.expAptWrap?.classList.toggle("is-hidden", !showApt);
}

// period: iz date ako postoji, inače iz izabranog mjeseca (MONTH view)
function periodFromDateOrSelected(dateStr) {
    if (dateStr) {
        const d = new Date(dateStr);
        if (Number.isFinite(d.getTime())) {
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
    }
    if (state.selectedPeriodKey) return periodKeyToYM(state.selectedPeriodKey);
    return null;
}

async function ensureImportPeriod(year, month) {
    const imports = await dbGetAll("imports");
    const exists = imports.some(i => i.year === year && i.month === month);
    if (exists) return;

    await dbPutOne("imports", {
        id: makeId("imp"),
        year,
        month,
        filename: "MANUAL",
        imported_at: new Date().toISOString(),
    });
}

// kategorije: čuvamo u localStorage da radi "Dodaj kategoriju"
const CAT_KEY = "expenseCategories";
function getCategoriesLocal() {
    try {
        const arr = JSON.parse(localStorage.getItem(CAT_KEY) || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}
function saveCategoriesLocal(arr) {
    localStorage.setItem(CAT_KEY, JSON.stringify(arr));
}
function uniqueSorted(arr) {
    return [...new Set((arr || []).map(x => String(x || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "bs"));
}

function handleAddCategory() {
    const name = prompt("Unesi naziv nove kategorije:");
    if (!name) return;
    const cat = String(name).trim();
    if (!cat) return;

    const cats = uniqueSorted([...getCategoriesLocal(), cat]);
    saveCategoriesLocal(cats);

    // refresh oba selecta (filter + modal)
    renderExpenseFilters(els.expCat, cats, state.cat);
    renderExpenseFilters(els.expAddCategory, cats, cat);
}

// ---------- data ----------
async function load() {
    const shareRule = getShareRule();
    const [rawExpenses, incomeMonthly] = await Promise.all([
        dbGetAll("expenses"),
        dbGetAll("income_monthly"),
    ]);

    const expenses = buildRenderableExpenses(rawExpenses, incomeMonthly, shareRule);
    return expenses.map((e) => ({ ...e, category: normCat(e) }));
}

function applyFilters(expenses) {
    return expenses.filter((e) => {
        // PERIOD FILTER
        if (state.selectedPeriodKey) {
            // MONTH view
            const { year, month } = periodKeyToYM(state.selectedPeriodKey);
            if (e.year !== year || e.month !== month) return false;
        } else if (state.selectedCalendarYear) {
            // YEAR view
            if (e.year !== state.selectedCalendarYear) return false;
        }

        // APT / CAT
        if (state.apt !== "ALL" && e.apartment !== state.apt) return false;
        if (state.cat !== "ALL" && normCat(e) !== state.cat) return false;

        return true;
    });
}

async function render() {
    const all = await load();

    // ===== Calendar init + render =====
    const imports = await dbGetAll("imports");
    imports.sort((a, b) => a.year - b.year || a.month - b.month);

    // default godina kalendara
    if (!state.selectedCalendarYear) {
        state.selectedCalendarYear = imports.length
            ? imports[imports.length - 1].year
            : new Date().getFullYear();
    }

    // default odabrani mjesec (zadnji importovani)
    if (!state.selectedPeriodKey && !state.isYearView && imports.length) {
        const last = imports[imports.length - 1];
        state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
    }

    // set mjeseci koji postoje za tu godinu (zelena/crvena)
    const monthsSet = new Set(
        imports
            .filter(i => i.year === state.selectedCalendarYear)
            .map(i => i.month)
    );

    // nacrtaj kalendar
    renderYearCalendar(els.calendar, {
        year: state.selectedCalendarYear,
        importedMonthsSet: monthsSet,
        selectedKey: state.selectedPeriodKey,
        isYearView: state.isYearView,
    });

    // ===== MERGE UI =====
    const catsAll = Array.from(new Set(all.map(e => normCat(e)))).sort();

    // ===== MODAL category dropdown =====
    const catsForSelect = uniqueSorted([
        ...catsAll,
        ...getCategoriesLocal(),
        "Čišćenje",
        "Održavanje",
        "Računi",
        "Potrošni materijal",
        "Ostalo",
    ]);

    saveCategoriesLocal(catsForSelect);

    // popuni modal kategorije (da nije prazan)
    renderExpenseFilters(els.expAddCategory, catsForSelect, els.expAddCategory?.value || "ALL");
    if (els.expAddCategory?.value === "ALL") {
        // da ne ostane ALL u modalu, selektuj prvu realnu
        els.expAddCategory.value = catsForSelect[0] || "Ostalo";
    }

    const prevFrom = els.mergeFrom.value || "ALL";
    const prevTo = els.mergeTo.value || "ALL";

    renderExpenseFilters(els.mergeFrom, catsAll, prevFrom);
    renderExpenseFilters(els.mergeTo, catsAll, prevTo);

    // ===== Filteri (kategorije zavise od apartmana) =====
    const forCats = all.filter(e => state.apt === "ALL" ? true : e.apartment === state.apt);
    renderExpenseFilters(els.expCat, forCats.map(e => normCat(e)), state.cat);

    const catSet = new Set(forCats.map(e => normCat(e)));
    if (state.cat !== "ALL" && !catSet.has(state.cat)) {
        state.cat = "ALL";
        els.expCat.value = "ALL";
    }

    const filtered = applyFilters(all);

    // YEAR breakdown tabela: samo u Year view i samo kad je izabrana kategorija
    const showYearTable = state.isYearView && state.cat !== "ALL";
    els.yearBreakdown.style.display = showYearTable ? "" : "none";

    if (showYearTable) {
        const year = state.selectedCalendarYear;
        const rows = buildYearSeries(all, year, state.cat, state.apt);
        renderYearBreakdownTable(els.yearBreakdownTable, rows);
    }

    // da li smo u MONTH ili YEAR view-u
    const isMonthView = !!state.selectedPeriodKey;

    if (isMonthView) {
        const { year, month } = periodKeyToYM(state.selectedPeriodKey);
        els.status.textContent =
            `Period: ${periodLabel({ year, month })} — Stavki: ${filtered.length}`;
    } else {
        const y = state.selectedCalendarYear || new Date().getFullYear();
        els.status.textContent =
            `Godina: ${y} (svi mjeseci) — Stavki: ${filtered.length}`;
    }

    // YEAR view → sakrij listu po defaultu
    if (!isMonthView && els.listWrap && els.listToggle) {
        els.listWrap.classList.add("is-hidden");
        els.listToggle.textContent = "Prikaži";
    }

    // MONTH view → pokaži listu
    if (isMonthView && els.listWrap && els.listToggle) {
        els.listWrap.classList.remove("is-hidden");
        els.listToggle.textContent = "Sakrij";
    }

    renderExpensesByCategory(els.byCat, filtered);
    renderExpensesList(els.list, filtered);
}

async function handleSaveExpense() {
    const amountBam = Number(els.expAddAmountBam?.value || 0);
    if (!Number.isFinite(amountBam) || amountBam <= 0) {
        alert("Unesi ispravan iznos (BAM).");
        return;
    }

    const categoryRaw = String(els.expAddCategory?.value || "").trim();
    if (!categoryRaw || categoryRaw === "ALL") {
        alert("Odaberi kategoriju.");
        return;
    }

    const scope = els.expAddScope?.value || "SHARED";
    const apartment = scope === "APARTMENT" ? (els.expAddApt?.value || "A") : null;

    const dateStr = els.expAddDate?.value || "";
    const period = periodFromDateOrSelected(dateStr);
    if (!period) {
        alert("Unesi datum ili odaberi mjesec u kalendaru (MONTH view) da se odredi period.");
        return;
    }

    const fx = getFxRate();
    const amountEur = round2(amountBam / fx);

    const item = {
        id: makeId("exp"),
        year: period.year,
        month: period.month,

        amount_bam: round2(amountBam),
        amount_eur: amountEur,

        scope,                 // "SHARED" / "APARTMENT"
        apartment,             // null ili "A"/"Z"/"N"

        raw_category: categoryRaw, // da imaš original
        category: categoryRaw,     // normCat će je kasnije mapirati
        date: dateStr || null,
        note: String(els.expAddNote?.value || "").trim(),
        source: "Manual",
        created_at: new Date().toISOString(),
    };

    try {
        await dbPutOne("expenses", item);
        await ensureImportPeriod(period.year, period.month);

        // reset inputa (ostavi scope + category radi brzog unosa)
        els.expAddAmountBam.value = "";
        els.expAddDate.value = "";
        els.expAddNote.value = "";

        closeModal();
        await render();
    } catch (e) {
        console.error(e);
        alert(e?.message || "Greška pri snimanju troška.");
    }
}

function attach() {
    els.listToggle?.addEventListener("click", async () => {
        state.listCollapsed = !state.listCollapsed;
        els.listWrap?.classList.toggle("is-hidden", state.listCollapsed);
        els.listToggle.textContent = state.listCollapsed ? "Prikaži" : "Sakrij";
    });

    els.expApt?.addEventListener("change", async () => {
        state.apt = els.expApt.value;
        await render();
    });

    els.expCat?.addEventListener("change", async () => {
        state.cat = els.expCat.value;
        await render();
    });

    // MERGE: samo jednom!
    els.mergeSave?.addEventListener("click", async () => {
        const from = els.mergeFrom.value;
        const to = els.mergeTo.value;

        if (!from || !to || from === "ALL" || to === "ALL") {
            els.mergeMsg.textContent = "Izaberi FROM i TO.";
            return;
        }
        if (from === to) {
            els.mergeMsg.textContent = "FROM i TO ne mogu biti isti.";
            return;
        }

        await dbPutCategoryAlias(from, to);
        await loadCategoryAliases(); // refresh cache u mappingConfig
        els.mergeMsg.textContent = `OK: "${from}" → "${to}"`;
        await render();
    });

    els.calendar?.addEventListener("click", async (e) => {
        const yearClick = e.target.closest("[data-cal='year']");
        if (yearClick) {
            state.isYearView = true;
            state.selectedPeriodKey = null; // YEAR view (cijela godina)
            await render();
            return;
        }
        const prev = e.target.closest("[data-cal='prev']");
        const next = e.target.closest("[data-cal='next']");

        if (prev || next) {
            state.selectedCalendarYear += prev ? -1 : 1;

            // kad promijeniš godinu, auto-odaberi zadnji importovani mjesec u toj godini (ako postoji)
            const imports = await dbGetAll("imports");
            const inYear = imports
                .filter(i => i.year === state.selectedCalendarYear)
                .sort((a, b) => a.month - b.month);

            if (inYear.length) {
                const last = inYear[inYear.length - 1];
                state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
            } else {
                state.selectedPeriodKey = null; // nema podataka u toj godini
            }

            await render();
            return;
        }

        const cell = e.target.closest(".monthCell");
        if (!cell) return;
        if (cell.classList.contains("is-disabled")) return;

        const m = Number(cell.dataset.month);
        state.isYearView = false;
        state.selectedPeriodKey = keyFromPeriod(state.selectedCalendarYear, m);
        await render();
    });

    // Klik na kategoriju u tabeli -> toggle filter kategorije
    els.byCat?.addEventListener("click", async (e) => {
        const tr = e.target.closest("tr[data-cat]");
        if (!tr) return;

        const cat = tr.dataset.cat;
        if (!cat) return;

        // Ako je već filtrirano na ovu kategoriju, resetuj na ALL
        // Inače, filtriraj na ovu kategoriju
        if (state.cat === cat) {
            state.cat = "ALL";
            if (els.expCat) els.expCat.value = "ALL";
        } else {
            state.cat = cat;
            if (els.expCat) els.expCat.value = cat;
        }

        await render();
    });

    // ===== MODAL events =====
els.btnOpenExpenseModal?.addEventListener("click", () => {
  syncScopeUI();
  openModal();
});

els.btnCloseExpenseModal?.addEventListener("click", closeModal);
els.btnCancelExpense?.addEventListener("click", closeModal);

els.expModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close) closeModal();
});

els.expAddScope?.addEventListener("change", syncScopeUI);

els.btnAddCategory?.addEventListener("click", handleAddCategory);

els.btnSaveExpense?.addEventListener("click", handleSaveExpense);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.expModal && !els.expModal.classList.contains("is-hidden")) {
    closeModal();
  }
});

}

(async () => {
    await loadCategoryAliases();
    attach();
    render();
})();
