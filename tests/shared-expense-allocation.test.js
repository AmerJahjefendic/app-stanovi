import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateSharedExpense,
  resolveSharedExpenseMembers,
} from "../js/shared/shared-expense-allocation.service.js";
import { SHARE_RULE } from "../js/shared/constants.js";

test("shared expense uses persisted member snapshot instead of current registry", () => {
  const members = resolveSharedExpenseMembers({
    shareKey: "TEAM_1",
    sharedMembers: ["F", "H", "F", ""],
  });

  assert.deepEqual(members, ["F", "H"]);
});

test("legacy SHARED expense without shareKey falls back to A+Z", () => {
  assert.deepEqual(resolveSharedExpenseMembers({}), ["A", "Z"]);
});

test("income-based allocation follows member income ratios", () => {
  const result = allocateSharedExpense(
    { id: "exp1", amount_eur: 10, sharedMembers: ["A", "Z"] },
    {
      A: { income: 100, nights: 1 },
      Z: { income: 300, nights: 3 },
    },
    SHARE_RULE.INCOME
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].apartment, "A");
  assert.equal(result[0].amount_eur, 2.5);
  assert.equal(result[1].apartment, "Z");
  assert.equal(result[1].amount_eur, 7.5);
  assert.equal(result[0].shareRatio, 0.25);
  assert.equal(result[1].shareRatio, 0.75);
});

test("nights-based allocation uses nights instead of income", () => {
  const result = allocateSharedExpense(
    { id: "exp2", amount_eur: 12, sharedMembers: ["A", "Z"] },
    {
      A: { income: 900, nights: 1 },
      Z: { income: 100, nights: 3 },
    },
    SHARE_RULE.NIGHTS
  );

  assert.equal(result[0].amount_eur, 3);
  assert.equal(result[1].amount_eur, 9);
});

test("zero basis falls back to equal split and preserves full amount", () => {
  const result = allocateSharedExpense(
    { id: "exp3", amount_eur: 10, sharedMembers: ["A", "Z", "B"] },
    {},
    SHARE_RULE.INCOME
  );

  assert.equal(result.length, 3);
  assert.equal(result.reduce((total, row) => total + row.amount_eur, 0), 10);
  assert.ok(Math.abs(result[0].shareRatio - 1 / 3) < 1e-12);
  assert.ok(Math.abs(result[1].shareRatio - 1 / 3) < 1e-12);
  assert.ok(Math.abs(result[2].shareRatio - 1 / 3) < 1e-12);
});

test("final member receives floating remainder so allocated sum matches original", () => {
  const result = allocateSharedExpense(
    { id: "exp4", amount_eur: 20, sharedMembers: ["A", "Z"] },
    {
      A: { income: 119.28 },
      Z: { income: 606.57 },
    },
    SHARE_RULE.INCOME
  );

  assert.equal(result.reduce((total, row) => total + row.amount_eur, 0), 20);
});
