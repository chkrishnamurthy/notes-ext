# Holdpad — Feature Roadmap and Growth Plan

**Written:** 23 September 2026 · **Updated:** 24 September 2026
**Status:** Proposal. Items marked **Shipped** are built; everything else is uncommitted.
**Companion docs:** [`PRODUCT_RESEARCH_AND_PLAN.md`](PRODUCT_RESEARCH_AND_PLAN.md) (the original product plan), [`README.md`](README.md) (how the code is built)

---

## How to use this document

Each feature below is written so you can pick it up cold, months from now, without
remembering this conversation. Every entry has:

- **What** — the feature in one or two sentences
- **Why** — the evidence for it, not an opinion
- **Effort** — S (1–2 days), M (3–7 days), L (2+ weeks)
- **Permissions** — whether it costs you a new Chrome permission warning
- **Touches** — the files you will actually be editing
- **Done when** — how you know it is finished

Work top to bottom. The order is deliberate: Phase 0 before Phase 1, and all of
Phase 1 before any of Phase 2.

---

## The two rules that govern everything here

### Rule 1: Retention beats features

The category does not lose users because extensions lack features. It loses them
because saving fails, sync breaks, or notes vanish. Review samples across Note
Sidebar, Note Anywhere and Note Board all contain lost-work complaints.

> "Fixing 15% monthly churn is almost always worth more than improving conversion
> from 2% to 3%."

Reliability is the wedge. **No feature on this list may endanger it.** If a feature
would make a failed save more likely, or make it harder to explain where notes
live, it does not ship.

### Rule 2: Your permission set is a conversion asset

Right now the extension asks for `storage`, `sidePanel`, `contextMenus`,
`activeTab` and `scripting`. `scripting` injects the overlay and the selection
reader into the tab you clicked, under `activeTab`; it is not a host permission
and adds no install warning. There are no host permissions and no content script
in the manifest. The quick-open button needs `<all_urls>`, but only as an
*optional* permission requested when the user switches it on, so the install
prompt is unaffected. That means Chrome does **not** show the alarming *"Read and
change all your data on all websites"* warning at install.

Every Phase 2 feature costs you that. Phase 1 costs you nothing. That is why the
order is what it is.

---

## Phase 0 — The store listing (do this first)

Nothing else on this page matters until this is done.

### Why this is first

An analysis of 120,000 Chrome Web Store listings found the ranking model is
**tiered**:

- **Keyword relevance** across title + summary + description decides *which tier*
  you can compete in.
- **Weekly users, ratings and reviews** only decide your position *within* that
  tier.
- **Badges** ("Featured", "Verified Publisher") matter far less than developers
  assume.

A test extension with 8 users ranked #15 for its keyword, then #3 within days
after relevance fixes alone — with no change in user count.

### The market you are entering

| Chrome Web Store, 2026 | |
|---|---|
| Active extensions | 178,299 (+22.7% year on year) |
| New listings in Q1 2026 alone | 38,015 |
| Extensions with 100 users or fewer | **70.4%** |
| Median extension | **18 users** |
| Extensions above 10,000 users | 2.63% |

Listing is table stakes, not distribution.

### 0.1 — Decide the name

**Status:** decided 2026-09-25 — **Holdpad**. Store title: “Holdpad – Quick Notes & Notepad
for Any Page”. “Napkin” was dropped: *Napkin Notes • Side panel notes* already ships the
same idea on the Web Store, and napkin.one and napkin.ai own the word in search. A web
search found no notes product called Holdpad; USPTO / IP India and domains are still unchecked.

Shortlist, warm/concrete style, with room to grow as features are added:

| Name | Why | Risk |
|---|---|---|
| **Shoebox** | "The box of unsorted things" — your differentiator as a noun. Scales to clips, images, links. | Used by some photo apps |
| **Satchel** | A bag you carry. The only name whose metaphor *improves* when sync ships. | UK edtech company uses it |
| **Matchbook** | Most memorable. "Write it on whatever's to hand." | Amazon ran a discontinued "Kindle MatchBook" |
| **Napkin** | Warmest and most instantly understood. | **Napkin.ai is live and funded** — expect a fight |
| **Flyleaf** | The blank page bound beside the content. Most precise. | Likely free |
| **Slate** | Write on it, wipe it clean — names the emotional payoff. | Slate magazine, Slate.js |

