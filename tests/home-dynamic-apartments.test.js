import test from "node:test";
import assert from "node:assert/strict";

import { computePeriodReport } from "../js/reports/metrics.service.js";

function report(input = {}) {
  return computePeriodReport({
    incomeMonthly: [],
    incomeItems: [],
    allIncomeItems: [],
    expenses: [],
    nCommission: null,
    year: 2026,
    month: 8,
    ...input,
  }, { aptFilter: "ALL", shareRule: "INCOME" });
}

test("fresh dynamic Home report does not inject phantom A/Z/N apartments", () => {
  const result = report({
    incomeMonthly: [{ apartment: "S", income_eur: 100, nights: 1 }],
  });

  assert.deepEqual(Object.keys(result.perApt), ["S"]);
  assert.equal(result.perApt.S.income, 100);
  assert.equal(result.perApt.A, undefined);
  assert.equal(result.perApt.Z, undefined);
  assert.equal(result.perApt.N, undefined);
});

test("legacy A/Z/N remain supported when they actually exist in historical data", () => {
  const result = report({
    incomeMonthly: [
      { apartment: "A", income_eur: 50, nights: 1 },
      { apartment: "Z", income_eur: 75, nights: 2 },
      { apartment: "N", income_eur: 90, nights: 1 },
    ],
  });

  assert.deepEqual(Object.keys(result.perApt), ["A", "Z", "N"]);
});

test("legacy N commission-only snapshot still creates N when needed", () => {
  const result = report({
    nCommission: { commission_eur: 25 },
  });

  assert.deepEqual(Object.keys(result.perApt), ["N"]);
  assert.equal(result.perApt.N.income, 25);
});
