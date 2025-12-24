// js/income/income.ui.js
import { fmtEUR, fmtNum } from "../shared/utils.js";

// ---------- SUMMARY BOX (A/Z/N breakdown) ----------
export function renderIncomeSummary(root, { sumsAZN, nBreakdown, total }) {
  const nb = nBreakdown || { income_total: 0, my_commission: 0, owner: 0 };
  const nightsN = (sumsAZN?.N?.nights ?? 0);

  root.innerHTML = `
    <table class="catTable">
      <thead>
        <tr>
          <th>Apartman</th>
          <th class="right">Prihod (EUR)</th>
          <th class="right">Noćenja</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>A</td>
          <td class="right">${fmtEUR(sumsAZN?.A?.income || 0)}</td>
          <td class="right">${fmtNum(sumsAZN?.A?.nights || 0)}</td>
        </tr>
        <tr>
          <td>Z</td>
          <td class="right">${fmtEUR(sumsAZN?.Z?.income || 0)}</td>
          <td class="right">${fmtNum(sumsAZN?.Z?.nights || 0)}</td>
        </tr>
        <tr>
          <td>N - Ukupan prihod (NET nama)</td>
          <td class="right">${fmtEUR(nb.income_total || 0)}</td>
          <td class="right">${fmtNum(nightsN || 0)}</td>
        </tr>
        <tr>
          <td>N - Moja zarada</td>
          <td class="right">${fmtEUR(nb.my_commission || 0)}</td>
          <td class="right">—</td>
        </tr>
        <tr>
          <td>N - Vlasnik</td>
          <td class="right">${fmtEUR(nb.owner || 0)}</td>
          <td class="right">—</td>
        </tr>
        <tr class="totalRow">
          <td><strong>TOTAL</strong></td>
          <td class="right"><strong>${fmtEUR(total?.income || 0)}</strong></td>
          <td class="right"><strong>${fmtNum(total?.nights || 0)}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}

// ---------- ITEMS TABLE (taksativne stavke) ----------
// ---------- ITEMS TABLE (taksativne stavke) ----------
export function renderIncomeItemsTable(root, items) {
  if (!items || items.length === 0) {
    root.innerHTML = `<p class="note">Nema stavki za prikaz.</p>`;
    return;
  }

  // sort: newest first
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
          <th class="right">Gross</th>
          <th class="right">Fee</th>
          <th class="right">NET (EUR)</th>
          <th class="right">Noćenja</th>
          <th>Plaćeno</th>
          <th>Napomena</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const period = `${r.year}-${String(r.month).padStart(2, "0")}`;

          // NET je amount_eur (kod tebe je to "što ostaje nama" za N, i prihod za A/Z)
          const net = Number(r.amount_eur ?? r.income_eur ?? 0) || 0;

          // gross: koristimo reservation_gross_eur ako postoji (booking i N+airbnb), inače net
          const gross = Number(r.reservation_gross_eur ?? r.gross_eur ?? net) || 0;

          // fee: booking_fee_eur koristimo i za Airbnb fee (opc 1 koju si izabrao)
          const fee = Number(r.booking_fee_eur ?? 0) || 0;

          const paid = !!r.paid;

          // Ako nema r.id -> to je fallback/sumarno -> disable toggle
          const canToggle = !!r.id;

          return `
            <tr>
              <td>${period}</td>
              <td>${r.apartment || "—"}</td>
              <td>${r.platform || "—"}</td>
              <td class="right">${fmtEUR(gross)}</td>
              <td class="right">${fmtEUR(fee)}</td>
              <td class="right">${fmtEUR(net)}</td>
              <td class="right">${fmtNum(r.nights)}</td>
              <td>
                <label style="display:flex; align-items:center; gap:8px;">
                  <input
                    type="checkbox"
                    class="js-paid-toggle"
                    data-id="${r.id || ""}"
                    ${paid ? "checked" : ""}
                    ${canToggle ? "" : "disabled"}
                  />
                  <span>${paid ? "DA" : "NE"}</span>
                </label>
              </td>
              <td>${r.note || r.source || ""}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

// ---------- BY APARTMENT TABLE ----------
export function renderIncomeByApt(root, sums) {
  const apts = ["A", "Z", "N"];

  const total = apts.reduce(
    (acc, apt) => ({
      income: acc.income + Number(sums?.[apt]?.income || 0),
      nights: acc.nights + Number(sums?.[apt]?.nights || 0),
    }),
    { income: 0, nights: 0 }
  );

  root.innerHTML = `
    <table class="catTable">
      <thead>
        <tr>
          <th>Apartman</th>
          <th class="right">Prihod (EUR)</th>
          <th class="right">Noćenja</th>
        </tr>
      </thead>
      <tbody>
        ${apts.map((apt) => {
          const label = (apt === "N") ? "N (moja provizija)" : apt;
          return `
            <tr>
              <td>${label}</td>
              <td class="right">${fmtEUR(sums?.[apt]?.income || 0)}</td>
              <td class="right">${fmtNum(sums?.[apt]?.nights || 0)}</td>
            </tr>
          `;
        }).join("")}
        <tr class="totalRow">
          <td><strong>TOTAL</strong></td>
          <td class="right"><strong>${fmtEUR(total.income)}</strong></td>
          <td class="right"><strong>${fmtNum(total.nights)}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}
