/**
 * Matcher — canonical dedup engine (shared by extension + web app).
 * Kept algorithmically identical to apps-script/Matcher.gs. Mirror any change.
 * Exposed as globalThis.Matcher for both content scripts and the service worker.
 */
(function (root) {
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

  /** Find all prior approaches that collide with a candidate. */
  function findHits(candidate, contacts, settings) {
    var cand = {
      source: candidate.source,
      id_normalized: normalizeId(candidate.source, candidate.identifier, settings),
      name: candidate.name || '',
      company: candidate.company || ''
    };
    var hits = [];
    (contacts || []).forEach(function (c) {
      if (matchEntry(cand, c, settings).hit) hits.push(c);
    });
    return { candidate: cand, hits: hits };
  }

  root.Matcher = { normalizeId: normalizeId, matchEntry: matchEntry,
                   similarity: similarity, findHits: findHits };
})(typeof self !== 'undefined' ? self : this);
