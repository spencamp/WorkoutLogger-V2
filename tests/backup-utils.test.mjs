import test from "node:test";
import assert from "node:assert/strict";
import { createBackupCode, parseBackupCode } from "../backup-utils.js";

test("backup codes round-trip the app data", () => {
  const backupCode = createBackupCode({
    entries: [
      {
        id: "entry-1",
        timestamp: 1700000000000,
        movement: "Hamstring stretch",
        movementType: "stretches",
        mode: "time",
        amount: 120,
      },
    ],
    customOptions: {
      stretches: ["Couch Stretch"],
      exercises: ["Push-Up"],
    },
    archivedMovements: {
      stretches: ["Quad stretch"],
      exercises: [],
    },
    trendBenchmarkSnapshot: {
      dateKey: "2026-03-06",
      baselineEndKey: "2026-03-05",
      metrics: {
        time: { avg7: 5, avg30: 7 },
        reps: { avg7: 8, avg30: 10 },
      },
    },
  });

  const parsed = parseBackupCode(backupCode);

  assert.equal(parsed.version, 1);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].movement, "Hamstring stretch");
  assert.deepEqual(parsed.customOptions, {
    stretches: ["Couch Stretch"],
    exercises: ["Push-Up"],
  });
  assert.deepEqual(parsed.archivedMovements, {
    stretches: ["Quad stretch"],
    exercises: [],
  });
  assert.equal(parsed.trendBenchmarkSnapshot.metrics.time.avg7, 5);
});

test("backup parsing rejects unrecognized codes", () => {
  assert.throws(() => parseBackupCode("not-a-backup"), /not recognized/);
});

test("backup parsing preserves unicode and deduplicates movement lists", () => {
  const parsed = parseBackupCode(
    createBackupCode({
      entries: [
        {
          id: "entry-2",
          timestamp: 1700000000000,
          movement: "Hip Opener",
          movementType: "stretches",
          mode: "time",
          amount: 60,
        },
      ],
      customOptions: {
        stretches: ["  Cossack Squat  ", "cossack squat", "Pigeon 🧘"],
        exercises: ["Sit-Up"],
      },
      archivedMovements: {
        stretches: [],
        exercises: ["Burpee", " burpee "],
      },
    })
  );

  assert.deepEqual(parsed.customOptions.stretches, ["Cossack Squat", "Pigeon 🧘"]);
  assert.deepEqual(parsed.archivedMovements.exercises, ["Burpee"]);
});
