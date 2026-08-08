import {
  shoppingAddItem,
  shoppingToggleStatus,
  shoppingDeleteItem,
  shoppingListByGroup,
  shoppingBumpQty,
} from "../db/db.js";
import { shoppingListActiveScopes } from "../shared/shopping-scopes.service.js";

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
  group: "",
  scopes: [],
  filter: "TO_BUY",
  search: "",
  items: [],
};

function setActiveFilterButtons() {
  const map = {
    TO_BUY: els.filterToBuy,
    IN_STOCK: els.filterInStock,
    ALL: els.filterAll,
  };
  Object.values(map).forEach((btn) => btn.classList.remove("primary"));
  map[state.filter]?.classList.add("primary");
}

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyFilters(items) {
  const q = normalize(state.search);
  return items
    .filter((it) => state.filter === "ALL" || it.status === state.filter)
    .filter((it) => !q || normalize(it.name).includes(q) || normalize(it.note).includes(q))
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
}

function setFormEnabled(enabled) {
  for (const control of els.addForm?.querySelectorAll("input, select, button") || []) {
    control.disabled = !enabled;
  }
}

function populateScopeSelect() {
  if (!els.groupSelect) return;

  if (!state.scopes.length) {
    els.groupSelect.innerHTML = '<option value="">Nema shopping lista</option>';
    els.groupSelect.disabled = true;
    state.group = "";
    setFormEnabled(false);
    return;
  }

  els.groupSelect.disabled = false;
  els.groupSelect.innerHTML = state.scopes
    .map((scope) => `<option value="${escapeHtml(scope.storageKey)}">${escapeHtml(scope.label)}</option>`)
    .join("");

  const stillExists = state.scopes.some((scope) => scope.storageKey === state.group);
  if (!stillExists) state.group = state.scopes[0].storageKey;
  els.groupSelect.value = state.group;
  setFormEnabled(true);
}

function render() {
  setActiveFilterButtons();

  if (!state.group) {
    els.listRoot.innerHTML = '<div class="hint">Dodaj apartman ili shared grupu u Settings da bi kreirao Shopping listu.</div>';
    return;
  }

  const rows = applyFilters(state.items);
  if (!rows.length) {
    els.listRoot.innerHTML = '<div class="hint">Nema stavki za prikaz.</div>';
    return;
  }

  els.listRoot.innerHTML = rows.map((it) => {
    const badge = it.status === "TO_BUY" ? "🟠 TO_BUY" : "🟢 IN_STOCK";
    const qtyTxt = it.qty ? ` • ${it.qty} ${escapeHtml(it.unit || "pcs")}` : "";
    const note = it.note ? `<div class="hint">${escapeHtml(it.note)}</div>` : "";
    return `
      <div class="row" data-id="${escapeHtml(it.id)}" style="display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-bottom:1px solid rgba(0,0,0,0.08);">
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

async function load() {
  state.items = state.group ? await shoppingListByGroup(state.group) : [];
  render();
}

async function refresh() {
  await load();
}

async function initScopes() {
  state.scopes = await shoppingListActiveScopes();
  populateScopeSelect();
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
  if (!state.group) {
    alert("Prvo dodaj apartman ili shared grupu u Settings.");
    return;
  }

  try {
    await shoppingAddItem({
      group: state.group,
      name: els.nameInput.value,
      note: els.noteInput.value,
      qty: els.qtyInput.value,
      status: els.statusInput.value,
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

els.listRoot.addEventListener("click", async (e) => {
  const row = e.target.closest("[data-id]");
  if (!row) return;
  const id = row.getAttribute("data-id");

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

setActiveFilterButtons();
initScopes().catch((err) => {
  console.error("[shopping] init error", err);
  els.listRoot.innerHTML = `<div class="hint">Greška pri učitavanju Shopping lista: ${escapeHtml(err?.message || err)}</div>`;
});
