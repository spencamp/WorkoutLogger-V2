import { movementKey, normalizeMovementName } from "./entry-utils.js";
import { WORKOUT_OPTIONS } from "./workout-options.js";

const EXERCISE_KEYS = new Set((WORKOUT_OPTIONS.exercises || []).map((movement) => movementKey(movement)));
const STRETCH_KEYS = new Set((WORKOUT_OPTIONS.stretches || []).map((movement) => movementKey(movement)));

function inferMovementType({ movement, mode, movementType }) {
  if (movementType === "stretches" || movementType === "exercises") return movementType;

  const key = movementKey(movement);
  if (!key) return null;

  if (EXERCISE_KEYS.has(key) && !STRETCH_KEYS.has(key)) return "exercises";
  if (STRETCH_KEYS.has(key) && !EXERCISE_KEYS.has(key)) return "stretches";
  if (mode === "reps") return "exercises";
  if (mode === "time") return "stretches";

  return null;
}

export function normalizePersistedEntry(entry) {
  const id =
    typeof entry?.id === "string"
      ? entry.id
      : Number.isFinite(entry?.id)
        ? String(entry.id)
        : "";
  const mode = entry?.mode === "time" || entry?.mode === "reps" ? entry.mode : null;
  const amount = Number(entry?.amount);
  const timestamp = Number(entry?.timestamp);
  const movement = normalizeMovementName(entry?.movement);
  const movementType = inferMovementType({
    movement,
    mode,
    movementType: entry?.movementType,
  });

  if (!id || !mode || !Number.isFinite(amount) || !Number.isFinite(timestamp) || !movement || !movementType) {
    return null;
  }

  return {
    id,
    mode,
    amount,
    timestamp,
    movement,
    movementType,
  };
}
