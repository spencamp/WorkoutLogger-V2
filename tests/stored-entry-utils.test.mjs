import test from "node:test";
import assert from "node:assert/strict";
import { normalizePersistedEntry } from "../stored-entry-utils.js";

test("normalizePersistedEntry keeps already valid entries intact", () => {
  const entry = normalizePersistedEntry({
    id: "entry-1",
    mode: "time",
    amount: 90,
    setAmount: 30,
    timestamp: 1700000000000,
    movement: "Hamstring Stretch",
    movementType: "stretches",
  });

  assert.deepEqual(entry, {
    id: "entry-1",
    mode: "time",
    amount: 90,
    setAmount: 30,
    timestamp: 1700000000000,
    movement: "Hamstring Stretch",
    movementType: "stretches",
  });
});

test("normalizePersistedEntry restores entries with missing movementType", () => {
  const entry = normalizePersistedEntry({
    id: 42,
    mode: "reps",
    amount: "12",
    timestamp: "1700000000000",
    movement: "Push Up",
  });

  assert.deepEqual(entry, {
    id: "42",
    mode: "reps",
    amount: 12,
    setAmount: 12,
    timestamp: 1700000000000,
    movement: "Push Up",
    movementType: "exercises",
  });
});

test("normalizePersistedEntry rejects entries without enough information", () => {
  assert.equal(
    normalizePersistedEntry({
      id: "entry-3",
      amount: 30,
      timestamp: 1700000000000,
      movement: "Mystery Move",
    }),
    null
  );
});
