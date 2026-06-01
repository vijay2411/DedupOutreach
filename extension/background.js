/**
 * Service worker: syncs the shared log + settings into chrome.storage.local on
 * a timer, and proxies add/update writes to the Apps Script API. Content scripts
 * read the cached log for instant, offline-ish dedup.
 */
importScripts('matcher.js');

var SYNC_MINUTES = 4;

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create('sync', { periodInMinutes: SYNC_MINUTES });
  sync();
});
chrome.runtime.onStartup.addListener(sync);
chrome.alarms.onAlarm.addListener(function (a) { if (a.name === 'sync') sync(); });

async function cfg() {
  return await chrome.storage.local.get(['apiUrl', 'apiKey', 'me']);
}

async function sync() {
  var c = await cfg();
  if (!c.apiUrl || !c.apiKey) return;
  try {
    var url = c.apiUrl + '?action=bootstrap&apiKey=' + encodeURIComponent(c.apiKey);
    var res = await fetch(url, { method: 'GET' });
    var data = await res.json();
    if (data.ok) {
      await chrome.storage.local.set({
        contacts: data.contacts, settings: data.settings, lastSync: Date.now()
      });
    }
  } catch (e) { /* keep last good cache */ }
}

async function post(body) {
  var c = await cfg();
  if (!c.apiUrl || !c.apiKey) return { ok: false, error: 'not configured' };
  body.apiKey = c.apiKey;
  var res = await fetch(c.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body: JSON.stringify(body)
  });
  return await res.json();
}

chrome.runtime.onMessage.addListener(function (msg, _sender, reply) {
  if (msg.type === 'sync') { sync().then(function () { reply({ ok: true }); }); return true; }
  if (msg.type === 'add') {
    post({ action: 'add', added_by: msg.me, source: msg.source,
           identifier: msg.identifier, name: msg.name, company: msg.company,
           status: msg.status || 'sent', notes: msg.notes || '' })
      .then(function (r) { sync().then(function () { reply(r); }); });
    return true;
  }
  if (msg.type === 'update') {
    post({ action: 'update', id: msg.id, status: msg.status, notes: msg.notes })
      .then(function (r) { sync().then(function () { reply(r); }); });
    return true;
  }
});