Avoid outright: Post-it (3M), Nook (B&N), Nest (Google), Pocket (Mozilla),
Sidecar (Apple), Scratch (MIT), Thumbtack, Pinboard, Doodle.

**Before committing, check:** Chrome Web Store search, USPTO, IP India, and
`.com` / `.app` domains. None of the above have been verified.

### 0.2 — Write the listing for the tier you want

**Status:** drafted — title and summary in `_locales/*/messages.json`, full copy in `store/`.

**Effort:** S · **Permissions:** none · **Touches:** `src/public/manifest.json`, store listing

The name alone is invisible — nobody searches "Shoebox". Pair brand with keywords:

```
Shoebox — Sticky Notes, Notepad & Side Panel Notes
```

- Title, summary **and** description must all carry the target keywords.
- A descriptor is allowed; keyword *stuffing* violates policy. Keep it readable.
- Target terms worth owning: `sticky notes`, `notepad`, `side panel`, `scratchpad`,
  `quick notes`, `web clipper`, `offline notes`, `no account`.

**Done when:** title, summary and description share the same keyword set, and the
listing reads like a sentence a human wrote.

### 0.3 — Listing assets

**Effort:** S · **Permissions:** none

- 5 screenshots at 1280×800, showing real use, not an empty panel.
- A 30-second demo video (capture → search → clear → Undo).
- Privacy policy and support contact (required).
- Verify your publisher domain for the Established Publisher badge. Small ranking
  effect, but a meaningful trust signal on the listing itself.

### 0.4 — Onboarding walkthrough

**Effort:** M · **Permissions:** none · **Touches:** `src/sidepanel/`, new component

**Why:** the single highest-ROI item in this document. One developer cut first-week
uninstalls from **40% to 18%** by replacing a cold start with a 3-step walkthrough
showing one clear use case.

**Done when:** a first-time user reaches their first saved note without reading
anything longer than a sentence.

---

## Phase 1 — No new permissions (target: 0 → 1,000 users)

Everything here keeps the clean install prompt. Ship 3–5 of these before touching
Phase 2. Aim for a visible release every 6–10 weeks: only 30.8% of extensions
update within 90 days, so cadence alone puts you ahead of most.

### 1.1 — One optional tag per note

**Status: Shipped** (24 Sep 2026). Schema v4. Tag from the note's **Add tag**
action, click a tag to filter, and search matches tags. Tags survive export and
import, and are carried onto conflict copies. There is no tag picker in the
filter row yet; clicking a tag on a note is the only way to filter.

**What:** a single free-text tag, optional, never required at capture time.
**Why:** already identified in `PRODUCT_RESEARCH_AND_PLAN.md` §8 as the first
organisation feature worth adding *if retrieval tests justify it*. Cheapest
retrieval win that does not reintroduce filing.
**Effort:** M · **Permissions:** none
**Touches:** `src/lib/schema.ts` (schema v3 + migration), `src/lib/migrations.ts`,
`src/lib/search.ts`, `src/sidepanel/components/FilterBar.tsx`, `NoteItem.tsx`
**Done when:** a tag can be added after the fact, filtered on, searched, survives
export/import, and capture still needs zero decisions.

> Keep it to **one** tag. Multiple tags is a filing system, which is the thing this
> product exists to avoid.

### 1.2 — Copy and export as Markdown

**Status: Shipped** (24 Sep 2026). **Copy as Markdown** on each note, and
**Export as Markdown** in Settings (active notes only; Trash stays in the JSON
backup). Converter in `src/lib/markdown.ts`, not `richtext.ts`, with tests in
`tests/markdown.test.ts`.

