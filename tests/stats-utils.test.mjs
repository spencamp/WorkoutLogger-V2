import test from "node:test";
import assert from "node:assert/strict";
import { getEntriesForRange, getEntriesWithinDays, getStreakStats } from "../stats-utils.js";

test("getEntriesWithinDays includes the full oldest calendar day across DST fallback", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    const entries = [
      { timestamp: new Date(2026, 9, 27, 0, 30).getTime() },
      { timestamp: new Date(2026, 10, 2, 9, 0).getTime() },
    ];

    const recent = getEntriesWithinDays(entries, 7, "2026-11-02");
    assert.equal(recent.length, 2);
  } finally {
    process.env.TZ = previousTz;
  }
});

test("getStreakStats keeps longest streak intact across DST fallback", () => {
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    const entries = [
      { timestamp: new Date(2026, 9, 31, 8, 0).getTime() },
      { timestamp: new Date(2026, 10, 1, 8, 0).getTime() },
      { timestamp: new Date(2026, 10, 2, 8, 0).getTime() },
    ];

    assert.deepEqual(getStreakStats(entries, "2026-11-02"), {
      currentStreak: 3,
      longestStreak: 3,
      activeDays: 3,
    });
  } finally {
    process.env.TZ = previousTz;
  }
});

test("getEntriesForRange supports today, 7d, 30d, and all", () => {
  const entries = [
    { id: "old", timestamp: new Date(2026, 0, 1, 8, 0).getTime() },
    { id: "week", timestamp: new Date(2026, 2, 1, 8, 0).getTime() },
    { id: "today", timestamp: new Date(2026, 2, 7, 8, 0).getTime() },
  ];

  assert.deepEqual(
    getEntriesForRange(entries, "today", "2026-03-07").map((entry) => entry.id),
    ["today"]
  );
  assert.deepEqual(
    getEntriesForRange(entries, "7d", "2026-03-07").map((entry) => entry.id),
    ["week", "today"]
  );
  assert.deepEqual(
    getEntriesForRange(entries, "30d", "2026-03-07").map((entry) => entry.id),
    ["week", "today"]
  );
  assert.deepEqual(
    getEntriesForRange(entries, "all", "2026-03-07").map((entry) => entry.id),
    ["old", "week", "today"]
  );
});
