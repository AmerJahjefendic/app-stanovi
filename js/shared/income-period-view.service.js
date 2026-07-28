import {
  buildReservationFinancials,
  normalizeReservationPlatform,
} from "./reservation-financial.service.js";

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function matchesApartment(item, apartment) {
  return !apartment || apartment === "ALL" || item?.apartment === apartment;
}

function matchesPlatform(item, platform) {
  return (
    !platform ||
    platform === "ALL" ||
    normalizeReservationPlatform(item?.platform) ===
      normalizeReservationPlatform(platform)
  );
}

function getDisplayAmount(item, segment) {
  return item?.apartment === "N"
    ? Number(segment?.splitBaseEur || 0)
    : Number(segment?.amountEur || 0);
}

function buildPeriodRow(financial, segments, year, month = null) {
  const item = financial.reservation;

  const totals = segments.reduce(
    (sum, segment) => {
      sum.nights += Number(segment.nights || 0);
      sum.amountEur += Number(segment.amountEur || 0);
      sum.splitBaseEur += Number(segment.splitBaseEur || 0);
      sum.ownerIncomeEur += Number(segment.ownerIncomeEur || 0);
      sum.agencyCommissionEur += Number(segment.agencyCommissionEur || 0);
      sum.cleaningFeeEur += Number(segment.cleaningFeeEur || 0);
      sum.platformFeeEur += Number(segment.platformFeeEur || 0);
      return sum;
    },
    {
      nights: 0,
      amountEur: 0,
      splitBaseEur: 0,
      ownerIncomeEur: 0,
      agencyCommissionEur: 0,
      cleaningFeeEur: 0,
      platformFeeEur: 0,
    }
  );

  return {
    ...item,

    // Period prikaza, dok originalni period boravka ostaje u checkin/checkout.
    year: Number(year),
    month: month == null ? Number(item?.month || 1) : Number(month),

    // Postojeći UI već koristi ova polja.
    amount_eur: round2(
      getDisplayAmount(item, {
        amountEur: totals.amountEur,
        splitBaseEur: totals.splitBaseEur,
      })
    ),
    nights: totals.nights,

    // Dodatna finansijska polja za summary i budući UI.
    allocated_amount_eur: round2(totals.amountEur),
    allocated_split_base_eur: round2(totals.splitBaseEur),
    allocated_owner_eur: round2(totals.ownerIncomeEur),
    allocated_agency_eur: round2(totals.agencyCommissionEur),
    allocated_cleaning_fee_eur: round2(totals.cleaningFeeEur),
    allocated_platform_fee_eur: round2(totals.platformFeeEur),

    allocation_mode:
      segments.length === 1
        ? segments[0].allocationMode
        : "YEAR_AGGREGATE",

    // Originalni ID ostaje isti za Edit/Delete/Paid.
    original_item: item,
  };
}

/**
 * Gradi UI stavke prihoda za jedan mjesec ili cijelu godinu.
 *
 * Mjesečni prikaz vraća samo segment aktivnog mjeseca.
 * Godišnji prikaz agregira sve segmente jedne rezervacije u odabranoj godini,
 * pa se ista rezervacija u tabeli ne prikazuje više puta.
 */
export function buildIncomePeriodView(
  items = [],
  {
    year,
    month = null,
    isYearView = false,
    apartment = "ALL",
    platform = "ALL",
    onError,
  } = {}
) {
  const targetYear = Number(year);
  const targetMonth = month == null ? null : Number(month);

  if (!Number.isInteger(targetYear)) {
    throw new TypeError("Godina prikaza mora biti ispravan cijeli broj.");
  }

  if (
    !isYearView &&
    (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12)
  ) {
    throw new RangeError("Mjesec prikaza mora biti između 1 i 12.");
  }

  const filteredItems = items.filter(
    (item) =>
      matchesApartment(item, apartment) &&
      matchesPlatform(item, platform)
  );

  const financials = buildReservationFinancials(filteredItems, { onError });
  const rows = [];

  for (const financial of financials) {
    const matchingSegments = financial.segments.filter((segment) => {
      if (Number(segment.year) !== targetYear) return false;

      return isYearView || Number(segment.month) === targetMonth;
    });

    if (!matchingSegments.length) continue;

    rows.push(
      buildPeriodRow(
        financial,
        matchingSegments,
        targetYear,
        isYearView ? null : targetMonth
      )
    );
  }

  return rows;
}

export function computeIncomePeriodTotals(rows = []) {
  const sumsAZN = {
    A: { income: 0, nights: 0 },
    Z: { income: 0, nights: 0 },
    N: { income: 0, nights: 0 },
  };

  const nBreakdown = {
    income_total: 0,
    my_commission: 0,
    owner: 0,
  };

  for (const row of rows) {
    const apartment = row?.apartment;
    if (!sumsAZN[apartment]) continue;

    const nights = Number(row.nights || 0);
    sumsAZN[apartment].nights += nights;

    if (apartment === "N") {
      const splitBase = Number(row.allocated_split_base_eur || 0);
      const agency = Number(row.allocated_agency_eur || 0);
      const owner = Number(row.allocated_owner_eur || 0);

      nBreakdown.income_total += splitBase;
      nBreakdown.my_commission += agency;
      nBreakdown.owner += owner;

      // U tabeli "Po apartmanu" N predstavlja našu proviziju.
      sumsAZN.N.income += agency;
    } else {
      sumsAZN[apartment].income += Number(
        row.allocated_amount_eur ?? row.amount_eur ?? 0
      );
    }
  }

  for (const apartment of Object.keys(sumsAZN)) {
    sumsAZN[apartment].income = round2(sumsAZN[apartment].income);
    sumsAZN[apartment].nights = Number(sumsAZN[apartment].nights || 0);
  }

  nBreakdown.income_total = round2(nBreakdown.income_total);
  nBreakdown.my_commission = round2(nBreakdown.my_commission);
  nBreakdown.owner = round2(nBreakdown.owner);

  const total = {
    income: round2(
      sumsAZN.A.income +
      sumsAZN.Z.income +
      nBreakdown.income_total
    ),
    nights:
      sumsAZN.A.nights +
      sumsAZN.Z.nights +
      sumsAZN.N.nights,
  };

  return {
    sumsAZN,
    nBreakdown,
    total,
  };
}
