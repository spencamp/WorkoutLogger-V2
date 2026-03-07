const BACKUP_PREFIX = "workoutlog:v1:";
const MOVEMENT_TYPES = ["stretches", "exercises"];

function sanitizeStringList(values) {
  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const sanitized = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().replace(/\s+/g, " ");
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sanitized.push(trimmed);
  }

  return sanitized;
}

function sanitizeMovementGroups(groups) {
  const sanitized = {
    stretches: [],
    exercises: [],
  };

  for (const type of MOVEMENT_TYPES) {
    sanitized[type] = sanitizeStringList(groups?.[type]);
  }

  return sanitized;
}

function encodeBase64Utf8(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64Utf8(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }

  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildPayload({
  entries,
  customOptions,
  archivedMovements,
  trendBenchmarkSnapshot = null,
}) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : [],
    customOptions: sanitizeMovementGroups(customOptions),
    archivedMovements: sanitizeMovementGroups(archivedMovements),
    trendBenchmarkSnapshot,
  };
}

export function createBackupCode(data) {
  return `${BACKUP_PREFIX}${encodeBase64Utf8(JSON.stringify(buildPayload(data)))}`;
}

export function parseBackupCode(backupCode) {
  const raw = String(backupCode ?? "").trim();
  if (!raw.startsWith(BACKUP_PREFIX)) {
    throw new Error("Backup code format is not recognized.");
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Utf8(raw.slice(BACKUP_PREFIX.length)));
  } catch {
    throw new Error("Backup code could not be read.");
  }

  if (!payload || payload.version !== 1 || !Array.isArray(payload.entries)) {
    throw new Error("Backup code is not supported.");
  }

  return {
    version: payload.version,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : null,
    entries: payload.entries,
    customOptions: sanitizeMovementGroups(payload.customOptions),
    archivedMovements: sanitizeMovementGroups(payload.archivedMovements),
    trendBenchmarkSnapshot: payload.trendBenchmarkSnapshot ?? null,
  };
}
