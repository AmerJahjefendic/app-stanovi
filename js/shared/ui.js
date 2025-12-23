// js/shared/ui.js
import { fmtEUR, fmtNum } from "./utils.js";

export function renderPeriodList(root, periods, selectedKey) {
  root.innerHTML = "";
  if (!periods.length) {
    root.innerHTML = `<div class="note">Nema importovanih perioda.</div>`;
    return;
  }

  for (const p of periods) {
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const div = document.createElement("div");
    div.className = "listItem" + (key === selectedKey ? " active" : "");
    div.dataset.key = key;
    div.innerHTML = `
      <div>
        <div><b>${p.label}</b></div>
        <small>${p.filename}</small>
      </div>
      <small>${new Date(p.imported_at).toLocaleDateString("bs-BA")}</small>
    `;
    root.appendChild(div);
  }
}

export function renderKPIs({ income, expenses, net, nights }, els) {
  els.kpiIncome.textContent = fmtEUR(income, { dashIfNull: true });
  els.kpiExpenses.textContent = fmtEUR(expenses, { dashIfNull: true });
  els.kpiNet.textContent = fmtEUR(net, { dashIfNull: true });
  els.kpiNights.textContent = fmtNum(nights, { dashIfNull: true });
}

export function renderIncomeTable(root, perApt, aptFilter) {
  const rows = (aptFilter === "ALL") ? ["A", "Z", "N"] : [aptFilter];
  let html = `<table><thead><tr><th>Apartman</th><th class="right">Prihod (EUR)</th><th class="right">Noćenja</th></tr></thead><tbody>`;
  for (const a of rows) {
    html += `<tr><td><b>${a}</b></td><td class="right">${fmtEUR(perApt[a].income, { dashIfNull: true })}</td><td class="right">${fmtNum(perApt[a].nights, { dashIfNull: true })}</td></tr>`;
  }
  html += `</tbody></table>`;
  root.innerHTML = html;
}

export function renderExpenseTable(root, report, aptFilter) {
  const { perApt, sharedTotal, sharedA, sharedZ, nTotal } = report;

  if (aptFilter === "A") {
    root.innerHTML = `
      <table>
        <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
        <tbody>
          <tr><td>Shared total (A+Z)</td><td class="right">${fmtEUR(sharedTotal, { dashIfNull: true })}</td></tr>
          <tr><td><b>Dodijeljeno A (po pravilu)</b></td><td class="right"><b>${fmtEUR(sharedA, { dashIfNull: true })}</b></td></tr>
        </tbody>
      </table>`;
    return;
  }
  if (aptFilter === "Z") {
    root.innerHTML = `
      <table>
        <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
        <tbody>
          <tr><td>Shared total (A+Z)</td><td class="right">${fmtEUR(sharedTotal, { dashIfNull: true })}</td></tr>
          <tr><td><b>Dodijeljeno Z (po pravilu)</b></td><td class="right"><b>${fmtEUR(sharedZ, { dashIfNull: true })}</b></td></tr>
        </tbody>
      </table>`;
    return;
  }
  if (aptFilter === "N") {
    root.innerHTML = `
      <table>
        <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
        <tbody>
          <tr><td><b>Troškovi N (Apt N tab)</b></td><td class="right"><b>${fmtEUR(nTotal, { dashIfNull: true })}</b></td></tr>
        </tbody>
      </table>`;
    return;
  }

  // ALL
  root.innerHTML = `
    <table>
      <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
      <tbody>
        <tr><td>Troškovi A (dodijeljeno)</td><td class="right">${fmtEUR(perApt.A.expenses, { dashIfNull: true })}</td></tr>
        <tr><td>Troškovi Z (dodijeljeno)</td><td class="right">${fmtEUR(perApt.Z.expenses, { dashIfNull: true })}</td></tr>
        <tr><td>Troškovi N</td><td class="right">${fmtEUR(perApt.N.expenses, { dashIfNull: true })}</td></tr>
        <tr><td><b>Ukupno</b></td><td class="right"><b>${fmtEUR(perApt.A.expenses + perApt.Z.expenses + perApt.N.expenses, { dashIfNull: true })}</b></td></tr>
      </tbody>
    </table>`;
}

export function renderNNote(root, nCommission) {
  if (!nCommission) {
    root.textContent = "Nema podatka za N proviziju.";
    return;
  }
  const incomeTotal = Number(nCommission?.incomeN_eur_total);
  const commission = Number(nCommission?.commission_eur);
  const incomeStr = Number.isFinite(incomeTotal) ? incomeTotal.toFixed(2) : "—";
  const commissionStr = Number.isFinite(commission) ? commission.toFixed(2) : "—";

  root.innerHTML = `
    Za apartman <b>N</b>, u KPI i izvještajima kao “prihod” se koristi <b>samo tvoja provizija</b>:
    <br/>
    Provizija = <b>25%</b> × (N priliv iz “Tabela priliva”) + <b>10 EUR</b>.
    <br/><br/>
    <b>Ukupni N priliv (EUR):</b> ${incomeStr} EUR<br/>
    <b>Tvoja provizija (EUR):</b> ${commissionStr} EUR
  `;
}

const MONTHS_BS = [
  "Januar", "Februar", "Mart", "April", "Maj", "Juni",
  "Juli", "August", "Septembar", "Oktobar", "Novembar", "Decembar"
];

export function renderYearCalendar(
  root,
  { year, importedMonthsSet, selectedKey, isYearView = false }
) {
  if (!root) return;

  const selected = selectedKey?.startsWith(`${year}-`)
    ? Number(selectedKey.split("-")[1])
    : null;

  root.innerHTML = `
    <div class="yearCalHeader">
      <button class="btnMini yearBtn" data-cal="year" type="button" title="Prikaži godinu">${year}</button>
      <div class="yearCalNav">
        <button class="btnMini" data-cal="prev">←</button>
        <button class="btnMini" data-cal="next">→</button>
      </div>
    </div>
    <div class="yearCalGrid">
      ${MONTHS_BS.map((mName, idx) => {
        const m = idx + 1;
        const imported = importedMonthsSet.has(m);
        const cls = [
          "monthCell",
          imported ? "is-imported" : "is-missing",
          selected === m ? "is-selected" : "",
          imported ? "" : "is-disabled"
        ].filter(Boolean).join(" ");

        return `<div class="${cls}" data-month="${m}">${mName}</div>`;
      }).join("")}
    </div>
  `;
  const yearEl = root.querySelector("[data-cal='year']");
  if (yearEl) {
    yearEl.classList.toggle("is-active", isYearView);
  }
}


