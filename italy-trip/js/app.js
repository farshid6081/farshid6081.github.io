// Main app controller: state, rendering, and event wiring.

const TYPE_ICONS = { hotel: '🏨', restaurant: '🍽️', activity: '🎟️', transport: '🚆', other: '📌' };
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

let data = loadData();
let currentView = 'itinerary';
let parsedItems = [];

// ---------- Date helpers ----------

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  return parseISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function getDateRange(start, end) {
  const dates = [];
  if (!start || !end) return dates;
  const last = parseISODate(end);
  const cur = parseISODate(start);
  while (cur <= last) {
    dates.push(isoFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function sortByTime(a, b) {
  if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
  if (a.startTime) return -1;
  if (b.startTime) return 1;
  return 0;
}

function formatCost(item) {
  const symbol = CURRENCY_SYMBOLS[item.currency || data.trip.currency] || '';
  return `${symbol}${item.cost}`;
}

function mapsUrl(item, provider) {
  const query = encodeURIComponent((item.location && (item.location.address || item.location.name)) || item.title);
  return provider === 'apple' ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// ---------- Itinerary rendering ----------

function renderItinerary() {
  const container = document.getElementById('itinerary-list');
  const emptyEl = document.getElementById('itinerary-empty');
  container.innerHTML = '';
  emptyEl.classList.toggle('hidden', data.items.length > 0);

  const byDate = {};
  const noDate = [];
  data.items.forEach((item) => {
    if (item.date) {
      (byDate[item.date] = byDate[item.date] || []).push(item);
    } else {
      noDate.push(item);
    }
  });

  const dates = getDateRange(data.trip.startDate, data.trip.endDate);
  Object.keys(byDate).forEach((d) => { if (!dates.includes(d)) dates.push(d); });
  dates.sort();

  dates.forEach((date) => {
    const items = (byDate[date] || []).slice().sort(sortByTime);
    container.appendChild(renderDayGroup(date, items));
  });

  if (noDate.length) {
    container.appendChild(renderDayGroup(null, noDate.slice().sort(sortByTime)));
  }
}

function renderDayGroup(date, items) {
  const group = document.createElement('div');
  group.className = 'day-group';

  const header = document.createElement('h2');
  header.className = 'day-header';
  if (date) {
    let label = formatDate(date);
    if (data.trip.startDate) {
      const dayNum = Math.round((parseISODate(date) - parseISODate(data.trip.startDate)) / 86400000) + 1;
      if (dayNum >= 1) label = `Day ${dayNum} · ${label}`;
    }
    header.textContent = label;
  } else {
    header.textContent = 'No date set';
  }
  group.appendChild(header);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Nothing planned yet.';
    group.appendChild(empty);
  } else {
    items.forEach((item) => group.appendChild(renderItemCard(item)));
  }

  return group;
}

function renderItemCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card' + (item.done ? ' done' : '');
  card.dataset.id = item.id;

  const icon = document.createElement('div');
  icon.className = 'item-icon';
  icon.textContent = TYPE_ICONS[item.type] || TYPE_ICONS.other;
  card.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'item-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'item-title-row';
  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  titleRow.appendChild(title);
  if (item.startTime || item.endTime) {
    const time = document.createElement('span');
    time.className = 'item-time';
    time.textContent = [item.startTime, item.endTime].filter(Boolean).join(' – ');
    titleRow.appendChild(time);
  }
  body.appendChild(titleRow);

  const metaParts = [];
  if (item.location && (item.location.address || item.location.name)) {
    const place = item.location.address || item.location.name;
    metaParts.push(`<a href="${mapsUrl(item, 'apple')}" target="_blank" rel="noopener">${escapeHtml(place)}</a>`);
  }
  if (item.cost) metaParts.push(escapeHtml(formatCost(item)));
  if (item.confirmation) metaParts.push(`Conf: ${escapeHtml(item.confirmation)}`);
  if (item.url) metaParts.push(`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Link</a>`);
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.innerHTML = metaParts.join(' &middot; ');
    body.appendChild(meta);
  }

  if (item.notes) {
    const notes = document.createElement('div');
    notes.className = 'item-notes';
    notes.textContent = item.notes;
    body.appendChild(notes);
  }

  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const done = document.createElement('input');
  done.type = 'checkbox';
  done.checked = !!item.done;
  done.title = 'Mark done';
  done.addEventListener('change', () => {
    item.done = done.checked;
    saveData(data);
    renderItinerary();
    if (currentView === 'map') renderMapView();
  });
  actions.appendChild(done);

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit';
  editBtn.addEventListener('click', () => openItemModal(item));
  actions.appendChild(editBtn);

  card.appendChild(actions);
  return card;
}

// ---------- Item modal ----------

const itemModal = document.getElementById('item-modal');
const itemForm = document.getElementById('item-form');

function openItemModal(item) {
  document.getElementById('modal-title').textContent = item ? 'Edit plan' : 'Add plan';
  document.getElementById('item-id').value = item ? item.id : '';
  document.getElementById('item-type').value = item ? item.type : 'activity';
  document.getElementById('item-title').value = item ? item.title : '';
  document.getElementById('item-date').value = item ? item.date : (data.trip.startDate || '');
  document.getElementById('item-start-time').value = item ? item.startTime : '';
  document.getElementById('item-end-time').value = item ? item.endTime : '';
  document.getElementById('item-location-name').value = item && item.location ? item.location.name : '';
  document.getElementById('item-address').value = item && item.location ? item.location.address : '';
  document.getElementById('item-confirmation').value = item ? item.confirmation : '';
  document.getElementById('item-cost').value = item && item.cost ? item.cost : '';
  document.getElementById('item-url').value = item ? item.url : '';
  document.getElementById('item-notes').value = item ? item.notes : '';
  document.getElementById('item-done').checked = item ? !!item.done : false;
  document.getElementById('delete-item-btn').classList.toggle('hidden', !item);
  itemModal.classList.remove('hidden');
}

function closeItemModal() {
  itemModal.classList.add('hidden');
}

document.getElementById('add-item-btn').addEventListener('click', () => openItemModal(null));
document.getElementById('modal-close').addEventListener('click', closeItemModal);
itemModal.addEventListener('click', (e) => { if (e.target === itemModal) closeItemModal(); });

itemForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = document.getElementById('item-title').value.trim();
  if (!title) { showToast('Please enter a title'); return; }

  const id = document.getElementById('item-id').value;
  const existing = id ? data.items.find((i) => i.id === id) : null;

  const newItem = {
    id: id || uid(),
    type: document.getElementById('item-type').value,
    title,
    date: document.getElementById('item-date').value,
    startTime: document.getElementById('item-start-time').value,
    endTime: document.getElementById('item-end-time').value,
    location: {
      name: document.getElementById('item-location-name').value.trim(),
      address: document.getElementById('item-address').value.trim(),
      lat: null,
      lng: null
    },
    confirmation: document.getElementById('item-confirmation').value.trim(),
    cost: document.getElementById('item-cost').value,
    currency: data.trip.currency,
    url: document.getElementById('item-url').value.trim(),
    notes: document.getElementById('item-notes').value.trim(),
    done: document.getElementById('item-done').checked
  };

  if (existing && geocodeQueryForItem(existing) === geocodeQueryForItem(newItem)) {
    newItem.location.lat = existing.location.lat;
    newItem.location.lng = existing.location.lng;
  }

  if (existing) {
    Object.assign(existing, newItem);
  } else {
    data.items.push(newItem);
  }

  saveData(data);
  closeItemModal();
  renderItinerary();
  if (currentView === 'map') renderMapView();

  const target = existing || newItem;
  if (target.location.lat == null && geocodeQueryForItem(target)) {
    geocodeItem(target);
  }
});

