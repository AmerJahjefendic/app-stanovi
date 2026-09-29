import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseAndValidateBackupText } from "../js/backup/backup.service.js";

// Execute the production transaction boundary with a deterministic IDB double.
// This checks rollback behaviour without requiring a browser or new dependency.
const source = fs.readFileSync(new URL("../js/db/db.js", import.meta.url), "utf8");
const functionSource = source.slice(
  source.indexOf("export async function dbPutStoreMapAtomic"),
  source.indexOf("export async function dbPutMany")
).replace("export ", "");

function harness(initial = {}, { asyncFailure = false, creationFailure = false } = {}) {
  const records = structuredClone(initial);
  let aborted = false;
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      if (creationFailure) throw new Error("Transaction unavailable");
      const pending = [];
      const transaction = {
        objectStore(name) {
          return { put(row) {
            if (typeof row.id !== "string") throw new Error("DataError");
            pending.push([name, structuredClone(row)]);
          } };
        },
        abort() { aborted = true; },
      };
      setImmediate(() => {
        if (asyncFailure) {
          aborted = true;
          transaction.error = new Error("ConstraintError");
          transaction.onerror?.();
        }
        if (aborted) { transaction.onabort?.(); return; }
        for (const [name, row] of pending) {
          records[name] ||= {};
          records[name][row.id] = row;
        }
        transaction.oncomplete?.();
      });
      return transaction;
    },
  };
  const context = vm.createContext({ getDB: async () => db });
  vm.runInContext(functionSource, context);
  return { restore: context.dbPutStoreMapAtomic, records };
}

for (const initial of [{}, { apartments: { old: { id: "old", name: "Original" } } }]) {
  test(`synchronous restore failure rolls back all stores in ${Object.keys(initial).length ? "existing" : "empty"} database`, async () => {
    const h = harness(initial);
    await assert.rejects(h.restore({
      apartments: [{ id: "old", name: "Replacement" }, { id: "new" }],
      income_items: [{ id: { invalid: true } }],
    }), /DataError/);
    await new Promise(setImmediate);
    assert.deepEqual(h.records, initial);
  });
}

test("successful restore adds and overwrites while retaining unrelated records", async () => {
  const h = harness({ apartments: { old: { id: "old" }, keep: { id: "keep" } } });
  assert.equal(await h.restore({ apartments: [{ id: "old", name: "Updated" }], income_items: [{ id: "new" }] }), true);
  assert.deepEqual(h.records, { apartments: { old: { id: "old", name: "Updated" }, keep: { id: "keep" } }, income_items: { new: { id: "new" } } });
});

test("asynchronous request failure leaves all stores unchanged", async () => {
  const initial = { apartments: { old: { id: "old" } } };
  const h = harness(initial, { asyncFailure: true });
  await assert.rejects(h.restore({ apartments: [{ id: "new" }] }), /ConstraintError/);
  assert.deepEqual(h.records, initial);
});

test("transaction creation failure preserves original error", async () => {
  const h = harness({}, { creationFailure: true });
  await assert.rejects(h.restore({ apartments: [{ id: "new" }] }), /Transaction unavailable/);
});

test("legacy backup with an invalid key cannot leave a partial restore", async () => {
  const parsed = parseAndValidateBackupText(JSON.stringify({
    meta: { app: "AppStanovi", version: "1.0" },
    apartments: [{ id: "valid" }],
    income_items: [{ id: { invalid: true } }],
  }));
  const h = harness();
  await assert.rejects(h.restore(parsed.storeRows), /DataError/);
  await new Promise(setImmediate);
  assert.deepEqual(h.records, {});
});
