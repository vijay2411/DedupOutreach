/**
 * DedupManager — Apps Script backend + web app host.
 *
 * Deploy: Extensions > Apps Script (from your Google Sheet), paste these files,
 * then Deploy > New deployment > Web app, "Execute as: Me",
 * "Who has access: Anyone". Copy the /exec URL into the extension + web UI.
 *
 * Security: every request must carry the shared API key (see API_KEY below).
 */

// ── Config ────────────────────────────────────────────────────────────────
// The team secret lives in Config.gs as `var TEAM_API_KEY = '...'`.
//   • deploy.sh generates Config.gs automatically.
//   • Manual install: copy Config.example.gs → Config.gs and set the key.
function getApiKey() {
  return (typeof TEAM_API_KEY !== 'undefined' && TEAM_API_KEY)
    ? TEAM_API_KEY : 'CHANGE_ME_set_in_Config_gs';
}

// Leave blank to use the Sheet this script is bound to (recommended).
var SHEET_ID = '';

var CONTACTS_SHEET = 'Contacts';
var SETTINGS_SHEET = 'Settings';

var CONTACT_HEADERS = [
  'id', 'added_by', 'added_at', 'source', 'identifier',
  'id_normalized', 'name', 'company', 'status', 'notes'
];

var DEFAULT_SETTINGS = {
  email_lowercase: true,
  email_strip_plus: true,
  email_ignore_dots: false,
  linkedin_slug_only: true,
  reddit_strip_prefix: true,
  fuzzy_name_company: false,
  fuzzy_threshold: 0.85,
  match_logic: 'any'
};

// ── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'app';
  if (action === 'app') return serveApp();

  if (!authed(e)) return json({ ok: false, error: 'unauthorized' });
  if (action === 'log') return json({ ok: true, contacts: readContacts() });
  if (action === 'settings') return json({ ok: true, settings: readSettings() });
  if (action === 'bootstrap')
    return json({ ok: true, contacts: readContacts(), settings: readSettings() });
  return json({ ok: false, error: 'unknown action: ' + action });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (!authed({ parameter: body })) return json({ ok: false, error: 'unauthorized' });

  var action = body.action;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (action === 'add') return json(addContact(body));
    if (action === 'update') return json(updateContact(body));
    if (action === 'settings') return json(writeSettings(body.settings || {}));
    return json({ ok: false, error: 'unknown action: ' + action });
  } finally {
    lock.releaseLock();
  }
}

function authed(e) {
  var key = e && e.parameter && e.parameter.apiKey;
  return key && key === getApiKey();
}

// ── Data access ─────────────────────────────────────────────────────────────

function book() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
}

function sheet(name, headers) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) sh.appendRow(headers);
  }
  return sh;
}

function readContacts() {
  var sh = sheet(CONTACTS_SHEET, CONTACT_HEADERS);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    if (obj.added_at instanceof Date) obj.added_at = obj.added_at.toISOString();
    return obj;
  });
}

function readSettings() {
  var sh = sheet(SETTINGS_SHEET);
  if (sh.getLastRow() < 1) seedSettings(sh);
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
  values.forEach(function (row) {
    if (row[0] === 'key' && row[1] === 'value') return; // header
    if (row[0]) out[row[0]] = coerce(row[1]);
  });
  return out;
}

function coerce(v) {
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  if (v !== '' && !isNaN(v)) return Number(v);
  return v;
}

function seedSettings(sh) {
  sh.appendRow(['key', 'value']);
  for (var k in DEFAULT_SETTINGS) sh.appendRow([k, DEFAULT_SETTINGS[k]]);
}

function addContact(body) {
  var settings = readSettings();
  var source = body.source || 'other';
  var id = Utilities.getUuid().slice(0, 8);
  var idNorm = normalizeId(source, body.identifier, settings);
  var row = [
    id,
    body.added_by || 'unknown',
    new Date().toISOString(),
    source,
    body.identifier || '',
    idNorm,
    body.name || '',
    body.company || '',
    body.status || 'sent',
    body.notes || ''
  ];
  sheet(CONTACTS_SHEET, CONTACT_HEADERS).appendRow(row);
  return { ok: true, id: id, id_normalized: idNorm };
}

function updateContact(body) {
  var sh = sheet(CONTACTS_SHEET, CONTACT_HEADERS);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(body.id)) {
      if (body.status !== undefined)
        sh.getRange(i + 1, headers.indexOf('status') + 1).setValue(body.status);
      if (body.notes !== undefined)
        sh.getRange(i + 1, headers.indexOf('notes') + 1).setValue(body.notes);
      return { ok: true, id: body.id };
    }
  }
  return { ok: false, error: 'id not found: ' + body.id };
}

function writeSettings(patch) {
  var sh = sheet(SETTINGS_SHEET);
  if (sh.getLastRow() < 1) seedSettings(sh);
  var values = sh.getDataRange().getValues();
  var rowFor = {};
  values.forEach(function (row, i) { if (row[0]) rowFor[row[0]] = i + 1; });
  for (var key in patch) {
    if (rowFor[key]) sh.getRange(rowFor[key], 2).setValue(patch[key]);
    else sh.appendRow([key, patch[key]]);
  }
  return { ok: true, settings: readSettings() };
}

