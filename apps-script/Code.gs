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
// Set a long random string. The same value goes in the extension settings.
var API_KEY = 'CHANGE_ME_to_a_long_random_team_secret';

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
  return key && key === API_KEY;
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

/** Run once from the editor to create tabs + headers. */
function setup() {
  sheet(CONTACTS_SHEET, CONTACT_HEADERS);
  var s = sheet(SETTINGS_SHEET);
  if (s.getLastRow() < 1) seedSettings(s);
  return 'ready';
}
