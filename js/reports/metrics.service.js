// js/reports/metrics.service.js
import { APARTMENTS, APT_LIST, SHARE_RULE, SCOPE } from "../shared/constants.js";
import { safeDate } from "../shared/utils.js";

function round2(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

// Helper to build KPI from per-apartment aggregates
function buildKpiFromPerApt(perApt, aptFilter, sharedTotal, nCommission) {
  if (APT_LIST.includes(aptFilter)) {
    const r = perApt[aptFilter] || { income: 0, expenses: 0, net: 0, nights: 0 };
    const sharedAlloc = aptFilter === APARTMENTS.A
      ? perApt.A?.expenses || 0
      : aptFilter === APARTMENTS.Z
        ? perApt.Z?.expenses || 0
        : 0;

    return {
      income: round2(r.income),
      expenses: round2(r.expenses),
      net: round2(r.net),
      nights: round2(r.nights),
      sharedTotal: round2(sharedTotal),
      sharedAlloc: round2(sharedAlloc),
      nCommission: round2(nCommission),
    };
  }

  const totalIncome = (perApt.A?.income || 0) + (perApt.Z?.income || 0) + (perApt.N?.income || 0);
  const totalExpenses = (perApt.A?.expenses || 0) + (perApt.Z?.expenses || 0) + (perApt.N?.expenses || 0);
  const totalNights = (perApt.A?.nights || 0) + (perApt.Z?.nights || 0) + (perApt.N?.nights || 0);

  return {
    income: round2(totalIncome),
    expenses: round2(totalExpenses),
    net: round2(totalIncome - totalExpenses),
    nights: round2(totalNights),
    sharedTotal: round2(sharedTotal),
    nCommission: round2(nCommission),
  };
}

// Razlika u noćima na osnovu datuma (checkout - checkin).
// Ako nema oba datuma ili je checkout <= checkin → 0
function nightsFromDates(checkin, checkout) {
  if (!checkin || !checkout) return 0;

  const a = safeDate(checkin);
  const b = safeDate(checkout);
  if (!a || !b) return 0;

  const ms = b.getTime() - a.getTime();
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}

// incomeItems -> { A:{income,nights}, Z:{...}, N:{...} }
function computeIncomeFromItems(incomeItems) {
  const out = {
    A: { income: 0, nights: 0 },
    Z: { income: 0, nights: 0 },
    N: { income: 0, nights: 0 },
  };

  for (const it of incomeItems || []) {
    const apt = it?.apartment;
    if (!out[apt]) continue;

    const amount = Number(it?.amount_eur || it?.income_eur || 0) || 0;
    out[apt].income += amount;

    // nights: prefer explicit nights (pošto želiš da se snima),
    // fallback na checkin/checkout ako nights nije upisan
    let n = 0;
    if (it?.nights != null && it?.nights !== "") {
      const nn = Number(it.nights);
      n = Number.isFinite(nn) ? nn : 0;
    } else {
      n = nightsFromDates(it?.checkin, it?.checkout);
    }

    out[apt].nights += n;
  }

  return out;
}

// =================== PERIOD (1 mjesec) ===================

export function computePeriodReport(
  { incomeMonthly, incomeItems, expenses, nCommission },
  { aptFilter, shareRule }
) {
  // ✅ KLJUČ: da nema dupliranja
  // Ako imamo income_items (bilo koje) -> koristimo SAMO njih
  // Inače koristimo income_monthly
  const incMonthlyArr = Array.isArray(incomeMonthly) ? incomeMonthly : [];
  const incItemsArr = Array.isArray(incomeItems) ? incomeItems : [];
  const expArr = Array.isArray(expenses) ? expenses : [];
  const useItems = incItemsArr.length > 0;

  const incomeByApt = Object.fromEntries(
    APT_LIST.map((a) => [a, { income: 0, nights: 0 }])
  );

  if (useItems) {
    const byItems = computeIncomeFromItems(incItemsArr);
    for (const a of APT_LIST) {
      incomeByApt[a].income = byItems[a].income || 0;
      incomeByApt[a].nights = byItems[a].nights || 0;
    }
  } else {
    for (const row of incMonthlyArr) {
      if (!incomeByApt[row.apartment]) continue;
      incomeByApt[row.apartment].income += Number(row.income_eur || 0) || 0;
      incomeByApt[row.apartment].nights += Number(row.nights || 0) || 0;
    }
  }

  // Expenses
  const shared = expArr.filter((e) => e.scope === SCOPE.SHARED);
  const nExp = expArr.filter(
    (e) => e.scope === SCOPE.APARTMENT && e.apartment === APARTMENTS.N
  );

  const sharedTotal = shared.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);
  const nTotal = nExp.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);

  // Allocate shared between A and Z
  const A = incomeByApt.A;
  const Z = incomeByApt.Z;

  let aShare = 0.5;
  let zShare = 0.5;

  if (shareRule === SHARE_RULE.HALF) {
    aShare = 0.5;
    zShare = 0.5;
  } else if (shareRule === SHARE_RULE.INCOME) {
    const denom = A.income + Z.income;
    if (denom > 0) {
      aShare = A.income / denom;
      zShare = Z.income / denom;
    }
  } else {
    // NIGHTS default
    const denom = A.nights + Z.nights;
    if (denom > 0) {
      aShare = A.nights / denom;
      zShare = Z.nights / denom;
    }
  }

  const sharedA = sharedTotal * aShare;
  const sharedZ = sharedTotal * zShare;

  // N: income = commission (not total income), expenses = N expenses
  const nComm = Number(nCommission?.commission_eur || 0) || 0;

  const perApt = {
    A: {
      income: A.income,
      nights: A.nights,
      expenses: sharedA,
      net: A.income - sharedA,
    },
    Z: {
      income: Z.income,
      nights: Z.nights,
      expenses: sharedZ,
      net: Z.income - sharedZ,
    },
    N: {
      income: nComm,
      nights: incomeByApt.N.nights,
      expenses: nTotal,
      net: nComm - nTotal,
    },
  };
  const kpi = buildKpiFromPerApt(perApt, aptFilter, sharedTotal, nComm);

  return {
    perApt: {
      A: {
        income: round2(perApt.A.income),
        nights: round2(perApt.A.nights),
        expenses: round2(perApt.A.expenses),
        net: round2(perApt.A.net),
      },
      Z: {
        income: round2(perApt.Z.income),
        nights: round2(perApt.Z.nights),
        expenses: round2(perApt.Z.expenses),
        net: round2(perApt.Z.net),
      },
      N: {
        income: round2(perApt.N.income),
        nights: round2(perApt.N.nights),
        expenses: round2(perApt.N.expenses),
        net: round2(perApt.N.net),
      },
    },
    kpi,
    sharedTotal: round2(sharedTotal),
    sharedA: round2(sharedA),
    sharedZ: round2(sharedZ),
    nTotal: round2(nTotal),
  };
}

