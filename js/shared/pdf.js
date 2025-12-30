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

export function renderPeriodReportToPrintRoot(
  dto,
  { title = "Mjesečni izvještaj", aptFilter = "ALL", shareRule = "NIGHTS" } = {}
) {
  const root = document.getElementById("print-root");
  if (!root) throw new Error("Missing #print-root");

  const kpi = dto?.kpi ?? {};
  const perApt = dto?.perApt ?? {};
  const a = perApt.A ?? null;
  const z = perApt.Z ?? null;
  const n = perApt.N ?? null;

  const isSingle = aptFilter && aptFilter !== "ALL";
  const single = isSingle ? (perApt?.[aptFilter] ?? null) : null;

  const incomeLabel =
    (isSingle && aptFilter === "N") ? "Commission (EUR)" : "Income (EUR)";

  const showSharedBlock = !isSingle;   // raspodjela A/Z samo u ALL
  const showPerAptTable = !isSingle;  // tabela A/Z/N samo u ALL


  root.innerHTML = `
    <div class="print-root">
      <div class="print-title">${esc(title)}</div>

           <div class="print-section-title">KPI</div>
      <div class="print-kpi avoid-break">
        <div class="row"><span class="label">${esc(incomeLabel)}</span><span class="value">${fmtEur(kpi.income)}</span></div>
        <div class="row"><span class="label">Expenses (EUR)</span><span class="value">${fmtEur(kpi.expenses)}</span></div>

        ${isSingle ? `
          <div class="row"><span class="label">Direct apt expenses (EUR)</span><span class="value">${fmtEur(kpi.aptExpenses)}</span></div>
          <div class="row"><span class="label">Shared allocated (EUR)</span><span class="value">${fmtEur(kpi.sharedAlloc)}</span></div>
        ` : `
          <div class="row"><span class="label">Shared total (EUR)</span><span class="value">${fmtEur(kpi.sharedTotal ?? dto.sharedTotal)}</span></div>
          <div class="row"><span class="label">N commission (EUR)</span><span class="value">${fmtEur(kpi.nCommission)}</span></div>
        `}

        <div class="row"><span class="label">Net (EUR)</span><span class="value">${fmtEur(kpi.net)}</span></div>
        <div class="row"><span class="label">Nights</span><span class="value">${esc(kpi.nights)}</span></div>
      </div>


           ${showPerAptTable ? `
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
      ` : `
        <div class="print-section-title">Apartman</div>
        <table class="print-table avoid-break">
          <thead>
            <tr>
              <th>Apt</th>
              <th class="num">${esc(incomeLabel)}</th>
              <th class="num">Expenses (EUR)</th>
              <th class="num">Net (EUR)</th>
              <th class="center">Nights</th>
            </tr>
          </thead>
          <tbody>
            ${single ? `
              <tr>
                <td>${esc(aptFilter)}</td>
                <td class="num">${fmtEur(single.income)}</td>
                <td class="num">${fmtEur(single.expenses)}</td>
                <td class="num">${fmtEur(single.net)}</td>
                <td class="center">${esc(single.nights)}</td>
              </tr>` : ""}
          </tbody>
        </table>
      `}

            ${showSharedBlock ? `
        <div class="print-section-title">Shared raspodjela</div>
        <div class="print-kpi avoid-break">
          <div class="row"><span class="label">Shared → A (EUR)</span><span class="value">${fmtEur(dto.sharedA)}</span></div>
          <div class="row"><span class="label">Shared → Z (EUR)</span><span class="value">${fmtEur(dto.sharedZ)}</span></div>
          <div class="row"><span class="label">Shared total (EUR)</span><span class="value">${fmtEur(dto.sharedTotal)}</span></div>
        </div>
      ` : ``}

    </div>
  `;
}

function fmtDateISO(iso) {
  // očekuje "YYYY-MM-DD"
  if (!iso) return "";
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(s);
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

function fmtInt(n) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return esc(n);
  return String(Math.round(x));
}

