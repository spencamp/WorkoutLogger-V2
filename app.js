import { WORKOUT_OPTIONS } from "./workout-options.js";

const STORAGE_KEY = "workout-log-v1";
const CUSTOM_OPTIONS_STORAGE_KEY = "workout-custom-options-v1";
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
const trendChart = document.getElementById("trend-chart");
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

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function persistCustomOptions() {
  localStorage.setItem(CUSTOM_OPTIONS_STORAGE_KEY, JSON.stringify(state.customOptions));
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

function getDateKey(dateValue) {
  const date = new Date(dateValue);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function dayLabel(dateKey) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parseDateKey(dateKey));
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

function getCurrentAmount() {
  return state.totals[state.mode];
}

function resetSelectionForMode(mode) {
  state.totals[mode] = 0;
}

function movementKey(name) {
  return normalizeMovementName(name).toLowerCase();
}

function findMatchingDayEntry(referenceEntry, excludeId = null) {
  const targetDate = getDateKey(referenceEntry.timestamp);
  const targetMovement = movementKey(referenceEntry.movement);

  return state.entries.find((entry) => {
    if (excludeId && entry.id === excludeId) return false;
    return (
      getDateKey(entry.timestamp) === targetDate &&
      entry.mode === referenceEntry.mode &&
      entry.movementType === referenceEntry.movementType &&
      movementKey(entry.movement) === targetMovement
    );
  });
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
      mergeTarget.amount += entry.amount;
      mergeTarget.timestamp = Math.max(mergeTarget.timestamp, entry.timestamp);
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
      existing.amount += newEntry.amount;
      existing.timestamp = newEntry.timestamp;
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
    existing.amount += cloned.amount;
    existing.timestamp = cloned.timestamp;
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
    existing.amount += entry.amount;
    existing.timestamp = Math.max(existing.timestamp, entry.timestamp);
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
    existing.amount += cloned.amount;
    existing.timestamp = cloned.timestamp;
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

function getLastNDaysKeys(days) {
  const today = startOfDay(Date.now());
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    keys.push(getDateKey(date));
  }
  return keys;
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

function normalizeMovementName(name) {
  return name.trim().replace(/\\s+/g, " ");
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
  clearStickyButton.disabled = amount <= 0 && !state.selectedMovement;
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

function renderTrendStats() {
  trendStats.innerHTML = "";
  const last7 = summarizeEntries(getEntriesWithinDays(7));
  const last30 = summarizeEntries(getEntriesWithinDays(30));

  const items = [
    { label: "7d minutes", value: formatMinutes(last7.timeSeconds) },
    { label: "7d reps", value: `${last7.reps}` },
    { label: "30d minutes", value: formatMinutes(last30.timeSeconds) },
    { label: "30d reps", value: `${last30.reps}` },
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
  const days = getLastNDaysKeys(7);
  const totalsByDay = {};

  for (const key of days) {
    totalsByDay[key] = { timeSeconds: 0, reps: 0 };
  }

  for (const entry of state.entries) {
    const key = getDateKey(entry.timestamp);
    if (!totalsByDay[key]) continue;
    if (entry.mode === "time") totalsByDay[key].timeSeconds += entry.amount;
    if (entry.mode === "reps") totalsByDay[key].reps += entry.amount;
  }

  const maxTime = Math.max(1, ...days.map((key) => totalsByDay[key].timeSeconds));
  const maxReps = Math.max(1, ...days.map((key) => totalsByDay[key].reps));

  for (const key of days) {
    const dayTotals = totalsByDay[key];
    const timeHeight = Math.round((dayTotals.timeSeconds / maxTime) * 72);
    const repsHeight = Math.round((dayTotals.reps / maxReps) * 72);

    const col = document.createElement("article");
    col.className = "day-col";

    const stack = document.createElement("div");
    stack.className = "bar-stack";

    const timeBar = document.createElement("div");
    timeBar.className = "trend-bar time";
    timeBar.style.height = `${dayTotals.timeSeconds > 0 ? Math.max(6, timeHeight) : 0}px`;

    const repsBar = document.createElement("div");
    repsBar.className = "trend-bar reps";
    repsBar.style.height = `${dayTotals.reps > 0 ? Math.max(6, repsHeight) : 0}px`;

    stack.append(timeBar, repsBar);

    const label = document.createElement("p");
    label.className = "day-label";
    label.textContent = dayLabel(key);

    const totals = document.createElement("p");
    totals.className = "day-totals";
    totals.textContent = `${Math.round(dayTotals.timeSeconds / 60)}m / ${dayTotals.reps}r`;

    col.append(stack, label, totals);
    trendChart.appendChild(col);
  }
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
  let lastTouchEnd = 0;

  document.addEventListener(
    "touchend",
    (event) => {
      if (event.touches.length > 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("input, textarea, select")) return;

      const now = Date.now();
      const delta = now - lastTouchEnd;
      if (delta > 0 && delta < 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
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
clearStickyButton.addEventListener("click", () => {
  state.selectedMovement = null;
  clearCurrentTotal();
});
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
