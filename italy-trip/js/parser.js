// Heuristic parser that turns pasted chat text into itinerary items.
// Expected shape (not strict): a "Day N - Month Day[, Year]" header line,
// followed by bullet lines ("- Hotel: ...", "* Dinner at ...", "1. Train to ...").

const MONTH_NAMES =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

// Order matters: first matching keyword wins.
const TYPE_KEYWORDS = [
  ['hotel', ['hotel', 'check-in', 'check in', 'checkout', 'check-out', 'b&b', 'bnb', 'hostel', 'airbnb', 'accommodation', 'resort', 'agriturismo']],
  ['transport', ['train', 'flight', 'fly', 'ferry', 'bus', 'transfer', 'taxi', 'uber', 'metro', 'rental car', 'airport', 'depart', 'drive to']],
  ['restaurant', ['breakfast', 'lunch', 'dinner', 'restaurant', 'trattoria', 'ristorante', 'café', 'cafe', 'pizzeria', 'osteria', 'gelato', 'aperitivo', 'wine bar']],
  ['activity', ['museum', 'tour', 'ticket', 'visit', 'gallery', 'hike', 'beach', 'show', 'opera', 'mass', 'climb', 'colosseum', 'vatican', 'uffizi', 'duomo', 'tower', 'palace', 'villa', 'park']]
];

function parseChatText(text, yearHint) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let currentDate = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const bulletMatch = line.match(/^(?:[-*•–]|\d+[.)])\s*/);
    if (!bulletMatch) {
      const date = extractDate(line, yearHint);
      if (date) currentDate = date;
      continue;
    }

    const content = line.slice(bulletMatch[0].length).trim();
    if (!content) continue;
    items.push(parseItemLine(content, currentDate));
  }

  return items;
}

function extractDate(text, yearHint) {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toISO(+m[1], +m[2], +m[3]);

  let re = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i');
  m = text.match(re);
  if (m) return toISO(m[3] ? +m[3] : yearHint, MONTHS[m[1].toLowerCase()], +m[2]);

  re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\.?(?:,?\\s*(\\d{4}))?\\b`, 'i');
  m = text.match(re);
  if (m) return toISO(m[3] ? +m[3] : yearHint, MONTHS[m[2].toLowerCase()], +m[1]);

  m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    let year = m[3] ? +m[3] : yearHint;
    if (year < 100) year += 2000;
    return toISO(year, +m[1], +m[2]);
  }

  return null;
}

function toISO(year, month, day) {
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseItemLine(content, currentDateISO) {
  let text = content;
  let startTime = '';
  let confirmation = '';
  let cost = '';

  // Time, e.g. "3pm", "8:30 PM"
  let m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let hour = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    startTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    text = text.replace(m[0], ' ');
  } else {
    m = text.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
    if (m) {
      startTime = `${m[1]}:${m[2]}`;
      text = text.replace(m[0], ' ');
    }
  }

  // Confirmation / booking reference / ticket number
  m = text.match(/\b(?:conf(?:irmation)?\.?|booking\s*ref(?:erence)?\.?|ref(?:erence)?\.?|pnr|reservation)\s*#?\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]{2,})/i);
  if (!m) m = text.match(/#\s*([A-Za-z0-9][A-Za-z0-9-]{2,})/);
  if (m) {
    confirmation = m[1];
    text = text.replace(m[0], ' ');
  }

  // Cost, e.g. "€60", "~$25", "30 EUR"
  m = text.match(/~?\s*[€$£]\s?(\d+(?:[.,]\d{1,2})?)/);
  if (!m) m = text.match(/(\d+(?:[.,]\d{1,2})?)\s?[€$£]/);
  if (m) {
    cost = m[1].replace(',', '.');
    text = text.replace(m[0], ' ');
  }

  const type = detectType(content);

  let title = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
  title = title.replace(/^[:;\-–]+\s*/, '').replace(/[:;\-–]+\s*$/, '').trim();
  if (!title) title = content.trim();

  return {
    type,
    title,
    date: currentDateISO || '',
    startTime,
    endTime: '',
    location: { name: title, address: '', lat: null, lng: null },
    notes: '',
    confirmation,
    cost,
    currency: '',
    url: '',
    done: false
  };
}

function detectType(line) {
  const lower = line.toLowerCase();
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return 'other';
}
