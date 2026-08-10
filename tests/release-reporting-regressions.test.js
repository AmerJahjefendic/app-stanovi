import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { computeRangeReport, computeYearReport } from "../js/reports/metrics.service.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function monthRow(month, apartment = "S", income = 100, nights = 1) {
  return {
    year: 2026,
    month,
    incomeMonthly: [{ apartment, income_eur: income, nights }],
    incomeItems: [],
    allIncomeItems: [],
    expenses: [],
    nCommission: null,
  };
}

test("dynamic Year report does not require legacy A/Z/N seed", () => {
  const result = computeYearReport([monthRow(1, "S", 100, 1), monthRow(2, "S", 50, 2)], {
    aptFilter: "ALL",
    shareRule: "INCOME",
  });

  assert.deepEqual(Object.keys(result.perApt), ["S"]);
  assert.equal(result.perApt.S.income, 150);
  assert.equal(result.perApt.S.nights, 3);
  assert.equal(result.perApt.A, undefined);
  assert.equal(result.perApt.Z, undefined);
  assert.equal(result.perApt.N, undefined);
});

test("Range report reuses dynamic Year aggregation without legacy ReferenceError", () => {
  const result = computeRangeReport([monthRow(7, "B", 80, 1), monthRow(8, "C", 120, 2)], {
    aptFilter: "ALL",
    shareRule: "INCOME",
  });

  assert.deepEqual(Object.keys(result.perApt).sort(), ["B", "C"]);
  assert.equal(result.perApt.B.income, 80);
  assert.equal(result.perApt.C.income, 120);
});

test("selected dynamic apartment with no Year data still gets an empty row without seeding A/Z/N", () => {
  const result = computeYearReport([], { aptFilter: "ARCH1", shareRule: "INCOME" });
  assert.deepEqual(Object.keys(result.perApt), ["ARCH1"]);
  assert.deepEqual(result.perApt.ARCH1, { income: 0, nights: 0, expenses: 0, net: 0 });
});

test("Home owner-report metadata lookup uses all registry apartments, not active-only rows", async () => {
  const [eventsSource, pageSource] = await Promise.all([
    read("js/app/home.events.js"),
    read("js/app/home.page.js"),
  ]);

  for (const source of [eventsSource, pageSource]) {
    assert.match(source, /apartmentsListAll/);
    assert.equal(source.includes("apartmentsListActive"), false);
  }
});

test("legacy N note is hidden in the initial fresh-app HTML state", async () => {
  const indexSource = await read("index.html");
  assert.match(
    indexSource,
    /<div class="box" hidden>\s*<div class="boxTitle">Napomena za N<\/div>\s*<div id="nNote" class="note"><\/div>/
  );
});
