import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMovementName,
  movementKey,
  getDateKey,
  getDateRangeKeys,
  isDateKeyInRange,
  isConsecutiveDateKey,
  findMatchingDayEntry,
  mergeEntryAmounts,
} from "../entry-utils.js";

test("normalizeMovementName trims and collapses spaces", () => {
  assert.equal(normalizeMovementName("  dead   hang "), "dead hang");
  assert.equal(normalizeMovementName(""), "");
});

test("movementKey normalizes case and whitespace", () => {
  assert.equal(movementKey(" Dead   Hang "), "dead hang");
});

test("getDateKey returns local YYYY-MM-DD", () => {
  const key = getDateKey(new Date(2026, 1, 20, 10, 45));
  assert.equal(key, "2026-02-20");
});

test("getDateRangeKeys walks local calendar days across DST fallback", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    assert.deepEqual(getDateRangeKeys("2026-10-31", "2026-11-02"), [
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  } finally {
    process.env.TZ = previousTz;
  }
});

test("isDateKeyInRange includes both range boundaries", () => {
  assert.equal(isDateKeyInRange("2026-03-01", "2026-03-01", "2026-03-07"), true);
  assert.equal(isDateKeyInRange("2026-03-07", "2026-03-01", "2026-03-07"), true);
  assert.equal(isDateKeyInRange("2026-02-28", "2026-03-01", "2026-03-07"), false);
});

test("isConsecutiveDateKey follows calendar days instead of raw milliseconds", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    assert.equal(isConsecutiveDateKey("2026-11-01", "2026-11-02"), true);
    assert.equal(isConsecutiveDateKey("2026-11-01", "2026-11-03"), false);
  } finally {
    process.env.TZ = previousTz;
  }
});

test("findMatchingDayEntry matches same day/mode/type/movement", () => {
  const entries = [
    {
      id: "1",
      timestamp: new Date(2026, 1, 20, 8, 0).getTime(),
      movement: "Dead Hang",
      movementType: "stretches",
      mode: "time",
      amount: 60,
    },
    {
      id: "2",
      timestamp: new Date(2026, 1, 20, 9, 0).getTime(),
      movement: "Dead Hang",
      movementType: "stretches",
      mode: "reps",
      amount: 5,
    },
  ];

  const reference = {
    id: "3",
    timestamp: new Date(2026, 1, 20, 18, 30).getTime(),
    movement: "  dead   hang ",
    movementType: "stretches",
    mode: "time",
    amount: 30,
  };

  const match = findMatchingDayEntry(entries, reference);
  assert.equal(match?.id, "1");
});

test("findMatchingDayEntry respects excludeId", () => {
  const entry = {
    id: "1",
    timestamp: new Date(2026, 1, 20, 8, 0).getTime(),
    movement: "Dead Hang",
    movementType: "stretches",
    mode: "time",
    amount: 60,
  };

  const match = findMatchingDayEntry([entry], entry, "1");
  assert.equal(match, undefined);
});

test("mergeEntryAmounts combines amounts and keeps newest timestamp", () => {
  const target = {
    id: "1",
    timestamp: new Date(2026, 1, 20, 8, 0).getTime(),
    movement: "Dead Hang",
    movementType: "stretches",
    mode: "time",
    amount: 60,
  };
  const source = {
    id: "2",
    timestamp: new Date(2026, 1, 20, 18, 0).getTime(),
    movement: "dead hang",
    movementType: "stretches",
    mode: "time",
    amount: 120,
  };

  mergeEntryAmounts(target, source);
  assert.equal(target.amount, 180);
  assert.equal(target.timestamp, source.timestamp);
});
