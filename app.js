import { WORKOUT_OPTIONS } from "./workout-options.js";
import {
  getDateKey,
  normalizeMovementName,
  findMatchingDayEntry as findMatchingDayEntryInList,
  mergeEntryAmounts,
} from "./entry-utils.js";
import {
  buildDailyTotals,
  getFirstTrackedDateKey,
  shiftDateKey,
  calculateAdjustedAverage,
  buildRollingAverageSeries,
} from "./trend-utils.js";

const STORAGE_KEY = "workout-log-v1";
const CUSTOM_OPTIONS_STORAGE_KEY = "workout-custom-options-v1";
const TREND_BENCHMARK_STORAGE_KEY = "workout-trend-benchmarks-v1";
const MS_DAY = 24 * 60 * 60 * 1000;
const VALUE_OPTIONS = {
  time: [30, 60, 90, 120],
  reps: [5, 10, 15, 20],
};
const MOVEMENT_LABEL = {
  stretches: "stretch",
  exercises: "exercise",
};

const state = {
  mode: "time",
  movementType: "stretches",
  selectedMovement: null,
  totals: { time: 0, reps: 0 },
  entries: loadEntries(),
  customOptions: loadCustomOptions(),
  customTarget: "stretches",
  editingEntryId: null,
  lastDeleted: null,
  undoTimerId: null,
  mobileView: "add",
  trendMetric: "time",
  trendBenchmarkSnapshot: loadTrendBenchmarkSnapshot(),
  lastAddedEntryId: null,
  addedHighlightTimerId: null,
};

const modeTabs = document.querySelectorAll("[data-mode-tab]");
const movementTabs = document.querySelectorAll("[data-movement-tab]");
const valueGrid = document.getElementById("value-grid");
const movementGrid = document.getElementById("movement-grid");
const selectedValueLabel = document.getElementById("selected-value");
const saveWorkoutButton = document.getElementById("save-workout");
const duplicateLastButton = document.getElementById("duplicate-last");
const cancelEditButton = document.getElementById("cancel-edit");
const clearValueButton = document.getElementById("clear-value");
const undoBar = document.getElementById("undo-bar");
const undoText = document.getElementById("undo-text");
const undoDeleteButton = document.getElementById("undo-delete");
const trendStats = document.getElementById("trend-stats");
const trendMetricButtons = document.querySelectorAll("[data-trend-metric]");
const trendChart = document.getElementById("trend-chart");
const trendAxis = document.getElementById("trend-axis");
const trendComparison = document.getElementById("trend-comparison");
const movementTrends = document.getElementById("movement-trends");
const streakGrid = document.getElementById("streak-grid");
const heatmap = document.getElementById("heatmap");
const logList = document.getElementById("log-list");
const summaryDate = document.getElementById("summary-date");
const summaryStreak = document.getElementById("summary-streak");
const summaryGrid = document.getElementById("summary-grid");
const composerSummary = document.getElementById("composer-summary");
const clearStickyButton = document.getElementById("clear-sticky");
const quickRepeatButton = document.getElementById("quick-repeat");
const quickAddButtons = document.querySelectorAll("[data-quick-mode][data-quick-value]");
const panelButtons = document.querySelectorAll("[data-mobile-view]");
const appShell = document.getElementById("app-shell");
const addPanel = document.getElementById("add-panel");
const logPanel = document.getElementById("log-panel");
const trendsPanel = document.getElementById("trends-panel");
const installAppButton = document.getElementById("install-app");
const customTargetButtons = document.querySelectorAll("[data-custom-target]");
const customMovementInput = document.getElementById("custom-movement-input");
const addCustomMovementButton = document.getElementById("add-custom-movement");
const customMovementMessage = document.getElementById("custom-movement-message");
const customMovementList = document.getElementById("custom-movement-list");

const panels = {
  add: addPanel,
  log: logPanel,
  trends: trendsPanel,
};

let deferredInstallPrompt = null;

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    (entry.mode === "time" || entry.mode === "reps") &&
    typeof entry.amount === "number" &&
    typeof entry.timestamp === "number" &&
    typeof entry.movement === "string" &&
    (entry.movementType === "stretches" || entry.movementType === "exercises")
  );
}

function loadCustomOptions() {
  const fallback = { stretches: [], exercises: [] };
  const raw = localStorage.getItem(CUSTOM_OPTIONS_STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;

    const stretches = Array.isArray(parsed.stretches)
      ? parsed.stretches.filter((item) => typeof item === "string" && item.trim())
      : [];
    const exercises = Array.isArray(parsed.exercises)
      ? parsed.exercises.filter((item) => typeof item === "string" && item.trim())
      : [];

    return { stretches, exercises };
  } catch {
    return fallback;
  }
}

