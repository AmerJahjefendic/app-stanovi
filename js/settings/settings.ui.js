// js/settings/settings.ui.js

import { APARTMENT_STATUS, normalizeApartmentStatus } from "../shared/apartment-lifecycle.js";

export function setMsg(box, type, text) {
    if (!box) return;
    box.style.display = text ? "block" : "none";
    box.className = `msg ${type || ""}`.trim();
    box.textContent = text || "";
}

export function renderGroupsSelect(selectEl, groups) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    for (const g of groups) {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name || g.id;
        selectEl.appendChild(opt);
    }
}

export function renderApartmentsTable(tbody, rows, groupMap, handlers) {
    tbody.innerHTML = "";

    for (const r of rows) {
        const tr = document.createElement("tr");

        const gid = r.groupId || "";
        const groupLabel = groupMap?.[gid] || gid;
        const status = normalizeApartmentStatus(r);
        const statusLabel = status === APARTMENT_STATUS.ACTIVE
            ? "Aktivan"
            : status === APARTMENT_STATUS.ARCHIVED
                ? "Arhiviran"
                : "Neaktivan";

        tr.innerHTML = `
            <td>${escapeHtml(groupLabel)}</td>
            <td>${escapeHtml(r.ownerType || "")}</td>
            <td>${escapeHtml(r.name || "")}</td>
            <td>${escapeHtml(r.address || "")}</td>
            <td>${escapeHtml(r.ownerName || "")}</td>
            <td>${r.agencyPct === null || r.agencyPct === undefined ? "" : Number(r.agencyPct)}</td>
            <td>${escapeHtml(statusLabel)}</td>
            <td class="rowActions"></td>
        `;

        const actions = tr.querySelector(".rowActions");

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn";
        btnEdit.type = "button";
        btnEdit.textContent = "Edit";
        btnEdit.addEventListener("click", () => handlers.onEdit(r.id));
        actions.appendChild(btnEdit);

        if (status === APARTMENT_STATUS.ACTIVE) {
            const btnDeactivate = document.createElement("button");
            btnDeactivate.className = "btn";
            btnDeactivate.type = "button";
            btnDeactivate.textContent = "Deactivate";
            btnDeactivate.addEventListener("click", () => handlers.onToggleActive(r.id, false));
            actions.appendChild(btnDeactivate);
        } else if (status === APARTMENT_STATUS.INACTIVE) {
            const btnActivate = document.createElement("button");
            btnActivate.className = "btn";
            btnActivate.type = "button";
            btnActivate.textContent = "Activate";
            btnActivate.addEventListener("click", () => handlers.onToggleActive(r.id, true));
            actions.appendChild(btnActivate);

            const btnArchive = document.createElement("button");
            btnArchive.className = "btn";
            btnArchive.type = "button";
            btnArchive.textContent = "Archive";
            btnArchive.addEventListener("click", () => handlers.onArchive(r.id));
            actions.appendChild(btnArchive);

            const btnDel = document.createElement("button");
            btnDel.className = "btn";
            btnDel.type = "button";
            btnDel.textContent = "Delete";
            btnDel.addEventListener("click", () => handlers.onDelete(r.id));
            actions.appendChild(btnDel);
        } else {
            const btnRestore = document.createElement("button");
            btnRestore.className = "btn";
            btnRestore.type = "button";
            btnRestore.textContent = "Restore";
            btnRestore.addEventListener("click", () => handlers.onRestore(r.id));
            actions.appendChild(btnRestore);
        }

        tbody.appendChild(tr);
    }
}

export function showAgencyRow(agencyRowEl, show) {
    if (!agencyRowEl) return;
    agencyRowEl.style.display = show ? "flex" : "none";
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
