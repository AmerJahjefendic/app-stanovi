const CENTS_PER_EURO = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toFiniteNumber(value, fieldName, { defaultValue } = {}) {
  if ((value === undefined || value === null || value === "") && defaultValue !== undefined) {
    return defaultValue;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${fieldName} mora biti ispravan broj.`);
  }
  return number;
}

function toNonNegativeNumber(value, fieldName, options) {
  const number = toFiniteNumber(value, fieldName, options);
  if (number < 0) {
    throw new RangeError(`${fieldName} ne može biti negativan.`);
  }
  return number;
}

function toInteger(value, fieldName) {
  const number = toFiniteNumber(value, fieldName);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${fieldName} mora biti cijeli broj.`);
  }
  return number;
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, timestamp };
}

function getValidStay(checkIn, checkOut) {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end || end.timestamp <= start.timestamp) return null;

  return {
    start,
    end,
    nights: Math.round((end.timestamp - start.timestamp) / MS_PER_DAY),
  };
}

function getMonthSegments(stay) {
  const segments = [];
  let cursor = stay.start.timestamp;
  let nightOffset = 0;

  while (cursor < stay.end.timestamp) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const segmentStartOffset = nightOffset;
    let nights = 0;

    while (cursor < stay.end.timestamp) {
      const current = new Date(cursor);
      if (current.getUTCFullYear() !== year || current.getUTCMonth() + 1 !== month) {
        break;
      }
      nights += 1;
      nightOffset += 1;
      cursor += MS_PER_DAY;
    }

    segments.push({ year, month, nights, startOffset: segmentStartOffset });
  }

  return segments;
}

function toCents(amount, fieldName) {
  const number = toNonNegativeNumber(amount, fieldName, { defaultValue: 0 });
  return Math.round((number + Number.EPSILON) * CENTS_PER_EURO);
}

function fromCents(cents) {
  return cents / CENTS_PER_EURO;
}

/**
 * Raspoređuje novčani total po noćenjima bez gubitka centi.
 * Ostatak se deterministički dodjeljuje najranijim noćenjima rezervacije.
 */
function allocateCentsBySegments(totalCents, totalNights, segments) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError("Novčani iznos u centima mora biti nenegativan cijeli broj.");
  }
  if (!Number.isInteger(totalNights) || totalNights <= 0) {
    throw new RangeError("Broj noćenja mora biti veći od 0.");
  }

  const centsPerNight = Math.floor(totalCents / totalNights);
  const remainder = totalCents % totalNights;

  return segments.map((segment) => {
    const segmentEndOffset = segment.startOffset + segment.nights;
    const extraCents = Math.max(
      0,
      Math.min(segmentEndOffset, remainder) - segment.startOffset
    );

    return centsPerNight * segment.nights + extraCents;
  });
}

function buildLegacySegment(input) {
  const year = toInteger(input.fallbackYear ?? input.year, "Godina rezervacije");
  const month = toInteger(input.fallbackMonth ?? input.month, "Mjesec rezervacije");
  if (month < 1 || month > 12) {
    throw new RangeError("Mjesec rezervacije mora biti između 1 i 12.");
  }

  const nights = toNonNegativeNumber(input.nights, "Broj noćenja", { defaultValue: 0 });
  const cleaningFeeEur = toNonNegativeNumber(
    input.cleaningFeeEur,
    "Cleaning fee",
    { defaultValue: 0 }
  );

  return [{
    year,
    month,
    nights,
    amountEur: fromCents(toCents(input.amountEur, "Prihod")),
    splitBaseEur: fromCents(toCents(input.splitBaseEur, "Split base")),
    ownerIncomeEur: fromCents(toCents(input.ownerIncomeEur, "Owner income")),
    agencyCommissionEur: fromCents(
      toCents(input.agencyCommissionEur, "Agency commission")
    ),
    cleaningFeeEur: fromCents(toCents(cleaningFeeEur, "Cleaning fee")),
    platformFeeEur: fromCents(toCents(input.platformFeeEur, "Platform fee")),
    allocationMode: "LEGACY_MONTH",
  }];
}

