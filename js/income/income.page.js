// js/income/income.page.js
import { dbGetAll, dbGetOneByIndex, dbPutOne, makeId } from "../db/db.js";
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { debug } from "../shared/log.js";
import { renderYearCalendar, setLoading, showError, withLoading } from "../shared/ui.js";
import { periodLabel } from "../shared/parseFilename.js";
import {
    renderIncomeSummary,
    renderIncomeItemsTable,
    renderIncomeByApt
} from "./income.ui.js";

console.log("[income.js] loaded manual-income-v1", new Date().toISOString());
window.__incomeLoaded = true;

const els = {
    modal: document.getElementById("incomeModal"),
    btnOpenModal: document.getElementById("btnOpenIncomeModal"),

    incAddApt: document.getElementById("incAddApt"),
    incAddAmount: document.getElementById("incAddAmount"),
    incAddPlatform: document.getElementById("incAddPlatform"),
    incAddCheckin: document.getElementById("incAddCheckin"),
    incAddCheckout: document.getElementById("incAddCheckout"),
    incAddNights: document.getElementById("incAddNights"),
    incAddNote: document.getElementById("incAddNote"),
    btnAddIncomeItem: document.getElementById("btnAddIncomeItem"),

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

function nightsFromDates(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const a = safeDate(checkin);
    const b = safeDate(checkout);
    if (!a || !b) return 0;

    const ms = b.getTime() - a.getTime();
    const n = Math.round(ms / (1000 * 60 * 60 * 24));
    return n > 0 ? n : 0;
}

function periodFromInputsOrSelected(checkinStr) {
    // 1) Ako imamo checkin → uzmi year/month iz checkin datuma
    if (checkinStr) {
        const d = safeDate(checkinStr);
        if (d) {
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
    }

    // 2) Ako je korisnik u MONTH view (selectedPeriodKey) → uzmi taj period
    if (state.selectedPeriodKey) {
        return periodKeyToYM(state.selectedPeriodKey);
    }

    // 3) Inače nema dovoljno info
    return null;
}

// Modal open/close helpers (hoisted to top-level so they can be used from handlers)
function openModal() {
    els.modal?.classList.remove("is-hidden");
    els.modal?.setAttribute("aria-hidden", "false");
    // fokus na iznos
    setTimeout(() => els.incAddAmount?.focus(), 0);
}

function closeModal() {
    els.modal?.classList.add("is-hidden");
    els.modal?.setAttribute("aria-hidden", "true");
}

// Ensure an import record exists for the given period (year, month)
async function ensureImportPeriod(year, month) {
    const existing = await dbGetOneByIndex("imports", "by_period", [year, month]);
    if (existing) return;

    // bitno: id mora biti stabilan i unikatan
    await dbPutOne("imports", {
        id: `manual_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,
        source: "MANUAL",
        created_at: new Date().toISOString(),
    });
}

function round2(x) {
    return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

// GROSS = kompletan iznos rezervacije (tvoj unos)
function splitN(gross) {
    const G = Number(gross || 0);
    if (!Number.isFinite(G) || G <= 0) {
        return { gross: 0, my: 0, owner: 0, cleaning: 0, base: 0 };
    }

    const cleaning = 10;
    const base = Math.max(0, G - cleaning);
    const my = cleaning + 0.25 * base;   // 10 + 25% od (G-10)
    const owner = G - my;

    return {
        gross: round2(G),
        cleaning: round2(cleaning),
        base: round2(base),
        my: round2(my),
        owner: round2(owner),
    };
}

async function upsertNCommission(year, month, addedGross) {
    const existing = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

    const prevGross = Number(existing?.incomeN_eur_total || 0) || 0;
    const newGross = prevGross + (Number(addedGross || 0) || 0);

    const s = splitN(newGross);

    await dbPutOne("n_commission", {
        id: existing?.id || `ncomm_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,
        incomeN_eur_total: s.gross,   // ukupan gross za mjesec
        commission_eur: s.my,         // tvoja zarada (10 + 25% od (gross-10))

        // optional (ne smeta ako postoji):
        owner_eur: s.owner,
        cleaning_eur: s.cleaning,

        updated_at: new Date().toISOString(),
    });
}

async function handleAddIncomeItem() {
    debug("CLICK add income item");

    const apartment = els.incAddApt?.value || "A";
    const amount = Number(els.incAddAmount?.value || 0);
    const platform = els.incAddPlatform?.value || "";
    const checkin = els.incAddCheckin?.value || "";
    const checkout = els.incAddCheckout?.value || "";
    const note = (els.incAddNote?.value || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
        alert("Unesi ispravan iznos (EUR).");
        return;
    }

    const period = periodFromInputsOrSelected(checkin);
    if (!period) {
        alert("Odaberi mjesec u kalendaru (MONTH view) ili unesi check-in datum da se odredi period.");
        return;
    }

    // Nights: prefer ručni unos, inače iz datuma
    let nights = 0;
    const nightsInputRaw = els.incAddNights?.value;
    const hasManualNights = (nightsInputRaw !== "" && nightsInputRaw != null);

    if (hasManualNights) {
        const nn = Number(nightsInputRaw);
        nights = Number.isFinite(nn) ? Math.max(0, Math.round(nn)) : 0;
    } else {
        if (checkin && checkout) {
            const a = safeDate(checkin);
            const b = safeDate(checkout);
            if (a && b && b.getTime() <= a.getTime()) {
                alert("Check-out mora biti poslije check-in datuma.");
                return;
            }
        }
        nights = nightsFromDates(checkin, checkout);
    }

    if (!hasManualNights && (!checkin || !checkout)) {
        alert("Napomena: Nisu uneseni check-in/check-out i noćenja. Prihod će biti snimljen sa 0 noćenja.");
    }

    const item = {
        id: makeId("incit"),
        year: period.year,
        month: period.month,
        apartment,
        amount_eur: round2(amount),
        nights,
        checkin: checkin || null,
        checkout: checkout || null,
        platform,
        note,
        source: "Manual",
        created_at: new Date().toISOString(),
    };

    try {
        // 1) upiši item
        await dbPutOne("income_items", item);

        // 2) da se mjesec vidi na homepage-u
        await ensureImportPeriod(period.year, period.month);

        // 3) N logika: gross ide u n_commission (sabira po mjesecu + formula)
        if (apartment === "N") {
            await upsertNCommission(period.year, period.month, item.amount_eur);
        }

        // očisti polja
        els.incAddAmount.value = "";
        els.incAddCheckin.value = "";
        els.incAddCheckout.value = "";
        els.incAddNights.value = "";
        els.incAddNote.value = "";

        // zatvori modal nakon uspješnog snimanja prije refresha UI-a
        closeModal();
        await render();
    } catch (e) {
        console.error(e);
        alert(e?.message || "Greška pri snimanju prihoda.");
    }
}

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

function computeSums(filteredMonthly, filteredItems, nCommission) {
    const sumsAZN = {
        A: { income: 0, nights: 0 },
        Z: { income: 0, nights: 0 },
        N: { income: 0, nights: 0 },
    };

    // ✅ Ključno: nema dupliranja
    const useItems = Array.isArray(filteredItems) && filteredItems.length > 0;

    if (useItems) {
        // Sum from income_items (xlsx items + future manual)
        for (const it of filteredItems || []) {
            if (!sumsAZN[it.apartment]) continue;

            sumsAZN[it.apartment].income += Number(it.amount_eur || 0) || 0;

            let n = 0;
            if (it.nights != null && it.nights !== "") {
                const nn = Number(it.nights);
                n = Number.isFinite(nn) ? nn : 0;
            } else {
                n = nightsFromDates(it.checkin, it.checkout);
            }
            sumsAZN[it.apartment].nights += n;
        }
    } else {
        // Fallback: sum from income_monthly
        for (const r of filteredMonthly || []) {
            if (!sumsAZN[r.apartment]) continue;
            sumsAZN[r.apartment].income += Number(r.income_eur || 0) || 0;
            sumsAZN[r.apartment].nights += Number(r.nights || 0) || 0;
        }
    }

    // N breakdown from n_commission (ukupan N + moja provizija)
    const nBreakdown = { income_total: 0, my_commission: 0, owner: 0 };

    // periode skupljamo iz izvora koji koristimo (items ili monthly)
    const periodKeys = new Set();
    if (useItems) {
        for (const it of filteredItems || []) {
            if (it.apartment === "N") periodKeys.add(`${it.year}-${String(it.month).padStart(2, "0")}`);
        }
    } else {
        for (const r of filteredMonthly || []) {
            if (r.apartment === "N") periodKeys.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
        }
    }

    for (const key of periodKeys) {
        const [year, month] = key.split("-").map(Number);
        const comm = (nCommission || []).find(c => c.year === year && c.month === month);
        if (comm) {
            nBreakdown.income_total += Number(comm.incomeN_eur_total || 0) || 0;
            nBreakdown.my_commission += Number(comm.commission_eur || 0) || 0;
        }
    }

    nBreakdown.owner = Math.max(0, nBreakdown.income_total - nBreakdown.my_commission);

    // N u “by apt” pokazuje moju proviziju
    sumsAZN.N.income = nBreakdown.my_commission;

    // TOTAL: A + Z + ukupan N (gross)
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
    const { sumsAZN, nBreakdown, total } = computeSums(filteredMonthly, filteredItems, data.nCommission);

    // Status tekst
    const useItems = filteredItems.length > 0;
    const itemCount = useItems ? filteredItems.length : filteredMonthly.length;

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
        await withLoading(async () => { await render(); });
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

            await withLoading(async () => { await render(); });
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

            await withLoading(async () => { await render(); });
            return;
        }

        const cell = e.target.closest(".monthCell");
        if (!cell) return;
        if (cell.classList.contains("is-disabled")) return;

        const m = Number(cell.dataset.month);
        state.isYearView = false;
        state.selectedPeriodKey = keyFromPeriod(state.selectedCalendarYear, m);
        await withLoading(async () => { await render(); });
    });

    els.btnOpenModal?.addEventListener("click", openModal);

    els.modal?.addEventListener("click", (e) => {
        if (e.target.closest("[data-modal-close]")) closeModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && els.modal && !els.modal.classList.contains("is-hidden")) {
            closeModal();
        }
    });
    console.log("btnAddIncomeItem:", els.btnAddIncomeItem);
    els.btnAddIncomeItem?.addEventListener("click", handleAddIncomeItem);

}

attach();
withLoading(async () => { await render(); });
