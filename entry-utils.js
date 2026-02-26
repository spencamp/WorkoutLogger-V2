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
  target.timestamp = Math.max(target.timestamp, source.timestamp);
}
