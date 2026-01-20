// js/settings/settings.page.js
import {
    apartmentsListAll,
    apartmentsGet,
    apartmentsCreate,
    apartmentsUpdate,
    apartmentsSetActive,
    apartmentsDelete,
    groupsListAll,
    shareSetsCreate,
    shareSetsGet,
    OWNER_TYPE,
} from "../shared/apartments.service.js";

import { dbGetAll } from "../db/db.js";

import {
    setMsg,
    renderGroupsSelect,
    renderApartmentsTable,
    showAgencyRow,
} from "./settings.ui.js";

const els = {
  msgBox: document.getElementById("msgBox"),

  // open modal
  btnOpen: document.getElementById("btnOpenAptModal"),

  // modal
  modal: document.getElementById("aptModal"),
  btnSave: document.getElementById("btnSaveApt"),

  editMode: document.getElementById("aptEditMode"),

  id: document.getElementById("aptId"),
  name: document.getElementById("aptName"),
  address: document.getElementById("aptAddress"),
  aptGroup: document.getElementById("aptGroup"),
  aptOwnerType: document.getElementById("aptOwnerType"),
  agencyPct: document.getElementById("aptAgencyPct"),
  ownerName: document.getElementById("aptOwnerName"),
  sort: document.getElementById("aptSort"),
  isActive: document.getElementById("aptIsActive"),

  agencyRow: document.getElementById("agencyRow"),

  shareSetWrap: document.getElementById("shareSetWrap"),
  shareKey: document.getElementById("aptShareKey"),
  btnNewShareSet: document.getElementById("btnNewShareSet"),

  shareModal: document.getElementById("shareSetModal"),
  shareSetName: document.getElementById("shareSetName"),
  shareSetAddress: document.getElementById("shareSetAddress"),
  btnSaveShareSet: document.getElementById("btnSaveShareSet"),

  tbody: document.getElementById("aptTbody"),
};

let _groups = [];
let _groupMap = {};
let _shareSets = [];
let _lastFocusEl = null;
let _lastFocusElShare = null;

function normId(v) {
    return String(v || "").trim();
}

function cleanStr(x) {
    const s = String(x ?? "").trim();
    return s ? s : "";
}

function showAptFormError(msg) {
    const el = document.getElementById("aptFormError");
    if (!el) return alert(msg); // fallback
    el.textContent = String(msg || "Greška.");
    el.classList.remove("hidden");
}

function clearAptFormError() {
    const el = document.getElementById("aptFormError");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
}

