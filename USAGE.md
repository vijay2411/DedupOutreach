# DedupManager — Setup & Usage

Two pieces: a **Google Sheet + Apps Script backend**, and a **Chrome extension**.
Set up the backend once, then each teammate installs the extension. ~15 minutes total.

---

## Part 1 — Backend (one person does this once)

### 1. Create the Sheet
1. Go to [sheets.new](https://sheets.new). Name it e.g. `DedupManager DB`.
2. **Extensions → Apps Script**. This opens a script bound to the Sheet.

### 2. Paste the code
In the Apps Script editor, recreate these three files (delete the default `Code.gs` content first):

| File in editor | Paste from |
|---|---|
| `Code.gs` | `apps-script/Code.gs` |
| `Matcher.gs` (➕ New → Script) | `apps-script/Matcher.gs` |
| `Index.html` (➕ New → HTML) | `apps-script/Index.html` |

### 3. Set your team secret
At the top of `Code.gs`, change:
```js
var API_KEY = 'CHANGE_ME_to_a_long_random_team_secret';
```
to a long random string (e.g. run `openssl rand -hex 24` in a terminal). **Remember it** — every teammate needs it.

### 4. Initialize + deploy
1. In the editor, pick the `setup` function in the toolbar dropdown and click **Run**. Approve the permission prompt. This creates the `Contacts` and `Settings` tabs. (You'll see them appear in the Sheet.)
2. **Deploy → New deployment → Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Click **Deploy**, approve, and **copy the Web app URL** (ends in `/exec`).

> "Anyone" sounds scary but the API_KEY gates every data call; only the web UI page is public, and it's useless without the key.

### 5. Use the web app
Open the `/exec` URL in a browser → that's your search / stats / settings / manual-add dashboard. Bookmark it. Edit the `TEAM` array near the top of the `<script>` in `Index.html` to your real names.

---

## Part 2 — Chrome extension (each teammate)

### 1. Edit your names
In `extension/popup.js`, set:
```js
var TEAM = ['Aman', 'Vedant', 'Teammate 3'];
```
to your 3 names (do this once, then share the folder). Match the same names in the web app's `Index.html` `TEAM` array.

### 2. Load it
1. Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top-right) on.
3. **Load unpacked** → select the `extension/` folder.

### 3. Connect it
Click the DedupManager icon → **Connection settings**:
- **Apps Script web app URL** → paste the `/exec` URL.
- **Team API key** → paste the shared secret.
- **Save connection** (it syncs immediately).
Then pick **I am → your name**, and leave **Active mode** on.

---

## Daily use

- **Browsing LinkedIn / Reddit / Gmail**: a badge appears bottom-right —
  🟢 *not approached* or 🔴 *already approached by X on date*. Click **Log this
  contact**, verify the prefilled fields, **Save**.
- **Anywhere else / no extension**: open the web app, paste an identifier, hit
  **Check for duplicates**, then **Log it**.
- **Search history**: web app → **History** tab.
- **Tune strictness**: web app → **Settings**. Changes sync to everyone's
  extension within a few minutes.

## Tuning the dedup (Settings tab)

| Knob | Turn it on when… |
|---|---|
| Lowercase emails | always (default on) |
| Ignore `+tags` | you use `you+lead@gmail` style addresses |
| Ignore dots in email | your targets use Gmail and dot-tricks matter |
| LinkedIn slug only | always (default on) — kills url tracking params |
| Normalize Reddit handles | always (default on) |
| Fuzzy name + company | you want warnings even without a shared URL/email (a few false alarms) |
| Fuzzy threshold | lower = looser/more warnings, higher = stricter |

## Tests

```bash
node extension/matcher.test.js
```
Covers normalization, cross-channel dedup, false-positive avoidance, and the fuzzy toggle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Badge says "set your name" | Open popup → pick your name. |
| Badge never appears | Check popup shows "synced N contacts"; verify URL + key; toggle Active mode. |
| "unauthorized" on save | API key in the extension ≠ `API_KEY` in `Code.gs`. |
| A scraped name/company is wrong | Just edit it in the confirm card before saving — extraction is best-effort by design. |
| Changed the Apps Script code | **Deploy → Manage deployments → edit → Version: New version**, or the old code keeps serving. |
