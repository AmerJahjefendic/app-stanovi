// js/reports/metrics.service.js
import { APARTMENTS, APT_LIST, SHARE_RULE, SCOPE } from "../shared/constants.js";
import { safeDate } from "../shared/utils.js";

function round2(x) {
  return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

// Helper to build KPI from per-apartment aggregates
function buildKpiFromPerApt(perApt, aptFilter, sharedTotal, nCommission, sharedA, sharedZ, aTotal, zTotal, nTotal) {
  if (APT_LIST.includes(aptFilter)) {
    const r = perApt[aptFilter] || { income: 0, expenses: 0, net: 0, nights: 0 };

    let sharedAlloc = 0;
    let aptExpenses = 0;

    if (aptFilter === APARTMENTS.A) {
      sharedAlloc = sharedA;
      aptExpenses = aTotal;
    } else if (aptFilter === APARTMENTS.Z) {
      sharedAlloc = sharedZ;
      aptExpenses = zTotal;
    } else if (aptFilter === APARTMENTS.N) {
      sharedAlloc = 0;
      aptExpenses = nTotal;
    }

    return {
      income: round2(r.income),
      expenses: round2(r.expenses),
      net: round2(r.net),
      nights: round2(r.nights),
      sharedTotal: round2(sharedTotal),
      sharedAlloc: round2(sharedAlloc),
      aptExpenses: round2(aptExpenses),
      nCommission: round2(nCommission),
    };
  }

  const totalIncome = (perApt.A?.income || 0) + (perApt.Z?.income || 0) + (perApt.N?.income || 0);
  const totalExpenses = (perApt.A?.expenses || 0) + (perApt.Z?.expenses || 0) + (perApt.N?.expenses || 0);
  const totalNights = (perApt.A?.nights || 0) + (perApt.Z?.nights || 0) + (perApt.N?.nights || 0);
  const totalAptExpenses = aTotal + zTotal + nTotal;

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

// Razlika u noćima na osnovu datuma (checkout - checkin).
// Ako nema oba datuma ili je checkout <= checkin → 0
function nightsFromDates(checkin, checkout) {
  if (!checkin || !checkout) return 0;

  const a = safeDate(checkin);
  const b = safeDate(checkout);
  if (!a || !b) return 0;

  // date-only normalizacija (UTC midnight) da izbjegnemo DST/timezone probleme
  const A = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const B = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

  const days = Math.floor((B - A) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
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
  const aExp = expArr.filter(
    (e) => e.scope === SCOPE.APARTMENT && e.apartment === APARTMENTS.A
  );
  const zExp = expArr.filter(
    (e) => e.scope === SCOPE.APARTMENT && e.apartment === APARTMENTS.Z
  );
  const nExp = expArr.filter(
    (e) => e.scope === SCOPE.APARTMENT && e.apartment === APARTMENTS.N
  );

  const sharedTotal = shared.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);
  const aTotal = aExp.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);
  const zTotal = zExp.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);
  const nTotal = nExp.reduce((s, e) => s + (Number(e.amount_eur || 0) || 0), 0);

  // Allocate shared between A and Z
  const A = incomeByApt.A;
  const Z = incomeByApt.Z;

  let aShare = 0.5;
  let zShare = 0.5;

  if (shareRule === SHARE_RULE.INCOME) {
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
  const sharedZ = sharedTotal - sharedA;  // garantuje sharedA + sharedZ = sharedTotal

  // N: income = commission (not total income), expenses = N expenses
  const nComm = Number(nCommission?.commission_eur || 0) || 0;

  const perApt = {
    A: {
      income: A.income,
      nights: A.nights,
      expenses: sharedA + aTotal,
      net: A.income - (sharedA + aTotal),
    },
    Z: {
      income: Z.income,
      nights: Z.nights,
      expenses: sharedZ + zTotal,
      net: Z.income - (sharedZ + zTotal),
    },
    N: {
      income: nComm,
      nights: incomeByApt.N.nights,
      expenses: nTotal,
      net: nComm - nTotal,
    },
  };
  const kpi = buildKpiFromPerApt(perApt, aptFilter, sharedTotal, nComm, sharedA, sharedZ, aTotal, zTotal, nTotal);

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
    aTotal: round2(aTotal),
    zTotal: round2(zTotal),
    nTotal: round2(nTotal),
  };
}