function isValidTrendBenchmarkSnapshot(snapshot) {
  const metrics = snapshot?.metrics;

  return (
    snapshot &&
    typeof snapshot.dateKey === "string" &&
    typeof snapshot.baselineEndKey === "string" &&
    metrics &&
    Number.isFinite(metrics.time?.avg7) &&
    Number.isFinite(metrics.time?.avg30) &&
    Number.isFinite(metrics.reps?.avg7) &&
    Number.isFinite(metrics.reps?.avg30)
  );
}

function loadTrendBenchmarkSnapshot() {
  const raw = localStorage.getItem(TREND_BENCHMARK_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return isValidTrendBenchmarkSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function persistCustomOptions() {
  localStorage.setItem(CUSTOM_OPTIONS_STORAGE_KEY, JSON.stringify(state.customOptions));
}

function persistTrendBenchmarkSnapshot() {
  if (!state.trendBenchmarkSnapshot) return;
  localStorage.setItem(TREND_BENCHMARK_STORAGE_KEY, JSON.stringify(state.trendBenchmarkSnapshot));
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function startOfDay(dateValue) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseDateKey(dateKey));
}

function formatAmount(mode, amount) {
  if (mode === "reps") return `${amount} reps`;

  const minutes = Math.floor(amount / 60);
  const seconds = amount % 60;
  if (minutes === 0) return `${seconds} sec`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes}m ${seconds}s`;
}

function formatMinutes(seconds) {
  const minutes = seconds / 60;
  const rounded = minutes >= 10 ? Math.round(minutes) : Number(minutes.toFixed(1));
  return `${rounded} min`;
}

function formatAverageCount(value) {
  const rounded = value >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded}`;
}

function formatTrendValue(metric, value) {
  if (metric === "time") return formatMinutes(value);

  const count = formatAverageCount(value);
  return `${count} reps`;
}

