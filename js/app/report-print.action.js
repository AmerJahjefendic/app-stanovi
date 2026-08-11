import { getMonthLabel } from "../shared/utils.js";
import { loadPeriodData } from "./home.data.js";
import { computePeriodReport, computeOwnerReport } from "../reports/metrics.service.js";
import { renderPeriodReportToPrintRoot, renderOwnerReportToPrintRoot, printToPdf } from "../shared/pdf.js";
import { apartmentsListAll } from "../shared/apartments.service.js";
import { getShareRule } from "../shared/settings.js";

export async function printMonthlyReport({ selectedPeriodKey, aptFilter = "ALL", shareRule = null } = {}) {
  const m = String(selectedPeriodKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    throw new Error("Nije odabran mjesec. Na Pregledu prvo odaberi mjesec za izvještaj.");
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const data = await loadPeriodData(year, month);
  const apartments = await apartmentsListAll();
  const selectedApartment = apartments.find((apartment) => apartment.id === aptFilter) || null;
  const effectiveShareRule = shareRule || getShareRule();

  if (selectedApartment?.ownerType === "MANAGED") {
    const core = computeOwnerReport(
      { allIncomeItems: data.allIncomeItems, incomeItems: data.incomeItems },
      { year, month, apartmentId: selectedApartment.id }
    );

    const dto = {
      meta: {
        monthLabel: getMonthLabel(month),
        year,
        apartmentName: selectedApartment.name || selectedApartment.id,
        apartmentAddress: selectedApartment.address || "",
        ownerName: selectedApartment.ownerName || "",
        agencyName: "Sarajevo from A to Z",
        agencyPct: selectedApartment.agencyPct,
      },
      rows: core.rows,
      stats: core.stats,
    };

    renderOwnerReportToPrintRoot(dto, {
      title: `Izvještaj za vlasnika – ${getMonthLabel(month)} ${year}`,
    });
  } else {
    const report = computePeriodReport(
      {
        incomeMonthly: data.incomeMonthly,
        incomeItems: data.incomeItems,
        allIncomeItems: data.allIncomeItems,
        expenses: data.expenses,
        nCommission: data.nCommission,
        year,
        month,
      },
      { aptFilter, shareRule: effectiveShareRule, apartments }
    );

    renderPeriodReportToPrintRoot(report, {
      title: `Mjesečni izvještaj – ${getMonthLabel(month)} ${year}`,
      aptFilter,
      shareRule: effectiveShareRule,
      selectedApartment,
    });
  }

  await printToPdf();
}
