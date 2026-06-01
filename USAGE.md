# DedupManager — Setup & Usage

Two pieces: a **Google Sheet + Apps Script backend**, and a **Chrome extension**.
The technical person runs the backend deploy once; teammates paste one config
string into the extension.

---

## Part 1 — Backend (the technical person, once)

### Fast path: `./deploy.sh` (recommended)

```bash
npm i -g @google/clasp     # install Google's Apps Script CLI
clasp login                # opens your browser; authorize once
# one-time: enable the Apps Script API at
#   https://script.google.com/home/usersettings  (toggle "Apps Script API" on)
./deploy.sh                # creates the Sheet + script, pushes, deploys
```

`deploy.sh` will:
- generate a random **team API key** into `apps-script/Config.gs` (gitignored),
- create a new Google Sheet with a bound script,
- push the code and deploy it as a public-URL web app **that runs as you**
  (no manual click-through),
- pin a **stable deployment URL** (re-running `./deploy.sh` after code changes
  keeps the same URL — teammates never re-import),
- print the **dashboard URL**, the **API key**, and a **shareable config string**.

Open the printed dashboard URL once to initialize the Sheet tabs. Edit the
`TEAM_JSON` line in `deploy.sh` (and the `TEAM` array in `apps-script/Index.html`)
to your real names.

> "Access: anyone" sounds scary — the **API key gates every data call**, so only
> the dashboard *page* is reachable by URL, and it's useless without the key.

### Manual path (no clasp)

1. [sheets.new](https://sheets.new) → name it → **Extensions → Apps Script**.
2. Recreate two files (consolidated — just two now):
   - `Code.gs` ← paste `apps-script/Code.gs`
   - `Index.html` (➕ New → HTML) ← paste `apps-script/Index.html`
3. Add a `Config.gs` (➕ New → Script) with `var TEAM_API_KEY = '<long random>';`
   (see `apps-script/Config.example.gs`).
4. **Deploy → New deployment → Web app** → *Execute as:* **Me**,
   *Who has access:* **Anyone** → copy the `/exec` URL.
5. Open the `/exec` URL once to initialize tabs.

> Redeploying manually: **Deploy → Manage deployments → edit → Version: New
> version**, or the old code keeps serving.

---

## Part 2 — Chrome extension (each teammate)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the `extension/` folder.
2. Click the DedupManager icon → **Connection settings** →
   paste the **config string** the host shared → **Import config**.
   (This sets the URL, key, and team names in one shot.)
3. Pick **I am → your name**. Leave **Active mode** on. Done.

> The host gets their own config string from `./deploy.sh` output, or from the
> popup: set URL + key manually once, then **Copy shareable config** to hand to
> the others.

---

## Daily use

- **On LinkedIn / Reddit / Gmail**: a badge appears bottom-right —
  🟢 *not approached* or 🔴 *already approached by X on date*. Click **Log this
  contact**, verify the prefilled fields, **Save**.
- **Anywhere else**: open the dashboard, paste an identifier, **Check for
  duplicates**, then **Log it**.
- **Search history**: dashboard → **History** tab.
- **Tune strictness**: dashboard → **Settings** (syncs to everyone's extension
  within a few minutes).

## Tuning the dedup (Settings tab)

| Knob | Turn it on when… |
|---|---|
| Lowercase emails | always (default on) |
| Ignore `+tags` | you use `you+lead@gmail` style addresses |
| Ignore dots in email | targets use Gmail and dot-tricks matter |
| LinkedIn slug only | always (default on) — kills url tracking params |
| Normalize Reddit handles | always (default on) |
| Fuzzy name + company | warn even without a shared URL/email (a few false alarms) |
| Fuzzy threshold | lower = looser/more warnings, higher = stricter |

## Tests

```bash
node extension/matcher.test.js
```
Covers normalization, cross-channel dedup, false-positive avoidance, and the
fuzzy toggle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `clasp push` mentions the API | Enable it once: https://script.google.com/home/usersettings |
| `Not logged in to clasp` | Run `clasp login`. |
| Badge says "set your name" | Open popup → pick your name. |
| Badge never appears | Popup should show "synced N contacts"; re-import config; toggle Active mode. |
| "unauthorized" on save | Extension key ≠ `TEAM_API_KEY` in `Config.gs`; re-import the latest config. |
| A scraped name/company is wrong | Edit it in the confirm card before saving — extraction is best-effort by design. |
| Want a fresh deployment URL | Delete `.deployment-id` and re-run `./deploy.sh`. |
