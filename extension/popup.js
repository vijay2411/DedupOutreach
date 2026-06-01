var TEAM = ['Aman', 'Vedant', 'Teammate 3']; // edit to your names

var $ = function (id) { return document.getElementById(id); };

function fillTeam(selected) {
  var sel = $('me');
  sel.textContent = '';
  TEAM.forEach(function (n) {
    var o = document.createElement('option');
    o.value = n; o.textContent = n;
    if (n === selected) o.selected = true;
    sel.appendChild(o);
  });
}

function load() {
  chrome.storage.local.get(
    ['me', 'apiUrl', 'apiKey', 'activeMode', 'lastSync', 'contacts'],
    function (s) {
      fillTeam(s.me);
      $('apiUrl').value = s.apiUrl || '';
      $('apiKey').value = s.apiKey || '';
      $('active').checked = s.activeMode !== false;
      var n = (s.contacts || []).length;
      $('sync').textContent = s.lastSync
        ? n + ' contacts · synced ' + new Date(s.lastSync).toLocaleTimeString()
        : 'not synced yet';
    }
  );
}

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

$('syncBtn').addEventListener('click', doSync);

function doSync() {
  msg('Syncing…');
  chrome.runtime.sendMessage({ type: 'sync' }, function () {
    setTimeout(load, 300); msg('Synced ✓');
  });
}

function msg(m) { $('msg').textContent = m; }

load();