**What:** per-note "Copy as Markdown", and a bulk Markdown export beside the
existing JSON backup.
**Why:** review samples show users want their notes *out* — into Obsidian, Notion,
or a document. Portability friction is one of the four named frustrations in the
original research (§4.1).
**Effort:** S · **Permissions:** none
**Touches:** `src/lib/richtext.ts` (add `htmlToMarkdown`), `src/lib/backup.ts`,
`src/options/Options.tsx`, `src/sidepanel/components/NoteItem.tsx`
**Done when:** headings, lists, code blocks, links and checklists all round-trip
into valid Markdown, with a test in `tests/richtext.test.ts`.

### 1.3 — Command palette

**What:** extend `Cmd/Ctrl+K` from "focus search" into search → jump → act
(open, pin, copy, clear) without touching the mouse.
**Why:** cheap, and the kind of thing power users tell other people about.
**Effort:** M · **Permissions:** none
**Touches:** `src/sidepanel/App.tsx`, new `components/CommandPalette.tsx`
**Done when:** every action available by mouse is reachable by keyboard, and
Escape still peels back one layer at a time.

### 1.4 — Note templates

**What:** a small set of starting points — meeting notes, bug reproduction,
comparison table, daily log — inserted into the editor.
**Why:** high perceived value, near-zero risk, and it shows off the rich text
editor you already have.
**Effort:** S · **Permissions:** none
**Touches:** `src/sidepanel/components/NoteEditor.tsx`, new `lib/templates.ts`
**Done when:** a template can be inserted at the cursor and the user can add
their own.

### 1.5 — Links between notes

**What:** `[[note title]]` creates a link to another note; clicking opens it.
**Why:** no new permissions, and it appeals directly to the Obsidian/Roam audience
who are already comfortable installing note tooling.
**Effort:** M · **Permissions:** none
**Touches:** `src/lib/richtext.ts` (allowlist an internal link form),
`src/sidepanel/components/NoteEditor.tsx` (TipTap extension)
**Done when:** links survive the sanitizer, export, and import — and a link to a
deleted note fails gracefully instead of throwing.

### 1.6 — Import from other tools

**What:** import plain text, Markdown, and a Google Keep Takeout export.
**Why:** removes the switching cost that keeps people on the incumbent. Your
import path is already validated and tested — this is mostly a parser.
**Effort:** M · **Permissions:** none
**Touches:** `src/lib/backup.ts`, `src/options/Options.tsx`
**Done when:** a Keep Takeout zip produces notes with their original timestamps,
and malformed input is reported rather than half-imported.

### 1.7 — Localisation

**Status: UI shipped** (24 Sep 2026); **store listing not done**. `chrome.i18n`
drives every string, including the manifest name, description and context
menus, in `src/public/_locales/` for en, hi, es, pt_BR, de, fr, id and ja. The
translations are machine drafts, **not reviewed by native speakers**, and need
checking before launch. The Web Store listing itself (0.2) still needs writing
and translating; that is where the ranking benefit comes from.

**What:** translate the UI and the store listing into 5–8 languages.
**Why:** **the cheapest ranking lever that exists.** Each translation is a separate
search surface in that locale's store — another entry point to the same extension.
**Effort:** M · **Permissions:** none
**Touches:** new `src/_locales/`, every user-facing string
**Suggested first set:** Hindi, Spanish, Portuguese (BR), German, French,
Indonesian, Japanese.
**Done when:** `chrome.i18n` drives every string and the store listing is
translated too — the listing matters more than the UI for discovery.

### 1.8 — Sort and filter the list

**What:** sort by created/updated, filter by source type (thought, selection,
link, page).
**Why:** flagged in the original plan §8 as useful "when note volume makes them
useful". Cheap now that the list has two layouts.
**Effort:** S · **Permissions:** none
**Touches:** `src/sidepanel/components/FilterBar.tsx`, `App.tsx`

### 1.9 — Automatic backup reminder

**What:** if it has been N days since the last export and there are more than M
notes, offer a one-click backup in the status bar.
**Why:** uninstalling Chrome or the extension deletes everything. This directly
serves the trust promise, and it is the kind of care users mention in reviews.
**Effort:** S · **Permissions:** none
**Touches:** `src/sidepanel/App.tsx`, `src/lib/schema.ts` (settings)

---

## Phase 2 — New surfaces, new permissions (reach)

These unlock the big category keywords, but **each one costs you the clean install
prompt**. Do not start here. Weigh each honestly against Rule 2.

