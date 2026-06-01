/**
 * Matcher — person-centric dedup engine (shared by extension + web app).
 * Kept algorithmically identical to the matcher block in apps-script/Code.gs.
 * Mirror any change to both.
 *
 * A person may have several identifiers (email, phone, linkedin, reddit). Two
 * records are the SAME person if ANY identifier matches after normalization,
 * or (optionally) if name+company are fuzzy-equal.
 */
(function (root) {
  // Order matters only for which reason is reported first.
  var IDENTIFIER_FIELDS = ['email', 'phone', 'link'];

  function normalizeField(field, value, settings) {
    var raw = (value == null ? '' : String(value)).trim();
    if (!raw) return '';
    settings = settings || {};
    if (field === 'email') return normEmail(raw, settings);
    if (field === 'phone') return normPhone(raw, settings);
    if (field === 'link') return linkParts(raw).key;
    return stripUrl(raw);
  }

  function normEmail(raw, s) {
    raw = raw.replace(/^mailto:/i, '').replace(/\s+/g, '');
    var at = raw.indexOf('@');
    if (at === -1) return s.email_lowercase ? raw.toLowerCase() : raw;
    var local = raw.slice(0, at), domain = raw.slice(at + 1);
    if (s.email_lowercase !== false) { local = local.toLowerCase(); domain = domain.toLowerCase(); }
    if (s.email_strip_plus !== false) local = local.split('+')[0];
    if (s.email_ignore_dots) local = local.replace(/\./g, '');
    return local + '@' + domain;
  }

  function normPhone(raw, s) {
    var digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
    if (digits.length < 7) return '';                 // too short to trust
    if (s.phone_match_last10 !== false && digits.length > 10)
      digits = digits.slice(-10);                     // ignore country code
    return digits;
  }

  /**
   * Parse any profile link / handle (LinkedIn, X, Instagram, Reddit, GitHub,
   * Facebook, or a bare @handle) into a platform-prefixed dedupe key, a clean
   * canonical form for storage, and the platform name (used to auto-set source).
   * The platform prefix means two different platforms with the same handle do
   * NOT false-merge.
   */
  function linkParts(raw) {
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return { key: '', canonical: '', platform: '' };
    var low = s.toLowerCase(), m;
    function grab(re) { var x = low.match(re); return x ? x[1].replace(/^@/, '') : null; }
    if ((m = grab(/linkedin\.com\/in\/([^/?#\s]+)/))) return { platform: 'LinkedIn', key: 'li:' + m, canonical: 'https://www.linkedin.com/in/' + m + '/' };
    if ((m = grab(/(?:twitter|x)\.com\/([^/?#\s]+)/)) && ['home', 'search', 'i', 'explore'].indexOf(m) < 0) return { platform: 'Twitter/X', key: 'x:' + m, canonical: 'https://x.com/' + m };
    if ((m = grab(/instagram\.com\/([^/?#\s]+)/))) return { platform: 'Instagram', key: 'ig:' + m, canonical: 'https://instagram.com/' + m };
    if ((m = grab(/reddit\.com\/(?:user|u)\/([^/?#\s]+)/)) || (m = grab(/^(?:user|u)\/([^/?#\s]+)$/))) return { platform: 'Reddit', key: 'rd:' + m, canonical: 'https://reddit.com/user/' + m };
    if ((m = grab(/github\.com\/([^/?#\s]+)/))) return { platform: 'GitHub', key: 'gh:' + m, canonical: 'https://github.com/' + m };
    if ((m = grab(/(?:facebook|fb)\.com\/([^/?#\s]+)/))) return { platform: 'Facebook', key: 'fb:' + m, canonical: 'https://facebook.com/' + m };
    if (/^@?[a-z0-9._-]+$/i.test(s)) { var h = s.replace(/^@/, '').toLowerCase(); return { platform: '', key: 'h:' + h, canonical: '@' + h }; }
    return { platform: '', key: 'url:' + stripUrl(s), canonical: s };
  }

  function stripUrl(str) {
    return str.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
              .split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  }

  /** Map of field -> normalized value, for non-empty identifiers only. */
  function keys(person, settings) {
    var k = {};
    IDENTIFIER_FIELDS.forEach(function (f) {
      var n = normalizeField(f, person[f], settings);
      if (n) k[f] = n;
    });
    return k;
  }

  /** Does candidate refer to the same person as entry? */
  function matchPerson(candidate, entry, settings) {
    var ck = keys(candidate, settings), ek = keys(entry, settings);
    for (var i = 0; i < IDENTIFIER_FIELDS.length; i++) {
      var f = IDENTIFIER_FIELDS[i];
      if (ck[f] && ek[f] && ck[f] === ek[f]) return { hit: true, reason: f };
    }
    if (settings && settings.fuzzy_name_company &&
        candidate.name && candidate.company && entry.name && entry.company) {
      var t = Number(settings.fuzzy_threshold) || 0.85;
      if (similarity(candidate.name, entry.name) >= t &&
          similarity(candidate.company, entry.company) >= t)
        return { hit: true, reason: 'name+company' };
    }
    return { hit: false, reason: '' };
  }

  /**
   * Clean a value for STORAGE/display (distinct from match-normalization):
   * trims, removes spaces from phones, lowercases emails, canonicalizes
   * LinkedIn URLs — so common entry mistakes don't create messy rows.
   */
  function canonicalize(field, value) {
    var raw = (value == null ? '' : String(value)).replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (field === 'phone') {
      var plus = raw.charAt(0) === '+' ? '+' : '';
      return plus + raw.replace(/[^0-9]/g, '');
    }
    if (field === 'email') return raw.replace(/^mailto:/i, '').replace(/\s+/g, '').toLowerCase();
    if (field === 'link') return linkParts(raw).canonical;
    return raw; // name, company, source: trimmed + single-spaced
  }

  /** All existing people that are the same as candidate. */
  function findHits(candidate, contacts, settings) {
    var hits = [];
    (contacts || []).forEach(function (c) {
      var m = matchPerson(candidate, c, settings);
      if (m.hit) hits.push({ contact: c, reason: m.reason });
    });
    return { hits: hits, keys: keys(candidate, settings) };
  }

  function similarity(a, b) {
    a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase();
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  function levenshtein(a, b) {
    var m = a.length, n = b.length, prev = [], curr = [], i, k, z;
    for (var j = 0; j <= n; j++) prev[j] = j;
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

  root.Matcher = {
    IDENTIFIER_FIELDS: IDENTIFIER_FIELDS,
    normalizeField: normalizeField,
    canonicalize: canonicalize,
    linkParts: linkParts,
    matchPerson: matchPerson,
    findHits: findHits,
    keys: keys,
    similarity: similarity
  };
})(typeof self !== 'undefined' ? self : this);