function slugify(s) {
    return String(s || "")
        .trim()
        .toUpperCase()
        .replace(/Č/g,"C").replace(/Ć/g,"C").replace(/Đ/g,"DJ").replace(/Š/g,"S").replace(/Ž/g,"Z")
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function groupById(id) {
    return (_groups || []).find(g => g.id === id) || null;
}

function isOwnedSharedGroupId(groupId) {
    return groupById(groupId)?.type === "OWNED_SHARED";
}

function isManagedOwnerType(ownerType) {
    return String(ownerType || "").toUpperCase() === "MANAGED";
}

function applyAgencyUI() {
    const managed = isManagedOwnerType(els.aptOwnerType.value);
    els.agencyRow?.classList.toggle("is-hidden", !managed);
}

async function makeUniqueShareId(prefix = "SS") {
    // First try with prefix as-is
    let exists = await shareSetsGet(prefix);
    if (!exists) return prefix;
    
    // Try with incremental numbers
    for (let i = 2; i <= 20; i++) {
        const id = `${prefix}_${i}`;
        exists = await shareSetsGet(id);
        if (!exists) return id;
    }
    
    // Last resort: random suffix
    for (let i = 0; i < 10; i++) {
        const id = `${prefix}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        exists = await shareSetsGet(id);
        if (!exists) return id;
    }
    
    throw new Error("Ne mogu generisati jedinstven ID. Pokušaj ponovo.");
}

function applyShareUI() {
    const groupId = els.aptGroup.value;
    const show = isOwnedSharedGroupId(groupId);
    els.shareSetWrap?.classList.toggle("is-hidden", !show);

    // UX: ako nije Shared, shareKey select reset (ali ne snimaj ovdje)
    if (!show) {
        // samo UI reset, snimanje će normalizovati u service
        if (els.shareKey) els.shareKey.value = "";
    }
}

function groupShortLabel(id, g) {
    // id je keyPath; g je record iz DB
    const type = g?.type;

    if (type === "OWNED_SHARED") return "Shared";
    if (type === "OWNED_SOLO") return "Solo";

    // legacy / fallback:
    if (id === "N") return "Managed (legacy)";
    return g?.name || id;
}

function rebuildAptGroupOptions(currentGroupId) {
    const cur = String(currentGroupId || "").trim() || "O";

    const allowed = ["AZ", "O"]; // ✅ uvijek ove dvije
    const includeLegacyN = (cur === "N"); // ✅ samo kad editujemo N

    els.aptGroup.innerHTML = "";

    for (const id of allowed) {
        const g = groupById(id);
        if (!g) continue;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = groupShortLabel(id, g);
        els.aptGroup.appendChild(opt);
    }

    if (includeLegacyN) {
        const g = groupById("N");
        const opt = document.createElement("option");
        opt.value = "N";
        opt.textContent = groupShortLabel("N", g);
        els.aptGroup.appendChild(opt);
    }

    // set value
    const has = [...els.aptGroup.options].some(o => o.value === cur);
    els.aptGroup.value = has ? cur : "O";
}

function setFormMode(mode) {
    els.editMode.value = mode; // "create" | "edit"
    const editing = mode === "edit";

    // ID zaključan kad edituješ
    els.id.disabled = editing;
}

function resetForm() {
    els.editMode.value = "create";
    els.id.disabled = false;

    els.id.value = "";
    els.name.value = "";
    els.address.value = "";

    els.aptOwnerType.value = OWNER_TYPE.OWNED;
    els.agencyPct.value = "";
    if (els.ownerName) els.ownerName.value = "";

    els.sort.value = "";
    els.isActive.checked = true;

    rebuildAptGroupOptions("O");

    applyAgencyUI();
    applyShareUI();
}

function openModal() {
    _lastFocusEl = document.activeElement;   // ko je otvorio modal (Add/Edit)
    els.modal.classList.remove("is-hidden");
    els.modal.setAttribute("aria-hidden", "false");

    // fokus na prvo polje u modalu
    setTimeout(() => els.id?.focus(), 0);
}

function closeModal() {
    // vrati fokus VAN modala prije aria-hidden
    try { _lastFocusEl?.focus?.(); } catch {}

    els.modal.classList.add("is-hidden");
    els.modal.setAttribute("aria-hidden", "true");
}

function attachModalCloseHandlers() {
    els.modal.querySelectorAll("[data-modal-close]").forEach(el => {
        el.addEventListener("click", closeModal);
    });

    // ESC
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !els.modal.classList.contains("is-hidden")) closeModal();
    });
}

function openShareModal() {
    _lastFocusElShare = document.activeElement;
    
    // Reset form fields
    els.shareSetName.value = "";
    els.shareSetAddress.value = "";
    
    els.shareModal.classList.remove("is-hidden");
    els.shareModal.setAttribute("aria-hidden", "false");
    setTimeout(() => els.shareSetName.focus(), 0);
}

function closeShareModal() {
    try { _lastFocusElShare?.focus?.(); } catch {}
    els.shareModal.classList.add("is-hidden");
    els.shareModal.setAttribute("aria-hidden", "true");
}

function resetShareSetForm() {
    els.shareSetName.value = "";
    els.shareSetAddress.value = "";
}

function attachShareModalCloseHandlers() {
    els.shareModal.querySelectorAll("[data-modal-close-share]").forEach(el => {
        el.addEventListener("click", closeShareModal);
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !els.shareModal.classList.contains("is-hidden")) closeShareModal();
    });
}

async function loadShareSets() {
    _shareSets = await dbGetAll("share_sets");
    _shareSets.sort((a,b) => (a.sort||0) - (b.sort||0) || String(a.name||"").localeCompare(String(b.name||"")));
}

function renderShareSetsDropdown(currentShareKey = "") {
    if (!els.shareKey) return;

    const currentKey = cleanStr(currentShareKey);
    
    // Only active share sets
    const active = _shareSets.filter(s => s.isActive !== false);
    
    // Build options
    let options = [
        { value: "", label: "-- Izaberi shared set --" },
        ...active.map(s => ({ value: s.id, label: s.name || s.id }))
    ];
    
    // Check if current key is in active options
    const hasCurrent = options.some(o => o.value === currentKey);
    
    if (currentKey && !hasCurrent) {
        // Try to find in all share sets (including inactive)
        const found = _shareSets.find(s => s.id === currentKey);
        const label = found
            ? `${found.name || found.id} (inactive)`
            : `${currentKey} (missing)`;
        
        // Insert after placeholder
        options.splice(1, 0, { value: currentKey, label });
    }
    
    // Render dropdown
    els.shareKey.innerHTML = "";
    for (const opt of options) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        els.shareKey.appendChild(el);
    }
}

async function load() {
    _groups = await groupsListAll();
    _groupMap = Object.fromEntries(_groups.map(g => [g.id, g.name]));
    
    await loadShareSets();
    renderShareSetsDropdown(""); // no current key on initial load

    await refreshTable();
    resetForm();
}

async function refreshTable() {
    const rows = await apartmentsListAll();
    renderApartmentsTable(els.tbody, rows, _groupMap, {
        onEdit: handleEdit,
        onToggleActive: handleToggleActive,
        onDelete: handleDelete,
    });
}

function handleOpenCreate() {
    setMsg(els.msgBox, "", "");
    resetForm();
    
    // ✅ rebuild grupa dropdown (default O, no legacy N)
    rebuildAptGroupOptions("O");
    els.aptOwnerType.value = "OWNED";
    
    applyAgencyUI();
    applyShareUI();
    
    renderShareSetsDropdown(""); // no current key for new apartment
    openModal();
}

async function handleEdit(id) {
    try {
        setMsg(els.msgBox, "", "");

        const row = await apartmentsGet(id);
        if (!row) return setMsg(els.msgBox, "warn", `Apartman "${id}" ne postoji.`);

        els.editMode.value = "edit";
        els.id.disabled = true;

        els.id.value = row.id || "";
        els.name.value = row.name || "";
        els.address.value = row.address || "";
        
        // ✅ set ownerType first
        els.aptOwnerType.value = row.ownerType || OWNER_TYPE.OWNED;
        
        // ✅ rebuild grupa sa trenutnim groupId (da ubaci legacy N ako treba)
        rebuildAptGroupOptions(row.groupId || "O");
        
        // ✅ set value nakon rebuild-a
        if (row.groupId) els.aptGroup.value = row.groupId;
        
        els.agencyPct.value = (row.agencyPct === null || row.agencyPct === undefined) ? "" : String(row.agencyPct);
        els.sort.value = (row.sort === null || row.sort === undefined) ? "" : String(row.sort);
        els.isActive.checked = row.isActive !== false;
        if (els.ownerName) els.ownerName.value = row.ownerName || "";
        
        // Render dropdown with current shareKey
        renderShareSetsDropdown(row.shareKey || "");
        if (els.shareKey) els.shareKey.value = row.shareKey || "";

        applyAgencyUI();
        applyShareUI();

        setMsg(els.msgBox, "info", `Edit mode: ${row.id}`);

        openModal();
    } catch (e) {
        console.error(e);
        setMsg(els.msgBox, "err", e.message || "Greška pri učitavanju apartmana.");
    }

}

async function handleToggleActive(id, nextActive) {
    try {
        setMsg(els.msgBox, "", "");
        await apartmentsSetActive(id, nextActive);
        await refreshTable();
        setMsg(els.msgBox, "ok", `Apartman "${id}" je ${nextActive ? "aktivan" : "deaktiviran"}.`);
    } catch (e) {
        console.error(e);
        setMsg(els.msgBox, "err", e.message || "Greška pri promjeni statusa.");
    }
}

async function handleDelete(id) {
    try {
        setMsg(els.msgBox, "", "");
        if (!confirm(`Obrisati apartman "${id}"? Ovo se ne može vratiti.`)) return;

        await apartmentsDelete(id);
        await refreshTable();
        setMsg(els.msgBox, "ok", `Apartman "${id}" obrisan.`);
    } catch (e) {
        console.error(e);
        setMsg(els.msgBox, "err", e.message || "Greška pri brisanju.");
    }
}

async function handleSaveClick() {
    setMsg(els.msgBox, "", "");
    clearAptFormError();

    // Loading state
    els.btnSave.disabled = true;
    els.btnSave.textContent = "Snima…";

    try {
        const mode = els.editMode.value;

        const payload = {
            id: normId(els.id.value),
            name: String(els.name.value || "").trim(),
            address: String(els.address.value || "").trim(),
            groupId: els.aptGroup.value,
            ownerType: els.aptOwnerType.value,
            agencyPct: els.agencyPct.value,
            ownerName: els.ownerName ? String(els.ownerName.value || "").trim() : "",
            sort: els.sort.value,
            isActive: !!els.isActive.checked,
            shareKey: isOwnedSharedGroupId(els.aptGroup.value) ? (els.shareKey?.value || "") : "",
        };

        if (mode === "create") {
            await apartmentsCreate(payload);
            setMsg(els.msgBox, "ok", `Apartman "${payload.id}" kreiran.`);
        } else {
            await apartmentsUpdate(payload.id, payload);
            setMsg(els.msgBox, "ok", `Apartman "${payload.id}" ažuriran.`);
        }

        await refreshTable();
        closeModal();
    } catch (e) {
        console.error(e);
        showAptFormError(e?.message || String(e));
        return; 
    } finally {
        // Reset button state
        els.btnSave.disabled = false;
        els.btnSave.textContent = "Sačuvaj";
    }
}

async function handleSaveShareSet() {
    // Loading state
    els.btnSaveShareSet.disabled = true;
    els.btnSaveShareSet.textContent = "Snima…";

    try {
        const name = String(els.shareSetName.value || "").trim();
        const address = String(els.shareSetAddress.value || "").trim();
        
        if (!name) {
            setMsg(els.msgBox, "err", "Naziv shared seta je obavezan.");
            return;
        }

        // Generate unique ID from name (with DB check)
        const base = slugify(name) || `SHARE_${Date.now()}`;
        const id = await makeUniqueShareId(base);

        // Calculate sort dynamically
        const maxSort = _shareSets.reduce((m, s) => Math.max(m, Number(s.sort)||0), 0);
        const sort = maxSort + 10;

        // Use service function instead of direct dbPutOne
        await shareSetsCreate({
            id,
            name,
            address,
            isActive: true,
            sort
        });

        await loadShareSets();
        
        // Re-render dropdown with newly created share set
        renderShareSetsDropdown(id);
        if (els.shareKey) els.shareKey.value = id;

        resetShareSetForm();
        closeShareModal();
        setMsg(els.msgBox, "ok", `Shared set "${name}" kreiran.`);
    } catch (e) {
        console.error(e);
        setMsg(els.msgBox, "err", e.message || "Greška pri snimanju shared seta.");
    } finally {
        // Reset button state
        els.btnSaveShareSet.disabled = false;
        els.btnSaveShareSet.textContent = "Sačuvaj";
    }
}

// events
els.aptOwnerType?.addEventListener("change", () => {
    applyAgencyUI();
});

els.aptGroup?.addEventListener("change", () => {
    applyShareUI();
});

els.btnOpen.addEventListener("click", handleOpenCreate);
els.btnSave.addEventListener("click", handleSaveClick);
els.btnNewShareSet.addEventListener("click", openShareModal);
els.btnSaveShareSet.addEventListener("click", handleSaveShareSet);

attachModalCloseHandlers();
attachShareModalCloseHandlers();
load().catch(err => {
    console.error(err);
    setMsg(els.msgBox, "err", err.message || "Greška pri inicijalizaciji settings-a.");
});
