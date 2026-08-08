// js/income/income.ui.js
import { fmtEUR, fmtNum } from "../shared/utils.js";

// ---------- SUMMARY BOX (A/Z/N breakdown) ----------
export function renderIncomeSummary(root, { sumsAZN, managedBreakdowns, nBreakdown, total }) {
  const sums = sumsAZN || {};
  const legacyN = nBreakdown || { income_total: 0, my_commission: 0, owner: 0 };
  const managed = { ...(managedBreakdowns || {}) };
  if (!managed.N && (legacyN.income_total || legacyN.my_commission || legacyN.owner)) {
    managed.N = legacyN;
  }
  const apartments = Object.keys(sums).sort((a, b) => {
    const priority = { A: 0, Z: 1, N: 2 };
    const pa = priority[a] ?? 100;
    const pb = priority[b] ?? 100;
    return pa - pb || a.localeCompare(b, "bs");
  });

  const rows = apartments.map((apt) => {
    if (managed[apt]) {
      const breakdown = managed[apt];
      const nights = sums?.[apt]?.nights ?? 0;
      return `
        <tr><td>${apt} - Ukupan prihod</td><td class="right">${fmtEUR(breakdown.income_total)}</td><td class="right">${fmtNum(nights)}</td></tr>
        <tr><td>${apt} - Moja zarada</td><td class="right">${fmtEUR(breakdown.my_commission)}</td><td class="right">—</td></tr>
        <tr><td>${apt} - Vlasnik</td><td class="right">${fmtEUR(breakdown.owner)}</td><td class="right">—</td></tr>`;
    }

    return `
      <tr>
        <td>${apt}</td>
        <td class="right">${fmtEUR(sums?.[apt]?.income || 0)}</td>
        <td class="right">${fmtNum(sums?.[apt]?.nights || 0)}</td>
      </tr>`;
  }).join("");

  root.innerHTML = `
    <table class="catTable">
      <thead><tr><th>Apartman</th><th class="right">Prihod (EUR)</th><th class="right">Noćenja</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="totalRow"><td><strong>TOTAL</strong></td><td class="right"><strong>${fmtEUR(total.income)}</strong></td><td class="right"><strong>${fmtNum(total.nights)}</strong></td></tr>
      </tbody>
    </table>`;
}

function platformLabel(p) {
  const x = String(p || "").toLowerCase();
  if (x === "airbnb") return "Airbnb";
  if (x === "booking") return "Booking";
  if (x === "vrbo") return "VRBO";
  if (x === "direct") return "Direktno";
  if (x === "other") return "Ostalo";
  return "—";
}

function platformClass(p) {
  const x = String(p || "").toLowerCase();
  if (["airbnb", "booking", "vrbo", "direct", "other"].includes(x)) return x;
  return "unknown";
}

function paidIcon(paid) {
  return paid ? "✔" : "⏳";
}

function formatDateBS(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function stayPeriodLabel(row) {
  const checkin = formatDateBS(row.checkin);
  const checkout = formatDateBS(row.checkout);
  if (checkin && checkout) {
    return `${checkin} – ${checkout}`;
  }
  return `${row.year}-${String(row.month).padStart(2, "0")}`;
}

// ---------- ITEMS TABLE (taksativne stavke) ----------
export function renderIncomeItemsTable(root, items) {
  if (!items || items.length === 0) {
    root.innerHTML = `<p class="note">Nema stavki za prikaz.</p>`;
    return;
  }

  const rows = [...items].sort((a, b) =>
    (b.year - a.year) ||
    (b.month - a.month) ||
    String(a.apartment || "").localeCompare(String(b.apartment || ""), "bs") ||
    (Number(b.amount_eur || 0) - Number(a.amount_eur || 0))
  );

  root.innerHTML = `
    <table class="dataTable">
      <thead>
        <tr>
          <th>Period</th>
          <th>Apt</th>
          <th>Platforma</th>
          <th class="right">EUR</th>
          <th class="right">Noćenja</th>
          <th>Napomena</th>
          <th>Status</th>
          <th>Akcije</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${stayPeriodLabel(r)}</td>
            <td>${r.apartment || "—"}</td>
            <td>
              <span class="badge ${platformClass(r.platform)}">
                ${platformLabel(r.platform)}
              </span>
            </td>
            <td class="right">${fmtEUR(r.amount_eur)}</td>
            <td class="right">${fmtNum(r.nights)}</td>
            <td>${r.note || r.source || ""}</td>
            <td>
              <input
                type="checkbox"
                class="paidToggle"
                data-id="${r.id}"
                ${r.paid ? "checked" : ""}
              />
            </td>
            <td>
              ${
                r.id
                  ? `
                      <div class="action-buttons">
                        <button
                          type="button"
                          class="btn-edit"
                          data-action="edit-income-item"
                          data-id="${r.id}"
                          title="Uredi prihod"
                        >
                          ✏ Uredi
                        </button>
                        <button
                          type="button"
                          class="btn-delete"
                          data-action="delete-income-item"
                          data-id="${r.id}"
                          title="Obriši prihod"
                        >
                          🗑 Obriši
                        </button>
                      </div>
                    `
                  : "—"
              }
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---------- BY APARTMENT TABLE (simple) ----------
export function renderIncomeByApt(root, sums, managedBreakdowns = {}) {
  const values = sums || {};
  const apts = Object.keys(values).sort((a, b) => {
    const priority = { A: 0, Z: 1, N: 2 };
    const pa = priority[a] ?? 100;
    const pb = priority[b] ?? 100;
    return pa - pb || a.localeCompare(b, "bs");
  });

  const total = apts.reduce(
    (acc, apt) => ({
      income: acc.income + Number(values?.[apt]?.income || 0),
      nights: acc.nights + Number(values?.[apt]?.nights || 0),
    }),
    { income: 0, nights: 0 }
  );

  root.innerHTML = `
    <table class="catTable">
      <thead><tr><th>Apartman</th><th class="right">Prihod (EUR)</th><th class="right">Noćenja</th></tr></thead>
      <tbody>
        ${apts.map((apt) => {
          const label = managedBreakdowns?.[apt] ? `${apt} (moja provizija)` : apt;
          return `<tr><td>${label}</td><td class="right">${fmtEUR(values?.[apt]?.income || 0)}</td><td class="right">${fmtNum(values?.[apt]?.nights || 0)}</td></tr>`;
        }).join("")}
        <tr class="totalRow"><td><strong>TOTAL</strong></td><td class="right"><strong>${fmtEUR(total.income)}</strong></td><td class="right"><strong>${fmtNum(total.nights)}</strong></td></tr>
      </tbody>
    </table>`;
}