// ── Web app host ────────────────────────────────────────────────────────────

function serveApp() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('DedupManager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Server-side calls used by the web UI (google.script.run) ────────────────
// These skip the API key (already inside an authenticated Google session).

function apiBootstrap() { return { contacts: readContacts(), settings: readSettings() }; }
function apiAdd(body)   { return addContact(body); }
function apiUpdate(body){ return updateContact(body); }
function apiSettings(s) { return writeSettings(s); }

/** Dedup check used by the web UI: returns prior approaches that collide. */
function apiCheck(candidate) {
  var settings = readSettings();
  var cand = {
    source: candidate.source || 'other',
    id_normalized: normalizeId(candidate.source, candidate.identifier, settings),
    name: candidate.name || '',
    company: candidate.company || ''
  };
  var hits = [];
  readContacts().forEach(function (c) {
    var m = matchEntry(cand, c, settings);
    if (m.hit) hits.push({ contact: c, reason: m.reason });
  });
  return { ok: true, candidate: cand, hits: hits };
}

/** Free-text search across the log. */
function apiSearch(query) {
  var q = (query || '').trim().toLowerCase();
  var rows = readContacts();
  if (!q) return { ok: true, contacts: rows.slice(-200).reverse() };
  var hits = rows.filter(function (c) {
    return [c.identifier, c.id_normalized, c.name, c.company, c.added_by, c.source]
      .some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
  });
  return { ok: true, contacts: hits.reverse() };
}

function apiStats() {
  var rows = readContacts();
  var byPerson = {}, bySource = {}, byWeek = {}, normCount = {};
  rows.forEach(function (c) {
    byPerson[c.added_by] = (byPerson[c.added_by] || 0) + 1;
    bySource[c.source] = (bySource[c.source] || 0) + 1;
    var wk = isoWeek(c.added_at);
    byWeek[wk] = (byWeek[wk] || 0) + 1;
    if (c.id_normalized) normCount[c.id_normalized] = (normCount[c.id_normalized] || 0) + 1;
  });
  var collisions = 0;
  for (var k in normCount) if (normCount[k] > 1) collisions += normCount[k] - 1;
  return { ok: true, total: rows.length, byPerson: byPerson, bySource: bySource,
           byWeek: byWeek, collisions: collisions };
}

function isoWeek(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return 'unknown';
  var onejan = new Date(d.getFullYear(), 0, 1);
  var wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + (wk < 10 ? '0' + wk : wk);
}

/** Run once from the editor to create tabs + headers (optional — also lazy-created). */
function setup() {
  sheet(CONTACTS_SHEET, CONTACT_HEADERS);
  var s = sheet(SETTINGS_SHEET);
  if (s.getLastRow() < 1) seedSettings(s);
  return 'ready';
}

// ── Matching engine ─────────────────────────────────────────────────────────
// Kept algorithmically identical to extension/matcher.js so the web app and the
// browser extension dedup the exact same way. Mirror any change to both.

function normalizeId(source, identifier, settings) {
  var raw = (identifier || '').trim();
  if (!raw) return '';
  source = (source || 'other').toLowerCase();

  if (source === 'email') {
    var at = raw.indexOf('@');
    if (at === -1) return settings.email_lowercase ? raw.toLowerCase() : raw;
    var local = raw.slice(0, at), domain = raw.slice(at + 1);
    if (settings.email_lowercase) { local = local.toLowerCase(); domain = domain.toLowerCase(); }
    if (settings.email_strip_plus) local = local.split('+')[0];
    if (settings.email_ignore_dots) local = local.replace(/\./g, '');
    return local + '@' + domain;
  }
  if (source === 'linkedin') {
    var m = raw.match(/\/in\/([^/?#]+)/i);
    if (m && settings.linkedin_slug_only) return 'in/' + m[1].toLowerCase();
    return stripUrl(raw);
  }
  if (source === 'reddit') {
    var r = raw.match(/(?:u\/|user\/)([^/?#\s]+)/i);
    var handle = r ? r[1] : raw.replace(/^\/?(u\/|user\/)/i, '');
    return settings.reddit_strip_prefix ? handle.replace(/^@/, '').toLowerCase() : handle;
  }
  return stripUrl(raw);
}

function stripUrl(s) {
  return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
          .split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
}

function matchEntry(candidate, entry, settings) {
  if (candidate.id_normalized && entry.id_normalized &&
      candidate.id_normalized === entry.id_normalized)
    return { hit: true, reason: 'identifier' };
  if (settings.fuzzy_name_company &&
      candidate.name && candidate.company && entry.name && entry.company) {
    var t = Number(settings.fuzzy_threshold) || 0.85;
    if (similarity(candidate.name, entry.name) >= t &&
        similarity(candidate.company, entry.company) >= t)
      return { hit: true, reason: 'name+company' };
  }
  return { hit: false, reason: '' };
}

function similarity(a, b) {
  a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  var m = a.length, n = b.length, prev = [], curr = [], i, j, k, z;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    curr[0] = i;
    for (k = 1; k <= n; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
    }
    for (z = 0; z <= n; z++) prev[z] = curr[z];
  }
  return prev[n];
}