document.getElementById('delete-item-btn').addEventListener('click', () => {
  const id = document.getElementById('item-id').value;
  if (!id) return;
  if (!confirm('Delete this plan?')) return;
  data.items = data.items.filter((i) => i.id !== id);
  saveData(data);
  closeItemModal();
  renderItinerary();
  if (currentView === 'map') renderMapView();
});

async function geocodeItem(item) {
  try {
    const query = geocodeQueryForItem(item);
    const coords = await geocodeAddress(query);
    if (coords) {
      item.location.lat = coords.lat;
      item.location.lng = coords.lng;
      saveData(data);
      if (currentView === 'map') renderMapView();
    }
  } catch (e) {
    console.error('Geocode failed', e);
  }
}

// ---------- Tabs ----------

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'map') renderMapView();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ---------- Map ----------

function renderMapView() {
  initMap('map');
  invalidateMapSize();
  renderMarkers(data.items);
}

document.getElementById('geocode-all-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('geocode-status');
  const targets = data.items.filter((i) => geocodeQueryForItem(i) && i.location.lat == null);

  if (!targets.length) {
    statusEl.textContent = 'All set!';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    statusEl.textContent = `Locating ${i + 1} of ${targets.length}...`;
    try {
      const coords = await geocodeAddress(geocodeQueryForItem(targets[i]));
      if (coords) {
        targets[i].location.lat = coords.lat;
        targets[i].location.lng = coords.lng;
      }
    } catch (e) {
      console.error(e);
    }
    saveData(data);
    renderMarkers(data.items);
    if (i < targets.length - 1) await sleep(1100); // be polite to the free geocoding service
  }

  statusEl.textContent = 'Done!';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Import from chat ----------

document.getElementById('parse-btn').addEventListener('click', () => {
  const text = document.getElementById('import-text').value;
  const yearHint = data.trip.startDate ? parseISODate(data.trip.startDate).getFullYear() : new Date().getFullYear();
  parsedItems = parseChatText(text, yearHint);
  renderImportPreview();
  if (!parsedItems.length) showToast('No plans detected - check the format hints above');
});

document.getElementById('clear-import-btn').addEventListener('click', () => {
  document.getElementById('import-text').value = '';
  parsedItems = [];
  renderImportPreview();
});

function renderImportPreview() {
  const preview = document.getElementById('import-preview');
  const list = document.getElementById('import-preview-list');
  const count = document.getElementById('import-count');
  list.innerHTML = '';

  if (!parsedItems.length) {
    preview.classList.add('hidden');
    return;
  }

  preview.classList.remove('hidden');
  count.textContent = `(${parsedItems.length})`;

  parsedItems.forEach((item, idx) => {
    const row = document.createElement('label');
    row.className = 'import-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.idx = String(idx);
    row.appendChild(checkbox);

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'import-item-title';
    title.textContent = `${TYPE_ICONS[item.type] || ''} ${item.title}`;
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'import-item-meta';
    const metaParts = [];
    if (item.date) metaParts.push(formatDate(item.date));
    if (item.startTime) metaParts.push(item.startTime);
    if (item.cost) metaParts.push(formatCost(item));
    if (item.confirmation) metaParts.push(`Conf: ${item.confirmation}`);
    meta.textContent = metaParts.join(' · ') || 'No date detected';
    info.appendChild(meta);

    row.appendChild(info);
    list.appendChild(row);
  });
}

document.getElementById('add-imported-btn').addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('#import-preview-list input[type="checkbox"]');
  let added = 0;
  checkboxes.forEach((cb) => {
    if (!cb.checked) return;
    const item = parsedItems[Number(cb.dataset.idx)];
    item.id = uid();
    item.currency = data.trip.currency;
    data.items.push(item);
    added++;
    if (geocodeQueryForItem(item)) geocodeItem(item);
  });

  saveData(data);
  parsedItems = [];
  document.getElementById('import-text').value = '';
  renderImportPreview();
  renderItinerary();
  showToast(`Added ${added} item${added === 1 ? '' : 's'} to your itinerary`);
  switchView('itinerary');
});

