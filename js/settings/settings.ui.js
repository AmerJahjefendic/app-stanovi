// js/settings/settings.ui.js

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

        tr.innerHTML = `
            <td>${escapeHtml(groupLabel)}</td>
            <td>${escapeHtml(r.ownerType || "")}</td>
            <td>${escapeHtml(r.name || "")}</td>
            <td>${escapeHtml(r.address || "")}</td>
            <td>${escapeHtml(r.ownerName || "")}</td>
            <td>${r.agencyPct === null || r.agencyPct === undefined ? "" : Number(r.agencyPct)}</td>
            <td>${r.isActive === false ? "Ne" : "Da"}</td>
            <td class="rowActions"></td>
        `;

        const actions = tr.querySelector(".rowActions");

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn";
        btnEdit.type = "button";
        btnEdit.textContent = "Edit";
        btnEdit.addEventListener("click", () => handlers.onEdit(r.id));
        actions.appendChild(btnEdit);

        const btnToggle = document.createElement("button");
        btnToggle.className = "btn";
        btnToggle.type = "button";
        const curActive = (r.isActive !== false);
        const nextActive = !curActive;
        btnToggle.textContent = curActive ? "Deactivate" : "Activate";
        btnToggle.addEventListener("click", () => handlers.onToggleActive(r.id, nextActive));
        actions.appendChild(btnToggle);

        // Delete samo ako je neaktivan i nije core A/Z/N
        if (!curActive && !["A", "Z", "N"].includes(String(r.id))) {
            const btnDel = document.createElement("button");
            btnDel.className = "btn";
            btnDel.type = "button";
            btnDel.textContent = "Delete";
            btnDel.addEventListener("click", () => handlers.onDelete(r.id));
            actions.appendChild(btnDel);
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
