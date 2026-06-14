// Leaflet map rendering + free geocoding (OpenStreetMap Nominatim) with local caching.

const TYPE_COLORS = {
  hotel: '#1B3A6B',
  restaurant: '#CD212A',
  activity: '#008C45',
  transport: '#E08E00',
  other: '#777777'
};

const GEOCODE_CACHE_KEY = 'italyTripGeocodeCache_v1';

let map = null;
let markersLayer = null;

function initMap(containerId) {
  if (map) return map;
  if (typeof L === 'undefined') {
    const el = document.getElementById(containerId);
    if (el) {
      el.innerHTML = '<div class="map-unavailable">Map could not load (no internet connection). '
        + 'Your plans are still saved - locations are shown as links you can open in Maps.</div>';
    }
    return null;
  }
  map = L.map(containerId, { zoomControl: true }).setView([42.8, 12.5], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  // Map starts hidden inside a tab; make sure Leaflet recalculates its size once shown.
  setTimeout(() => map.invalidateSize(), 0);
  return map;
}

function invalidateMapSize() {
  if (map) map.invalidateSize();
}

function renderMarkers(items) {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();
  const bounds = [];

  items
    .filter((item) => item.location && isFinite(item.location.lat) && isFinite(item.location.lng))
    .forEach((item) => {
      const color = TYPE_COLORS[item.type] || TYPE_COLORS.other;
      const marker = L.circleMarker([item.location.lat, item.location.lng], {
        radius: 9,
        weight: 2,
        color: '#fff',
        fillColor: color,
        fillOpacity: 1
      });
      marker.bindPopup(popupHtml(item));
      marker.addTo(markersLayer);
      bounds.push([item.location.lat, item.location.lng]);
    });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  } else {
    map.setView([42.8, 12.5], 6);
  }
}

function popupHtml(item) {
  const query = encodeURIComponent(item.location.address || item.location.name || item.title);
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const appleUrl = `https://maps.apple.com/?q=${query}`;
  const when = [item.date, item.startTime].filter(Boolean).join(' ');
  return `
    <strong>${escapeHtml(item.title)}</strong><br>
    ${escapeHtml(when)}<br>
    <a href="${googleUrl}" target="_blank" rel="noopener">Google Maps</a> &middot;
    <a href="${appleUrl}" target="_blank" rel="noopener">Apple Maps</a>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function getGeocodeCache() {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function setGeocodeCache(cache) {
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

// Looks up an address via Nominatim. Results are cached in localStorage so we
// don't re-query the same address, in line with Nominatim's usage policy.
async function geocodeAddress(query) {
  if (!query) return null;
  const cache = getGeocodeCache();
  if (cache[query]) return cache[query];

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const results = await resp.json();
  if (!results.length) {
    cache[query] = null;
    setGeocodeCache(cache);
    return null;
  }

  const coords = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  cache[query] = coords;
  setGeocodeCache(cache);
  return coords;
}

function geocodeQueryForItem(item) {
  const place = item.location && (item.location.address || item.location.name);
  if (!place) return null;
  return /italy|italia/i.test(place) ? place : `${place}, Italy`;
}
