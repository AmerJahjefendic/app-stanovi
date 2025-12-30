import {
  shoppingAddItem,
  shoppingToggleStatus,
  shoppingDeleteItem,
  shoppingListByGroup,
  shoppingBumpQty,
} from "../db/db.js";

const els = {
  groupSelect: document.getElementById("groupSelect"),
  addForm: document.getElementById("addForm"),
  nameInput: document.getElementById("nameInput"),
  qtyInput: document.getElementById("qtyInput"),
  noteInput: document.getElementById("noteInput"),
  statusInput: document.getElementById("statusInput"),
  listRoot: document.getElementById("listRoot"),
  searchInput: document.getElementById("searchInput"),
  filterToBuy: document.getElementById("filterToBuy"),
  filterInStock: document.getElementById("filterInStock"),
  filterAll: document.getElementById("filterAll"),
};

let state = {
  group: "AZ",
  filter: "TO_BUY", // default
  search: "",
  items: [],
};

function setActiveFilterButtons() {
  const map = {
    TO_BUY: els.filterToBuy,
    IN_STOCK: els.filterInStock,
    ALL: els.filterAll,
  };
  Object.values(map).forEach(btn => btn.classList.remove("primary"));
  map[state.filter].classList.add("primary"); // ako nema .primary u css, ignore
}

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function applyFilters(items) {
  const q = normalize(state.search);
  return items
    .filter(it => {
      if (state.filter === "ALL") return true;
      return it.status === state.filter;
    })
    .filter(it => {
      if (!q) return true;
      return normalize(it.name).includes(q) || normalize(it.note).includes(q);
    })
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
}

function render() {
  setActiveFilterButtons();

  const rows = applyFilters(state.items);

  if (!rows.length) {
    els.listRoot.innerHTML = `<div class="hint">Nema stavki za prikaz.</div>`;
    return;
  }

  els.listRoot.innerHTML = rows.map(it => {
    const badge = it.status === "TO_BUY" ? "🟠 TO_BUY" : "🟢 IN_STOCK";
    const qtyTxt = it.qty ? ` • ${it.qty} ${escapeHtml(it.unit || "pcs")}` : "";
    const note = it.note ? `<div class="hint">${escapeHtml(it.note)}</div>` : "";
    return `
      <div class="row" data-id="${it.id}" style="display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-bottom:1px solid rgba(0,0,0,0.08);">
        <div style="flex:1; cursor:pointer;" class="toggle">
          <div style="font-weight:600;">${escapeHtml(it.name)}</div>
          <div class="hint">${badge}${qtyTxt}</div>
          ${note}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn secondary qtyMinus" title="Količina -1" style="padding:6px 10px;">−</button>
          <button class="btn secondary qtyPlus" title="Količina +1" style="padding:6px 10px;">+</button>
          <button class="btn secondary delete" title="Obriši" style="padding:6px 10px;">🗑</button>
        </div>
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function load() {
  state.items = await shoppingListByGroup(state.group);
  render();
}

async function refresh() {
  await load();
}

els.groupSelect.addEventListener("change", async () => {
  state.group = els.groupSelect.value;
  await refresh();
});

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value || "";
  render();
});

els.filterToBuy.addEventListener("click", () => { state.filter = "TO_BUY"; render(); });
els.filterInStock.addEventListener("click", () => { state.filter = "IN_STOCK"; render(); });
els.filterAll.addEventListener("click", () => { state.filter = "ALL"; render(); });

els.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const name = els.nameInput.value;
    const qty = els.qtyInput.value;
    const note = els.noteInput.value;
    const status = els.statusInput.value;

    await shoppingAddItem({
      group: state.group,
      name,
      note,
      qty,
      status,
    });

    els.nameInput.value = "";
    els.qtyInput.value = "";
    els.noteInput.value = "";
    els.nameInput.focus();

    await refresh();
  } catch (err) {
    alert(err?.message || String(err));
  }
});

// Event delegation (toggle i delete)
els.listRoot.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-id]");
  if (!row) return;
  const id = row.getAttribute("data-id");

  // ✅ qty +/-
  if (e.target.closest(".qtyPlus")) {
    await shoppingBumpQty(id, +1);
    await refresh();
    return;
  }

  if (e.target.closest(".qtyMinus")) {
    await shoppingBumpQty(id, -1);
    await refresh();
    return;
  }

  if (e.target.closest(".delete")) {
    if (confirm("Obrisati ovu stavku?")) {
      await shoppingDeleteItem(id);
      await refresh();
    }
    return;
  }

  if (e.target.closest(".toggle")) {
    await shoppingToggleStatus(id);
    await refresh();
  }
});

// init
setActiveFilterButtons();
load();
