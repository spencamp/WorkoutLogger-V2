import { getDateKey, isConsecutiveDateKey, isDateKeyInRange, shiftDateKey } from "./entry-utils.js";

function buildDailyCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const key = getDateKey(entry.timestamp);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function getEntriesWithinDays(entries, days, todayDateKey = getDateKey(Date.now())) {
  if (!Array.isArray(entries) || days <= 0) return [];

  const startDateKey = shiftDateKey(todayDateKey, -(days - 1));
  return entries.filter((entry) => {
    const entryDateKey = getDateKey(entry.timestamp);
    return isDateKeyInRange(entryDateKey, startDateKey, todayDateKey);
  });
}

export function getEntriesForRange(entries, range = "all", todayDateKey = getDateKey(Date.now())) {
  if (!Array.isArray(entries)) return [];
  if (range === "all") return [...entries];
  if (range === "today") return getEntriesWithinDays(entries, 1, todayDateKey);
  if (range === "7d") return getEntriesWithinDays(entries, 7, todayDateKey);
  if (range === "30d") return getEntriesWithinDays(entries, 30, todayDateKey);
  return [];
}

export function getStreakStats(entries, todayDateKey = getDateKey(Date.now())) {
  const counts = buildDailyCounts(entries);
  const keys = Object.keys(counts).sort();

  let currentStreak = 0;
  for (let cursorKey = todayDateKey; counts[cursorKey]; cursorKey = shiftDateKey(cursorKey, -1)) {
    currentStreak += 1;
  }

  let longestStreak = 0;
  let running = 0;
  let previousKey = null;
  for (const key of keys) {
    if (previousKey && isConsecutiveDateKey(previousKey, key)) running += 1;
    else running = 1;

    if (running > longestStreak) longestStreak = running;
    previousKey = key;
  }

  return {
    currentStreak,
    longestStreak,
    activeDays: keys.length,
  };
}
