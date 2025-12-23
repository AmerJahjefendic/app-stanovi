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
          <td class="right">${fmtEUR(sumsAZN.A.income)}</td>
          <td class="right">${fmtNum(sumsAZN.A.nights)}</td>
        </tr>
        <tr>
          <td>Z</td>
          <td class="right">${fmtEUR(sumsAZN.Z.income)}</td>
          <td class="right">${fmtNum(sumsAZN.Z.nights)}</td>
        </tr>
        <tr>
          <td>N - Ukupan prihod</td>
          <td class="right">${fmtEUR(nb.income_total)}</td>
          <td class="right">${fmtNum(nightsN)}</td>
        </tr>
        <tr>
          <td>N - Moja zarada</td>
          <td class="right">${fmtEUR(nb.my_commission)}</td>
          <td class="right">—</td>
        </tr>
        <tr>
          <td>N - Vlasnik</td>
          <td class="right">${fmtEUR(nb.owner)}</td>
          <td class="right">—</td>
        </tr>
        <tr class="totalRow">
          <td><strong>TOTAL</strong></td>
          <td class="right"><strong>${fmtEUR(total.income)}</strong></td>
          <td class="right"><strong>${fmtNum(total.nights)}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}

// ---------- ITEMS TABLE (taksativne stavke) ----------
export function renderIncomeItemsTable(root, items) {
  if (!items || items.length === 0) {
    root.innerHTML = `<p class="note">Nema stavki za prikaz.</p>`;
    return;
  }

  // sort: newest first (isto kao troškovi: year desc, month desc, pa apt)
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
          <th class="right">EUR</th>
          <th class="right">Noćenja</th>
          <th>Napomena</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.year}-${String(r.month).padStart(2, "0")}</td>
            <td>${r.apartment || "—"}</td>
            <td class="right">${fmtEUR(r.amount_eur)}</td>
            <td class="right">${fmtNum(r.nights)}</td>
            <td>${r.note || r.source || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---------- BY APARTMENT TABLE (simple) ----------
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
        ${apts
          .map((apt) => {
            const label = (apt === "N") ? "N (moja provizija)" : apt;
            return `
              <tr>
                <td>${label}</td>
                <td class="right">${fmtEUR(sums?.[apt]?.income || 0)}</td>
                <td class="right">${fmtNum(sums?.[apt]?.nights || 0)}</td>
              </tr>
            `;
          })
          .join("")}
        <tr class="totalRow">
          <td><strong>TOTAL</strong></td>
          <td class="right"><strong>${fmtEUR(total.income)}</strong></td>
          <td class="right"><strong>${fmtNum(total.nights)}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}