### 2.1 — YouTube timestamped notes

**What:** notes attached to a timestamp in a YouTube video; clicking seeks there.
**Why:** **the best value for money in this phase.** It needs a host permission for
*one domain*, not `<all_urls>` — so the install warning stays narrow. It reaches a
distinct audience (students, course-takers) with its own search keywords, and
several extensions sustain themselves on this feature alone.
**Effort:** M · **Permissions:** `+ host permission for youtube.com` (narrow)
**Touches:** new content script, `src/lib/schema.ts` (timestamp field),
`src/public/manifest.json`

### 2.2 — Highlight and annotate web pages

**What:** select text on any page, highlight it, and have the highlight reappear
on the next visit.
**Why:** "highlight" is a top keyword in this category — Web Highlights sits around
200,000 users at 4.83 stars. Large, proven demand.
**Effort:** L · **Permissions:** `+ <all_urls>` content script — **the expensive one**
**Cost:** install-time conversion drops once Chrome shows the all-sites warning.
Measure before and after.

### 2.3 — Per-site sticky notes

**What:** notes pinned to a specific URL that reappear when you return.
**Why:** "sticky notes" is *the* search term in this category. Note Board (~8K
ratings, 4.8) and Note Anywhere (~1.8K ratings) both live here.
**Effort:** L · **Permissions:** `+ <all_urls>` (same cost as 2.2; ship together)

### 2.4 — Screenshot and region capture

**What:** capture a region of the page into a note.
**Why:** frequently requested in review samples. Explicitly excluded from the MVP
in the original plan §8.2 — revisit only if users ask twice.
**Effort:** M · **Permissions:** `+ activeTab` capture; storage cost is significant
**Caution:** images will consume the 10 MB `chrome.storage.local` quota fast. This
forces `unlimitedStorage` or a different storage backend. Plan that first.

### 2.5 — PDF annotation

**What:** notes and highlights on PDFs opened in Chrome.
**Why:** students and researchers are your stated target audience (§5.1).
**Effort:** L · **Permissions:** `+ file:// access` (an extra user opt-in)

---

## Phase 3 — Sync, mobile, and the paid tier

This is the most-requested feature in the category **and** the most-complained-about
one. Review samples across competitors describe sync that is slow, buggy, creates
duplicate entries, or "doesn't work at all", plus repeated re-authentication on
mobile.

**The strategic read:** sync is simultaneously your biggest growth unlock and your
biggest reputational risk. Shipping it badly is worse than not shipping it, because
your entire differentiator is *it never loses your notes*.

`PRODUCT_RESEARCH_AND_PLAN.md` §9.8 already treats sync as a separate project with
its own design requirements. The research supports that judgement completely.
**Re-read §9.8 before starting.**

### 3.1 — Cross-device sync

**Effort:** L (months, not weeks) · **Permissions:** `+ identity`, `+ host permission for your API`

Non-negotiables from §9.8:
- Local writes first, with an offline upload queue
- Explicit upload/merge choice when connecting a second device
- Conflict copies, deletion tombstones, recovery
- Clear device status, account export, account deletion
- A deliberate encryption and key-recovery design **before** promising E2E

**Do not** use `chrome.storage.sync` as the note database: its quota is ~100 KB
total and 8 KB per item.

### 3.2 — Web and mobile access

**Why:** the second-most-requested thing in review samples — "I can't get my notes
on my phone."
**Effort:** L. This is a second product, not a feature.

### 3.3 — Version history

**Why:** a natural paid-tier feature, and a direct extension of the revision
counter already in `src/lib/schema.ts`.
**Effort:** M

### 3.4 — Shared notes

**Why:** only if users ask twice. Collaboration turns a scratchpad into a different
product, where Notion already wins.

---

## What not to build

From `PRODUCT_RESEARCH_AND_PLAN.md` §8.2, still correct:

Boards · nested folders · collaboration (until 3.4) · AI summaries · OCR ·
calendars · automatic clipboard history · an embedded code editor

Every one of these turns a scratchpad into a notes app, competing directly with
Notion and Obsidian on their terms. **The reason to install this extension is that
it does less, faster, without an account.** Protect that.

