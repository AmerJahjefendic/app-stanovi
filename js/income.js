// js/income.js
import { dbGetAll } from "./db.js";
import { keyFromPeriod, periodKeyToYM } from "./utils.js";
import { renderYearCalendar } from "./ui.js";
import { periodLabel } from "./parseFilename.js";
import {
    renderIncomeSummary,
    renderIncomeItemsTable,
    renderIncomeByApt
} from "./incomeUi.js";

const els = {
    calendar: document.getElementById("incCalendar"),
    status: document.getElementById("incStatus"),
    incApt: document.getElementById("incApt"),
    summary: document.getElementById("incSummary"),
    itemsTable: document.getElementById("incItemsTable"),
    byApt: document.getElementById("incByApt"),
    btnToggleItems: document.getElementById("btnToggleIncItems"),
    itemsWrap: document.getElementById("incItemsWrap"),
};

const state = {
    apt: "ALL",
    selectedCalendarYear: null,
    selectedPeriodKey: null,
    isYearView: false,
};

// ---------- helpers ----------

async function load() {
    const [incomeMonthly, incomeItems, nCommission, imports] = await Promise.all([
        dbGetAll("income_monthly"),
        dbGetAll("income_items").catch(() => []), // fallback if store doesn't exist
        dbGetAll("n_commission"),
        dbGetAll("imports"),
    ]);

    return { incomeMonthly, incomeItems, nCommission, imports };
}

function applyFilters(data, aptFilter) {
    const { incomeMonthly, incomeItems } = data;

    let filteredMonthly = incomeMonthly;
    let filteredItems = incomeItems;

    // PERIOD FILTER
    if (state.selectedPeriodKey) {
        // MONTH view
        const { year, month } = periodKeyToYM(state.selectedPeriodKey);
        filteredMonthly = filteredMonthly.filter(r => r.year === year && r.month === month);
        filteredItems = filteredItems.filter(r => r.year === year && r.month === month);
    } else if (state.isYearView && state.selectedCalendarYear) {
        // YEAR view
        filteredMonthly = filteredMonthly.filter(r => r.year === state.selectedCalendarYear);
        filteredItems = filteredItems.filter(r => r.year === state.selectedCalendarYear);
    }

    // APT FILTER
    if (aptFilter !== "ALL") {
        filteredMonthly = filteredMonthly.filter(r => r.apartment === aptFilter);
        filteredItems = filteredItems.filter(r => r.apartment === aptFilter);
    }

    return { filteredMonthly, filteredItems };
}

function computeSums(filteredMonthly, nCommission) {
    const sumsAZN = {
        A: { income: 0, nights: 0 },
        Z: { income: 0, nights: 0 },
        N: { income: 0, nights: 0 },
    };

    // Sum from income_monthly
    for (const r of filteredMonthly) {
        if (sumsAZN[r.apartment]) {
            sumsAZN[r.apartment].income += Number(r.income_eur || 0);
            sumsAZN[r.apartment].nights += Number(r.nights || 0);
        }
    }

    // N breakdown from n_commission (ukupan N + moja provizija)
    const nBreakdown = { income_total: 0, my_commission: 0, owner: 0 };
    const periodKeys = new Set();

    // Collect period keys for N from filteredMonthly
    for (const r of filteredMonthly) {
        if (r.apartment === "N") {
            periodKeys.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
        }
    }

    for (const key of periodKeys) {
        const [year, month] = key.split("-").map(Number);
        const comm = nCommission.find(c => c.year === year && c.month === month);
        if (comm) {
            nBreakdown.income_total += Number(comm.incomeN_eur_total || 0);
            nBreakdown.my_commission += Number(comm.commission_eur || 0);
        }
    }

    nBreakdown.owner = Math.max(0, nBreakdown.income_total - nBreakdown.my_commission);

    // ✅ Da "Prihodi po apartmanu" za N pokaže MOJU proviziju (logično i konzistentno)
    sumsAZN.N.income = nBreakdown.my_commission;

    // TOTAL prihod (gross): A + Z + ukupan N (ne samo provizija)
    const total = {
        income: sumsAZN.A.income + sumsAZN.Z.income + nBreakdown.income_total,
        nights: sumsAZN.A.nights + sumsAZN.Z.nights + sumsAZN.N.nights,
    };

    return { sumsAZN, nBreakdown, total };
}

