/**
 * Content script. When Active mode is ON, an editable bar is ALWAYS shown on
 * LinkedIn / Reddit / Gmail (bottom-right). It auto-detects the person + checks
 * the CRM when it can; when it can't (or detection is wrong), you just fill /
 * fix the fields and save. Manual logging anywhere is also in the popup.
 *
 * All DOM is built with createElement/textContent — scraped values can't inject.
 */
(function () {
  var STATE = { contacts: [], settings: {}, me: '', active: true, stages: ['New'], sources: [] };
  var lastKey = null, dismissed = false;

  chrome.storage.local.get(['contacts', 'settings', 'me', 'activeMode'], function (s) {
    apply(s); hook(); scan();
  });
  chrome.storage.onChanged.addListener(function (ch) {
    var s = {};
    if (ch.contacts) s.contacts = ch.contacts.newValue;
    if (ch.settings) s.settings = ch.settings.newValue;
    if (ch.me) s.me = ch.me.newValue;
    if (ch.activeMode) s.activeMode = ch.activeMode.newValue;
    apply(s); scan();
  });
  function apply(s) {
    if (s.contacts !== undefined) STATE.contacts = s.contacts || [];
    if (s.settings !== undefined) STATE.settings = s.settings || {};
    if (s.me !== undefined) STATE.me = s.me || '';
    if (s.activeMode !== undefined) STATE.active = s.activeMode !== false;
    STATE.stages = list(STATE.settings.stages, 'New');
    STATE.sources = list(STATE.settings.sources, '');
  }
  function list(v, fb) { return String(v || fb).split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  // ── SPA navigation hook ────────────────────────────────────────────────
  function hook() {
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); fire(); return r; };
    });
    window.addEventListener('popstate', fire);
    new MutationObserver(debounce(scan, 700)).observe(document.documentElement, { childList: true, subtree: true });
  }
  var t = null;
  function fire() { clearTimeout(t); dismissed = false; t = setTimeout(scan, 400); }
  function debounce(fn, ms) { var d; return function () { clearTimeout(d); d = setTimeout(fn, ms); }; }

  // ── Detection (best-effort; always editable) ────────────────────────────
  function detect() {
    var host = location.hostname, path = location.pathname;
    if (host.indexOf('linkedin.com') > -1) {
      var m = path.match(/\/in\/([^/?#]+)/);
      if (!m) return null;
      return blank({ source: 'LinkedIn', linkedin: 'https://www.linkedin.com/in/' + m[1] + '/',
        name: txt(document.querySelector('h1')),
        company: txt(document.querySelector('[data-field="experience_company_logo"] span, .pv-text-details__right-panel')) });
    }
    if (host.indexOf('reddit.com') > -1) {
      var r = path.match(/\/(?:user|u)\/([^/?#]+)/);
      if (!r) return null;
      return blank({ source: 'Reddit', reddit: 'u/' + r[1], name: r[1] });
    }
    if (host.indexOf('mail.google.com') > -1) {
      // Prefer the sender in an OPEN message header; fall back to any email span.
      var el = document.querySelector('.gE [email], .gD[email], .go[email]') || document.querySelector('[email]');
      if (!el) return null;
      return blank({ source: 'Email', email: el.getAttribute('email') || '',
        name: el.getAttribute('name') || txt(el) });
    }
    return null;
  }
  function blank(o) {
    var base = { name: '', company: '', phone: '', linkedin: '', email: '', reddit: '', handle: '', source: '' };
    for (var k in o) base[k] = o[k];
    return base;
  }
  function txt(el) { return el ? (el.textContent || '').trim().slice(0, 120) : ''; }
  function anyId(c) { return c.phone || c.linkedin || c.email || c.reddit || c.handle; }

  // ── Scan: always show a bar when active ─────────────────────────────────
  function scan() {
    if (!STATE.active) { remove(); return; }
    var cand = detect();
    var manual = !cand;
    cand = cand || blank({});
    var key = (manual ? 'manual@' + location.pathname : JSON.stringify([cand.linkedin, cand.email, cand.reddit, cand.phone])) + '|' + dismissed;
    if (key === lastKey && document.getElementById('dedup-badge')) return;
    lastKey = key;
    if (dismissed) { remove(); return; }
    var res = (!manual && anyId(cand)) ? Matcher.findHits(cand, STATE.contacts, STATE.settings) : { hits: [] };
    render(cand, res.hits, manual);
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function remove() { var b = document.getElementById('dedup-badge'); if (b) b.remove(); }

  function render(cand, hits, manual) {
    remove();
    var dup = hits.length > 0;
    var box = el('div', 'dedup-badge ' + (manual ? 'manual' : dup ? 'dup' : 'clear'));
    box.id = 'dedup-badge';

    var head = el('div', 'dm-head');
    head.appendChild(el('span', 'dm-dot'));
    head.appendChild(el('span', 'dm-title', manual ? 'Log a contact' : dup ? '⚠ Already in CRM' : '✓ Not in CRM yet'));
    var x = el('span', 'dm-x', '×');
    x.onclick = function () { dismissed = true; remove(); };
    head.appendChild(x);
    box.appendChild(head);

    box.appendChild(el('div', 'dm-sub', cand.name || cand.linkedin || cand.email || cand.reddit || 'Fill the fields and save'));

    hits.slice(0, 3).forEach(function (h) {
      var p = h.contact;
      var row = el('div', 'dm-hit');
      row.appendChild(el('span', 'dm-pill', p.status || '—'));
      row.appendChild(el('span', 'dm-hit-txt', (p.added_by || '?') + ' · matched ' + h.reason + (p.company ? ' · ' + p.company : '')));
      box.appendChild(row);
    });

    var add = el('button', 'dm-btn', dup ? 'View / update record' : 'Log this person');
    add.onclick = function () { openForm(cand, hits[0] ? hits[0].contact : null); };
    box.appendChild(add);

    if (!STATE.me) { box.appendChild(el('div', 'dm-warn', 'Set your name in the extension popup first.')); add.disabled = true; }
    document.body.appendChild(box);
  }

  function openForm(cand, existing) {
    remove();
    var merged = blank(existing || {});
    ['name', 'company', 'phone', 'linkedin', 'email', 'reddit', 'handle', 'source'].forEach(function (f) {
      merged[f] = (existing && String(existing[f] || '').trim()) ? existing[f] : (cand[f] || '');
    });

    var box = el('div', 'dedup-badge form'); box.id = 'dedup-badge';
    box.appendChild(el('div', 'dm-title', existing ? 'Update record' : 'Log a contact'));

    var f = {
      name: input('Name', merged.name), company: input('Company', merged.company),
      phone: input('Phone', merged.phone), linkedin: input('LinkedIn', merged.linkedin),
      email: input('Email', merged.email), handle: input('Handle (Slack/X…)', merged.handle)
    };
    ['name', 'company', 'phone', 'linkedin', 'email', 'handle'].forEach(function (k) { box.appendChild(f[k].wrap); });
    var source = selectField('Source', [''].concat(STATE.sources), merged.source, true);
    var status = selectField('Stage', STATE.stages, existing ? existing.status : STATE.stages[0], false);
    box.appendChild(source.wrap); box.appendChild(status.wrap);

    var msg = el('div', 'dm-msg'); box.appendChild(msg);

    var save = el('button', 'dm-btn', (existing ? 'Save & merge as ' : 'Save as ') + (STATE.me || '—'));
    save.onclick = function () {
      var vals = { name: f.name.get(), company: f.company.get(), phone: f.phone.get(),
        linkedin: f.linkedin.get(), email: f.email.get(), handle: f.handle.get(),
        reddit: merged.reddit || '', source: source.get(), status: status.get() };
      if (!(vals.phone || vals.linkedin || vals.email || vals.handle) && !vals.source) { msg.textContent = 'Add an identifier or a source.'; return; }
      save.disabled = true; msg.textContent = 'Saving…';
      chrome.runtime.sendMessage({ type: 'add', me: STATE.me, fields: vals }, function (r) {
        if (r && r.ok) { msg.textContent = r.merged ? 'Merged ✓' : 'Saved ✓'; setTimeout(function () { dismissed = true; remove(); }, 900); }
        else { msg.textContent = 'Error: ' + ((r && r.error) || 'failed'); save.disabled = false; }
      });
    };
    box.appendChild(save);
    var cancel = el('button', 'dm-btn ghost', 'Cancel');
    cancel.onclick = function () { remove(); lastKey = null; scan(); };
    box.appendChild(cancel);
    document.body.appendChild(box);
  }

  function input(label, val) {
    var wrap = el('label', 'dm-field'); wrap.appendChild(el('span', 'dm-lbl', label));
    var i = document.createElement('input'); i.value = val || ''; wrap.appendChild(i);
    return { wrap: wrap, get: function () { return i.value.trim(); } };
  }
  function selectField(label, opts, val, blankFirst) {
    var wrap = el('label', 'dm-field'); wrap.appendChild(el('span', 'dm-lbl', label));
    var s = document.createElement('select');
    opts.forEach(function (o) {
      var op = el('option', null, o === '' ? (blankFirst ? '— none —' : '') : o); op.value = o;
      if (o === val) op.selected = true; s.appendChild(op);
    });
    wrap.appendChild(s);
    return { wrap: wrap, get: function () { return s.value; } };
  }
})();
