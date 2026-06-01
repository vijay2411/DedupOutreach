/**
 * Matcher — the tweakable dedup engine (Apps Script copy).
 *
 * This file is kept algorithmically identical to extension/matcher.js so the
 * web app and the browser extension dedup the exact same way. If you change the
 * logic here, mirror it there.
 *
 * Two pure functions:
 *   normalizeId(source, identifier, settings) -> canonical string
 *   matchEntry(candidate, entry, settings)     -> { hit, reason }
 */

function normalizeId(source, identifier, settings) {
  var raw = (identifier || '').trim();
  if (!raw) return '';
  source = (source || 'other').toLowerCase();

  if (source === 'email') {
    var at = raw.indexOf('@');
    if (at === -1) return settings.email_lowercase ? raw.toLowerCase() : raw;
    var local = raw.slice(0, at);
    var domain = raw.slice(at + 1);
    if (settings.email_lowercase) { local = local.toLowerCase(); domain = domain.toLowerCase(); }
    if (settings.email_strip_plus) { local = local.split('+')[0]; }
    if (settings.email_ignore_dots) { local = local.replace(/\./g, ''); }
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
    if (settings.reddit_strip_prefix) return handle.replace(/^@/, '').toLowerCase();
    return handle;
  }

  // other / generic
  return stripUrl(raw);
}

function stripUrl(s) {
  return s.replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split(/[?#]/)[0]
          .replace(/\/+$/, '')
          .toLowerCase();
}

/**
 * candidate / entry: { source, id_normalized, name, company }
 * Returns the first reason this candidate collides with an existing entry.
 */
function matchEntry(candidate, entry, settings) {
  if (candidate.id_normalized && entry.id_normalized &&
      candidate.id_normalized === entry.id_normalized) {
    return { hit: true, reason: 'identifier' };
  }
  if (settings.fuzzy_name_company &&
      candidate.name && candidate.company && entry.name && entry.company) {
    var nameSim = similarity(candidate.name, entry.name);
    var compSim = similarity(candidate.company, entry.company);
    var threshold = Number(settings.fuzzy_threshold) || 0.85;
    if (nameSim >= threshold && compSim >= threshold) {
      return { hit: true, reason: 'name+company' };
    }
  }
  return { hit: false, reason: '' };
}

/** Normalized Levenshtein similarity in [0,1]. */
function similarity(a, b) {
  a = (a || '').trim().toLowerCase();
  b = (b || '').trim().toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  var dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  var m = a.length, n = b.length;
  var prev = [], curr = [];
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    curr[0] = i;
    for (var k = 1; k <= n; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
    }
    for (var z = 0; z <= n; z++) prev[z] = curr[z];
  }
  return prev[n];
}