function formatTrendChange(currentValue, baselineValue) {
  if (baselineValue === 0) {
    if (currentValue === 0) return "Flat";
    return "Up from zero";
  }

  const change = ((currentValue - baselineValue) / baselineValue) * 100;
  if (Math.abs(change) < 0.5) return "Flat";

  const direction = change > 0 ? "Up" : "Down";
  return `${direction} ${Math.abs(Math.round(change))}%`;
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

function getCurrentAmount() {
  return state.totals[state.mode];
}

function resetSelectionForMode(mode) {
  state.totals[mode] = 0;
}

function findMatchingDayEntry(referenceEntry, excludeId = null) {
  return findMatchingDayEntryInList(state.entries, referenceEntry, excludeId);
}

function queueAddedHighlight(id) {
  state.lastAddedEntryId = id;
  if (state.addedHighlightTimerId) clearTimeout(state.addedHighlightTimerId);

  state.addedHighlightTimerId = setTimeout(() => {
    state.lastAddedEntryId = null;
    state.addedHighlightTimerId = null;
    render();
  }, 900);
}

function updateMode(mode) {
  state.mode = mode;
  render();
}

function updateMovementType(type) {
  state.movementType = type;
  state.customTarget = type;
  const list = getMovementOptions(type);
  if (!list.includes(state.selectedMovement)) state.selectedMovement = null;
  render();
}

function addToTotal(value) {
  state.totals[state.mode] += value;
  render();
}

function clearCurrentTotal() {
  state.totals[state.mode] = 0;
  render();
}

function hasDraftSelection() {
  return (
    state.totals.time > 0 ||
    state.totals.reps > 0 ||
    Boolean(state.selectedMovement) ||
    Boolean(state.editingEntryId)
  );
}

function clearDraftSelection() {
  state.totals.time = 0;
  state.totals.reps = 0;
  state.selectedMovement = null;
  state.editingEntryId = null;
  render();
}

function saveWorkout() {
  const amount = getCurrentAmount();
  if (!state.selectedMovement || amount <= 0) return;

  if (state.editingEntryId) {
    const entry = state.entries.find((item) => item.id === state.editingEntryId);
    if (!entry) return;

    entry.movement = state.selectedMovement;
    entry.movementType = state.movementType;
    entry.mode = state.mode;
    entry.amount = amount;

    const mergeTarget = findMatchingDayEntry(entry, entry.id);
    if (mergeTarget) {
      mergeEntryAmounts(mergeTarget, entry);
      state.entries = state.entries.filter((item) => item.id !== entry.id);
    }

    state.editingEntryId = null;
  } else {
    const newEntry = {
      id: createId(),
      timestamp: Date.now(),
      movement: state.selectedMovement,
      movementType: state.movementType,
      mode: state.mode,
      amount,
    };

    const existing = findMatchingDayEntry(newEntry);
    if (existing) {
      mergeEntryAmounts(existing, newEntry);
      queueAddedHighlight(existing.id);
    } else {
      state.entries.push(newEntry);
      queueAddedHighlight(newEntry.id);
    }

    state.selectedMovement = null;
  }

  resetSelectionForMode(state.mode);
  persistEntries();
  render();
}

function getNewestEntry() {
  if (state.entries.length === 0) return null;
  return state.entries.reduce((newest, entry) =>
    entry.timestamp > newest.timestamp ? entry : newest
  );
}

function duplicateLastEntry() {
  const newest = getNewestEntry();
  if (!newest) return;

  const cloned = {
    ...newest,
    id: createId(),
    timestamp: Date.now(),
  };

  const existing = findMatchingDayEntry(cloned);
  if (existing) {
    mergeEntryAmounts(existing, cloned);
    queueAddedHighlight(existing.id);
  } else {
    state.entries.push(cloned);
    queueAddedHighlight(cloned.id);
  }

  state.mode = newest.mode;
  state.movementType = newest.movementType;
  state.selectedMovement = newest.movement;
  state.totals[newest.mode] = newest.amount;

  persistEntries();
  render();
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  state.editingEntryId = id;
  state.mode = entry.mode;
  state.movementType = entry.movementType;
  state.selectedMovement = entry.movement;
  state.totals[entry.mode] = entry.amount;
  state.mobileView = "add";
  render();
}

function cancelEdit() {
  state.editingEntryId = null;
  render();
}

function setUndoEntry(entry, index) {
  state.lastDeleted = { entry, index };

  if (state.undoTimerId) clearTimeout(state.undoTimerId);
  state.undoTimerId = setTimeout(() => {
    state.lastDeleted = null;
    state.undoTimerId = null;
    render();
  }, 10000);
}

function deleteEntry(id) {
  const index = state.entries.findIndex((entry) => entry.id === id);
  if (index < 0) return;

  const [removed] = state.entries.splice(index, 1);
  if (state.editingEntryId === id) state.editingEntryId = null;
  setUndoEntry(removed, index);
  persistEntries();
  render();
}

function undoDelete() {
  if (!state.lastDeleted) return;

  const { entry, index } = state.lastDeleted;
  const existing = findMatchingDayEntry(entry);
  if (existing) {
    mergeEntryAmounts(existing, entry);
  } else {
    const safeIndex = Math.max(0, Math.min(index, state.entries.length));
    state.entries.splice(safeIndex, 0, entry);
  }

  state.lastDeleted = null;
  if (state.undoTimerId) clearTimeout(state.undoTimerId);
  state.undoTimerId = null;
  persistEntries();
  render();
}

function quickAddSet(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  const cloned = {
    ...entry,
    id: createId(),
    timestamp: Date.now(),
  };

  const existing = findMatchingDayEntry(cloned);
  if (existing) {
    mergeEntryAmounts(existing, cloned);
    queueAddedHighlight(existing.id);
  } else {
    state.entries.push(cloned);
    queueAddedHighlight(cloned.id);
  }

  persistEntries();
  render();
}

function quickAddAmount(mode, value) {
  if (state.mode !== mode) state.mode = mode;
  state.totals[mode] += value;
  render();
}

function getEntriesWithinDays(days) {
  const threshold = startOfDay(Date.now()).getTime() - (days - 1) * MS_DAY;
  return state.entries.filter((entry) => entry.timestamp >= threshold);
}

function summarizeEntries(entries) {
  const totals = { timeSeconds: 0, reps: 0 };
  for (const entry of entries) {
    if (entry.mode === "time") totals.timeSeconds += entry.amount;
    if (entry.mode === "reps") totals.reps += entry.amount;
  }
  return totals;
}

function getRelativeDateKey(dayOffset) {
  return shiftDateKey(getDateKey(Date.now()), dayOffset);
}

function createTrendBenchmarkSnapshot() {
  const valuesByDay = buildDailyTotals(state.entries);
  const firstTrackedDateKey = getFirstTrackedDateKey(state.entries);
  const baselineEndKey = getRelativeDateKey(-1);

  return {
    dateKey: getRelativeDateKey(0),
    baselineEndKey,
    metrics: {
      time: {
        avg7: calculateAdjustedAverage({
          endDateKey: baselineEndKey,
          valuesByDay,
          metric: "time",
          windowDays: 7,
          firstTrackedDateKey,
        }),
        avg30: calculateAdjustedAverage({
          endDateKey: baselineEndKey,
          valuesByDay,
          metric: "time",
          windowDays: 30,
          firstTrackedDateKey,
        }),
      },
      reps: {
        avg7: calculateAdjustedAverage({
          endDateKey: baselineEndKey,
          valuesByDay,
          metric: "reps",
          windowDays: 7,
          firstTrackedDateKey,
        }),
        avg30: calculateAdjustedAverage({
          endDateKey: baselineEndKey,
          valuesByDay,
          metric: "reps",
          windowDays: 30,
          firstTrackedDateKey,
        }),
      },
    },
  };
}

function ensureTrendBenchmarkSnapshot() {
  const todayKey = getRelativeDateKey(0);
  if (state.trendBenchmarkSnapshot?.dateKey === todayKey) {
    return state.trendBenchmarkSnapshot;
  }

  state.trendBenchmarkSnapshot = createTrendBenchmarkSnapshot();
  persistTrendBenchmarkSnapshot();
  return state.trendBenchmarkSnapshot;
}

function buildTrendViewModel(metric) {
  const firstTrackedDateKey = getFirstTrackedDateKey(state.entries);
  if (!firstTrackedDateKey) {
    return {
      metric,
      firstTrackedDateKey: null,
      startDateKey: null,
      endDateKey: getRelativeDateKey(0),
      series7: [],
      series30: [],
    };
  }

  const todayKey = getRelativeDateKey(0);
  const hasTodayEntry = state.entries.some((entry) => getDateKey(entry.timestamp) === todayKey);
  const endDateKey = hasTodayEntry ? todayKey : getRelativeDateKey(-1);
  const minStartDateKey = getRelativeDateKey(-89);
  const startDateKey = firstTrackedDateKey > minStartDateKey ? firstTrackedDateKey : minStartDateKey;
  const valuesByDay = buildDailyTotals(state.entries);

  return {
    metric,
    firstTrackedDateKey,
    startDateKey,
    endDateKey,
    series7: buildRollingAverageSeries({
      startDateKey,
      endDateKey,
      valuesByDay,
      metric,
      windowDays: 7,
      firstTrackedDateKey,
    }),
    series30: buildRollingAverageSeries({
      startDateKey,
      endDateKey,
      valuesByDay,
      metric,
      windowDays: 30,
      firstTrackedDateKey,
    }),
  };
}

function getDailyCounts() {
  const counts = {};
  for (const entry of state.entries) {
    const key = getDateKey(entry.timestamp);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function getStreakStats() {
  const counts = getDailyCounts();
  const keys = Object.keys(counts).sort();

  let currentStreak = 0;
  const today = startOfDay(Date.now());
  for (let i = 0; ; i += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = getDateKey(day);
    if (counts[key]) currentStreak += 1;
    else break;
  }

  let longestStreak = 0;
  let running = 0;
  let previous = null;
  for (const key of keys) {
    const current = parseDateKey(key).getTime();
    if (previous !== null && current - previous === MS_DAY) running += 1;
    else running = 1;
    if (running > longestStreak) longestStreak = running;
    previous = current;
  }

  return {
    currentStreak,
    longestStreak,
    activeDays: keys.length,
  };
}

function groupedEntries(entries) {
  const groups = {};
  for (const entry of entries) {
    const key = getDateKey(entry.timestamp);
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function getMovementOptions(type) {
  const base = WORKOUT_OPTIONS[type] || [];
  const custom = state.customOptions[type] || [];
  const seen = new Set();
  const merged = [];

  for (const item of [...base, ...custom]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function setCustomMessage(message) {
  customMovementMessage.textContent = message || "";
}

function addCustomMovement() {
  const target = state.customTarget;
  const rawName = customMovementInput.value;
  const movementName = normalizeMovementName(rawName);
  if (!movementName) {
    setCustomMessage("Type a name first.");
    return;
  }

  const exists = getMovementOptions(target).some(
    (item) => item.toLowerCase() === movementName.toLowerCase()
  );
  if (exists) {
    setCustomMessage("That movement already exists.");
    return;
  }

  state.customOptions[target].push(movementName);
  persistCustomOptions();
  customMovementInput.value = "";
  setCustomMessage(`Added to ${target}.`);
  render();
}

function removeCustomMovement(type, movementName) {
  state.customOptions[type] = state.customOptions[type].filter((item) => item !== movementName);
  if (state.selectedMovement === movementName) state.selectedMovement = null;
  persistCustomOptions();
  setCustomMessage("Removed.");
  render();
}

function animateSwap(container) {
  container.classList.remove("swap-in");
  void container.offsetWidth;
  container.classList.add("swap-in");
}

function renderValueButtons() {
  valueGrid.innerHTML = "";
  for (const value of VALUE_OPTIONS[state.mode]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-btn";
    button.textContent = state.mode === "time" ? `${value} sec` : `${value} reps`;
    button.addEventListener("click", () => addToTotal(value));
    valueGrid.appendChild(button);
  }
  animateSwap(valueGrid);
}

function renderMovementButtons() {
  movementGrid.innerHTML = "";
  const list = getMovementOptions(state.movementType);

  for (const movement of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-btn movement-btn";
    if (state.selectedMovement === movement) button.classList.add("selected");
    button.textContent = movement;
    button.addEventListener("click", () => {
      state.selectedMovement = movement;
      render();
    });
    movementGrid.appendChild(button);
  }
  animateSwap(movementGrid);
}

function renderCustomManager() {
  for (const button of customTargetButtons) {
    button.classList.toggle("active", button.dataset.customTarget === state.customTarget);
  }

  customMovementList.innerHTML = "";
  const target = state.customTarget;
  const customList = state.customOptions[target] || [];

  if (customList.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = `No custom ${target} yet.`;
    customMovementList.appendChild(empty);
    return;
  }

  for (const movementName of customList) {
    const row = document.createElement("div");
    row.className = "manage-item";

    const name = document.createElement("p");
    name.textContent = movementName;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-btn danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeCustomMovement(target, movementName));

    row.append(name, remove);
    customMovementList.appendChild(row);
  }
}

function renderTabs() {
  for (const tab of modeTabs) {
    tab.classList.toggle("active", tab.dataset.modeTab === state.mode);
  }
  for (const tab of movementTabs) {
    tab.classList.toggle("active", tab.dataset.movementTab === state.movementType);
  }
}

function renderComposerState() {
  const amount = getCurrentAmount();
  selectedValueLabel.textContent =
    amount > 0 ? `Selected: ${formatAmount(state.mode, amount)}` : "No amount selected";

  const movementText = state.selectedMovement || "Select movement";
  const amountText = amount > 0 ? formatAmount(state.mode, amount) : "No amount";
  composerSummary.textContent = `${movementText} • ${amountText}`;

  saveWorkoutButton.disabled = amount <= 0 || !state.selectedMovement;
  saveWorkoutButton.textContent = state.editingEntryId ? "Save changes" : "Add workout";
  cancelEditButton.classList.toggle("hidden", !state.editingEntryId);
  duplicateLastButton.disabled = state.entries.length === 0;
  quickRepeatButton.disabled = state.entries.length === 0;
  clearStickyButton.disabled = !hasDraftSelection();
}

function renderUndoBar() {
  if (!state.lastDeleted) {
    undoBar.classList.add("hidden");
    undoText.textContent = "";
    return;
  }

  const deleted = state.lastDeleted.entry;
  undoText.textContent = `Deleted ${deleted.movement} (${formatAmount(
    deleted.mode,
    deleted.amount
  )})`;
  undoBar.classList.remove("hidden");
}

function renderDaySummary() {
  summaryGrid.innerHTML = "";

  const todayKey = getDateKey(Date.now());
  const todayEntries = state.entries.filter((entry) => getDateKey(entry.timestamp) === todayKey);
  const todayTotals = summarizeEntries(todayEntries);
  const streaks = getStreakStats();

  summaryDate.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
  }).format(new Date());
  summaryStreak.textContent = `${streaks.currentStreak}-day streak`;

  const cards = [
    { label: "Today min", value: formatMinutes(todayTotals.timeSeconds) },
    { label: "Today reps", value: `${todayTotals.reps}` },
    { label: "Sessions", value: `${todayEntries.length}` },
    { label: "Best streak", value: `${streaks.longestStreak} days` },
  ];

  for (const cardInfo of cards) {
    const card = document.createElement("article");
    card.className = "summary-card";

    const label = document.createElement("p");
    label.className = "summary-label";
    label.textContent = cardInfo.label;

    const value = document.createElement("p");
    value.className = "summary-value";
    value.textContent = cardInfo.value;

    card.append(label, value);
    summaryGrid.appendChild(card);
  }
}

function getTrendAxisLabelKeys(dayKeys) {
  if (dayKeys.length === 0) return [];

  const desiredLabels = Math.min(dayKeys.length, 4);
  const indices = new Set();

  for (let i = 0; i < desiredLabels; i += 1) {
    const ratio = desiredLabels === 1 ? 0 : i / (desiredLabels - 1);
    indices.add(Math.round(ratio * (dayKeys.length - 1)));
  }

  return [...indices]
    .sort((a, b) => a - b)
    .map((index) => dayKeys[index]);
}

function createSvgNode(tagName, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function getTrendCoordinates(series, width, height, padding, maxValue) {
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return series.map((point, index) => {
    const x =
      padding.left +
      (series.length === 1 ? innerWidth / 2 : (innerWidth * index) / (series.length - 1));
    const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight;
    return { x, y, value: point.value };
  });
}

function renderTrendComparisonCards(metric, series7, series30) {
  trendComparison.innerHTML = "";

  const comparisons = [
    { label: "7d average", series: series7 },
    { label: "30d average", series: series30 },
  ];

  for (const comparison of comparisons) {
    if (comparison.series.length === 0) continue;

    const currentPoint = comparison.series[comparison.series.length - 1];
    const baselineIndex = Math.max(0, comparison.series.length - 31);
    const baselinePoint = comparison.series[baselineIndex];
    const periodLabel = comparison.series.length > 30 ? "vs 30 days ago" : "since start";

    const card = document.createElement("article");
    card.className = "trend-callout";

    const label = document.createElement("p");
    label.className = "trend-callout-label";
    label.textContent = comparison.label;

    const value = document.createElement("p");
    value.className = "trend-callout-value";
    value.textContent = `${formatTrendChange(currentPoint.value, baselinePoint.value)} ${periodLabel}`;

    const meta = document.createElement("p");
    meta.className = "trend-callout-meta";
    meta.textContent = `${formatTrendValue(metric, currentPoint.value)} now • ${formatShortDate(
      baselinePoint.dateKey
    )} baseline ${formatTrendValue(metric, baselinePoint.value)}`;

    card.append(label, value, meta);
    trendComparison.appendChild(card);
  }
}

function renderTrendStats() {
  trendStats.innerHTML = "";
  const snapshot = ensureTrendBenchmarkSnapshot();
  const items = [
    { label: "7d min avg", value: formatTrendValue("time", snapshot.metrics.time.avg7) },
    { label: "30d min avg", value: formatTrendValue("time", snapshot.metrics.time.avg30) },
    { label: "7d reps avg", value: formatTrendValue("reps", snapshot.metrics.reps.avg7) },
    { label: "30d reps avg", value: formatTrendValue("reps", snapshot.metrics.reps.avg30) },
  ];

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "stat-card";

    const label = document.createElement("p");
    label.className = "stat-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "stat-value";
    value.textContent = item.value;

    card.append(label, value);
    trendStats.appendChild(card);
  }
}

function renderTrendChart() {
  trendChart.innerHTML = "";
  trendAxis.innerHTML = "";
  trendComparison.innerHTML = "";

  for (const button of trendMetricButtons) {
    button.classList.toggle("active", button.dataset.trendMetric === state.trendMetric);
  }

  const trendView = buildTrendViewModel(state.trendMetric);
  const dayKeys = trendView.series7.map((point) => point.dateKey);

  if (dayKeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Log a few workouts to see your rolling averages.";
    trendChart.appendChild(empty);
    trendAxis.style.gridTemplateColumns = "1fr";
    return;
  }

  const allValues = [...trendView.series7, ...trendView.series30].map((point) => point.value);
  const maxValue = Math.max(1, ...allValues);
  const width = Math.max(320, dayKeys.length * 12);
  const height = 196;
  const padding = { top: 14, right: 8, bottom: 14, left: 8 };
  const innerHeight = height - padding.top - padding.bottom;
  const svg = createSvgNode("svg", {
    class: "trend-svg",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${state.trendMetric === "time" ? "Minutes" : "Reps"} rolling average chart`,
  });

  for (const ratio of [0, 1 / 3, 2 / 3, 1]) {
    const y = padding.top + innerHeight * ratio;
    svg.appendChild(
      createSvgNode("line", {
        class: "trend-grid-line",
        x1: String(padding.left),
        y1: String(y),
        x2: String(width - padding.right),
        y2: String(y),
      })
    );
  }

  const lines = [
    { className: "line-7", series: trendView.series7 },
    { className: "line-30", series: trendView.series30 },
  ];

  for (const line of lines) {
    const coordinates = getTrendCoordinates(line.series, width, height, padding, maxValue);
    if (coordinates.length === 0) continue;

    if (coordinates.length > 1) {
      const path = coordinates
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

      svg.appendChild(
        createSvgNode("path", {
          class: `trend-line ${line.className}`,
          d: path,
        })
      );
    }

    const lastPoint = coordinates[coordinates.length - 1];
    svg.appendChild(
      createSvgNode("circle", {
        class: `trend-dot ${line.className}`,
        cx: String(lastPoint.x),
        cy: String(lastPoint.y),
        r: "3.5",
      })
    );
  }

  trendChart.appendChild(svg);

  const axisLabelKeys = getTrendAxisLabelKeys(dayKeys);
  trendAxis.style.gridTemplateColumns = `repeat(${Math.max(axisLabelKeys.length, 1)}, minmax(0, 1fr))`;
  for (const dateKey of axisLabelKeys) {
    const label = document.createElement("span");
    label.className = "trend-axis-label";
    label.textContent = formatShortDate(dateKey);
    trendAxis.appendChild(label);
  }

  renderTrendComparisonCards(state.trendMetric, trendView.series7, trendView.series30);
}

function renderMovementTrends() {
  movementTrends.innerHTML = "";
  const recent = getEntriesWithinDays(7);
  const movementTotals = {};

  for (const entry of recent) {
    if (!movementTotals[entry.movement]) {
      movementTotals[entry.movement] = { timeSeconds: 0, reps: 0, logs: 0 };
    }
    movementTotals[entry.movement].logs += 1;
    if (entry.mode === "time") movementTotals[entry.movement].timeSeconds += entry.amount;
    if (entry.mode === "reps") movementTotals[entry.movement].reps += entry.amount;
  }

  const rows = Object.entries(movementTotals).sort((a, b) => {
    const byLogs = b[1].logs - a[1].logs;
    if (byLogs !== 0) return byLogs;
    return b[1].timeSeconds - a[1].timeSeconds;
  });

  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No entries in the last 7 days yet.";
    movementTrends.appendChild(empty);
    return;
  }

  for (const [movement, totals] of rows) {
    const row = document.createElement("div");
    row.className = "trend-row";

    const name = document.createElement("p");
    name.className = "trend-row-title";
    name.textContent = movement;

    const amount = document.createElement("p");
    amount.className = "trend-row-meta";
    amount.textContent = `${Math.round(totals.timeSeconds / 60)} min | ${totals.reps} reps`;

    row.append(name, amount);
    movementTrends.appendChild(row);
  }
}

function renderStreaksAndHeatmap() {
  streakGrid.innerHTML = "";
  heatmap.innerHTML = "";

  const streaks = getStreakStats();
  const streakItems = [
    { label: "Current streak", value: `${streaks.currentStreak} days` },
    { label: "Longest streak", value: `${streaks.longestStreak} days` },
    { label: "Active days", value: `${streaks.activeDays}` },
  ];

  for (const item of streakItems) {
    const card = document.createElement("article");
    card.className = "streak-card";

    const label = document.createElement("p");
    label.className = "stat-label";
    label.textContent = item.label;

    const value = document.createElement("p");
    value.className = "stat-value";
    value.textContent = item.value;

    card.append(label, value);
    streakGrid.appendChild(card);
  }

  const counts = getDailyCounts();
  const today = startOfDay(Date.now());
  const first = new Date(today);
  first.setDate(today.getDate() - 55);

  const maxCount = Math.max(0, ...Object.values(counts));

  for (let i = 0; i < 56; i += 1) {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    const key = getDateKey(date);
    const count = counts[key] || 0;

    let level = 0;
    if (count > 0 && maxCount > 0) {
      const ratio = count / maxCount;
      if (ratio <= 0.25) level = 1;
      else if (ratio <= 0.5) level = 2;
      else if (ratio <= 0.75) level = 3;
      else level = 4;
    }

    const square = document.createElement("div");
    square.className = `heat-square heat-${level}`;
    square.title = `${formatDateKey(key)}: ${count} logged`;
    heatmap.appendChild(square);
  }
}

function setupSwipeRow(row, content, entryId) {
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let axisLock = "";
  let dragging = false;

  row.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      deltaX = 0;
      axisLock = "";
      dragging = true;
    },
    { passive: true }
  );

  row.addEventListener(
    "touchmove",
    (event) => {
      if (!dragging || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!axisLock) {
        axisLock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axisLock !== "x") return;

      event.preventDefault();
      deltaX = Math.max(-120, Math.min(120, dx));

      content.style.transform = `translateX(${deltaX}px)`;
      row.classList.toggle("swipe-right-active", deltaX > 30);
      row.classList.toggle("swipe-left-active", deltaX < -30);
    },
    { passive: false }
  );

  function reset() {
    content.style.transform = "";
    row.classList.remove("swipe-right-active", "swipe-left-active");
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;

    if (axisLock !== "x") {
      reset();
      return;
    }

    if (deltaX > 90) quickAddSet(entryId);
    else if (deltaX < -90) deleteEntry(entryId);

    reset();
  }

  row.addEventListener("touchend", onTouchEnd, { passive: true });
  row.addEventListener("touchcancel", onTouchEnd, { passive: true });
}

function renderLog() {
  logList.innerHTML = "";
  const sortedEntries = [...state.entries].sort((a, b) => b.timestamp - a.timestamp);
  const groups = groupedEntries(sortedEntries);

  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No workouts logged yet.";
    logList.appendChild(empty);
    return;
  }

  for (const [dateKey, entries] of groups) {
    const section = document.createElement("section");
    section.className = "log-day";

    const heading = document.createElement("h3");
    heading.textContent = formatDateKey(dateKey);
    section.appendChild(heading);

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "log-row";
      if (entry.id === state.lastAddedEntryId) row.classList.add("just-added");

      const swipeHintLeft = document.createElement("div");
      swipeHintLeft.className = "swipe-hint left";
      swipeHintLeft.textContent = "+1 set";

      const swipeHintRight = document.createElement("div");
      swipeHintRight.className = "swipe-hint right";
      swipeHintRight.textContent = "Delete";

      const content = document.createElement("div");
      content.className = "log-row-content";

      const text = document.createElement("div");
      text.className = "log-text";

      const title = document.createElement("p");
      title.className = "log-title";
      title.textContent = entry.movement;

      const meta = document.createElement("p");
      meta.className = "log-meta";
      meta.textContent = MOVEMENT_LABEL[entry.movementType];

      text.append(title, meta);

      const value = document.createElement("p");
      value.className = "log-amount";
      value.textContent = formatAmount(entry.mode, entry.amount);

      const controls = document.createElement("div");
      controls.className = "log-controls";

      const setBtn = document.createElement("button");
      setBtn.type = "button";
      setBtn.className = "small-btn";
      setBtn.textContent = "+1 set";
      setBtn.addEventListener("click", () => quickAddSet(entry.id));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "small-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => editEntry(entry.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "small-btn danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteEntry(entry.id));

      controls.append(setBtn, editBtn, deleteBtn);
      content.append(text, value, controls);

      row.append(swipeHintLeft, swipeHintRight, content);
      setupSwipeRow(row, content, entry.id);
      section.appendChild(row);
    }

    logList.appendChild(section);
  }
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function renderMobilePanels() {
  const mobile = isMobileLayout();

  if (!mobile) {
    appShell.classList.remove("mobile-layout");
    for (const panel of Object.values(panels)) {
      panel.classList.add("active-panel");
    }
    for (const button of panelButtons) {
      button.classList.toggle("active", button.dataset.mobileView === "add");
    }
    return;
  }

  appShell.classList.add("mobile-layout");
  for (const [view, panel] of Object.entries(panels)) {
    panel.classList.toggle("active-panel", state.mobileView === view);
  }
  for (const button of panelButtons) {
    button.classList.toggle("active", button.dataset.mobileView === state.mobileView);
  }
}

function render() {
  renderTabs();
  renderValueButtons();
  renderMovementButtons();
  renderCustomManager();
  renderComposerState();
  renderUndoBar();
  renderDaySummary();
  renderTrendStats();
  renderTrendChart();
  renderMovementTrends();
  renderStreaksAndHeatmap();
  renderLog();
  renderMobilePanels();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration errors in unsupported/private modes.
    });
  });
}

function setupInstallPrompt() {
  if (!installAppButton) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppButton.classList.remove("hidden");
  });

  installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installAppButton.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppButton.classList.add("hidden");
  });
}

function setupDoubleTapZoomGuard() {
  document.addEventListener(
    "dblclick",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("input, textarea, select")) return;

      event.preventDefault();
    },
    { passive: false }
  );
}

for (const tab of modeTabs) {
  tab.addEventListener("click", () => updateMode(tab.dataset.modeTab));
}

for (const tab of movementTabs) {
  tab.addEventListener("click", () => updateMovementType(tab.dataset.movementTab));
}

for (const button of trendMetricButtons) {
  button.addEventListener("click", () => {
    const metric = button.dataset.trendMetric;
    if (metric !== "time" && metric !== "reps") return;
    state.trendMetric = metric;
    renderTrendChart();
  });
}

for (const button of customTargetButtons) {
  button.addEventListener("click", () => {
    state.customTarget = button.dataset.customTarget;
    renderCustomManager();
  });
}

for (const button of panelButtons) {
  button.addEventListener("click", () => {
    state.mobileView = button.dataset.mobileView;
    renderMobilePanels();
  });
}

for (const button of quickAddButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.quickMode;
    const value = Number(button.dataset.quickValue);
    if (!mode || !Number.isFinite(value)) return;
    quickAddAmount(mode, value);
  });
}

clearValueButton.addEventListener("click", clearCurrentTotal);
clearStickyButton.addEventListener("click", clearDraftSelection);
saveWorkoutButton.addEventListener("click", saveWorkout);
duplicateLastButton.addEventListener("click", duplicateLastEntry);
quickRepeatButton.addEventListener("click", duplicateLastEntry);
cancelEditButton.addEventListener("click", cancelEdit);
undoDeleteButton.addEventListener("click", undoDelete);
addCustomMovementButton.addEventListener("click", addCustomMovement);
customMovementInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomMovement();
  }
});
window.addEventListener("resize", renderMobilePanels);

registerServiceWorker();
setupInstallPrompt();
setupDoubleTapZoomGuard();
render();
