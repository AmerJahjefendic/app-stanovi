// js/app/home.data.js
import { dbGetAll, dbGetByIndex, dbDeleteByIndex } from "../db/db.js";

export async function loadPeriodData(year, month) {
  const incomeMonthly = await dbGetByIndex("income_monthly", "by_period", [year, month]);
  const incomeItems = await dbGetByIndex("income_items", "by_period", [year, month]).catch(() => []);
  const allIncomeItems = await dbGetAll("income_items").catch(() => incomeItems);
  const expenses = await dbGetByIndex("expenses", "by_period", [year, month]);
  const nCommission = await dbGetByIndex("n_commission", "by_period", [year, month]).then(arr => arr?.[0] || null).catch(() => null);
  return { year, month, incomeMonthly, incomeItems, allIncomeItems, expenses, nCommission };
}

export async function deletePeriod(year, month) {
  await dbDeleteByIndex("imports", "by_period", [year, month]);
  await dbDeleteByIndex("income_monthly", "by_period", [year, month]);
  await dbDeleteByIndex("income_items", "by_period", [year, month]).catch(() => {});
  await dbDeleteByIndex("expenses", "by_period", [year, month]);
  await dbDeleteByIndex("n_commission", "by_period", [year, month]);
}
