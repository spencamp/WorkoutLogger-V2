import { WORKOUT_OPTIONS } from "./workout-options.js";

const STORAGE_KEY = "workout-log-v1";
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
};

const modeTabs = document.querySelectorAll("[data-mode-tab]");
const movementTabs = document.querySelectorAll("[data-movement-tab]");
const valueGrid = document.getElementById("value-grid");
const movementGrid = document.getElementById("movement-grid");
const selectedValueLabel = document.getElementById("selected-value");
const clearValueButton = document.getElementById("clear-value");
const saveWorkoutButton = document.getElementById("save-workout");
const cancelEditButton = document.getElementById("cancel-edit");
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

function updateMode(mode) {
  state.mode = mode;
  render();
}

function updateMovementType(type) {
  state.movementType = type;
  if (!WORKOUT_OPTIONS[type].includes(state.selectedMovement)) {
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

function formatAmount(mode, amount) {
  if (mode === "reps") return `${amount} reps`;

  const minutes = Math.floor(amount / 60);
  const seconds = amount % 60;
  if (minutes === 0) return `${seconds} sec`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes}m ${seconds}s`;
}

function getDateKey(timestamp) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function groupedEntries() {
  const sorted = [...state.entries].sort((a, b) => b.timestamp - a.timestamp);
  const groups = {};

  for (const entry of sorted) {
    const dateKey = getDateKey(entry.timestamp);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(entry);
  }

  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function resetSelectionForMode(mode) {
  state.totals[mode] = 0;
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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
    cancelEditButton.classList.add("hidden");
    saveWorkoutButton.textContent = "Add workout";
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

function deleteEntry(id) {
  state.entries = state.entries.filter((entry) => entry.id !== id);
  if (state.editingEntryId === id) cancelEdit();
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

  cancelEditButton.classList.remove("hidden");
  saveWorkoutButton.textContent = "Save changes";
  render();
}

function cancelEdit() {
  state.editingEntryId = null;
  cancelEditButton.classList.add("hidden");
  saveWorkoutButton.textContent = "Add workout";
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
  const list = WORKOUT_OPTIONS[state.movementType];

  for (const movement of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-btn movement-btn";
    if (state.selectedMovement === movement) {
      button.classList.add("selected");
    }
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

function renderSelectionSummary() {
  const amount = getCurrentAmount();
  if (amount > 0) {
    selectedValueLabel.textContent = `Selected: ${formatAmount(state.mode, amount)}`;
  } else {
    selectedValueLabel.textContent = "No amount selected";
  }

  saveWorkoutButton.disabled = amount <= 0 || !state.selectedMovement;
}

function renderLog() {
  logList.innerHTML = "";
  const groups = groupedEntries();

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

      controls.append(editBtn, deleteBtn);
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
  renderSelectionSummary();
  renderLog();
}

for (const tab of modeTabs) {
  tab.addEventListener("click", () => updateMode(tab.dataset.modeTab));
}

for (const tab of movementTabs) {
  tab.addEventListener("click", () => updateMovementType(tab.dataset.movementTab));
}

clearValueButton.addEventListener("click", clearCurrentTotal);
saveWorkoutButton.addEventListener("click", saveWorkout);
cancelEditButton.addEventListener("click", cancelEdit);

render();
