// js/settings/settings.page.js
import {
    apartmentsListAll,
    apartmentsGet,
    apartmentsCreate,
    apartmentsUpdate,
    apartmentsSetActive,
    apartmentsDelete,
    groupsListAll,
    OWNER_TYPE,
} from "../shared/apartments.service.js";

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
  group: document.getElementById("aptGroup"),
  ownerType: document.getElementById("aptOwnerType"),
  agencyPct: document.getElementById("aptAgencyPct"),
  ownerName: document.getElementById("aptOwnerName"),
  sort: document.getElementById("aptSort"),
  isActive: document.getElementById("aptIsActive"),

  agencyRow: document.getElementById("agencyRow"),

  tbody: document.getElementById("aptTbody"),
};

let _groups = [];
let _groupMap = {};
let _lastFocusEl = null;

function normId(v) {
    return String(v || "").trim();
}

function isManaged() {
    return els.ownerType.value === OWNER_TYPE.MANAGED;
}

function applyOwnerTypeUI() {
    const managed = isManaged();

    if (managed) els.agencyRow.classList.remove("is-hidden");
    else els.agencyRow.classList.add("is-hidden");

    if (!managed) {
        els.agencyPct.value = "";
        if (els.ownerName) els.ownerName.value = "";
    }
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

    els.ownerType.value = OWNER_TYPE.OWNED;
    els.agencyPct.value = "";
    if (els.ownerName) els.ownerName.value = "";

    els.sort.value = "";
    els.isActive.checked = true;

    if (_groups.length) els.group.value = _groups[0].id;

    applyOwnerTypeUI();
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

async function load() {
    _groups = await groupsListAll();
    _groupMap = Object.fromEntries(_groups.map(g => [g.id, g.name]));
    renderGroupsSelect(els.group, _groups);

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
        els.group.value = row.groupId || (_groups[0]?.id || "AZ");
        els.ownerType.value = row.ownerType || OWNER_TYPE.OWNED;
        els.agencyPct.value = (row.agencyPct === null || row.agencyPct === undefined) ? "" : String(row.agencyPct);
        els.sort.value = (row.sort === null || row.sort === undefined) ? "" : String(row.sort);
        els.isActive.checked = row.isActive !== false;
        els.address.value = row.address || "";
        if (els.ownerName) els.ownerName.value = row.ownerName || "";

        applyOwnerTypeUI();

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

    try {
        const mode = els.editMode.value;

        const payload = {
            id: normId(els.id.value),
            name: String(els.name.value || "").trim(),
            address: String(els.address.value || "").trim(),
            groupId: els.group.value,
            ownerType: els.ownerType.value,
            agencyPct: els.agencyPct.value,
            ownerName: els.ownerName ? String(els.ownerName.value || "").trim() : "",
            sort: els.sort.value,
            isActive: !!els.isActive.checked,
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
        setMsg(els.msgBox, "err", e.message || "Greška pri snimanju.");
    }
}

// events
els.ownerType.addEventListener("change", applyOwnerTypeUI);
els.btnOpen.addEventListener("click", handleOpenCreate);
els.btnSave.addEventListener("click", handleSaveClick);

attachModalCloseHandlers();
load().catch(err => {
    console.error(err);
    setMsg(els.msgBox, "err", err.message || "Greška pri inicijalizaciji settings-a.");
});
