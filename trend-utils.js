import { getDateKey } from "./entry-utils.js";

const MS_DAY = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getDateRangeKeys(startDateKey, endDateKey) {
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];

  const keys = [];
  const endTime = parseDateKey(endDateKey).getTime();

  for (let cursor = parseDateKey(startDateKey); cursor.getTime() <= endTime; ) {
    keys.push(getDateKey(cursor));
    cursor = new Date(cursor.getTime() + MS_DAY);
  }

  return keys;
}

function getWeekBucketKey(dateKey) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() - date.getDay());
  return getDateKey(date);
}

function getMetricValue(valuesByDay, dateKey, metric) {
  const raw = valuesByDay[dateKey]?.[metric];
  return Number.isFinite(raw) ? raw : 0;
}

export function buildDailyTotals(entries) {
  const totalsByDay = {};

  for (const entry of entries) {
    const key = getDateKey(entry.timestamp);
    if (!totalsByDay[key]) totalsByDay[key] = { time: 0, reps: 0 };
    if (entry.mode === "time") totalsByDay[key].time += entry.amount;
    if (entry.mode === "reps") totalsByDay[key].reps += entry.amount;
  }

  return totalsByDay;
}

export function getFirstTrackedDateKey(entries) {
  if (entries.length === 0) return null;

  let earliestKey = null;
  for (const entry of entries) {
    const key = getDateKey(entry.timestamp);
    if (!earliestKey || key < earliestKey) earliestKey = key;
  }

  return earliestKey;
}

export function shiftDateKey(dateKey, dayDelta) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + dayDelta);
  return getDateKey(date);
}

export function calculateAdjustedAverage({
  endDateKey,
  valuesByDay,
  metric,
  windowDays,
  firstTrackedDateKey = null,
}) {
  if (!endDateKey || !windowDays) return 0;

  const nominalStartKey = shiftDateKey(endDateKey, -(windowDays - 1));
  const startDateKey =
    firstTrackedDateKey && nominalStartKey < firstTrackedDateKey
      ? firstTrackedDateKey
      : nominalStartKey;

  if (startDateKey > endDateKey) return 0;

  const dayKeys = getDateRangeKeys(startDateKey, endDateKey);
  if (dayKeys.length === 0) return 0;

  let total = 0;
  let countedDays = 0;
  const weeklyBuckets = new Map();

  for (const dateKey of dayKeys) {
    const value = getMetricValue(valuesByDay, dateKey, metric);
    total += value;

    const bucketKey = getWeekBucketKey(dateKey);
    const bucket = weeklyBuckets.get(bucketKey) || { activeDays: 0, restDays: 0 };
    if (value > 0) bucket.activeDays += 1;
    else bucket.restDays += 1;
    weeklyBuckets.set(bucketKey, bucket);
  }

  for (const bucket of weeklyBuckets.values()) {
    countedDays += bucket.activeDays + Math.max(0, bucket.restDays - 1);
  }

  if (countedDays === 0) return 0;
  return total / countedDays;
}

export function buildRollingAverageSeries({
  startDateKey,
  endDateKey,
  valuesByDay,
  metric,
  windowDays,
  firstTrackedDateKey = null,
}) {
  const dayKeys = getDateRangeKeys(startDateKey, endDateKey);

  return dayKeys.map((dateKey) => ({
    dateKey,
    value: calculateAdjustedAverage({
      endDateKey: dateKey,
      valuesByDay,
      metric,
      windowDays,
      firstTrackedDateKey,
    }),
  }));
}