// ---------- Trip info / settings ----------

function renderTripInfo() {
  document.getElementById('trip-name').value = data.trip.name;
  document.getElementById('trip-start').value = data.trip.startDate;
  document.getElementById('trip-end').value = data.trip.endDate;
  document.getElementById('trip-travelers').value = data.trip.travelers;
  document.getElementById('trip-currency').value = data.trip.currency;
  updateHeader();
}

function updateHeader() {
  document.getElementById('trip-title').textContent = data.trip.name || 'Italy Trip';
  const datesEl = document.getElementById('trip-dates');
  datesEl.textContent = (data.trip.startDate && data.trip.endDate)
    ? `${formatDate(data.trip.startDate)} – ${formatDate(data.trip.endDate)}`
    : '';
}

document.getElementById('trip-form').addEventListener('submit', (e) => e.preventDefault());

['trip-name', 'trip-start', 'trip-end', 'trip-travelers', 'trip-currency'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => {
    data.trip.name = document.getElementById('trip-name').value.trim() || 'Italy Trip';
    data.trip.startDate = document.getElementById('trip-start').value;
    data.trip.endDate = document.getElementById('trip-end').value;
    data.trip.travelers = document.getElementById('trip-travelers').value.trim();
    data.trip.currency = document.getElementById('trip-currency').value;
    saveData(data);
    updateHeader();
    renderItinerary();
  });
});

