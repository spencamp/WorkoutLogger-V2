export function normalizeMovementName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function movementKey(name) {
  return normalizeMovementName(name).toLowerCase();
}

export function getDateKey(dateValue) {
  const date = new Date(dateValue);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDateKey(dateKey, dayDelta) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + dayDelta);
  return getDateKey(date);
}

export function getDateRangeKeys(startDateKey, endDateKey) {
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];

  const keys = [];
  const cursor = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(endDate.getTime())) return [];

  while (cursor.getTime() <= endDate.getTime()) {
    keys.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return keys;
}

export function isDateKeyInRange(dateKey, startDateKey, endDateKey) {
  if (!dateKey || !startDateKey || !endDateKey) return false;
  return dateKey >= startDateKey && dateKey <= endDateKey;
}

export function isConsecutiveDateKey(previousDateKey, nextDateKey) {
  if (!previousDateKey || !nextDateKey) return false;
  return shiftDateKey(previousDateKey, 1) === nextDateKey;
}

export function findMatchingDayEntry(entries, referenceEntry, excludeId = null) {
  const targetDate = getDateKey(referenceEntry.timestamp);
  const targetMovement = movementKey(referenceEntry.movement);

  return entries.find((entry) => {
    if (excludeId && entry.id === excludeId) return false;
    return (
      getDateKey(entry.timestamp) === targetDate &&
      entry.mode === referenceEntry.mode &&
      entry.movementType === referenceEntry.movementType &&
      movementKey(entry.movement) === targetMovement
    );
  });
}

export function mergeEntryAmounts(target, source) {
  target.amount += source.amount;
  if (Number.isFinite(source.setAmount) && source.setAmount > 0) {
    target.setAmount = source.setAmount;
  }
  target.timestamp = Math.max(target.timestamp, source.timestamp);
}
