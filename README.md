# DedupManager

**Stop two teammates from cold-DMing the same person.** You open a LinkedIn
profile and a badge says: 🔴 *"Vedant already messaged this person on Apr 12 —
replied."* That's the whole product.

A shared outreach dedup ledger for a small team, running on **one Google Sheet +
a Chrome extension**. No server, no database, no monthly bill.

## ✨ What this is

- 🧑 **One record per person** — name, phone, LinkedIn, email (and Reddit) on a single row; reach them by any channel.
- 🟢 **Live dedup while you browse** — auto-detects who you're viewing on LinkedIn, Reddit, and Gmail and matches on **any** identifier instantly.
- 🔗 **Auto-merge** — found someone's email after you'd logged their LinkedIn? Saving merges it into their existing record and keeps the original owner.
- 🏷️ **Configurable stages** — `New → Contacted → Replied → Meeting → Won`, editable; track status per person.
- ➕ **Your own columns** — add call notes, insights, stage detail directly in the Sheet; the app **preserves** them and shows them read-only.
- 🎚️ **Tweakable matching** — dial strictness (phone country-code, email +tags, LinkedIn url noise, fuzzy name+company) from Settings, no code.
- 👤 **Attribution** — who first added each person, who last updated, and when.
- 📄 **Data is just a Google Sheet** — open it, sort it, export it, add columns. $0, serverless.

## ❌ What this isn't

- 🚫 Not a heavy CRM — no pipeline automation, sequences, or email sending; stages + notes + your own columns, that's it.
- 🚫 Not an inbox/LinkedIn auto-sync — you log people deliberately, it never scrapes silently.
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
| Node + clasp (host only) | One-command backend deploy | `npm i -g @google/clasp && clasp login` |
| ~5 min one-time setup | `./deploy.sh`, then teammates paste one config string | Follow [USAGE.md](USAGE.md) |

## 🧠 How it works under the hood

**Big picture**
```
LinkedIn/Reddit/Gmail page
        │  content script extracts name + company + identifiers (phone/linkedin/email)
        ▼
  shared dedup engine ──reads── local cache of people (synced every ~4 min)
        │  matches on ANY identifier → on-page badge 🟢/🔴 + existing record
        ▼ (only on "Save")
  Apps Script API ──upsert (merge)──► Google Sheet  ◄── dashboard (check/people/stats/settings)
                                       (your custom columns preserved)
```

**In one paragraph**
The extension keeps a local copy of the shared people list and dedupes *on your
machine*, so the badge is instant and nearly free. On save it calls the backend,
which **upserts** — if the person already exists under any identifier it merges
the new fields into their row (filling blanks, updating status, keeping the
original owner) instead of creating a duplicate. The backend is a thin gate over
one Google Sheet and serves a dashboard for searching, stats, and tuning the
matching rules; any columns you add in the Sheet are left untouched.

**Why this architecture works**
- 🗃️ One Sheet, not a database to run or pay for — and you can add CRM columns to it freely.
- ⚡ Dedup runs locally against a cached list → instant badge, minimal API calls.
- 🧩 One matching engine shared by extension and backend → strictness is identical everywhere.
- 🔗 Header-driven upsert merges on any identifier and never reorders or drops your columns.
- 🔧 Layout breakage degrades to manual entry, never to a broken tool.

**Things you can configure** (Settings tab)
```
stages               = New,Contacted,Replied,Meeting,Won,Lost
phone_match_last10   = on    # ignore country code (compare last 10 digits)
linkedin_slug_only   = on    # ignore url tracking junk
fuzzy_name_company   = off   # also merge same name+company w/o a shared identifier
fuzzy_threshold      = 0.85  # lower = looser
```

> **One thing to know:** two records merge only when they **share an identifier**
> (or fuzzy name+company is on). If you log someone by LinkedIn and a teammate
> has only their email with nothing else in common, they stay two rows until a
> shared identifier links them — turn on *fuzzy name+company* to also merge on a
> matching name+company.

## 📖 More

- **[USAGE.md](USAGE.md)** — full setup + daily use + troubleshooting.
- **[Design spec](docs/superpowers/specs/2026-06-01-dedupmanager-design.md)** — architecture & decisions.

## 🚧 Status

Working v0.1: backend, web app, and extension all built; dedup engine unit-tested.
Roadmap: optional verified Google sign-in, more source sites. Built for one team —
fork it for yours.
