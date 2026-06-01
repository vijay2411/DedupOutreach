/**
 * Content script: on LinkedIn / Reddit / Gmail, detect the person in view,
 * dedup against the locally-synced people list (any identifier matches), and
 * render an on-page badge. "Log" opens a prefilled, editable card; saving
 * upserts — merging into the existing person record if one matches.
 *
 * All DOM is built with createElement/textContent — no innerHTML with page or
 * log data — so scraped values can never inject markup.
 */
(function () {
  var STATE = { contacts: [], settings: {}, me: '', active: true, stages: ['New'] };
  var lastKey = null;

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
    var stg = STATE.settings.stages;
    STATE.stages = String(stg || 'New').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ── SPA navigation hook ────────────────────────────────────────────────
  function hook() {
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); fire(); return r; };
    });
    window.addEventListener('popstate', fire);
    new MutationObserver(debounce(scan, 600)).observe(document.documentElement, { childList: true, subtree: true });
  }
  var t = null;
  function fire() { clearTimeout(t); t = setTimeout(scan, 400); }
  function debounce(fn, ms) { var d; return function () { clearTimeout(d); d = setTimeout(fn, ms); }; }

  // ── Detection / extraction → a candidate person ─────────────────────────
  function detect() {
    var host = location.hostname, path = location.pathname;
    if (host.indexOf('linkedin.com') > -1) {
      var m = path.match(/\/in\/([^/?#]+)/);
      if (!m) return null;
      return blank({
        linkedin: 'https://www.linkedin.com/in/' + m[1] + '/',
        name: txt(document.querySelector('h1')),
        company: txt(document.querySelector('[data-field="experience_company_logo"] span, .pv-text-details__right-panel'))
      });
    }
    if (host.indexOf('reddit.com') > -1) {
      var r = path.match(/\/(?:user|u)\/([^/?#]+)/);
      if (!r) return null;
      return blank({ reddit: 'u/' + r[1], name: r[1] });
    }
    if (host.indexOf('mail.google.com') > -1) {
      var span = document.querySelector('.adn span[email], span[email]');
      if (!span) return null;
      return blank({ email: span.getAttribute('email') || '', name: span.getAttribute('name') || txt(span) });
    }
    return null;
  }
  function blank(o) {
    var base = { name: '', company: '', phone: '', linkedin: '', email: '', reddit: '' };
    for (var k in o) base[k] = o[k];
    return base;
  }
  function txt(el) { return el ? (el.textContent || '').trim().slice(0, 120) : ''; }
  function anyId(c) { return c.phone || c.linkedin || c.email || c.reddit; }

  // ── Scan ────────────────────────────────────────────────────────────────
  function scan() {
    if (!STATE.active) { remove(); return; }
    var cand = detect();
    if (!cand || !anyId(cand)) { remove(); return; }
    var key = JSON.stringify([cand.linkedin, cand.email, cand.reddit, cand.phone]);
    if (key === lastKey && document.getElementById('dedup-badge')) return;
    lastKey = key;
    var res = Matcher.findHits(cand, STATE.contacts, STATE.settings);
    render(cand, res.hits);
  }

  // ── Badge UI (safe DOM) ───────────────────────────────────────────────────
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
    head.appendChild(el('span', 'dm-title', dup ? '⚠ Already in CRM' : '✓ Not in CRM yet'));
    var x = el('span', 'dm-x', '×');
    x.onclick = function () { remove(); lastKey = null; };
    head.appendChild(x);
    box.appendChild(head);

    box.appendChild(el('div', 'dm-sub', cand.name || cand.linkedin || cand.email || cand.reddit));

    hits.slice(0, 3).forEach(function (h) {
      var p = h.contact;
      var row = el('div', 'dm-hit');
      row.appendChild(el('span', 'dm-pill', p.status || '—'));
      row.appendChild(el('span', 'dm-hit-txt',
        (p.added_by || '?') + ' · matched on ' + h.reason +
        (p.company ? ' · ' + p.company : '')));
      box.appendChild(row);
    });

    var add = el('button', 'dm-btn', dup ? 'View / update record' : 'Log this person');
    add.onclick = function () { openForm(cand, hits[0] ? hits[0].contact : null); };
    box.appendChild(add);

    if (!STATE.me) {
      box.appendChild(el('div', 'dm-warn', 'Set your name in the extension popup first.'));
      add.disabled = true;
    }
    document.body.appendChild(box);
  }

  function openForm(cand, existing) {
    remove();
    var merged = blank(existing || {});
    // prefer existing values, fall back to freshly scraped ones
    ['name', 'company', 'phone', 'linkedin', 'email', 'reddit'].forEach(function (f) {
      merged[f] = (existing && String(existing[f] || '').trim()) ? existing[f] : (cand[f] || '');
    });

    var box = el('div', 'dedup-badge form');
    box.id = 'dedup-badge';
    box.appendChild(el('div', 'dm-title', existing ? 'Update record' : 'Log new person'));

    var fields = {
      name: input('Name', merged.name), company: input('Company', merged.company),
      phone: input('Phone', merged.phone), linkedin: input('LinkedIn', merged.linkedin),
      email: input('Email', merged.email)
    };
    Object.keys(fields).forEach(function (k) { box.appendChild(fields[k].wrap); });
    var status = selectField('Status', STATE.stages, existing ? existing.status : STATE.stages[0]);
    box.appendChild(status.wrap);

    var msg = el('div', 'dm-msg');
    box.appendChild(msg);

    var save = el('button', 'dm-btn', (existing ? 'Save & merge under ' : 'Save under ') + (STATE.me || '—'));
    save.onclick = function () {
      save.disabled = true; msg.textContent = 'Saving…';
      chrome.runtime.sendMessage({
        type: 'add', me: STATE.me, fields: {
          name: fields.name.get(), company: fields.company.get(), phone: fields.phone.get(),
          linkedin: fields.linkedin.get(), email: fields.email.get(),
          reddit: merged.reddit || '', status: status.get()
        }
      }, function (r) {
        if (r && r.ok) { msg.textContent = r.merged ? 'Merged ✓' : 'Saved ✓'; setTimeout(function () { remove(); lastKey = null; }, 900); }
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
  function selectField(label, opts, val) {
    var wrap = el('label', 'dm-field'); wrap.appendChild(el('span', 'dm-lbl', label));
    var s = document.createElement('select');
    opts.forEach(function (o) { var op = el('option', null, o); op.value = o; if (o === val) op.selected = true; s.appendChild(op); });
    wrap.appendChild(s);
    return { wrap: wrap, get: function () { return s.value; } };
  }
})();
