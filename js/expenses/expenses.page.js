// js/expenses/expenses.page.js
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { renderYearCalendar, showError, withLoading } from "../shared/ui.js";
import {
    dbDelete,
    dbGetAll,
    dbGetOne,
    dbPutCategoryAlias,
    dbPutOne,
    makeId,
} from "../db/db.js";
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
import { buildReservationFinancials } from "../shared/reservation-financial.service.js";
import { populateApartmentSelect } from "../shared/apartment-select.js";
import { apartmentsListActive, apartmentsListByShareKey, shareSetsListActive } from "../shared/apartments.service.js";
import { allocateSharedExpense, LEGACY_SHARED_KEY, resolveSharedExpenseMembers } from "../shared/shared-expense-allocation.service.js";
const CAT_KEY = "appstanovi_expense_categories";

const els = {
    calendar: document.getElementById("expCalendar"),

    // ===== MODAL elements =====
    btnOpenExpenseModal: document.getElementById("btnOpenExpenseModal"),
    expModal: document.getElementById("expModal"),
    expModalTitle: document.getElementById("expModalTitle"),
    btnCloseExpenseModal: document.getElementById("btnCloseExpenseModal"),
    btnCancelExpense: document.getElementById("btnCancelExpense"),
    btnSaveExpense: document.getElementById("btnSaveExpense"),

    expAddAmountBam: document.getElementById("expAddAmountBam"),
    expAddCategory: document.getElementById("expAddCategory"),
    btnAddCategory: document.getElementById("btnAddCategory"),
    expAddScope: document.getElementById("expAddScope"),
    expShareWrap: document.getElementById("expShareWrap"),
    expAddShareKey: document.getElementById("expAddShareKey"),
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
    // null = novi trošak
    // ID = uređivanje postojećeg troška
    editingExpenseId: null,
};

// ---------- helpers ----------


