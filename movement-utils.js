import { getDateKey, movementKey } from "./entry-utils.js";

const MS_DAY = 24 * 60 * 60 * 1000;

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getFullDayDifference(startDateKey, endDateKey) {
  if (!startDateKey || !endDateKey) return 0;
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  return Math.max(0, Math.round((end - start) / MS_DAY));
}

export function buildMovementHistory(entries) {
  const history = { stretches: {}, exercises: {} };

  for (const entry of entries) {
    if (entry.movementType !== "stretches" && entry.movementType !== "exercises") continue;

    const key = movementKey(entry.movement);
    if (!key) continue;

    const dateKey = getDateKey(entry.timestamp);
    const record = history[entry.movementType][key] || { count: 0, lastLoggedDateKey: null };
    record.count += 1;
    if (!record.lastLoggedDateKey || dateKey > record.lastLoggedDateKey) {
      record.lastLoggedDateKey = dateKey;
    }
    history[entry.movementType][key] = record;
  }

  return history;
}

export function selectHighlightedStaleMovements({
  movementHistory,
  visibleMovementNames,
  todayDateKey = getDateKey(Date.now()),
  minLogs = 3,
  staleAfterDays = 5,
  maxHighlights = 3,
}) {
  const visibleKeys = new Set((visibleMovementNames || []).map((name) => movementKey(name)).filter(Boolean));

  const highlightedKeys = Object.entries(movementHistory || {})
    .filter(([key, record]) => {
      if (visibleKeys.size > 0 && !visibleKeys.has(key)) return false;
      if (!record?.lastLoggedDateKey || !Number.isFinite(record.count)) return false;
      if (record.count < minLogs) return false;
      return getFullDayDifference(record.lastLoggedDateKey, todayDateKey) > staleAfterDays;
    })
    .sort((a, b) => {
      const daysSinceA = getFullDayDifference(a[1].lastLoggedDateKey, todayDateKey);
      const daysSinceB = getFullDayDifference(b[1].lastLoggedDateKey, todayDateKey);
      if (daysSinceA !== daysSinceB) return daysSinceB - daysSinceA;

      const byLastLogged = a[1].lastLoggedDateKey.localeCompare(b[1].lastLoggedDateKey);
      if (byLastLogged !== 0) return byLastLogged;

      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxHighlights)
    .map(([key]) => key);

  return new Set(highlightedKeys);
}
