// js/reports/metrics.service.js
import { APARTMENTS, SHARE_RULE, SCOPE } from "../shared/constants.js";
import { safeDate } from "../shared/utils.js";
import {
  buildReservationFinancials,
  getReservationSegmentForPeriod,
} from "../shared/reservation-financial.service.js";
import { buildIncomePeriodView } from "../shared/income-period-view.service.js";
import { allocateSharedExpense, resolveSharedExpenseMembers } from "../shared/shared-expense-allocation.service.js";

function round2(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function apartmentId(value) {
  return String(value?.id ?? value ?? "").trim();
}

function collectApartmentIds(...dataSets) {
  const ids = [];
  const seen = new Set();
  const add = (value) => {
    const id = apartmentId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  // Apartment ids come only from actual period/history data.
  // Legacy A/Z/N rows remain supported naturally when those ids exist in legacy data.
  for (const dataSet of dataSets) {
    for (const row of dataSet || []) {
      add(row?.apartment);
      if (row?.scope === SCOPE.SHARED) {
        resolveSharedExpenseMembers(row).forEach(add);
      }
    }
  }
  return ids;
}

function ensureRow(map, id) {
  if (!id) return null;
  if (!map[id]) map[id] = { income: 0, nights: 0, shareIncome: 0 };
  return map[id];
}

function roundPerApt(perApt) {
  return Object.fromEntries(
    Object.entries(perApt || {}).map(([id, row]) => [id, {
      income: round2(row?.income),
      nights: round2(row?.nights),
      expenses: round2(row?.expenses),
      net: round2(row?.net),
    }])
  );
}

// Helper to build KPI from per-apartment aggregates.
function buildKpiFromPerApt(perApt, aptFilter, sharedTotal, nCommission, sharedAllocations, individualTotals) {
  if (aptFilter && aptFilter !== "ALL") {
    const r = perApt[aptFilter] || { income: 0, expenses: 0, net: 0, nights: 0 };
    return {
      income: round2(r.income),
      expenses: round2(r.expenses),
      net: round2(r.net),
      nights: round2(r.nights),
      sharedTotal: round2(sharedTotal),
      sharedAlloc: round2(sharedAllocations?.[aptFilter] || 0),
      aptExpenses: round2(individualTotals?.[aptFilter] || 0),
      nCommission: round2(nCommission),
    };
  }

  const rows = Object.values(perApt || {});
  const totalIncome = rows.reduce((sum, row) => sum + Number(row?.income || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + Number(row?.expenses || 0), 0);
  const totalNights = rows.reduce((sum, row) => sum + Number(row?.nights || 0), 0);
  const totalAptExpenses = Object.values(individualTotals || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);

  return {
    income: round2(totalIncome),
    expenses: round2(totalExpenses),
    net: round2(totalIncome - totalExpenses),
    nights: round2(totalNights),
    sharedTotal: round2(sharedTotal),
    sharedAlloc: round2(sharedTotal),
    aptExpenses: round2(totalAptExpenses),
    nCommission: round2(nCommission),
  };
}

function nightsFromDates(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const a = safeDate(checkin);
  const b = safeDate(checkout);
  if (!a || !b) return 0;
  const A = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const B = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  const days = Math.floor((B - A) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

// Reservation segments -> dynamic apartment map.
// Existing financial service decides whether a reservation is managed.
function computeIncomeFromReservationSegments(incomeItems, year, month, apartmentIds) {
  const out = Object.fromEntries(
    apartmentIds.map((apartment) => [apartment, { income: 0, nights: 0, shareIncome: 0, itemsCount: 0 }])
  );

  const financials = buildReservationFinancials(incomeItems, {
    onError: (item, error) => {
      console.warn("KPI reservation allocation skipped", item?.id, error);
    },
  });

  for (const financial of financials) {
    const apt = apartmentId(financial?.reservation?.apartment);
    if (!apt) continue;
    if (!out[apt]) out[apt] = { income: 0, nights: 0, shareIncome: 0, itemsCount: 0 };

    const segment = getReservationSegmentForPeriod(financial, year, month);
    if (!segment) continue;

    out[apt].income += financial.totals.isManaged
      ? Number(segment.agencyCommissionEur || 0) || 0
      : Number(segment.amountEur || 0) || 0;
    out[apt].shareIncome += financial.totals.isManaged
      ? Number(segment.splitBaseEur || 0) || 0
      : Number(segment.amountEur || 0) || 0;
    out[apt].nights += Number(segment.nights || 0) || 0;
    out[apt].itemsCount += 1;
  }

  return out;
}

// =================== PERIOD (1 mjesec) ===================

export function computePeriodReport(
  { incomeMonthly, incomeItems, allIncomeItems, expenses, nCommission, year, month },
  { aptFilter, shareRule }
) {
  const incMonthlyArr = Array.isArray(incomeMonthly) ? incomeMonthly : [];
  const periodItemsArr = Array.isArray(incomeItems) ? incomeItems : [];
  const allocationItemsArr = Array.isArray(allIncomeItems) ? allIncomeItems : periodItemsArr;
  const expArr = Array.isArray(expenses) ? expenses : [];

  const apartmentIds = collectApartmentIds(
    incMonthlyArr,
    periodItemsArr,
    allocationItemsArr,
    expArr
  );
  // Preserve the legacy N-only commission compatibility case without
  // polluting fresh/dynamic databases with phantom A/Z/N rows.
  if (nCommission && !apartmentIds.includes(APARTMENTS.N)) {
    apartmentIds.push(APARTMENTS.N);
  }
  if (aptFilter && aptFilter !== "ALL" && !apartmentIds.includes(aptFilter)) {
    apartmentIds.push(aptFilter);
  }

  const incomeByApt = Object.fromEntries(
    apartmentIds.map((a) => [a, { income: 0, nights: 0, shareIncome: 0 }])
  );

  const hasTargetPeriod = Number.isInteger(Number(year)) && Number.isInteger(Number(month));
  const bySegments = hasTargetPeriod
    ? computeIncomeFromReservationSegments(allocationItemsArr, Number(year), Number(month), apartmentIds)
    : null;
  const useAllocatedItems = bySegments
    ? Object.values(bySegments).some((row) => row.itemsCount > 0)
    : false;

  if (useAllocatedItems) {
    for (const [apartment, row] of Object.entries(bySegments)) {
      const target = ensureRow(incomeByApt, apartment);
      target.income = row.income || 0;
      target.shareIncome = row.shareIncome || 0;
      target.nights = row.nights || 0;
    }
  } else if (periodItemsArr.length > 0) {
    for (const item of periodItemsArr) {
      const apartment = apartmentId(item?.apartment);
      if (!apartment) continue;
      const target = ensureRow(incomeByApt, apartment);
      const itemIncome = Number(item?.amount_eur || item?.income_eur || 0) || 0;
      target.income += itemIncome;
      target.shareIncome += itemIncome;
      const explicitNights = Number(item?.nights);
      target.nights += Number.isFinite(explicitNights)
        ? explicitNights
        : nightsFromDates(item?.checkin, item?.checkout);
    }
  } else {
    for (const row of incMonthlyArr) {
      const apartment = apartmentId(row?.apartment);
      if (!apartment) continue;
      const target = ensureRow(incomeByApt, apartment);
      const monthlyIncome = Number(row.income_eur || 0) || 0;
      target.income += monthlyIncome;
      target.shareIncome += monthlyIncome;
      target.nights += Number(row.nights || 0) || 0;
    }
  }

  // Direct apartment expenses are dynamic. SHARED expenses use their persisted
  // member snapshot, so multiple independent shared groups can coexist.
  const shared = expArr.filter((e) => e.scope === SCOPE.SHARED);
  const individualTotals = {};
  for (const e of expArr) {
    if (e.scope !== SCOPE.APARTMENT) continue;
    const id = apartmentId(e.apartment);
    if (!id) continue;
    individualTotals[id] = (individualTotals[id] || 0) + (Number(e.amount_eur || 0) || 0);
    ensureRow(incomeByApt, id);
  }

  const sharedAllocations = {};
  let sharedTotal = 0;
  const sharedBasis = Object.fromEntries(
    Object.entries(incomeByApt).map(([id, row]) => [id, {
      income: Number(row?.shareIncome ?? row?.income ?? 0) || 0,
      nights: Number(row?.nights || 0) || 0,
    }])
  );

  for (const expense of shared) {
    const amount = Number(expense?.amount_eur || 0) || 0;
    sharedTotal += amount;
    const allocations = allocateSharedExpense(expense, sharedBasis, shareRule);
    for (const allocation of allocations) {
      const id = apartmentId(allocation.apartment);
      if (!id) continue;
      ensureRow(incomeByApt, id);
      sharedAllocations[id] = (sharedAllocations[id] || 0) + Number(allocation.amount_eur || 0);
    }
  }

  // Existing N behavior remains exactly as before.
  const nComm = useAllocatedItems
    ? Number(incomeByApt.N?.income || 0) || 0
    : Number(nCommission?.commission_eur || 0) || 0;

  const perApt = {};
  for (const [id, row] of Object.entries(incomeByApt)) {
    let income = Number(row?.income || 0);
    let expensesForApt = Number(individualTotals[id] || 0);

    expensesForApt += Number(sharedAllocations[id] || 0);
    if (id === APARTMENTS.N) income = nComm;

    perApt[id] = {
      income,
      nights: Number(row?.nights || 0),
      expenses: expensesForApt,
      net: income - expensesForApt,
    };
  }

  const roundedPerApt = roundPerApt(perApt);
  const kpi = buildKpiFromPerApt(
    perApt,
    aptFilter,
    sharedTotal,
    nComm,
    sharedAllocations,
    individualTotals
  );

  return {
    perApt: roundedPerApt,
    kpi,
    sharedTotal: round2(sharedTotal),
    sharedA: round2(sharedAllocations[APARTMENTS.A] || 0),
    sharedZ: round2(sharedAllocations[APARTMENTS.Z] || 0),
    sharedAllocations: Object.fromEntries(
      Object.entries(sharedAllocations).map(([id, value]) => [id, round2(value)])
    ),
    aTotal: round2(individualTotals.A || 0),
    zTotal: round2(individualTotals.Z || 0),
    nTotal: round2(individualTotals.N || 0),
    individualTotals: Object.fromEntries(
      Object.entries(individualTotals).map(([id, value]) => [id, round2(value)])
    ),
  };
}

// =================== OWNER REPORT (po rezervacijama) ===================
// PDF sloj NE računa – sve kolone i statistika se pripremaju ovdje.

export function computeOwnerReport(
  { allIncomeItems, incomeItems },
  { year, month, apartmentId }
) {
  // allIncomeItems je potreban kako bi rezervacije koje prelaze granicu mjeseca
  // bile uključene u oba stvarna perioda boravka. incomeItems ostaje samo
  // kompatibilni fallback za starije pozive.
  const sourceItems = Array.isArray(allIncomeItems)
    ? allIncomeItems
    : (Array.isArray(incomeItems) ? incomeItems : []);

  const aptFilter = String(apartmentId || "").trim();
  if (!aptFilter) throw new Error("computeOwnerReport: apartmentId is required");

  const periodRows = buildIncomePeriodView(sourceItems, {
    year,
    month,
    apartment: aptFilter,
    platform: "ALL",
  });

  const rows0 = periodRows.map((row) => {
    const nights = Number(row?.nights || 0);
    const reportIncome = Number(row?.allocated_split_base_eur || 0);
    const agencyTotalEur = Number(row?.allocated_agency_eur || 0);
    const cleaningFeeEur = Number(row?.allocated_cleaning_fee_eur || 0);
    // Owner Report prikazuje samo proviziju agencije na osnovicu.
    // Cleaning Fee pripada agenciji, ali je interni podatak i ne ulazi u
    // vlasničku kolonu "Provizija agencije".
    const agencyCommissionEur = Math.max(0, agencyTotalEur - cleaningFeeEur);
    const ownerNetEur = Number(row?.allocated_owner_eur || 0);

    return {
      checkin: row.checkin,
      checkout: row.checkout,
      totalIncomeEur: round2(reportIncome),
      nights: round2(nights),
      agencyCommissionEur: round2(agencyCommissionEur),
      ownerNetEur: round2(ownerNetEur),
      pricePerNightEur: round2(nights > 0 ? reportIncome / nights : 0),
    };
  });

  // Redovi zadržavaju originalni period rezervacije, a finansije/noćenja
  // predstavljaju samo dio koji pripada izabranom mjesecu.
  rows0.sort((a, b) => String(a.checkin).localeCompare(String(b.checkin)));

  const reservationsCount = rows0.length;
  const nightsTotal = rows0.reduce((s, r) => s + (Number(r.nights) || 0), 0);
  const incomeTotalEur = rows0.reduce(
    (s, r) => s + (Number(r.totalIncomeEur) || 0),
    0
  );

  const avgStayLength = reservationsCount > 0
    ? nightsTotal / reservationsCount
    : 0;
  const avgPricePerNightEur = nightsTotal > 0
    ? incomeTotalEur / nightsTotal
    : 0;

  const ownerNetTotalEur = round2(
    rows0.reduce((s, r) => s + (Number(r.ownerNetEur) || 0), 0)
  );

  return {
    year,
    month,
    apartmentId: aptFilter,
    rows: rows0,
    stats: {
      ownerNetTotalEur,
      nightsTotal: round2(nightsTotal),
      avgStayLength: round2(avgStayLength),
      avgPricePerNightEur: round2(avgPricePerNightEur),
      reservationsCount: round2(reservationsCount),
      incomeTotalEur: round2(incomeTotalEur),
    },
  };
}

// =================== YEAR (kalendarska godina) ===================

export function computeYearReport(rowsByMonth, opts) {
  const rowsArr = Array.isArray(rowsByMonth) ? rowsByMonth : [];
  const sumPerApt = {};

  let sharedTotalYear = 0;
  const sharedAllocationsYear = {};
  const individualTotalsYear = {};

  for (const m of rowsArr) {
    const rep = computePeriodReport(
      {
        incomeMonthly: m.incomeMonthly,
        incomeItems: m.incomeItems,
        allIncomeItems: m.allIncomeItems,
        expenses: m.expenses,
        nCommission: m.nCommission,
        year: m.year,
        month: m.month,
      },
      { aptFilter: "ALL", shareRule: opts.shareRule }
    );

    for (const [id, row] of Object.entries(rep.perApt || {})) {
      if (!sumPerApt[id]) sumPerApt[id] = { income: 0, nights: 0, expenses: 0, net: 0 };
      sumPerApt[id].income += Number(row.income || 0);
      sumPerApt[id].nights += Number(row.nights || 0);
      sumPerApt[id].expenses += Number(row.expenses || 0);
      sumPerApt[id].net += Number(row.net || 0);
    }

    sharedTotalYear += Number(rep.sharedTotal || 0);
    for (const [id, value] of Object.entries(rep.sharedAllocations || {})) {
      sharedAllocationsYear[id] = (sharedAllocationsYear[id] || 0) + Number(value || 0);
    }
    for (const [id, value] of Object.entries(rep.individualTotals || {})) {
      individualTotalsYear[id] = (individualTotalsYear[id] || 0) + Number(value || 0);
    }
  }

  if (opts?.aptFilter && opts.aptFilter !== "ALL" && !sumPerApt[opts.aptFilter]) {
    sumPerApt[opts.aptFilter] = { income: 0, nights: 0, expenses: 0, net: 0 };
  }
  const roundedPerApt = roundPerApt(sumPerApt);
  const kpi = buildKpiFromPerApt(
    roundedPerApt,
    opts.aptFilter,
    sharedTotalYear,
    roundedPerApt.N?.income || 0,
    sharedAllocationsYear,
    individualTotalsYear
  );

  return {
    perApt: roundedPerApt,
    kpi,
    sharedTotal: round2(sharedTotalYear),
    sharedA: round2(sharedAllocationsYear[APARTMENTS.A] || 0),
    sharedZ: round2(sharedAllocationsYear[APARTMENTS.Z] || 0),
    sharedAllocations: Object.fromEntries(
      Object.entries(sharedAllocationsYear).map(([id, value]) => [id, round2(value)])
    ),
    individualTotals: Object.fromEntries(
      Object.entries(individualTotalsYear).map(([id, value]) => [id, round2(value)])
    ),
  };
}

export function computeRangeReport(rowsByMonth, opts) {
  return computeYearReport(rowsByMonth, opts);
}