function normCat(exp) {
    const raw =
        (exp.category && String(exp.category).trim()) ? String(exp.category).trim()
            : (exp.raw_category && String(exp.raw_category).trim()) ? String(exp.raw_category).trim()
                : "NEPOZNATO";
    return mapExpenseCategory(raw);
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
 * Kreira mapu prihoda/noćenja po periodu i apartment ID-u za shared raspodjelu.
 * Revenue Allocation ostaje jedini izvor raspodjele rezervacija po mjesecima.
 */
function buildIncomeMap(incomeMonthlyRows, incomeItems, apartmentIds) {
    const memberIds = new Set((apartmentIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    const map = new Map();

    const ensure = (key, apartment) => {
        if (!map.has(key)) map.set(key, {});
        const period = map.get(key);
        if (!period[apartment]) period[apartment] = { income: 0, nights: 0, hasItems: false };
        return period[apartment];
    };

    const relevantItems = (incomeItems || []).filter((item) => memberIds.has(String(item?.apartment || "").trim()));
    const financials = buildReservationFinancials(relevantItems, {
        onError: (item, error) => console.warn("Shared expense income allocation skipped item", item?.id, error),
    });

    for (const financial of financials) {
        const apartment = String(financial?.reservation?.apartment || "").trim();
        if (!memberIds.has(apartment)) continue;

        for (const segment of financial.segments || []) {
            const key = keyFromPeriod(segment.year, segment.month);
            const slot = ensure(key, apartment);
            slot.income += financial.totals.isManaged
                ? Number(segment.splitBaseEur || 0)
                : Number(segment.amountEur || 0);
            slot.nights += Number(segment.nights || 0);
            slot.hasItems = true;
        }
    }

    // Legacy import fallback ostaje po apartmanu.
    for (const row of incomeMonthlyRows || []) {
        const apartment = String(row?.apartment || "").trim();
        if (!memberIds.has(apartment)) continue;

        const key = keyFromPeriod(row.year, row.month);
        const slot = ensure(key, apartment);
        if (slot.hasItems) continue;

        slot.income += Number(row.income_eur || 0);
        slot.nights += Number(row.nights || 0);
    }

    return map;
}

function collectSharedMemberIds(expenses) {
    const ids = new Set();
    for (const expense of expenses || []) {
        if (expense?.scope !== SCOPE.SHARED) continue;
        for (const member of resolveSharedExpenseMembers(expense)) ids.add(member);
    }
    return [...ids];
}

/**
 * Transformiše SHARED trošak u derived redove za članove njegove shared grupe.
 */
function buildRenderableExpenses(rawExpenses, incomeMonthlyRows, incomeItems, shareRule) {
    const src = Array.isArray(rawExpenses) ? rawExpenses : [];
    const memberIds = collectSharedMemberIds(src);
    const incMap = buildIncomeMap(incomeMonthlyRows, incomeItems, memberIds);
    const out = [];

    for (const expense of src) {
        if (expense.scope !== SCOPE.SHARED) {
            out.push(expense);
            continue;
        }

        const key = keyFromPeriod(expense.year, expense.month);
        const basisByApartment = incMap.get(key) || {};
        out.push(...allocateSharedExpense(expense, basisByApartment, shareRule));
    }

    return out;
}
function computeExpensesByApt(expenses, apartments) {
    const aptList = Array.isArray(apartments) ? apartments : [];
    const sums = Object.fromEntries(aptList.map((apt) => [apt.id, 0]));

    for (const e of expenses || []) {
        const apt = String(e?.apartment || "").trim();
        if (!apt) continue;
        if (!(apt in sums)) sums[apt] = 0;
        sums[apt] += Number(e.amount_eur || 0);
    }

    const total = Object.values(sums).reduce((sum, value) => sum + Number(value || 0), 0);
    return { sums, total, apartments: aptList };
}

function renderExpensesByApt(root, data) {
    if (!root) return;
    const { sums, total, apartments } = data;

    // koristi isti formatter kao ui.js (jednostavno, bez importa)
    const fmtEUR = (x) => {
        const n = Number(x || 0);
        return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
    };

    const knownIds = new Set((apartments || []).map((apt) => apt.id));
    const rows = (apartments || []).map((apt) => `
        <tr><td><b>${apt.name || apt.id}</b></td><td class="right">${fmtEUR(sums[apt.id])}</td></tr>`);

    // Defensive compatibility: ako postoji trošak za apartman koji više nije u registryju,
    // i dalje ga prikaži umjesto da finansijski podatak nestane iz tabele.
    for (const aptId of Object.keys(sums)) {
        if (knownIds.has(aptId)) continue;
        rows.push(`
        <tr><td><b>${aptId}</b></td><td class="right">${fmtEUR(sums[aptId])}</td></tr>`);
    }

    root.innerHTML = `
    <table class="catTable">
      <thead>
        <tr>
          <th>Apartman</th>
          <th class="right">Troškovi (EUR)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
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

async function populateSharedSetSelect(select, { includeShareKey = null } = {}) {
    if (!select) return;

    const [shareSets, apartments] = await Promise.all([
        shareSetsListActive(),
        apartmentsListActive(),
    ]);

    const options = [];
    for (const shareSet of shareSets) {
        const members = apartments.filter((apt) => apt?.shareKey === shareSet.id);
        if (members.length < 2 && shareSet.id !== includeShareKey) continue;
        options.push({
            id: shareSet.id,
            label: `${shareSet.name || shareSet.id} (${members.map((apt) => apt.name || apt.id).join(" + ") || "bez aktivnih članova"})`,
        });
    }

    if (includeShareKey && !options.some((option) => option.id === includeShareKey)) {
        options.push({ id: includeShareKey, label: includeShareKey });
    }

    const previous = select.value;
    select.innerHTML = options
        .map((option) => `<option value="${option.id}">${option.label}</option>`)
        .join("");

    const preferred = [previous, includeShareKey, LEGACY_SHARED_KEY, options[0]?.id]
        .find((value) => value && options.some((option) => option.id === value));
    if (preferred) select.value = preferred;
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
 * Vraća modal u režim dodavanja novog troška.
 * Ne briše scope i kategoriju, kako bi brzi unos ostao praktičan.
 */
function resetExpenseEditState() {
    state.editingExpenseId = null;
    if (els.expModalTitle) {
        els.expModalTitle.textContent = "Novi trošak";
    }
    if (els.btnSaveExpense) {
        els.btnSaveExpense.textContent = "Sačuvaj";
    }
}

async function openExpenseForEdit(id) {
    const expenseId = String(id || "").trim();
    if (!expenseId) return;

    const expense = await dbGetOne("expenses", expenseId);
    if (!expense) {
        showError("Trošak nije pronađen.");
        return;
    }

    state.editingExpenseId = expense.id;

    if (els.expModalTitle) {
        els.expModalTitle.textContent = "Uredi trošak";
    }
    if (els.btnSaveExpense) {
        els.btnSaveExpense.textContent = "Sačuvaj izmjenu";
    }

    if (els.expAddAmountBam) {
        els.expAddAmountBam.value = expense.amount_bam ?? "";
    }
    if (els.expAddScope) {
        els.expAddScope.value =
            expense.scope === SCOPE.APARTMENT
                ? SCOPE.APARTMENT
                : SCOPE.SHARED;
    }
    if (expense.scope === SCOPE.SHARED) {
        const shareKey = expense.shareKey || LEGACY_SHARED_KEY;
        await populateSharedSetSelect(els.expAddShareKey, { includeShareKey: shareKey });
        if (els.expAddShareKey) els.expAddShareKey.value = shareKey;
    }
    if (els.expAddApt) {
        await populateApartmentSelect(els.expAddApt, { includeApartmentId: expense.apartment });
        els.expAddApt.value = expense.apartment || els.expAddApt.value;
    }
    if (els.expAddDate) {
        els.expAddDate.value = expense.date || "";
    }
    if (els.expAddNote) {
        els.expAddNote.value = expense.note || "";
    }

    const expenseCategory = String(
        expense.raw_category ||
        expense.category ||
        ""
    ).trim();

    if (els.expAddCategory && expenseCategory) {
        const categoryExists = Array.from(els.expAddCategory.options)
            .some((option) => option.value === expenseCategory);

        if (!categoryExists) {
            const option = document.createElement("option");
            option.value = expenseCategory;
            option.textContent = expenseCategory;
            els.expAddCategory.appendChild(option);
        }

        els.expAddCategory.value = expenseCategory;
    }

    syncScopeUI();
    openModal();
}

async function handleDeleteExpense(id) {
    const expenseId = String(id || "").trim();
    if (!expenseId) return;

    const expense = await dbGetOne("expenses", expenseId);
    if (!expense) {
        alert("Trošak nije pronađen.");
        await render();
        return;
    }

    const category =
        expense.raw_category ||
        expense.category ||
        "Bez kategorije";
    const amountBam = Number(expense.amount_bam || 0).toFixed(2);

    let extraInfo = "";
    if (expense.scope === SCOPE.SHARED) {
        const members = resolveSharedExpenseMembers(expense);
        extraInfo =
            "\n\n⚠ Ovo je SHARED trošak." +
            `\nBrisanjem će biti uklonjen iz obračuna za shared grupu (${members.join(" + ") || "nepoznati članovi"}).`;
    } else {
        extraInfo =
            `\n\nApartman: ${expense.apartment}`;
    }

    const confirmed = window.confirm(
        `Da li sigurno želiš obrisati ovaj trošak?\n\n` +
        `Kategorija: ${category}\n` +
        `Iznos: ${amountBam} BAM` +
        extraInfo
    );
    if (!confirmed) return;

    try {
        await dbDelete("expenses", expenseId);

        if (state.editingExpenseId === expenseId) {
            resetExpenseEditState();
            closeModal();
        }

        await render();
    } catch (error) {
        console.error(error);
        alert(
            error?.message ||
            "Greška pri brisanju troška."
        );
    }
}

/**
 * Sinhronizuje UI modala (prikazuje/sakriva apartman select na osnovu scope)
 */
function syncScopeUI() {
    const sc = els.expAddScope?.value || SCOPE.SHARED;
    const showApt = sc === SCOPE.APARTMENT;
    const showShared = sc === SCOPE.SHARED;
    els.expAptWrap?.classList.toggle("is-hidden", !showApt);
    els.expShareWrap?.classList.toggle("is-hidden", !showShared);
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
 * Mapira kategorije kroz postojeća alias pravila i vraća
 * samo canonical, jedinstvene nazive.
 */
function canonicalizeCategories(categories) {
    return uniqueSorted(
        (categories || []).map((category) =>
            mapExpenseCategory(category)
        )
    );
}

function normalizeCategoryName(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("bs");
}

async function updateExpensesCategory(fromCategory, toCategory) {
    const fromNormalized = normalizeCategoryName(fromCategory);
    const expenses = await dbGetAll("expenses");
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const expense of expenses) {
        const categoryNormalized =
            normalizeCategoryName(expense.category);
        const rawCategoryNormalized =
            normalizeCategoryName(expense.raw_category);
        const matches =
            categoryNormalized === fromNormalized ||
            rawCategoryNormalized === fromNormalized;

        if (!matches) continue;

        await dbPutOne("expenses", {
            ...expense,
            // raw_category ostaje izvorna vrijednost iz importa.
            category: toCategory,
            updated_at: now,
        });
        updatedCount += 1;
    }

    return updatedCount;
}

/**
 * Handler za dodavanje nove kategorije putem prompt dijaloga
 */
function handleAddCategory() {
    const name = prompt("Unesi naziv nove kategorije:");
    if (!name) return;
    const rawCategory = String(name).trim();
    if (!rawCategory) return;

    const category = mapExpenseCategory(rawCategory);

    const categories = canonicalizeCategories([
        ...getCategoriesLocal(),
        category,
    ]);

    saveCategoriesLocal(categories);

    renderExpenseFilters(
        els.expCat,
        categories,
        state.cat
    );
    renderExpenseFilters(
        els.expAddCategory,
        categories,
        category
    );
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
    const [all, activeApartments] = await Promise.all([
        load(),
        apartmentsListActive(),
    ]);

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
    const catsForSelect = canonicalizeCategories([
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

    renderExpensesByApt(els.byApt, computeExpensesByApt(filtered, activeApartments));
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

    const categoryRaw = String(
        els.expAddCategory?.value || ""
    ).trim();
    if (!categoryRaw || categoryRaw === "ALL") {
        alert("Odaberi kategoriju.");
        return;
    }

    const existingExpense = state.editingExpenseId
        ? await dbGetOne("expenses", state.editingExpenseId)
        : null;

    if (state.editingExpenseId && !existingExpense) {
        alert("Trošak koji uređuješ više nije pronađen.");
        resetExpenseEditState();
        closeModal();
        await render();
        return;
    }

    const scope =
        els.expAddScope?.value || SCOPE.SHARED;
    const apartment =
        scope === SCOPE.APARTMENT
            ? (els.expAddApt?.value || APARTMENTS.A)
            : null;

    let shareKey = null;
    let sharedMembers = null;
    if (scope === SCOPE.SHARED) {
        shareKey = String(els.expAddShareKey?.value || "").trim();
        if (!shareKey) {
            alert("Odaberi shared grupu.");
            return;
        }

        if (
            existingExpense?.scope === SCOPE.SHARED &&
            (existingExpense.shareKey || LEGACY_SHARED_KEY) === shareKey &&
            Array.isArray(existingExpense.sharedMembers) &&
            existingExpense.sharedMembers.length >= 2
        ) {
            sharedMembers = [...existingExpense.sharedMembers];
        } else {
            const members = await apartmentsListByShareKey(shareKey);
            sharedMembers = members.map((apt) => apt.id);
        }

        if (sharedMembers.length < 2) {
            alert("Shared grupa mora imati najmanje dva aktivna apartmana.");
            return;
        }
    }

    const dateStr = els.expAddDate?.value || "";
    let period = null;

    if (dateStr) {
        period = periodFromDateOrSelected(dateStr);
    } else if (existingExpense) {
        period = {
            year: existingExpense.year,
            month: existingExpense.month,
        };
    } else {
        period = periodFromDateOrSelected("");
    }

    if (!period) {
        alert(
            "Unesi datum ili odaberi mjesec u kalendaru " +
            "(MONTH view) da se odredi period."
        );
        return;
    }

    const fx = getFxRate();
    const amountEur = round2(amountBam / fx);
    const now = new Date().toISOString();

    const item = {
        ...(existingExpense || {}),
        id: existingExpense?.id || makeId("exp"),
        year: period.year,
        month: period.month,
        amount_bam: round2(amountBam),
        amount_eur: amountEur,
        scope,
        apartment,
        shareKey,
        sharedMembers,
        raw_category: categoryRaw,
        category: categoryRaw,
        date: dateStr || null,
        note: String(
            els.expAddNote?.value || ""
        ).trim(),
        source: existingExpense?.source || "Manual",
        created_at:
            existingExpense?.created_at || now,
        updated_at: now,
    };

    try {
        await dbPutOne("expenses", item);
        await ensureImportPeriod(period.year, period.month);

        // Očisti polja, ali ostavi scope i kategoriju
        // radi bržeg unosa sljedećeg troška.
        els.expAddAmountBam.value = "";
        els.expAddDate.value = "";
        els.expAddNote.value = "";

        resetExpenseEditState();
        closeModal();
        await render();
    } catch (error) {
        console.error(error);
        alert(
            error?.message ||
            "Greška pri snimanju troška."
        );
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
        const updatedCount = await updateExpensesCategory(
            from,
            to
        );
        const cleanedCategories = canonicalizeCategories([
            ...getCategoriesLocal(),
            to,
        ]);
        saveCategoriesLocal(cleanedCategories);
        els.mergeMsg.textContent =
            `OK: "${from}" → "${to}" ` +
            `(${updatedCount} troškova ažurirano)`;
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

    els.list?.addEventListener("click", async (event) => {
        const editButton = event.target.closest(
            '[data-action="edit-expense"]'
        );
        if (editButton) {
            await openExpenseForEdit(editButton.dataset.id);
            return;
        }

        const deleteButton = event.target.closest(
            '[data-action="delete-expense"]'
        );
        if (deleteButton) {
            await handleDeleteExpense(deleteButton.dataset.id);
        }
    });

    // ===== MODAL events =====
    els.btnOpenExpenseModal?.addEventListener("click", () => {
        resetExpenseEditState();
        syncScopeUI();
        openModal();
    });

    els.btnCloseExpenseModal?.addEventListener("click", () => {
        resetExpenseEditState();
        closeModal();
    });
    els.btnCancelExpense?.addEventListener("click", () => {
        resetExpenseEditState();
        closeModal();
    });

    els.expModal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) {
            resetExpenseEditState();
            closeModal();
        }
    });

    els.expAddScope?.addEventListener("change", syncScopeUI);

    els.btnAddCategory?.addEventListener("click", handleAddCategory);

    els.btnSaveExpense?.addEventListener("click", handleSaveExpense);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && els.expModal && !els.expModal.classList.contains("is-hidden")) {
            resetExpenseEditState();
            closeModal();
        }
    });

}

(async () => {
    await loadCategoryAliases();
    await populateApartmentSelect(els.expApt, { includeAll: true, allLabel: "Svi" });
    await populateApartmentSelect(els.expAddApt);
    await populateSharedSetSelect(els.expAddShareKey);
    state.apt = els.expApt?.value || "ALL";
    attach();

    // Preslušaj promjene shareRule iz drugih tabova
    window.addEventListener("storage", (e) => {
        if (e.key === LS_KEYS.shareRule) {
            render(); // ponovo izračunaj split SHARED stavki
        }
    });

    await withLoading(async () => { await render(); });
})();

