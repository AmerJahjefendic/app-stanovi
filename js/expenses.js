import { dbGetAll } from "./db.js";
import { renderExpensesByCategory, renderExpensesList, renderExpenseFilters } from "./expensesUi.js";

const els = {
  status: document.getElementById("expStatus"),
  expApt: document.getElementById("expApt"),
  expCat: document.getElementById("expCat"),
  byCat: document.getElementById("expByCat"),
  list: document.getElementById("expList"),
};

const state = {
  apt: "ALL",
  cat: "ALL",
};

function normCat(c) {
  return c && String(c).trim() ? String(c).trim() : "NEPOZNATO";
}

async function load() {
  const expenses = await dbGetAll("expenses"); // svi periodi
  return expenses.map(e => ({ ...e, category: normCat(e.category) }));
}

function applyFilters(expenses) {
  return expenses.filter(e => {
    if (state.apt !== "ALL" && e.apartment !== state.apt) return false;
    if (state.cat !== "ALL" && normCat(e.category) !== state.cat) return false;
    return true;
  });
}

async function render() {
  const all = await load();

  // fill filters (kategorije iz baze)
  renderExpenseFilters(els.expCat, all.map(e => normCat(e.category)), state.cat);

  const filtered = applyFilters(all);

  els.status.textContent = `Stavki: ${filtered.length}`;

  renderExpensesByCategory(els.byCat, filtered);
  renderExpensesList(els.list, filtered);
}

function attach() {
  els.expApt.addEventListener("change", async () => {
    state.apt = els.expApt.value;
    await render();
  });

  els.expCat.addEventListener("change", async () => {
    state.cat = els.expCat.value;
    await render();
  });
}

attach();
render();