// =================== N OWNER REPORT (po rezervacijama) ===================
// PDF sloj NE računa – sve kolone i statistika se pripremaju ovdje.

export function computeNOwnerReport(
  { incomeItems, nCommission },
  { year, month, def }
) {
  const items = Array.isArray(incomeItems) ? incomeItems : [];

  const aptFilter = def?.apartment || APARTMENTS.N;
  const agencyShare = def?.agencyShare ?? 0.25;
  const ownerShare = def?.ownerShare ?? 0.75;
  const incomeField = def?.ownerReportIncomeField || "amount_eur";

  // uzmi samo stavke koje imaju checkin/checkout za odabrani apartman
  const rows0 = items
    .filter((it) =>
      it &&
      it.apartment === aptFilter &&
      it.checkin &&
      it.checkout
    )
    .map((it) => {
      const nights = (it.nights != null && it.nights !== "")
        ? (Number(it.nights) || 0)
        : nightsFromDates(it.checkin, it.checkout);

      const rawIncome = Number(it?.[incomeField] ?? 0) || 0;

      const platform = String(it?.platform || "").toLowerCase();  // npr "direct"
      const isDirect = platform === "direct";

      // probaj naći CF u itemu (ako ga imaš), inače uzmi iz def
      const cfFromItem =
        Number(it?.cf_eur ?? it?.cleaning_fee_eur ?? it?.cleaningFeeEur ?? 0) || 0;

      const cfDefault = Number(def?.directCleaningFeeEur ?? 0) || 0;
      const cf = isDirect ? (cfFromItem || cfDefault) : 0;

      // ✅ U izvještaju CF se NE smije vidjeti → skida se prije raspodjele
      const reportIncome = Math.max(0, rawIncome - cf);

      const agencyCommissionEur = agencyShare * reportIncome;
      const ownerNetEur = ownerShare * reportIncome;

      const pricePerNightEur = nights > 0 ? (reportIncome / nights) : 0;

      return {
        checkin: it.checkin,
        checkout: it.checkout,
        totalIncomeEur: round2(reportIncome),
        nights: round2(nights),
        agencyCommissionEur: round2(agencyCommissionEur),
        ownerNetEur: round2(ownerNetEur),
        pricePerNightEur: round2(pricePerNightEur),
      };
    });

  // sortiraj po checkin
  rows0.sort((a, b) => String(a.checkin).localeCompare(String(b.checkin)));

  const reservationsCount = rows0.length;
  const nightsTotal = rows0.reduce((s, r) => s + (Number(r.nights) || 0), 0);
  const incomeTotalEur = rows0.reduce((s, r) => s + (Number(r.totalIncomeEur) || 0), 0);

  const avgStayLength = reservationsCount > 0 ? (nightsTotal / reservationsCount) : 0;
  const avgPricePerNightEur = nightsTotal > 0 ? (incomeTotalEur / nightsTotal) : 0;

  // Ukupan neto vlasnika:
  // - ako nCommission.owner_eur postoji, uzmi to kao “izvor istine” (mjesečni agregat)
  // - inače suma po redovima
  const ownerNetTotalEur = round2(
    rows0.reduce((s, r) => s + (Number(r.ownerNetEur) || 0), 0)
  );

  return {
    year,
    month,
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
  const sumPerApt = {
    A: { income: 0, nights: 0, expenses: 0, net: 0 },
    Z: { income: 0, nights: 0, expenses: 0, net: 0 },
    N: { income: 0, nights: 0, expenses: 0, net: 0 },
  };

  let sharedTotalYear = 0;
  let sharedAYear = 0;
  let sharedZYear = 0;
  let aTotalYear = 0;
  let zTotalYear = 0;
  let nTotalYear = 0;

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
    sharedAYear += rep.sharedA || 0;
    sharedZYear += rep.sharedZ || 0;
    aTotalYear += rep.aTotal || 0;
    zTotalYear += rep.zTotal || 0;
    nTotalYear += rep.nTotal || 0;
  }

  const kpi = buildKpiFromPerApt(sumPerApt, opts.aptFilter, sharedTotalYear, sumPerApt.N.income, sharedAYear, sharedZYear, aTotalYear, zTotalYear, nTotalYear);

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
