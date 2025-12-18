// js/expenses.js
import { dbGetAll, dbPutCategoryAlias } from "./db.js";
import { loadCategoryAliases, mapExpenseCategory } from "./mappingConfig.js";
import {
    renderExpensesByCategory,
    renderExpensesList,
    renderExpenseFilters,
} from "./expensesUi.js";

const els = {
    status: document.getElementById("expStatus"),
    expApt: document.getElementById("expApt"),
    expCat: document.getElementById("expCat"),
    byCat: document.getElementById("expByCat"),
    list: document.getElementById("expList"),

    mergeFrom: document.getElementById("mergeFrom"),
    mergeTo: document.getElementById("mergeTo"),
    mergeSave: document.getElementById("mergeSave"),
    mergeMsg: document.getElementById("mergeMsg"),
};
console.log("ELS:", Object.fromEntries(Object.entries(els).map(([k, v]) => [k, !!v])));

const state = { apt: "ALL", cat: "ALL" };

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
        if (state.apt !== "ALL" && e.apartment !== state.apt) return false;
        if (state.cat !== "ALL" && normCat(e) !== state.cat) return false;
        return true;
    });
}

async function render() {
    const all = await load();
    if (els.mergeFrom && els.mergeTo) {
  const catsAll = Array.from(new Set(all.map(e => normCat(e)))).sort();
  renderExpenseFilters(els.mergeFrom, catsAll, els.mergeFrom.value || "ALL");
  renderExpenseFilters(els.mergeTo, catsAll, els.mergeTo.value || "ALL");
}
    // ---- MERGE UI dropdowns ----
    const catsAll = Array.from(new Set(all.map((e) => normCat(e)))).sort();
    renderExpenseFilters(els.mergeFrom, catsAll, els.mergeFrom.value || "ALL");
    renderExpenseFilters(els.mergeTo, catsAll, els.mergeTo.value || "ALL");

    // ---- filter kategorija po apartmanu ----
    const forCats = all.filter((e) => (state.apt === "ALL" ? true : e.apartment === state.apt));
    renderExpenseFilters(els.expCat, forCats.map((e) => normCat(e)), state.cat);

    const catSet = new Set(forCats.map((e) => normCat(e)));
    if (state.cat !== "ALL" && !catSet.has(state.cat)) {
        state.cat = "ALL";
        els.expCat.value = "ALL";
    }

    const filtered = applyFilters(all);

    els.status.textContent = `Stavki: ${filtered.length}`;
    renderExpensesByCategory(els.byCat, filtered);
    renderExpensesList(els.list, filtered);
}

function attach() {
    els.expApt?.addEventListener("change", async () => {
        state.apt = els.expApt.value;
        await render();
    });

    els.expCat?.addEventListener("change", async () => {
        state.cat = els.expCat.value;
        await render();
    });

    // MERGE dugme – radi samo ako UI postoji
    els.mergeSave?.addEventListener("click", async () => {
        const from = els.mergeFrom?.value;
        const to = els.mergeTo?.value;

        if (!from || !to || from === "ALL" || to === "ALL") {
            els.mergeMsg && (els.mergeMsg.textContent = "Izaberi FROM i TO.");
            return;
        }
        if (from === to) {
            els.mergeMsg && (els.mergeMsg.textContent = "FROM i TO ne mogu biti isti.");
            return;
        }

        await dbPutCategoryAlias(from, to);
        await loadCategoryAliases();
        els.mergeMsg && (els.mergeMsg.textContent = `OK: "${from}" → "${to}"`);
        await render();
    });
}

(async () => {
    await loadCategoryAliases();
    attach();
    render();
})();