async function render() {
    const data = await load();

    // ===== Calendar init + render =====
    data.imports.sort((a, b) => a.year - b.year || a.month - b.month);

    // default godina kalendara
    if (!state.selectedCalendarYear) {
        state.selectedCalendarYear = data.imports.length
            ? data.imports[data.imports.length - 1].year
            : new Date().getFullYear();
    }

    // default odabrani mjesec (zadnji importovani) - samo ako nismo u year view
    if (!state.selectedPeriodKey && !state.isYearView && data.imports.length) {
        const last = data.imports[data.imports.length - 1];
        state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
    }

    // set mjeseci koji postoje za tu godinu
    const monthsSet = new Set(
        data.imports
            .filter(i => i.year === state.selectedCalendarYear)
            .map(i => i.month)
    );

    renderYearCalendar(els.calendar, {
        year: state.selectedCalendarYear,
        importedMonthsSet: monthsSet,
        selectedKey: state.selectedPeriodKey,
        isYearView: state.isYearView,
    });

    const { filteredMonthly, filteredItems } = applyFilters(data, state.apt);
    const { sumsAZN, nBreakdown, total } = computeSums(filteredMonthly, data.nCommission);

    // Status tekst
    const itemCount = filteredItems.length || filteredMonthly.length;

    if (state.selectedPeriodKey) {
        const { year, month } = periodKeyToYM(state.selectedPeriodKey);
        els.status.textContent = `Period: ${periodLabel({ year, month })} — Stavki: ${itemCount}`;
    } else {
        const y = state.selectedCalendarYear || new Date().getFullYear();
        els.status.textContent = `Godina: ${y} — Stavki: ${itemCount}`;
    }

    renderIncomeSummary(els.summary, { sumsAZN, nBreakdown, total });

    // Ako nema income_items, fallback na income_monthly kao “sumarne stavke”
    const itemsForTable = filteredItems.length
        ? filteredItems
        : filteredMonthly.map(r => ({
            ...r,
            amount_eur: r.income_eur,
            note: `Sumarni prihod (${r.source || "nepoznato"})`
        }));

    renderIncomeItemsTable(els.itemsTable, itemsForTable);
    renderIncomeByApt(els.byApt, sumsAZN);
}

function attach() {

    els.btnToggleItems?.addEventListener("click", () => {
        const isHidden = els.itemsWrap.classList.toggle("is-collapsed");
        els.btnToggleItems.textContent = isHidden ? "Prikaži" : "Sakrij";
    });

    els.incApt?.addEventListener("change", async () => {
        state.apt = els.incApt.value;
        await render();
    });

    els.calendar?.addEventListener("click", async (e) => {
        const yearClick = e.target.closest("[data-cal='year']");
        if (yearClick) {
            state.isYearView = !state.isYearView;

            if (state.isYearView) {
                // ✅ ulaz u YEAR VIEW: obavezno očisti selektovani mjesec
                state.selectedPeriodKey = null;
            } else {
                // izlaz u MONTH VIEW: odaberi zadnji importovani mjesec u toj godini (ako postoji)
                const { imports } = await load();
                const inYear = imports
                    .filter(i => i.year === state.selectedCalendarYear)
                    .sort((a, b) => a.month - b.month);

                if (inYear.length) {
                    const last = inYear[inYear.length - 1];
                    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
                } else {
                    state.selectedPeriodKey = null;
                }
            }

            await render();
            return;
        }

        const prev = e.target.closest("[data-cal='prev']");
        const next = e.target.closest("[data-cal='next']");
        if (prev || next) {
            state.selectedCalendarYear += prev ? -1 : 1;

            const { imports } = await load();
            const inYear = imports
                .filter(i => i.year === state.selectedCalendarYear)
                .sort((a, b) => a.month - b.month);

            if (state.isYearView) {
                // ✅ u YEAR VIEW: ne biraj mjesec
                state.selectedPeriodKey = null;
            } else {
                // MONTH VIEW: auto-odaberi zadnji importovani mjesec u toj godini
                if (inYear.length) {
                    const last = inYear[inYear.length - 1];
                    state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
                } else {
                    state.selectedPeriodKey = null;
                }
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
}

attach();
render();
