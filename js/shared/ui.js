// js/shared/ui.js
import { fmtEUR, fmtNum, MONTH_NAMES } from "./utils.js";
import { APARTMENTS } from "./constants.js";

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


export function renderKPIs({ income, expenses, net, nights, net_avg, expense_ratio}, els) {
   els.kpiIncome.textContent = fmtEUR(income, { dashIfNull: true });
   els.kpiExpenses.textContent = fmtEUR(expenses, { dashIfNull: true });
   els.kpiNet.textContent = fmtEUR(net, { dashIfNull: true });
   els.kpiNights.textContent = fmtNum(nights, { dashIfNull: true });

   setSignClass(els.kpiNet, Number.isFinite(net) ? (net >= 0 ? "positive" : "negative") : null);
// Novo KPI
function fmtPct01(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

if (els.kpiNetAvg) {
  els.kpiNetAvg.textContent =
    net_avg == null ? "—" : fmtEUR(net_avg, { dashIfNull: true });
  setSignClass(els.kpiNetAvg, Number.isFinite(net_avg) ? (net_avg >= 0 ? "positive" : "negative") : null);
}

if (els.kpiExpenseRatio) {
  els.kpiExpenseRatio.textContent =
    expense_ratio == null ? "—" : fmtPct01(expense_ratio);
  setSignClass(els.kpiExpenseRatio, Number.isFinite(expense_ratio) ? (expense_ratio > 0.6 ? "warning" : null) : null);
}
// kraj Novo KPI  
}

function setSignClass(el, kind) {
  if (!el) return;
  el.classList.remove("positive", "negative", "warning");
  if (kind) el.classList.add(kind);
}

export function renderIncomeTable(root, perApt, aptFilter) {
  const rows = aptFilter === "ALL" ? Object.keys(perApt || {}) : [aptFilter];
  let html = `<table><thead><tr><th>Apartman</th><th class="right">Prihod (EUR)</th><th class="right">Noćenja</th></tr></thead><tbody>`;
  for (const a of rows) {
    const row = perApt?.[a] || { income: 0, nights: 0 };
    html += `<tr><td><b>${a}</b></td><td class="right">${fmtEUR(row.income, { dashIfNull: true })}</td><td class="right">${fmtNum(row.nights, { dashIfNull: true })}</td></tr>`;
  }
  html += `</tbody></table>`;
  root.innerHTML = html;
}

export function renderExpenseTable(root, report, aptFilter) {
  const { perApt = {}, sharedTotal = 0, sharedA = 0, sharedZ = 0 } = report || {};

  if (aptFilter === APARTMENTS.A) {
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
  if (aptFilter === APARTMENTS.Z) {
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

  if (aptFilter && aptFilter !== "ALL") {
    const total = Number(perApt?.[aptFilter]?.expenses || 0);
    const label = aptFilter === APARTMENTS.N ? "Troškovi N (Apt N tab)" : `Troškovi ${aptFilter}`;
    root.innerHTML = `
      <table>
        <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
        <tbody><tr><td><b>${label}</b></td><td class="right"><b>${fmtEUR(total, { dashIfNull: true })}</b></td></tr></tbody>
      </table>`;
    return;
  }

  const rows = Object.entries(perApt || {});
  const total = rows.reduce((sum, [, row]) => sum + Number(row?.expenses || 0), 0);
  root.innerHTML = `
    <table>
      <thead><tr><th>Stavka</th><th class="right">EUR</th></tr></thead>
      <tbody>
        ${rows.map(([id, row]) => `<tr><td>Troškovi ${id}</td><td class="right">${fmtEUR(row?.expenses, { dashIfNull: true })}</td></tr>`).join("")}
        <tr><td><b>Ukupno</b></td><td class="right"><b>${fmtEUR(total, { dashIfNull: true })}</b></td></tr>
      </tbody>
    </table>`;
}

export function renderNNote(root, nCommission) {
  if (!root) return;
  const box = root.closest?.(".box") || null;
  if (!nCommission) {
    root.textContent = "";
    if (box) box.hidden = true;
    return;
  }
  if (box) box.hidden = false;
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
      ${MONTH_NAMES.map((mName, idx) => {
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

// ===== Status / Error helpers =====
function resolveStatusEl() {
  return (
    document.getElementById("status") ||
    document.getElementById("incStatus") ||
    document.getElementById("expStatus")
  );
}

export function setLoading(isLoading, msg = "Učitavam…") {
  const el = resolveStatusEl();
  if (!el) return;
  if (isLoading) {
    el.textContent = msg;
    el.classList.remove("is-error");
  } else {
    // keep last status empty when not loading
    if (el.textContent === msg) el.textContent = "";
  }
}

export function showError(error) {
  const el = resolveStatusEl();
  const msg = (error && error.message) ? error.message : "Dogodila se greška.";
  if (el) {
    el.textContent = msg;
    el.classList.add("is-error");
  } else {
    // fallback if no status element on page
    alert(msg);
  }
}

export async function withLoading(fn, msg = "Učitavam…") {
  setLoading(true, msg);
  try {
    return await fn();
  } catch (e) {
    showError(e);
    throw e;
  } finally {
    setLoading(false, msg);
  }
}

export function initMobileMenu({ btnId="btnMenu", menuId="mobileMenu", backdropId="menuBackdrop" } = {}) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  const backdrop = document.getElementById(backdropId);
  if (!btn || !menu || !backdrop) return;

  const close = () => {
    menu.classList.add("is-hidden");
    backdrop.classList.add("is-hidden");
    menu.setAttribute("aria-hidden", "true");
    btn.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    menu.classList.remove("is-hidden");
    backdrop.classList.remove("is-hidden");
    menu.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = !menu.classList.contains("is-hidden");
    isOpen ? close() : open();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  backdrop.addEventListener("click", close);
  menu.addEventListener("click", (e) => {
    if (e.target.closest("[data-menu-close]")) close();
  });

  // zatvori ako promijeniš width u desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) close();
  });

  return { open, close };
}

