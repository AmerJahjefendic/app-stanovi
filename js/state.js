// js/state.js
export const state = {
  aptFilter: "ALL",
  shareRule: "NIGHTS",

  selectedCalendarYear: null, // godina u kalendaru
  selectedPeriodKey: null,    // "YYYY-MM" za MONTH view
  isYearView: false,          // YEAR view (klik na godinu)
  isRangeView: false,         // RANGE view (klik na dugme)

  fromPeriodKey: null,        // "YYYY-MM"
  toPeriodKey: null,          // "YYYY-MM"
};
