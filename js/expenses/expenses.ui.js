// js/expenses/expenses.ui.js

// ---------- FORMAT ----------
export function fmtEUR(x) {
  return new Intl.NumberFormat("bs-BA", {
    style: "currency",
    currency: "EUR",
  }).format(Number(x || 0));
}

// ---------- FILTERS ----------
export function renderExpenseFilters(selectEl, cats, selected) {
  if (!selectEl) return;

  const uniq = Array.from(
    new Set((cats || []).filter(Boolean).map((c) => String(c).trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "bs"));

  selectEl.innerHTML = [`<option value="ALL">Sve</option>`]
    .concat(uniq.map((c) => `<option value="${escapeHtmlAttr(c)}">${escapeHtml(c)}</option>`))
    .join("");

  selectEl.value = selected || "ALL";
}

// ---------- TABLE: BY CATEGORY ----------
export function renderExpensesByCategory(root, expenses) {
  const map = new Map();
  for (const e of expenses) {
    const k = e.category || "NEPOZNATO";
    map.set(k, (map.get(k) || 0) + (e.amount_eur || 0));
  }

  const rows = Array.from(map.entries()).sort((a,b) => b[1]-a[1]);

  root.innerHTML = `
    <table class="catTable">
      <thead><tr><th>Kategorija</th><th class="right">EUR</th></tr></thead>
      <tbody>
        ${rows.map(([k,sum]) => `
          <tr class="catRow" data-cat="${k}">
            <td>${k}</td>
            <td class="right">${fmtEUR(sum)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


// ---------- TABLE: RAW LIST ----------
export function renderExpensesList(root, expenses) {
  if (!root) return;

  // sort: newest first by year/month, then category
  const rows = [...(expenses || [])].sort(
    (a, b) =>
      (Number(b.year || 0) - Number(a.year || 0)) ||
      (Number(b.month || 0) - Number(a.month || 0)) ||
      String(b.category || "").localeCompare(String(a.category || ""), "bs")
  );

  root.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Period</th><th>Apt</th><th>Kategorija</th><th class="right">EUR</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((e) => {
            const period = `${Number(e.year || 0)}-${String(Number(e.month || 0)).padStart(2, "0")}`;
            const apt = e.apartment ? String(e.apartment) : "—";
            const cat = (e.category && String(e.category).trim()) ? String(e.category).trim() : "NEPOZNATO";
            const eur = Number(e.amount_eur || 0);

            return `
              <tr>
                <td>${escapeHtml(period)}</td>
                <td>${escapeHtml(apt)}</td>
                <td>${escapeHtml(cat)}</td>
                <td class="right">${fmtEUR(eur)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// ---------- YEAR BREAKDOWN (Jan–Dec) ----------
const MONTHS_BS_SHORT = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

export function renderYearBreakdownTable(root, rows) {
  if (!root) return;

  // napravi mapu month -> eur
  const byM = new Map();
  for (const r of rows || []) {
    const m = Number(r.month || 0);
    if (m >= 1 && m <= 12) byM.set(m, Number(r.eur || 0));
  }

  const eurRow = [];
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const v = byM.get(m) || 0;
    eurRow.push(v);
    total += v;
  }

  root.innerHTML = `
  <div class="yearBreakdownWrap">
    <table class="yearBreakdown">
      <thead>
        <tr>
          ${MONTHS_BS_SHORT.map(n => `<th class="center">${n}</th>`).join("")}
          <th class="right totalCol">Ukupno</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          ${eurRow.map(v => `<td class="center">${fmtEUR(v)}</td>`).join("")}
          <td class="right totalCol"><b>${fmtEUR(total)}</b></td>
        </tr>
      </tbody>
    </table>
  </div>
`;
}

// ---------- tiny escaping helpers (da ne pukne HTML ako ima navodnika itd.) ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeHtmlAttr(s) {
  // isto kao escapeHtml, ali jasno da ide u attribute
  return escapeHtml(s);
}
