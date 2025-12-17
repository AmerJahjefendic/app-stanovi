function fmtEUR(x) {
  return new Intl.NumberFormat("bs-BA", { style: "currency", currency: "EUR" }).format(x || 0);
}

export function renderExpenseFilters(catSelect, cats, selected) {
  const uniq = Array.from(new Set(cats)).sort((a,b) => a.localeCompare(b, "bs"));
  catSelect.innerHTML = [`<option value="ALL">Sve</option>`]
    .concat(uniq.map(c => `<option value="${c}">${c}</option>`))
    .join("");
  catSelect.value = selected || "ALL";
}

export function renderExpensesByCategory(root, expenses) {
  const map = new Map();
  for (const e of expenses) {
    const k = e.category || "NEPOZNATO";
    map.set(k, (map.get(k) || 0) + (e.amount_eur || 0));
  }

  const rows = Array.from(map.entries()).sort((a,b) => b[1]-a[1]);

  root.innerHTML = `
    <table>
      <thead><tr><th>Kategorija</th><th class="right">EUR</th></tr></thead>
      <tbody>
        ${rows.map(([k,sum]) => `<tr><td>${k}</td><td class="right">${fmtEUR(sum)}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

export function renderExpensesList(root, expenses) {
  // sort: newest first by year/month if exists
  const rows = [...expenses].sort((a,b) =>
    (b.year-a.year) || (b.month-a.month) || String(b.category).localeCompare(String(a.category))
  );

  root.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Period</th><th>Apt</th><th>Kategorija</th><th class="right">EUR</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${e.year}-${String(e.month).padStart(2,"0")}</td>
            <td>${e.apartment || "—"}</td>
            <td>${e.category || "NEPOZNATO"}</td>
            <td class="right">${fmtEUR(e.amount_eur)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
