import test from "node:test";
import assert from "node:assert/strict";
import {
  getFullDayDifference,
  buildMovementHistory,
  selectHighlightedStaleMovements,
} from "../movement-utils.js";

test("getFullDayDifference returns calendar day gaps", () => {
  assert.equal(getFullDayDifference("2026-03-01", "2026-03-01"), 0);
  assert.equal(getFullDayDifference("2026-03-01", "2026-03-06"), 5);
  assert.equal(getFullDayDifference("2026-03-01", "2026-03-07"), 6);
});

test("buildMovementHistory groups by movement type and normalized movement name", () => {
  const entries = [
    {
      id: "1",
      timestamp: new Date(2026, 1, 20, 8, 0).getTime(),
      movement: "Push Ups",
      movementType: "exercises",
      mode: "reps",
      amount: 10,
    },
    {
      id: "2",
      timestamp: new Date(2026, 1, 22, 8, 0).getTime(),
      movement: " push   ups ",
      movementType: "exercises",
      mode: "reps",
      amount: 10,
    },
    {
      id: "3",
      timestamp: new Date(2026, 1, 21, 8, 0).getTime(),
      movement: "Dead Hang",
      movementType: "stretches",
      mode: "time",
      amount: 60,
    },
  ];

  assert.deepEqual(buildMovementHistory(entries), {
    stretches: {
      "dead hang": { count: 1, lastLoggedDateKey: "2026-02-21" },
    },
    exercises: {
      "push ups": { count: 2, lastLoggedDateKey: "2026-02-22" },
    },
  });
});

test("selectHighlightedStaleMovements only flags movements with enough logs and more than five full days", () => {
  const highlighted = selectHighlightedStaleMovements({
    movementHistory: {
      plank: { count: 3, lastLoggedDateKey: "2026-02-23" },
      run: { count: 3, lastLoggedDateKey: "2026-02-24" },
      "push ups": { count: 2, lastLoggedDateKey: "2026-02-20" },
    },
    visibleMovementNames: ["plank", "run", "push ups"],
    todayDateKey: "2026-03-01",
    minLogs: 3,
    staleAfterDays: 5,
    maxHighlights: 3,
  });

  assert.deepEqual([...highlighted], ["plank"]);
});

test("selectHighlightedStaleMovements limits to the top three stalest visible movements", () => {
  const highlighted = selectHighlightedStaleMovements({
    movementHistory: {
      alpha: { count: 4, lastLoggedDateKey: "2026-02-20" },
      beta: { count: 4, lastLoggedDateKey: "2026-02-21" },
      gamma: { count: 4, lastLoggedDateKey: "2026-02-22" },
      delta: { count: 4, lastLoggedDateKey: "2026-02-23" },
      epsilon: { count: 4, lastLoggedDateKey: "2026-02-15" },
    },
    visibleMovementNames: ["alpha", "beta", "gamma", "delta"],
    todayDateKey: "2026-03-01",
    minLogs: 3,
    staleAfterDays: 5,
    maxHighlights: 3,
  });

  assert.deepEqual([...highlighted], ["alpha", "beta", "gamma"]);
});