// ---------- Share / backup ----------

document.getElementById('export-btn').addEventListener('click', () => exportJSON(data));

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  importJSONFile(file, (err, imported) => {
    if (err) {
      showToast('Could not read that file');
      return;
    }
    if (!confirm('This will replace your current itinerary with the imported backup. Continue?')) return;
    data = imported;
    saveData(data);
    renderAll();
    showToast('Backup imported');
  });
  e.target.value = '';
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (!confirm('This will permanently delete all trip data on this device. Continue?')) return;
  data = clone(DEFAULT_DATA);
  saveData(data);
  renderAll();
  showToast('All data cleared');
});

document.getElementById('share-btn').addEventListener('click', async () => {
  const text = buildShareText();
  if (navigator.share) {
    try {
      await navigator.share({ title: data.trip.name || 'Italy Trip', text });
    } catch (e) {
      // user cancelled the share sheet - nothing to do
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    showToast('Itinerary copied to clipboard');
  } else {
    showToast('Sharing is not supported on this browser');
  }
});

function buildShareText() {
  const lines = [];
  lines.push(data.trip.name || 'Italy Trip');
  if (data.trip.startDate && data.trip.endDate) {
    lines.push(`${formatDate(data.trip.startDate)} – ${formatDate(data.trip.endDate)}`);
  }
  lines.push('');

  const byDate = {};
  const noDate = [];
  data.items.forEach((item) => {
    if (item.date) (byDate[item.date] = byDate[item.date] || []).push(item);
    else noDate.push(item);
  });

  const dates = getDateRange(data.trip.startDate, data.trip.endDate);
  Object.keys(byDate).forEach((d) => { if (!dates.includes(d)) dates.push(d); });
  dates.sort();

  dates.forEach((date) => {
    const items = (byDate[date] || []).slice().sort(sortByTime);
    if (!items.length) return;
    lines.push(formatDate(date));
    items.forEach((item) => {
      const parts = [`${TYPE_ICONS[item.type] || ''} ${item.title}`];
      if (item.startTime) parts.push(`@ ${item.startTime}`);
      if (item.location && item.location.address) parts.push(`(${item.location.address})`);
      if (item.cost) parts.push(formatCost(item));
      if (item.confirmation) parts.push(`Conf: ${item.confirmation}`);
      lines.push(`  - ${parts.join(' ')}`);
    });
    lines.push('');
  });

  if (noDate.length) {
    lines.push('Unscheduled:');
    noDate.forEach((item) => lines.push(`  - ${TYPE_ICONS[item.type] || ''} ${item.title}`));
  }

  return lines.join('\n').trim();
}

// ---------- Toast ----------

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ---------- Init ----------

function renderAll() {
  renderTripInfo();
  renderItinerary();
  if (currentView === 'map') renderMapView();
}

renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
