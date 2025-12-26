// js/expenses/expenses.page.js
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { renderYearCalendar, setLoading, showError, withLoading } from "../shared/ui.js";
import { dbGetAll, dbPutCategoryAlias, dbPutOne, makeId } from "../db/db.js";
import { periodLabel } from "../shared/parseFilename.js";
import { loadCategoryAliases, mapExpenseCategory } from "../shared/mappingConfig.js";
import { renderYearBreakdownTable } from "./expenses.ui.js";
import {
    renderExpensesByCategory,
    renderExpensesList,
    renderExpenseFilters,
} from "./expenses.ui.js";
import { APARTMENTS, SHARE_RULE, SCOPE, FX, LS_KEYS } from "../shared/constants.js";
import { getShareRule } from "../shared/settings.js";
const CAT_KEY = "appstanovi_expense_categories";

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
    byApt: document.getElementById("expByApt"),
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
    listCollapsed: true,
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

/**
 * Računa broj noćenja na osnovu checkin i checkout datuma
 * @param {string} checkin - Datum prijave (ISO format ili bilo koji validan datum string)
 * @param {string} checkout - Datum odjave (ISO format ili bilo koji validan datum string)
 * @returns {number} Broj noćenja (0 ako su datumi nevalidni ili checkout <= checkin)
 */
function nightsFromDates(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const a = safeDate(checkin);
    const b = safeDate(checkout);
    if (!a || !b) return 0;
    const n = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
    return n > 0 ? n : 0;
}

/**
 * Kreira godišnju seriju troškova po mjesecima (za year breakdown tabelu)
 * @param {Array<Object>} expenses - Niz svih troškova
 * @param {number} year - Godina za koju se pravi serija
 * @param {string} category - Filter kategorije ("ALL" ili naziv kategorije)
 * @param {string} apt - Filter apartmana ("ALL", "A", "Z", "N")
 * @returns {Array<{month: number, eur: number}>} Niz od 12 mjeseci sa sumama u EUR
 */
function buildYearSeries(expenses, year, category, apt) {
    const arr = Array.isArray(expenses) ? expenses : [];
    const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, eur: 0 }));

    for (const e of arr) {
        if (e.year !== year) continue;
        if (apt !== "ALL" && e.apartment !== apt) continue;
        if (category !== "ALL" && e.category !== category) continue;

        out[e.month - 1].eur += Number(e.amount_eur || 0);
    }
    return out;
}


/**
 * Kreira mapu prihoda i noćenja za A/Z apartmane po periodima (za dijeljenje shared troškova)
 * Prioritet: income_items > income_monthly
 * @param {Array<Object>} incomeMonthlyRows - Mjesečni prihodi iz income_monthly tabele
 * @param {Array<Object>} incomeItems - Detaljne stavke prihoda iz income_items tabele
 * @returns {Map<string, {A: {income: number, nights: number}, Z: {income: number, nights: number}}>} 
 *          Mapa gdje je ključ "YYYY-MM", vrijednost objekti sa podacima za A i Z apartmane
 */
