var DEFAULT_TEAM = ['Vedant', 'Rahul', 'Saksham']; // fallback if no team in config

var $ = function (id) { return document.getElementById(id); };

function getTeam(stored) {
  return (Array.isArray(stored) && stored.length) ? stored : DEFAULT_TEAM;
}

function fillTeam(team, selected) {
  var sel = $('me');
  sel.textContent = '';
  team.forEach(function (n) {
    var o = document.createElement('option');
    o.value = n; o.textContent = n;
    if (n === selected) o.selected = true;
    sel.appendChild(o);
  });
}

function list(v, fb) { return String(v || fb).split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function fillSelect(id, opts, blankFirst) {
  var sel = $(id); sel.textContent = '';
  if (blankFirst) { var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— source —'; sel.appendChild(o0); }
  opts.forEach(function (o) { var o2 = document.createElement('option'); o2.value = o; o2.textContent = o; sel.appendChild(o2); });
}

function load() {
  chrome.storage.local.get(
    ['me', 'apiUrl', 'apiKey', 'activeMode', 'lastSync', 'contacts', 'team', 'settings'],
    function (s) {
      var team = getTeam(s.team);
      // Default "me" to the first teammate and PERSIST it, so the content
      // script always has a name (the dropdown defaulting visually isn't enough).
      var me = (s.me && team.indexOf(s.me) >= 0) ? s.me : team[0];
      fillTeam(team, me);
      if (s.me !== me) chrome.storage.local.set({ me: me });
      var st = s.settings || {};
      fillSelect('p_source', list(st.sources, 'LinkedIn,Email,Phone,WhatsApp,Slack,Twitter/X,Reddit,Other'), true);
      fillSelect('p_status', list(st.stages, 'New'), false);
      if (s.apiUrl) $('openDash').href = s.apiUrl;
      $('apiUrl').value = s.apiUrl || '';
      $('apiKey').value = s.apiKey || '';
      $('active').checked = s.activeMode !== false;
      var n = (s.contacts || []).length;
      $('sync').textContent = s.lastSync
        ? n + ' contacts · synced ' + new Date(s.lastSync).toLocaleTimeString()
        : 'not synced yet';
      // open the connection panel automatically until configured
      if (!s.apiUrl || !s.apiKey) $('connDetails').open = true;
    }
  );
}

// ── Config string: base64( JSON{ apiUrl, apiKey, team } ) ──────────────────
function encodeCfg(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function decodeCfg(s) { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/\s+/g, ''))))); }

$('importBtn').addEventListener('click', function () {
  var raw = $('importStr').value.trim();
  if (!raw) { msg('Paste a config string first'); return; }
  var cfg;
  try { cfg = decodeCfg(raw); } catch (e) { msg('That config string looks invalid'); return; }
  if (!cfg.apiUrl || !cfg.apiKey) { msg('Config missing url or key'); return; }
  var set = { apiUrl: cfg.apiUrl, apiKey: cfg.apiKey };
  if (Array.isArray(cfg.team) && cfg.team.length) set.team = cfg.team;
  chrome.storage.local.set(set, function () {
    msg('Imported ✓ — syncing…'); load(); doSync();
  });
});

$('exportBtn').addEventListener('click', function () {
  chrome.storage.local.get(['apiUrl', 'apiKey', 'team'], function (s) {
    if (!s.apiUrl || !s.apiKey) { msg('Set url + key first'); return; }
    var str = encodeCfg({ apiUrl: s.apiUrl, apiKey: s.apiKey, team: getTeam(s.team) });
    navigator.clipboard.writeText(str).then(
      function () { msg('Config copied — share it with your team'); },
      function () { $('importStr').value = str; msg('Copy failed; selected it above instead'); }
    );
  });
});

$('me').addEventListener('change', function () {
  chrome.storage.local.set({ me: $('me').value });
  msg('Saved as ' + $('me').value);
});

$('active').addEventListener('change', function () {
  chrome.storage.local.set({ activeMode: $('active').checked });
  msg($('active').checked ? 'Active mode on' : 'Active mode off');
});

$('saveCfg').addEventListener('click', function () {
  chrome.storage.local.set(
    { apiUrl: $('apiUrl').value.trim(), apiKey: $('apiKey').value.trim() },
    function () { msg('Connection saved — syncing…'); doSync(); }
  );
});

$('logBtn').addEventListener('click', function () {
  var fields = {
    name: $('p_name').value.trim(), company: $('p_company').value.trim(),
    phone: $('p_phone').value.trim(), linkedin: $('p_linkedin').value.trim(),
    email: $('p_email').value.trim(), handle: $('p_handle').value.trim(),
    source: $('p_source').value, status: $('p_status').value
  };
  if (!(fields.phone || fields.linkedin || fields.email || fields.handle) && !fields.source) {
    msg('Add an identifier or a source'); return;
  }
  $('logBtn').disabled = true; msg('Saving…');
  chrome.runtime.sendMessage({ type: 'add', me: $('me').value, fields: fields }, function (r) {
    $('logBtn').disabled = false;
    if (r && r.ok) {
      msg(r.merged ? 'Merged into existing ✓' : 'Saved ✓');
      ['p_name', 'p_company', 'p_phone', 'p_linkedin', 'p_email', 'p_handle'].forEach(function (i) { $(i).value = ''; });
    } else { msg('Error: ' + ((r && r.error) || 'failed')); }
  });
});

$('syncBtn').addEventListener('click', doSync);

function doSync() {
  msg('Syncing…');
  chrome.runtime.sendMessage({ type: 'sync' }, function () {
    setTimeout(load, 400); msg('Synced ✓');
  });
}

function msg(m) { $('msg').textContent = m; }

load();
