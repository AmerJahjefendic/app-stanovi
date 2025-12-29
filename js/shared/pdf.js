// js/shared/pdf.js
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtEur(n) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return esc(n);
  return x.toFixed(2);
}

export function renderPeriodReportToPrintRoot(dto, { title = "Mjesečni izvještaj" } = {}) {
  const root = document.getElementById("print-root");
  if (!root) throw new Error("Missing #print-root");

  const kpi = dto?.kpi ?? {};
  const perApt = dto?.perApt ?? {};
  const a = perApt.A ?? null;
  const z = perApt.Z ?? null;
  const n = perApt.N ?? null;

  root.innerHTML = `
    <div class="print-root">
      <div class="print-title">${esc(title)}</div>

      <div class="print-section-title">KPI</div>
      <div class="print-kpi avoid-break">
        <div class="row"><span class="label">Income (EUR)</span><span class="value">${fmtEur(kpi.income)}</span></div>
        <div class="row"><span class="label">Expenses (EUR)</span><span class="value">${fmtEur(kpi.expenses)}</span></div>
        <div class="row"><span class="label">Shared total (EUR)</span><span class="value">${fmtEur(dto.sharedTotal)}</span></div>
        <div class="row"><span class="label">N commission (EUR)</span><span class="value">${fmtEur(kpi.nCommission)}</span></div>
        <div class="row"><span class="label">Net (EUR)</span><span class="value">${fmtEur(kpi.net)}</span></div>
        <div class="row"><span class="label">Nights</span><span class="value">${esc(kpi.nights)}</span></div>
      </div>

      <div class="print-section-title">Po apartmanu</div>
      <table class="print-table avoid-break">
        <thead>
          <tr>
            <th>Apt</th>
            <th class="num">Income (EUR)</th>
            <th class="num">Expenses (EUR)</th>
            <th class="num">Net (EUR)</th>
            <th class="center">Nights</th>
          </tr>
        </thead>
        <tbody>
          ${a ? `
            <tr>
              <td>A</td><td class="num">${fmtEur(a.income)}</td><td class="num">${fmtEur(a.expenses)}</td><td class="num">${fmtEur(a.net)}</td><td class="center">${esc(a.nights)}</td>
            </tr>` : ""}
          ${z ? `
            <tr>
              <td>Z</td><td class="num">${fmtEur(z.income)}</td><td class="num">${fmtEur(z.expenses)}</td><td class="num">${fmtEur(z.net)}</td><td class="center">${esc(z.nights)}</td>
            </tr>` : ""}
          ${n ? `
            <tr>
              <td>N</td><td class="num">${fmtEur(n.income)}</td><td class="num">${fmtEur(n.expenses)}</td><td class="num">${fmtEur(n.net)}</td><td class="center">${esc(n.nights)}</td>
            </tr>` : ""}
        </tbody>
      </table>

      <div class="print-section-title">Shared raspodjela</div>
      <div class="print-kpi avoid-break">
        <div class="row"><span class="label">Shared → A (EUR)</span><span class="value">${fmtEur(dto.sharedA)}</span></div>
        <div class="row"><span class="label">Shared → Z (EUR)</span><span class="value">${fmtEur(dto.sharedZ)}</span></div>
        <div class="row"><span class="label">Shared total (EUR)</span><span class="value">${fmtEur(dto.sharedTotal)}</span></div>
      </div>
    </div>
  `;
}

export function printToPdf() {
  window.print();
}