function buildIncomeMap(incomeMonthlyRows, incomeItems) {
    const map = new Map();

    // Prvo uzimamo income_items ako postoje - imaju prioritet
    for (const item of incomeItems || []) {
        if (item.apartment !== APARTMENTS.A && item.apartment !== APARTMENTS.Z) continue;

        const key = periodKey(item.year, item.month);
        if (!map.has(key)) {
            map.set(key, {
                A: { income: 0, nights: 0 },
                Z: { income: 0, nights: 0 },
            });
        }

        const slot = map.get(key)[item.apartment];
        const amount = Number(item.amount_eur || item.income_eur || 0);
        slot.income += amount;

        // Noćenja: prefer explicit nights, fallback na checkin/checkout
        let n = 0;
        if (item.nights != null && item.nights !== "") {
            const nn = Number(item.nights);
            n = Number.isFinite(nn) ? nn : 0;
        } else {
            n = nightsFromDates(item.checkin, item.checkout);
        }
        slot.nights += n;
    }

    // Ako income_items nije dostupan ili je prazan, fallback na income_monthly
    for (const r of incomeMonthlyRows || []) {
        if (r.apartment !== APARTMENTS.A && r.apartment !== APARTMENTS.Z) continue;

        const key = periodKey(r.year, r.month);

        // Ako već postoje podaci iz income_items za ovaj period, preskačemo income_monthly
        if (map.has(key)) {
            const existing = map.get(key);
            const hasItems = existing.A.income > 0 || existing.Z.income > 0 ||
                existing.A.nights > 0 || existing.Z.nights > 0;
            if (hasItems) continue;
        }

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

/**
 * Dijeli SHARED trošak između A i Z apartmana po odabranom pravilu (INCOME ili NIGHTS)
 * @param {Object} exp - Trošak sa scope="SHARED"
 * @param {{A: {income: number, nights: number}, Z: {income: number, nights: number}}} az - Podaci o prihodima/noćenjima za A/Z
 * @param {string} shareRule - Pravilo dijeljenja: "INCOME" ili "NIGHTS"
 * @returns {Array<Object>} Dva nova troška (za A i za Z) sa proporcionalnim iznosima
 */
function splitSharedExpense(exp, az, shareRule) {
    const aBase = shareRule === SHARE_RULE.INCOME ? az.A.income : az.A.nights;
    const zBase = shareRule === SHARE_RULE.INCOME ? az.Z.income : az.Z.nights;
    const denom = aBase + zBase;

    const ratioA = denom > 0 ? aBase / denom : 0.5;
    const ratioZ = 1 - ratioA;

    const amount = Number(exp.amount_eur || 0);
    const base = { ...exp, scope: SCOPE.SHARED_SPLIT, derived_from: exp.id };

    return [
        { ...base, apartment: APARTMENTS.A, amount_eur: amount * ratioA },
        { ...base, apartment: APARTMENTS.Z, amount_eur: amount * ratioZ },
    ];
}

/**
 * Transformiše sirove troškove u prikazive troškove - dijeli SHARED troškove na A/Z
 * @param {Array<Object>} rawExpenses - Sirovi troškovi iz baze
 * @param {Array<Object>} incomeMonthlyRows - Mjesečni prihodi
 * @param {Array<Object>} incomeItems - Detaljne stavke prihoda
 * @param {string} shareRule - Pravilo dijeljenja: "INCOME" ili "NIGHTS"
 * @returns {Array<Object>} Troškovi gdje su SHARED troškovi podijeljeni na dva reda (A i Z)
 */
function buildRenderableExpenses(rawExpenses, incomeMonthlyRows, incomeItems, shareRule) {
    const incMap = buildIncomeMap(incomeMonthlyRows, incomeItems);
    const out = [];
    const src = Array.isArray(rawExpenses) ? rawExpenses : [];

    for (const e of src) {
        if (e.scope === SCOPE.SHARED) {
            const key = periodKey(e.year, e.month);
            const az = incMap.get(key) || { A: { income: 0, nights: 0 }, Z: { income: 0, nights: 0 } };
            out.push(...splitSharedExpense(e, az, shareRule));
        } else {
            out.push(e);
        }
    }
    return out;
}
function computeExpensesByApt(expenses) {
    const sums = { A: 0, Z: 0, N: 0 };
    for (const e of expenses || []) {
        const apt = e.apartment;
        if (apt === "A" || apt === "Z" || apt === "N") {
            sums[apt] += Number(e.amount_eur || 0);
        }
    }
    const total = sums.A + sums.Z + sums.N;
    return { sums, total };
}

function renderExpensesByApt(root, data) {
    if (!root) return;
    const { sums, total } = data;

    // koristi isti formatter kao ui.js (jednostavno, bez importa)
    const fmtEUR = (x) => {
        const n = Number(x || 0);
        return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
    };

    root.innerHTML = `
    <table class="catTable">
      <thead>
        <tr>
          <th>Apartman</th>
          <th class="right">Troškovi (EUR)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><b>A</b></td><td class="right">${fmtEUR(sums.A)}</td></tr>
        <tr><td><b>Z</b></td><td class="right">${fmtEUR(sums.Z)}</td></tr>
        <tr><td><b>N</b></td><td class="right">${fmtEUR(sums.N)}</td></tr>
        <tr class="totalRow">
          <td><b>UKUPNO</b></td>
          <td class="right"><b>${fmtEUR(total)}</b></td>
        </tr>
      </tbody>
    </table>
  `;
}

/**
 * Zaokružuje broj na 2 decimale
 * @param {number|string} x - Broj za zaokruživanje
 * @returns {number} Zaokružen broj na 2 decimale
 */
function round2(x) {
    return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

// FX: 1 EUR = 1.95583 BAM (default). Možeš kasnije staviti settings.
const FX_KEY = FX.FX_KEY;
/**
 * Dohvaća konverzioni kurs BAM/EUR iz localStorage (default: 1.95583)
 * @returns {number} Kurs BAM po 1 EUR
 */
function getFxRate() {
    const v = Number(localStorage.getItem(FX_KEY));
    return Number.isFinite(v) && v > 0 ? v : FX.DEFAULT_EUR_TO_BAM;
}

/**
 * Otvara modal za dodavanje novog troška
 */
function openModal() {
    els.expModal?.classList.remove("is-hidden");
    els.expModal?.setAttribute("aria-hidden", "false");
    setTimeout(() => els.expAddAmountBam?.focus(), 0);
}

/**
 * Zatvara modal za dodavanje novog troška
 */
function closeModal() {
    els.expModal?.classList.add("is-hidden");
    els.expModal?.setAttribute("aria-hidden", "true");
}

/**
 * Sinhronizuje UI modala (prikazuje/sakriva apartman select na osnovu scope)
 */
function syncScopeUI() {
    const sc = els.expAddScope?.value || SCOPE.SHARED;
    const showApt = sc === SCOPE.APARTMENT;
    els.expAptWrap?.classList.toggle("is-hidden", !showApt);
}

/**
 * Određuje period (year/month) iz datuma ili trenutno odabranog mjeseca
 * @param {string} dateStr - Datum string (ISO format)
 * @returns {{year: number, month: number}|null} Objekat sa year/month ili null
 */
function periodFromDateOrSelected(dateStr) {
    if (dateStr) {
        const d = safeDate(dateStr);
        if (d) {
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
    }
    if (state.selectedPeriodKey) return periodKeyToYM(state.selectedPeriodKey);
    return null;
}

/**
 * Osigurava da postoji import period (dodaje "MANUAL" import ako ne postoji)
 * @param {number} year - Godina
 * @param {number} month - Mjesec (1-12)
 * @returns {Promise<void>}
 */
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

/**
 * Dohvaća listu kategorija iz localStorage
 * @returns {Array<string>} Niz kategorija
 */
function getCategoriesLocal() {
    try {
        const arr = JSON.parse(localStorage.getItem(CAT_KEY) || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}
/**
 * Snima listu kategorija u localStorage
 * @param {Array<string>} arr - Niz kategorija
 */
function saveCategoriesLocal(arr) {
    localStorage.setItem(CAT_KEY, JSON.stringify(arr));
}
/**
 * Vraća unikatne elemente niza, sortirane alfabetski
 * @param {Array<string>} arr - Niz stringova
 * @returns {Array<string>} Sortirani niz unikatnih stringova
 */
function uniqueSorted(arr) {
    return [...new Set((arr || []).map(x => String(x || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "bs"));
}

/**
 * Handler za dodavanje nove kategorije putem prompt dijaloga
 */
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
/**
 * Učitava sve troškove iz baze i transformiše ih za prikaz
 * (dijeli SHARED troškove i normalizuje kategorije)
 * @returns {Promise<Array<Object>>} Niz troškova spremnih za prikaz
 */
async function load() {
    const shareRule = getShareRule();
    const [rawExpenses, incomeMonthly, incomeItems] = await Promise.all([
        dbGetAll("expenses"),
        dbGetAll("income_monthly"),
        dbGetAll("income_items").catch(() => []),
    ]);


    const expenses = buildRenderableExpenses(rawExpenses, incomeMonthly, incomeItems, shareRule);
    return expenses.map((e) => ({ ...e, category: normCat(e) }));
}

/**
 * Primjenjuje trenutne filtere (period, apartman, kategorija) na troškove
 * @param {Array<Object>} expenses - Svi troškovi
 * @returns {Array<Object>} Filtrirani troškovi
 */
function applyFilters(expenses) {
    const arr = Array.isArray(expenses) ? expenses : [];
    return arr.filter((e) => {
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

/**
 * Glavna render funkcija - učitava podatke, primjenjuje filtere i ažurira UI
 * @returns {Promise<void>}
 */
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

    if (els.listWrap && els.listToggle) {
        els.listWrap.classList.toggle("is-hidden", state.listCollapsed);
        els.listToggle.textContent = state.listCollapsed ? "Prikaži" : "Sakrij";
    }

    renderExpensesByApt(els.byApt, computeExpensesByApt(filtered));
    renderExpensesByCategory(els.byCat, filtered);
    renderExpensesList(els.list, filtered);
}

/**
 * Handler za snimanje novog troška iz modala
 * Validira unos, konvertuje BAM u EUR, i čuva u bazu
 * @returns {Promise<void>}
 */
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

    const scope = els.expAddScope?.value || SCOPE.SHARED;
    const apartment = scope === SCOPE.APARTMENT ? (els.expAddApt?.value || APARTMENTS.A) : null;

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

/**
 * Postavlja sve event listenere na UI elemente
 */
function attach() {
    els.listToggle?.addEventListener("click", () => {
        state.listCollapsed = !state.listCollapsed;
        els.listWrap?.classList.toggle("is-hidden", state.listCollapsed);
        els.listToggle.textContent = state.listCollapsed ? "Prikaži" : "Sakrij";
    });

    els.expApt?.addEventListener("change", async () => {
        state.apt = els.expApt.value;
        await withLoading(async () => { await render(); });
    });

    els.expCat?.addEventListener("change", async () => {
        state.cat = els.expCat.value;
        await withLoading(async () => { await render(); });
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
            await withLoading(async () => { await render(); });
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

    // Preslušaj promjene shareRule iz drugih tabova
    window.addEventListener("storage", (e) => {
        if (e.key === LS_KEYS.shareRule) {
            render(); // ponovo izračunaj split SHARED stavki
        }
    });

    await withLoading(async () => { await render(); });
})();

