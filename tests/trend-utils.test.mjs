import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyTotals,
  getFirstTrackedDateKey,
  shiftDateKey,
  calculateAdjustedAverage,
  buildRollingAverageSeries,
} from "../trend-utils.js";

test("buildDailyTotals pools time and reps by day", () => {
  const entries = [
    {
      id: "1",
      timestamp: new Date(2026, 1, 20, 8, 0).getTime(),
      movement: "Dead Hang",
      movementType: "stretches",
      mode: "time",
      amount: 90,
    },
    {
      id: "2",
      timestamp: new Date(2026, 1, 20, 18, 0).getTime(),
      movement: "Push Up",
      movementType: "exercises",
      mode: "reps",
      amount: 12,
    },
    {
      id: "3",
      timestamp: new Date(2026, 1, 21, 9, 0).getTime(),
      movement: "Plank",
      movementType: "stretches",
      mode: "time",
      amount: 30,
    },
  ];

  assert.deepEqual(buildDailyTotals(entries), {
    "2026-02-20": { time: 90, reps: 12 },
    "2026-02-21": { time: 30, reps: 0 },
  });
});

test("getFirstTrackedDateKey returns the oldest local day", () => {
  const entries = [
    { timestamp: new Date(2026, 1, 22, 9, 0).getTime() },
    { timestamp: new Date(2026, 1, 20, 9, 0).getTime() },
    { timestamp: new Date(2026, 1, 21, 9, 0).getTime() },
  ];

  assert.equal(getFirstTrackedDateKey(entries), "2026-02-20");
});

test("shiftDateKey moves forward and backward in local time", () => {
  assert.equal(shiftDateKey("2026-02-20", 3), "2026-02-23");
  assert.equal(shiftDateKey("2026-02-20", -6), "2026-02-14");
});

test("calculateAdjustedAverage forgives one rest day in each Sunday-to-Saturday week", () => {
  const valuesByDay = {
    "2026-02-15": { time: 10, reps: 0 },
    "2026-02-16": { time: 10, reps: 0 },
    "2026-02-17": { time: 10, reps: 0 },
    "2026-02-18": { time: 10, reps: 0 },
    "2026-02-19": { time: 10, reps: 0 },
    "2026-02-20": { time: 0, reps: 0 },
    "2026-02-21": { time: 0, reps: 0 },
  };

  const average = calculateAdjustedAverage({
    endDateKey: "2026-02-21",
    valuesByDay,
    metric: "time",
    windowDays: 7,
    firstTrackedDateKey: "2026-02-15",
  });

  assert.equal(average, 50 / 6);
});

test("calculateAdjustedAverage applies the forgiven rest day separately inside overlapping weeks", () => {
  const valuesByDay = {
    "2026-02-17": { time: 10, reps: 0 },
    "2026-02-18": { time: 0, reps: 0 },
    "2026-02-19": { time: 10, reps: 0 },
    "2026-02-20": { time: 0, reps: 0 },
    "2026-02-21": { time: 10, reps: 0 },
    "2026-02-22": { time: 10, reps: 0 },
    "2026-02-23": { time: 0, reps: 0 },
  };

  const average = calculateAdjustedAverage({
    endDateKey: "2026-02-23",
    valuesByDay,
    metric: "time",
    windowDays: 7,
    firstTrackedDateKey: "2026-02-17",
  });

  assert.equal(average, 8);
});

test("calculateAdjustedAverage clamps partial windows to the first tracked day", () => {
  const valuesByDay = {
    "2026-02-20": { time: 10, reps: 0 },
    "2026-02-21": { time: 0, reps: 0 },
    "2026-02-22": { time: 10, reps: 0 },
  };

  const average = calculateAdjustedAverage({
    endDateKey: "2026-02-22",
    valuesByDay,
    metric: "time",
    windowDays: 7,
    firstTrackedDateKey: "2026-02-20",
  });

  assert.equal(average, 10);
});

test("buildRollingAverageSeries returns a point for each displayed day", () => {
  const valuesByDay = {
    "2026-02-20": { time: 10, reps: 0 },
    "2026-02-21": { time: 20, reps: 0 },
    "2026-02-22": { time: 0, reps: 0 },
  };

  const series = buildRollingAverageSeries({
    startDateKey: "2026-02-20",
    endDateKey: "2026-02-22",
    valuesByDay,
    metric: "time",
    windowDays: 2,
    firstTrackedDateKey: "2026-02-20",
  });

  assert.deepEqual(series, [
    { dateKey: "2026-02-20", value: 10 },
    { dateKey: "2026-02-21", value: 15 },
    { dateKey: "2026-02-22", value: 20 },
  ]);
});
