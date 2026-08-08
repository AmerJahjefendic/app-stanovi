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

function getDisplayAmount(item, segment, isManaged = false) {
  return isManaged
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
      }, financial.totals.isManaged)
    ),
    nights: totals.nights,

    // Dodatna finansijska polja za summary i budući UI.
    allocated_amount_eur: round2(totals.amountEur),
    allocated_split_base_eur: round2(totals.splitBaseEur),
    allocated_owner_eur: round2(totals.ownerIncomeEur),
    allocated_agency_eur: round2(totals.agencyCommissionEur),
    allocated_cleaning_fee_eur: round2(totals.cleaningFeeEur),
    allocated_platform_fee_eur: round2(totals.platformFeeEur),
    is_managed: !!financial.totals.isManaged,

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
  const sumsAZN = {};

  const ensureApartment = (apartment) => {
    const key = String(apartment || "").trim();
    if (!key) return null;
    if (!sumsAZN[key]) sumsAZN[key] = { income: 0, nights: 0 };
    return key;
  };


  const managedBreakdowns = {};
  const ensureManagedBreakdown = (apartment) => {
    if (!managedBreakdowns[apartment]) {
      managedBreakdowns[apartment] = { income_total: 0, my_commission: 0, owner: 0 };
    }
    return managedBreakdowns[apartment];
  };

  for (const row of rows) {
    const apartment = ensureApartment(row?.apartment);
    if (!apartment) continue;

    sumsAZN[apartment].nights += Number(row.nights || 0);

    if (row?.is_managed) {
      const splitBase = Number(row.allocated_split_base_eur || 0);
      const agency = Number(row.allocated_agency_eur || 0);
      const owner = Number(row.allocated_owner_eur || 0);
      const breakdown = ensureManagedBreakdown(apartment);
      breakdown.income_total += splitBase;
      breakdown.my_commission += agency;
      breakdown.owner += owner;
      sumsAZN[apartment].income += agency;
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

  for (const breakdown of Object.values(managedBreakdowns)) {
    breakdown.income_total = round2(breakdown.income_total);
    breakdown.my_commission = round2(breakdown.my_commission);
    breakdown.owner = round2(breakdown.owner);
  }

  const nBreakdown = managedBreakdowns.N || { income_total: 0, my_commission: 0, owner: 0 };
  const total = {
    income: round2(Object.entries(sumsAZN).reduce((sum, [apartment, value]) => {
      const managed = managedBreakdowns[apartment];
      return sum + Number(managed ? managed.income_total : value?.income || 0);
    }, 0)),
    nights: Object.values(sumsAZN).reduce(
      (sum, value) => sum + Number(value?.nights || 0), 0
    ),
  };

  return { sumsAZN, managedBreakdowns, nBreakdown, total };
}
