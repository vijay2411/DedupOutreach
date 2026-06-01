/**
 * Content script: on LinkedIn / Reddit / Gmail, detect the person in view,
 * dedup against the locally-synced log, and render an on-page badge. "Add"
 * opens a prefilled, editable card you confirm before anything is written.
 *
 * All DOM is built with createElement/textContent — no innerHTML with page or
 * log data — so scraped values can never inject markup.
 */
(function () {
  var STATE = { contacts: [], settings: {}, me: '', active: true, url: '' };
  var lastKey = null;

  chrome.storage.local.get(
    ['contacts', 'settings', 'me', 'activeMode'],
    function (s) {
      STATE.contacts = s.contacts || [];
      STATE.settings = s.settings || {};
      STATE.me = s.me || '';
      STATE.active = s.activeMode !== false;
      hook();
      scan();
    }
  );

  chrome.storage.onChanged.addListener(function (ch) {
    if (ch.contacts) STATE.contacts = ch.contacts.newValue || [];
    if (ch.settings) STATE.settings = ch.settings.newValue || {};
    if (ch.me) STATE.me = ch.me.newValue || '';
    if (ch.activeMode) STATE.active = ch.activeMode.newValue !== false;
    scan();
  });

  // ── SPA navigation hook ────────────────────────────────────────────────
  function hook() {
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); fire(); return r; };
    });
    window.addEventListener('popstate', fire);
    var obs = new MutationObserver(debounce(scan, 600));
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  var t = null;
  function fire() { clearTimeout(t); t = setTimeout(scan, 400); }
  function debounce(fn, ms) { var d; return function () { clearTimeout(d); d = setTimeout(fn, ms); }; }

  // ── Detection / extraction ─────────────────────────────────────────────
  function detect() {
    var host = location.hostname, path = location.pathname;
    if (host.indexOf('linkedin.com') > -1) {
      var m = path.match(/\/in\/([^/?#]+)/);
      if (!m) return null;
      var h1 = document.querySelector('h1');
      return {
        source: 'linkedin',
        identifier: 'https://www.linkedin.com/in/' + m[1] + '/',
        name: txt(h1),
        company: txt(document.querySelector('[data-field="experience_company_logo"], .pv-text-details__right-panel'))
      };
    }
    if (host.indexOf('reddit.com') > -1) {
      var r = path.match(/\/(?:user|u)\/([^/?#]+)/);
      if (!r) return null;
      return { source: 'reddit', identifier: 'u/' + r[1], name: r[1], company: '' };
    }
    if (host.indexOf('mail.google.com') > -1) {
      var span = document.querySelector('.adn span[email], span[email]');
      if (!span) return null;
      return {
        source: 'email',
        identifier: span.getAttribute('email') || '',
        name: span.getAttribute('name') || txt(span),
        company: ''
      };
    }
    return null;
  }
  function txt(el) { return el ? (el.textContent || '').trim().slice(0, 120) : ''; }

  // ── Scan + render ──────────────────────────────────────────────────────
  function scan() {
    if (!STATE.active) { remove(); return; }
    var cand = detect();
    if (!cand || !cand.identifier) { remove(); return; }
    var key = cand.source + '|' + cand.identifier;
    if (key === lastKey && document.getElementById('dedup-badge')) return;
    lastKey = key;
    var res = Matcher.findHits(cand, STATE.contacts, STATE.settings);
    render(cand, res.hits);
  }

  // ── Badge UI (safe DOM) ────────────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function remove() { var b = document.getElementById('dedup-badge'); if (b) b.remove(); }

  function render(cand, hits) {
    remove();
    var dup = hits.length > 0;
    var box = el('div', 'dedup-badge ' + (dup ? 'dup' : 'clear'));
    box.id = 'dedup-badge';

    var head = el('div', 'dm-head');
    head.appendChild(el('span', 'dm-dot'));
    head.appendChild(el('span', 'dm-title',
      dup ? '⚠ Already approached (' + hits.length + ')' : '✓ Not approached yet'));
    var x = el('span', 'dm-x', '×');
    x.onclick = function () { remove(); lastKey = null; };
    head.appendChild(x);
    box.appendChild(head);

    var sub = el('div', 'dm-sub', cand.name || cand.identifier);
    box.appendChild(sub);

    hits.slice(0, 4).forEach(function (c) {
      var row = el('div', 'dm-hit');
      row.appendChild(el('span', 'dm-pill dm-' + (c.status || 'sent'), c.status || 'sent'));
      row.appendChild(el('span', 'dm-hit-txt',
        c.added_by + ' · ' + c.source + ' · ' + fmtDate(c.added_at)));
      box.appendChild(row);
    });

    var add = el('button', 'dm-btn', dup ? 'Log anyway' : 'Log this contact');
    add.onclick = function () { openForm(cand); };
    box.appendChild(add);

    if (!STATE.me) {
      var warn = el('div', 'dm-warn', 'Set your name in the extension popup first.');
      box.appendChild(warn);
      add.disabled = true;
    }
    document.body.appendChild(box);
  }

  function openForm(cand) {
    remove();
    var box = el('div', 'dedup-badge form');
    box.id = 'dedup-badge';
    box.appendChild(el('div', 'dm-title', 'Confirm & log'));

    var fName = input('Name', cand.name);
    var fCompany = input('Company', cand.company);
    var fId = input('Identifier', cand.identifier);
    var fSource = select('Source', ['linkedin', 'email', 'reddit', 'other'], cand.source);
    [fName, fCompany, fId, fSource].forEach(function (f) { box.appendChild(f.wrap); });

    var status = el('div', 'dm-msg');
    box.appendChild(status);

    var save = el('button', 'dm-btn', 'Save under ' + (STATE.me || '—'));
    save.onclick = function () {
      save.disabled = true; status.textContent = 'Saving…';
      chrome.runtime.sendMessage({
        type: 'add', me: STATE.me, source: fSource.get(),
        identifier: fId.get(), name: fName.get(), company: fCompany.get()
      }, function (r) {
        if (r && r.ok) { status.textContent = 'Logged ✓'; setTimeout(function () { remove(); lastKey = null; }, 900); }
        else { status.textContent = 'Error: ' + ((r && r.error) || 'failed'); save.disabled = false; }
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
  function select(label, opts, val) {
    var wrap = el('label', 'dm-field'); wrap.appendChild(el('span', 'dm-lbl', label));
    var s = document.createElement('select');
    opts.forEach(function (o) { var op = el('option', null, o); op.value = o; if (o === val) op.selected = true; s.appendChild(op); });
    wrap.appendChild(s);
    return { wrap: wrap, get: function () { return s.value; } };
  }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
})();
