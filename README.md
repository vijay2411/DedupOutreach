# DedupManager

**Stop two teammates from cold-DMing the same person.** You open a LinkedIn
profile and a badge says: 🔴 *"Vedant already messaged this person on Apr 12 —
replied."* That's the whole product.

A shared outreach dedup ledger for a small team, running on **one Google Sheet +
a Chrome extension**. No server, no database, no monthly bill.

## ✨ What this is

- 🟢 **Live dedup while you browse** — auto-detects who you're viewing on LinkedIn, Reddit, and Gmail and checks the shared log instantly.
- ✍️ **One-click logging** — auto-extracts name/company/handle, you verify & edit, then save under your name.
- 🔎 **Search the whole history** — by name, company, email, handle, or teammate.
- 🎚️ **Tweakable matching** — dial dedup strictness up/down (email +tags, LinkedIn url noise, fuzzy name+company) from a Settings panel, no code.
- 👤 **Per-person attribution** — every approach records who, when, and which channel.
- 📊 **Lightweight stats** — approaches per person/source/week + double-touches caught.
- 📄 **Data is just a Google Sheet** — open it, sort it, export it, trust it.
- 💸 **$0 and serverless** — Google Apps Script hosts it; you run nothing.

## ❌ What this isn't

- 🚫 Not a CRM — no pipeline, no sequences, no email sending.
- 🚫 Not an inbox/LinkedIn auto-sync — you log contacts deliberately, it never scrapes silently.
- 🚫 Not verified identity — attribution is honor-system (fine for a trusted team of 3).
- 🚫 Not a big-team tool — built for ~3 people sharing one Sheet.
- 🚫 Not a hosted SaaS — you deploy your own copy.
- 🚫 Not magic extraction — site layouts change; a wrong field is one edit away in the confirm card.

## 💪 Why this exists

Three people cold-approaching prospects on LinkedIn/email/Reddit eventually
double-touch the same person — which looks sloppy and burns the lead. Spreadsheets
shared by hand don't warn you *at the moment you're about to message someone*.

| Alternative | Why it didn't cut it |
|---|---|
| A shared Google Sheet | No warning while you're on the profile; everyone forgets to check. |
| A CRM (HubSpot, etc.) | Overkill, costs money, nobody logs cold DMs into it. |
| A Notion database | Same "remember to check first" problem; no on-page badge. |

I wanted a red flag *on the LinkedIn page itself*, backed by a Sheet I still own. So I built it.

## 👥 Who this is for

✅ **Use this if you:**
- 🤝 Are a small team (2–5) splitting cold outreach.
- 🔗 Reach out across LinkedIn, email, and/or Reddit.
- 📋 Want the data in a plain Google Sheet you control.
- 🧰 Can paste code into Apps Script and load an unpacked extension.

❌ **Don't use this if you:**
- 🏢 Need real auth/permissions for a big org.
- 🔄 Want automatic inbox/LinkedIn syncing.
- 🧑‍💼 Already live inside a real CRM.
- 📱 Need a polished installable app from a store.

## 🔧 Tech stack

| Layer | Tech |
|---|---|
| Storage | Google Sheet |
| Backend + web UI host | Google Apps Script |
| Browser client | Chrome extension (Manifest V3) |
| Dedup engine | Plain JS (shared by extension + backend) |
| Auth | Shared team API key + locally-chosen name |

## ⚠️ Requirements

| Requirement | Why | How to verify |
|---|---|---|
| A Google account | Hosts the Sheet + Apps Script | Can you open sheets.new? |
| Chrome (or Chromium) | Loads the extension | `chrome://extensions` opens |
| ~15 min one-time setup | Deploy script, load extension | Follow [USAGE.md](USAGE.md) |
| Node (optional) | Run the matcher tests | `node extension/matcher.test.js` |

## 🧠 How it works under the hood

**Big picture**
```
LinkedIn/Reddit/Gmail page
        │  content script extracts identifier + name + company
        ▼
  shared dedup engine ──reads── local cache of the log (synced every ~4 min)
        │  match? → on-page badge 🟢/🔴
        ▼ (only on "Save")
  Apps Script API ──appends row──► Google Sheet  ◄── web app (search/stats/settings)
```

**In one paragraph**
The extension keeps a local copy of the shared log and dedupes *on your machine*,
so the badge is instant and nearly free. It only calls the backend to write a new
approach or pull fresh data. The Apps Script backend is a thin gate over one Google
Sheet and also serves a small web dashboard for searching, stats, and tuning the
matching rules — which sync back to every extension.

**Why this architecture works**
- 🗃️ One Sheet, not a database to run or pay for.
- ⚡ Dedup runs locally against a cached log → instant badge, minimal API calls.
- 🧩 One matching engine shared by extension and backend → strictness is identical everywhere.
- 🔧 Layout breakage degrades to manual entry, never to a broken tool.

**Things you can configure** (Settings tab)
```
email_strip_plus     = on    # jane+sales@x.com → jane@x.com
linkedin_slug_only   = on    # ignore url tracking junk
fuzzy_name_company   = off   # warn on same name+company w/o shared id
fuzzy_threshold      = 0.85  # lower = looser
```

## 📖 More

- **[USAGE.md](USAGE.md)** — full setup + daily use + troubleshooting.
- **[Design spec](docs/superpowers/specs/2026-06-01-dedupmanager-design.md)** — architecture & decisions.

## 🚧 Status

Working v0.1: backend, web app, and extension all built; dedup engine unit-tested.
Roadmap: optional verified Google sign-in, more source sites. Built for one team —
fork it for yours.
