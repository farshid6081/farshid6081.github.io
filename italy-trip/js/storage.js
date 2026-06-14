// Local persistence for the Italy trip planner.
// Everything lives in localStorage on this device - export/import JSON to move or back it up.

const STORAGE_KEY = 'italyTripData_v1';

const DEFAULT_DATA = {
  trip: {
    name: 'Italy Trip',
    startDate: '',
    endDate: '',
    travelers: '',
    currency: 'EUR'
  },
  items: []
};

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    return {
      trip: { ...DEFAULT_DATA.trip, ...(parsed.trip || {}) },
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch (e) {
    console.error('Failed to load trip data', e);
    return clone(DEFAULT_DATA);
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = (data.trip.name || 'italy-trip').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.href = url;
  a.download = `${name || 'italy-trip'}-backup.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSONFile(file, callback) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error('File does not look like an Italy Trip backup.');
      }
      callback(null, {
        trip: { ...DEFAULT_DATA.trip, ...(parsed.trip || {}) },
        items: parsed.items
      });
    } catch (e) {
      callback(e);
    }
  };
  reader.onerror = () => callback(reader.error);
  reader.readAsText(file);
}