/**
 * Raspoređuje jednu rezervaciju po mjesecima stvarnog boravka.
 *
 * check-in je uključen, check-out nije uključen. Sve novčane vrijednosti
 * raspoređuju se u centima, pa zbir segmenata uvijek ostaje identičan ulazu.
 * Cleaning fee se ne dijeli i u cijelosti ostaje u mjesecu check-ina.
 *
 * Modul očekuje već izračunate/normalizovane totale. Ne računa Airbnb,
 * Booking ili VRBO pravila i ne pristupa bazi podataka.
 *
 * @param {Object} [input]
 * @param {string} input.checkIn Datum u YYYY-MM-DD formatu.
 * @param {string} input.checkOut Datum u YYYY-MM-DD formatu.
 * @param {number} [input.fallbackYear] Godina za legacy zapis bez validnog perioda.
 * @param {number} [input.fallbackMonth] Mjesec za legacy zapis bez validnog perioda.
 * @param {number} [input.nights=0] Legacy broj noćenja.
 * @param {number} [input.amountEur=0] Ukupni prihod koji se raspoređuje.
 * @param {number} [input.splitBaseEur=0] MANAGED split base.
 * @param {number} [input.ownerIncomeEur=0] MANAGED prihod vlasnika.
 * @param {number} [input.agencyCommissionEur=0] MANAGED ukupna provizija agencije, uključujući CF.
 * @param {number} [input.cleaningFeeEur=0] Jednokratni cleaning fee.
 * @param {number} [input.platformFeeEur=0] Ukupni platform fee koji se proporcionalno raspoređuje.
 * @returns {Array<{year:number,month:number,nights:number,amountEur:number,splitBaseEur:number,ownerIncomeEur:number,agencyCommissionEur:number,cleaningFeeEur:number,platformFeeEur:number,allocationMode:string}>}
 */
export function allocateReservationByStay(input = {}) {
  const stay = getValidStay(input.checkIn, input.checkOut);
  if (!stay) return buildLegacySegment(input);

  const segments = getMonthSegments(stay);
  const amountAllocations = allocateCentsBySegments(
    toCents(input.amountEur, "Prihod"),
    stay.nights,
    segments
  );
  const splitBaseAllocations = allocateCentsBySegments(
    toCents(input.splitBaseEur, "Split base"),
    stay.nights,
    segments
  );
  const ownerAllocations = allocateCentsBySegments(
    toCents(input.ownerIncomeEur, "Owner income"),
    stay.nights,
    segments
  );
  const platformFeeAllocations = allocateCentsBySegments(
    toCents(input.platformFeeEur, "Platform fee"),
    stay.nights,
    segments
  );

  const cleaningFeeCents = toCents(input.cleaningFeeEur, "Cleaning fee");
  const agencyCommissionCents = toCents(
    input.agencyCommissionEur,
    "Agency commission"
  );
  if (cleaningFeeCents > agencyCommissionCents) {
    throw new RangeError("Cleaning fee ne može biti veći od agency commission iznosa.");
  }

  const agencyShareAllocations = allocateCentsBySegments(
    agencyCommissionCents - cleaningFeeCents,
    stay.nights,
    segments
  );

  return segments.map((segment, index) => {
    const segmentCleaningFee = index === 0 ? cleaningFeeCents : 0;

    return {
      year: segment.year,
      month: segment.month,
      nights: segment.nights,
      amountEur: fromCents(amountAllocations[index]),
      splitBaseEur: fromCents(splitBaseAllocations[index]),
      ownerIncomeEur: fromCents(ownerAllocations[index]),
      agencyCommissionEur: fromCents(
        agencyShareAllocations[index] + segmentCleaningFee
      ),
      cleaningFeeEur: fromCents(segmentCleaningFee),
      platformFeeEur: fromCents(platformFeeAllocations[index]),
      allocationMode: "STAY",
    };
  });
}
