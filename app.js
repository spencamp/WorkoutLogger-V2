import { WORKOUT_OPTIONS } from "./workout-options.js";

const STORAGE_KEY = "workout-log-v1";
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
  editingEntryId: null,
  filters: {
    search: "",
    movementType: "all",
    mode: "all",
    startDate: "",
    endDate: "",
  },
  lastDeleted: null,
  undoTimerId: null,
};

const modeTabs = document.querySelectorAll("[data-mode-tab]");
const movementTabs = document.querySelectorAll("[data-movement-tab]");
const valueGrid = document.getElementById("value-grid");
const movementGrid = document.getElementById("movement-grid");
const selectedValueLabel = document.getElementById("selected-value");
const clearValueButton = document.getElementById("clear-value");
const saveWorkoutButton = document.getElementById("save-workout");
const duplicateLastButton = document.getElementById("duplicate-last");
const cancelEditButton = document.getElementById("cancel-edit");
const undoBar = document.getElementById("undo-bar");
const undoText = document.getElementById("undo-text");
const undoDeleteButton = document.getElementById("undo-delete");
const trendStats = document.getElementById("trend-stats");
const trendChart = document.getElementById("trend-chart");
const movementTrends = document.getElementById("movement-trends");
const streakGrid = document.getElementById("streak-grid");
const heatmap = document.getElementById("heatmap");
const filterSearchInput = document.getElementById("filter-search");
const filterTypeButtons = document.querySelectorAll("[data-filter-type]");
const filterModeButtons = document.querySelectorAll("[data-filter-mode]");
const quickRangeButtons = document.querySelectorAll("[data-quick-range]");
const filterStartInput = document.getElementById("filter-start");
const filterEndInput = document.getElementById("filter-end");
const clearFiltersButton = document.getElementById("clear-filters");
const filterSummary = document.getElementById("filter-summary");
const logList = document.getElementById("log-list");

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

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
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

function updateMode(mode) {
  state.mode = mode;
  render();
}

function updateMovementType(type) {
  state.movementType = type;
  const list = WORKOUT_OPTIONS[type] || [];
  if (!list.includes(state.selectedMovement)) {
    state.selectedMovement = null;
  }
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

function getCurrentAmount() {
  return state.totals[state.mode];
}

function resetSelectionForMode(mode) {
  state.totals[mode] = 0;
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
    state.editingEntryId = null;
  } else {
    state.entries.push({
      id: createId(),
      timestamp: Date.now(),
      movement: state.selectedMovement,
      movementType: state.movementType,
      mode: state.mode,
      amount,
    });
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

  state.entries.push({
    ...newest,
    id: createId(),
    timestamp: Date.now(),
  });

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
  const safeIndex = Math.max(0, Math.min(index, state.entries.length));
  state.entries.splice(safeIndex, 0, entry);

  state.lastDeleted = null;
  if (state.undoTimerId) clearTimeout(state.undoTimerId);
  state.undoTimerId = null;
  persistEntries();
  render();
}

function quickAddSet(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;

  state.entries.push({
    ...entry,
    id: createId(),
    timestamp: Date.now(),
  });
  persistEntries();
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

function isFiltersActive() {
  const { search, movementType, mode, startDate, endDate } = state.filters;
  return Boolean(search || startDate || endDate || movementType !== "all" || mode !== "all");
}

function getFilteredEntries() {
  const { search, movementType, mode, startDate, endDate } = state.filters;
  const searchValue = search.toLowerCase().trim();

  return state.entries
    .filter((entry) => {
      if (searchValue && !entry.movement.toLowerCase().includes(searchValue)) return false;
      if (movementType !== "all" && entry.movementType !== movementType) return false;
      if (mode !== "all" && entry.mode !== mode) return false;

      const day = getDateKey(entry.timestamp);
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
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

function applyQuickRange(range) {
  if (range === "all") {
    state.filters.startDate = "";
    state.filters.endDate = "";
    render();
    return;
  }

  const days = Number(range);
  if (!Number.isFinite(days) || days < 1) return;

  const today = startOfDay(Date.now());
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  state.filters.startDate = getDateKey(start);
  state.filters.endDate = getDateKey(today);
  render();
}

function clearFilters() {
  state.filters.search = "";
  state.filters.movementType = "all";
  state.filters.mode = "all";
  state.filters.startDate = "";
  state.filters.endDate = "";
  render();
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
}

function renderMovementButtons() {
  movementGrid.innerHTML = "";
  const list = WORKOUT_OPTIONS[state.movementType] || [];

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

  saveWorkoutButton.disabled = amount <= 0 || !state.selectedMovement;
  saveWorkoutButton.textContent = state.editingEntryId ? "Save changes" : "Add workout";
  cancelEditButton.classList.toggle("hidden", !state.editingEntryId);
  duplicateLastButton.disabled = state.entries.length === 0;
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

function renderFilters() {
  filterSearchInput.value = state.filters.search;
  filterStartInput.value = state.filters.startDate;
  filterEndInput.value = state.filters.endDate;

  for (const button of filterTypeButtons) {
    button.classList.toggle("active", button.dataset.filterType === state.filters.movementType);
  }
  for (const button of filterModeButtons) {
    button.classList.toggle("active", button.dataset.filterMode === state.filters.mode);
  }

  const filteredCount = getFilteredEntries().length;
  if (isFiltersActive()) {
    filterSummary.textContent = `Showing ${filteredCount} of ${state.entries.length} entries`;
  } else {
    filterSummary.textContent = `${state.entries.length} total entries`;
  }
}

function renderLog() {
  logList.innerHTML = "";
  const filtered = getFilteredEntries();
  const groups = groupedEntries(filtered);

  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = isFiltersActive()
      ? "No workouts match your current filters."
      : "No workouts logged yet.";
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
      row.append(text, value, controls);
      section.appendChild(row);
    }

    logList.appendChild(section);
  }
}

function render() {
  renderTabs();
  renderValueButtons();
  renderMovementButtons();
  renderComposerState();
  renderUndoBar();
  renderTrendStats();
  renderTrendChart();
  renderMovementTrends();
  renderStreaksAndHeatmap();
  renderFilters();
  renderLog();
}

for (const tab of modeTabs) {
  tab.addEventListener("click", () => updateMode(tab.dataset.modeTab));
}

for (const tab of movementTabs) {
  tab.addEventListener("click", () => updateMovementType(tab.dataset.movementTab));
}

for (const button of filterTypeButtons) {
  button.addEventListener("click", () => {
    state.filters.movementType = button.dataset.filterType;
    render();
  });
}

for (const button of filterModeButtons) {
  button.addEventListener("click", () => {
    state.filters.mode = button.dataset.filterMode;
    render();
  });
}

for (const button of quickRangeButtons) {
  button.addEventListener("click", () => applyQuickRange(button.dataset.quickRange));
}

filterSearchInput.addEventListener("input", () => {
  state.filters.search = filterSearchInput.value;
  render();
});

filterStartInput.addEventListener("change", () => {
  state.filters.startDate = filterStartInput.value;
  render();
});

filterEndInput.addEventListener("change", () => {
  state.filters.endDate = filterEndInput.value;
  render();
});

clearValueButton.addEventListener("click", clearCurrentTotal);
saveWorkoutButton.addEventListener("click", saveWorkout);
duplicateLastButton.addEventListener("click", duplicateLastEntry);
cancelEditButton.addEventListener("click", cancelEdit);
undoDeleteButton.addEventListener("click", undoDelete);
clearFiltersButton.addEventListener("click", clearFilters);

render();