/**
 * N Owner report – PDF renderer (NE RAČUNA, samo ispisuje DTO)
 *
 * Očekivani DTO shape:
 * dto = {
 *   meta: { monthLabel, year, propertyName, ownerName, agencyName },
 *   rows: [
 *     { checkin, checkout, totalIncomeEur, nights, agencyCommissionEur, ownerNetEur, pricePerNightEur }
 *   ],
 *   stats: {
 *     ownerNetTotalEur, nightsTotal, avgStayLength, avgPricePerNightEur,
 *     reservationsCount, incomeTotalEur
 *   }
 * }
 */
export function renderNOwnerReportToPrintRoot(dto, { title } = {}) {
  const root = document.getElementById("print-root");
  if (!root) throw new Error("Missing #print-root");

  const meta = dto?.meta ?? {};
  const rows = Array.isArray(dto?.rows) ? dto.rows : [];
  const stats = dto?.stats ?? {};

  const pageTitle = title || `Izvještaj za ${meta.monthLabel ?? ""} ${meta.year ?? ""}`.trim();

  root.innerHTML = `
    <div class="print-root">
      <div class="print-title">${esc(pageTitle)}</div>

      <div class="print-meta avoid-break">
        <div class="kv"><div class="k">Mjesec</div><div class="v">${esc(meta.monthLabel ?? "")}</div></div>
        <div class="kv"><div class="k">Godina</div><div class="v">${esc(meta.year ?? "")}</div></div>
        <div class="kv"><div class="k">Nekretnina</div><div class="v">${esc(meta.propertyName ?? "")}</div></div>
        <div class="kv"><div class="k">Vlasnik</div><div class="v">${esc(meta.ownerName ?? "")}</div></div>
        <div class="kv"><div class="k">Agencija</div><div class="v">${esc(meta.agencyName ?? "")}</div></div>
      </div>

      <div class="print-section-title">Rezervacije</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Datum dolaska</th>
            <th>Datum odlaska</th>
            <th class="num">Ukupan prihod (EUR)</th>
            <th class="center">Broj noćenja</th>
            <th class="num">Provizija agencije (25%) (EUR)</th>
            <th class="num">Neto prihod vlasnika (EUR)</th>
            <th class="num">Cijena po noći</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length
      ? rows
        .map(
          (r) => `
            <tr>
              <td>${fmtDateISO(r.checkin)}</td>
              <td>${fmtDateISO(r.checkout)}</td>
              <td class="num">${fmtEur(r.totalIncomeEur)}</td>
              <td class="center">${fmtInt(r.nights)}</td>
              <td class="num">${fmtEur(r.agencyCommissionEur)}</td>
              <td class="num">${fmtEur(r.ownerNetEur)}</td>
              <td class="num">${fmtEur(r.pricePerNightEur)}</td>
            </tr>`
        )
        .join("")
      : `<tr><td colspan="7" class="center">Nema rezervacija za izabrani period.</td></tr>`
    }
        </tbody>
      </table>

      <div class="print-section-title">Statistika</div>
      <div class="print-kpi avoid-break">
        <div class="row"><span class="label">Ukupan neto prihod za vlasnika (EUR)</span><span class="value">${fmtEur(stats.ownerNetTotalEur)}</span></div>
        <div class="row"><span class="label">Ukupan broj noćenja</span><span class="value">${fmtInt(stats.nightsTotal)}</span></div>
        <div class="row"><span class="label">Prosječna dužina boravka (dani)</span><span class="value">${fmtEur(stats.avgStayLength)}</span></div>
        <div class="row"><span class="label">Prosječna cijena po noćenju (EUR)</span><span class="value">${fmtEur(stats.avgPricePerNightEur)}</span></div>
        <div class="row"><span class="label">Ukupan broj rezervacija</span><span class="value">${fmtInt(stats.reservationsCount)}</span></div>
        <div class="row"><span class="label">Ukupan prihod za mjesec (EUR)</span><span class="value">${fmtEur(stats.incomeTotalEur)}</span></div>
      </div>
    </div>
  `;
}

export function printToPdf() {
  window.print();
}