// =================== YEAR (kalendarska godina) ===================

export function computeYearReport(rowsByMonth, opts) {
  const rowsArr = Array.isArray(rowsByMonth) ? rowsByMonth : [];
  const sumPerApt = {
    A: { income: 0, nights: 0, expenses: 0, net: 0 },
    Z: { income: 0, nights: 0, expenses: 0, net: 0 },
    N: { income: 0, nights: 0, expenses: 0, net: 0 },
  };

  let sharedTotalYear = 0;

  for (const m of rowsArr) {
    const rep = computePeriodReport(
      {
        incomeMonthly: m.incomeMonthly,
        incomeItems: m.incomeItems,
        expenses: m.expenses,
        nCommission: m.nCommission,
      },
      { aptFilter: "ALL", shareRule: opts.shareRule }
    );

    for (const a of APT_LIST) {
      sumPerApt[a].income += rep.perApt[a].income || 0;
      sumPerApt[a].nights += rep.perApt[a].nights || 0;
      sumPerApt[a].expenses += rep.perApt[a].expenses || 0;
      sumPerApt[a].net += rep.perApt[a].net || 0;
    }

    sharedTotalYear += rep.sharedTotal || 0;
  }

  const kpi = buildKpiFromPerApt(sumPerApt, opts.aptFilter, sharedTotalYear, sumPerApt.N.income);

  return {
    perApt: {
      A: {
        income: round2(sumPerApt.A.income),
        nights: round2(sumPerApt.A.nights),
        expenses: round2(sumPerApt.A.expenses),
        net: round2(sumPerApt.A.net),
      },
      Z: {
        income: round2(sumPerApt.Z.income),
        nights: round2(sumPerApt.Z.nights),
        expenses: round2(sumPerApt.Z.expenses),
        net: round2(sumPerApt.Z.net),
      },
      N: {
        income: round2(sumPerApt.N.income),
        nights: round2(sumPerApt.N.nights),
        expenses: round2(sumPerApt.N.expenses),
        net: round2(sumPerApt.N.net),
      },
    },
    kpi,
    sharedTotal: round2(sharedTotalYear),
  };
}

export function computeRangeReport(rowsByMonth, opts) {
  return computeYearReport(rowsByMonth, opts);
}