Also still correct: **no automatic expiration of active notes.** If it is ever
added, it must be opt-in and must move notes to Trash, never delete them.

---

## Growth playbook

Ranked by what the evidence supports, not by effort.

1. **Fix the listing** (Phase 0). Everything below multiplies this number. Doing it
   last wastes everything above it.
2. **Communities where your users already are** — r/productivity,
   r/chrome_extensions, r/ObsidianMD, student and developer Discords. Participate
   honestly; share the problem and how you solved it. Do not drop links.
3. **Small newsletters.** They "punch above their weight" — far better return than
   chasing large tech press.
4. **Content marketing** — "how I keep research notes while browsing", comparisons
   against Google Keep and Notion Web Clipper. These rank for the same keywords
   your listing targets.
5. **Partnerships** with complementary tools, to borrow an existing audience.
6. **Paid ads — last.** *"Paid traffic magnifies whatever your listing already does.
   If your value proposition, screenshots and social proof are not converting
   organic visitors yet, ads will just buy you expensive bounces."*

### Realistic timelines

Self-reported by indie developers, so directional only:

| Milestone | Typical time |
|---|---|
| 1,000–5,000 active users | 6–12 months |
| 5,000–20,000 active users | 12–18 months |
| 20,000+ engaged users | multi-year |

Freemium converts at **2–5%** of active users. A paywall hit *mid-task*, when a
user runs into a limit, converts an estimated 3–5× better than a prompt at install.

---

## What to measure

Before adding anything, know these four numbers:

1. **First-week uninstall rate** — the single best signal of product-market fit.
   The 40% → 18% case study above is the benchmark to beat.
2. **View-to-install conversion** on the listing — tells you whether Phase 0 worked.
3. **Weekly active / total installed** — tells you whether people keep using it.
4. **Notes created per active user per week** — tells you whether the core loop
   works at all.

If (1) and (4) are bad, **no feature on this page will help.** Fix those first.

---

## Evidence and limitations

Read this section before treating any number above as fact.

- Store statistics and the 120,000-listing ranking analysis are **third-party**, not
  Google's own published data.
- Revenue figures, conversion rates and timelines are **self-reported** by indie
  developers on Reddit, Indie Hackers and Starter Story. Directional only.
- Feature requests are drawn from **review samples**, not surveys. They show what
  people complain about loudly, not how many people want each thing.
- Competitor user counts and ratings are snapshots and will drift.
- **No name on this page has been checked** against the Chrome Web Store, any
  trademark register, or domain availability.
- Ranking factor weights are inferred from correlation, not published by Google.

### Sources

- [Discovery on the Chrome Web Store](https://developer.chrome.com/docs/webstore/discovery) — Google's own guidance
- [Chrome Web Store ranking patterns across 120K listings](https://extensionranker.com/blog/chrome-web-store-ranking-patterns)
- [Chrome extension statistics 2026](https://konabayev.com/blog/chrome-extension-statistics-2026/)
- [Marketing your extension: first 1,000 users](https://www.extensionfast.com/blog/marketing-your-chrome-extension-how-to-get-your-first-1000-users)
- [Growing 0 → 1,000 users in 2026](https://dev.to/quangpl/the-complete-guide-to-growing-your-chrome-extension-from-0-to-1000-users-in-2026-3hn6)
- [Chrome extension revenue benchmarks](https://chromegoldmine.com/blog/chrome-extension-monetization/chrome-extension-revenue-benchmarks/)
- [Side Panel API reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Best note-taking Chrome extensions 2026](https://www.recall.it/compare/best-note-taking-chrome-extensions)

---

## Suggested order of work

If you do nothing else, do these six, in this order:

- [ ] **0.1** Pick and clear the name
- [ ] **0.2** Rewrite the listing for keyword relevance
- [ ] **0.4** Onboarding walkthrough
- [x] **1.7** Localisation (5–8 languages) — UI done; translations need native review, listing still to do
- [x] **1.2** Markdown export
- [x] **1.1** One optional tag

Then measure first-week uninstalls and notes-per-user before choosing anything
from Phase 2.
