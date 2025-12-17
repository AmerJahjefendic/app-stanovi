function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// =================== PERIOD (1 mjesec) ===================

export function computePeriodReport(
  { incomeMonthly, expenses, nCommission },
  { aptFilter, shareRule }
) {
  // incomeMonthly: [{apartment, income_eur, nights}]
  // expenses: SHARED + APARTMENT (N)

  const incomeByApt = Object.fromEntries(
    ["A", "Z", "N"].map((a) => [a, { income: 0, nights: 0 }])
  );

  for (const row of incomeMonthly || []) {
    if (!incomeByApt[row.apartment]) continue;
    incomeByApt[row.apartment].income += row.income_eur || 0;
    incomeByApt[row.apartment].nights += row.nights || 0;
  }

  const shared = (expenses || []).filter((e) => e.scope === "SHARED");
  const nExp = (expenses || []).filter(
    (e) => e.scope === "APARTMENT" && e.apartment === "N"
  );

  const sharedTotal = shared.reduce((s, e) => s + (e.amount_eur || 0), 0);
  const nTotal = nExp.reduce((s, e) => s + (e.amount_eur || 0), 0);

  // Allocate shared between A and Z
  const A = incomeByApt.A,
    Z = incomeByApt.Z;
  let aShare = 0.5,
    zShare = 0.5;

  if (shareRule === "HALF") {
    aShare = 0.5;
    zShare = 0.5;
  } else if (shareRule === "INCOME") {
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
  const nComm = nCommission?.commission_eur || 0;

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

  let kpi;
  if (aptFilter === "A" || aptFilter === "Z" || aptFilter === "N") {
    const r = perApt[aptFilter];
    kpi = {
      income: round2(r.income),
      expenses: round2(r.expenses),
      net: round2(r.net),
      nights: round2(r.nights),
      sharedTotal: round2(sharedTotal),
      sharedAlloc:
        aptFilter === "A"
          ? round2(sharedA)
          : aptFilter === "Z"
          ? round2(sharedZ)
          : 0,
      nCommission: round2(nComm),
    };
  } else {
    // ALL
    const totalIncome = perApt.A.income + perApt.Z.income + perApt.N.income;
    const totalExpenses =
      perApt.A.expenses + perApt.Z.expenses + perApt.N.expenses;
    const totalNights = perApt.A.nights + perApt.Z.nights + perApt.N.nights;

    kpi = {
      income: round2(totalIncome),
      expenses: round2(totalExpenses),
      net: round2(totalIncome - totalExpenses),
      nights: round2(totalNights),
      sharedTotal: round2(sharedTotal),
      nCommission: round2(nComm),
    };
  }

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
  // rowsByMonth: Array<{ incomeMonthly, expenses, nCommission }>
  // opts: { aptFilter, shareRule }

  const sumPerApt = {
    A: { income: 0, nights: 0, expenses: 0, net: 0 },
    Z: { income: 0, nights: 0, expenses: 0, net: 0 },
    N: { income: 0, nights: 0, expenses: 0, net: 0 },
  };

  let sharedTotalYear = 0;
  let nCommissionYear = 0;

  for (const m of rowsByMonth || []) {
    // Mjesečni report računamo kao ALL da bi perApt uvijek bilo kompletno
    const rep = computePeriodReport(
      { incomeMonthly: m.incomeMonthly, expenses: m.expenses, nCommission: m.nCommission },
      { aptFilter: "ALL", shareRule: opts.shareRule }
    );

    for (const a of ["A", "Z", "N"]) {
      sumPerApt[a].income += rep.perApt[a].income || 0;
      sumPerApt[a].nights += rep.perApt[a].nights || 0;
      sumPerApt[a].expenses += rep.perApt[a].expenses || 0;
      sumPerApt[a].net += rep.perApt[a].net || 0;
    }

    sharedTotalYear += rep.sharedTotal || 0;
    nCommissionYear += rep.kpi?.nCommission || 0;
  }

  // KPI: po apartmanu ili ALL
  let kpi;
  if (opts.aptFilter === "A" || opts.aptFilter === "Z" || opts.aptFilter === "N") {
    const r = sumPerApt[opts.aptFilter];
    kpi = {
      income: round2(r.income),
      expenses: round2(r.expenses),
      net: round2(r.net),
      nights: round2(r.nights),
      sharedTotal: round2(sharedTotalYear),
      sharedAlloc: opts.aptFilter === "A"
        ? round2(sumPerApt.A.expenses)
        : opts.aptFilter === "Z"
        ? round2(sumPerApt.Z.expenses)
        : 0,
      nCommission: round2(sumPerApt.N.income), // godišnji N income = commission
    };
  } else {
    const totalIncome = sumPerApt.A.income + sumPerApt.Z.income + sumPerApt.N.income;
    const totalExpenses = sumPerApt.A.expenses + sumPerApt.Z.expenses + sumPerApt.N.expenses;
    const totalNights = sumPerApt.A.nights + sumPerApt.Z.nights + sumPerApt.N.nights;

    kpi = {
      income: round2(totalIncome),
      expenses: round2(totalExpenses),
      net: round2(totalIncome - totalExpenses),
      nights: round2(totalNights),
      sharedTotal: round2(sharedTotalYear),
      nCommission: round2(sumPerApt.N.income),
    };
  }

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
