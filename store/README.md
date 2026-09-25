# Chrome Web Store listing — Holdpad

One file per language: `en.md`, `de.md`, `es.md`, `fr.md`, `hi.md`, `id.md`,
`ja.md`, `pt_BR.md`. Each has the title, summary and description for that
language's listing.

The **title** and **summary** come from the extension itself
(`extStoreName` and `extDescription` in `src/public/_locales/*/messages.json`),
so the Store picks them up from the uploaded zip. Only the **description** is
pasted into the dashboard: *Store listing → Language → Description*.

Everything except English was drafted by Claude and has **not** been reviewed
by native speakers. Get each one checked before that language goes live.

## Why the listing reads the way it does

The Store's own guidance: ranking weighs the item name, how relevant the
description is, popularity (installs, weekly users, ratings) and user experience
([Google](https://support.google.com/chrome_webstore/answer/12225786),
[best listing](https://developer.chrome.com/docs/webstore/best-listing)).
Repeating keywords to game search is a policy violation and can get a listing
suspended, so every term appears where it describes a real feature.

| Search term | Title | Summary | Description |
|---|---|---|---|
| quick notes | ✓ | ✓ | ✓ |
| notepad | ✓ | | ✓ |
| notes (any page / web page) | ✓ | ✓ | ✓ |
| side panel | | ✓ | |
| save selected text / web clipper | | ✓ | ✓ |
| offline, private, no sign-up / no account | | ✓ | ✓ |
| scratchpad, checklist, Markdown, export | | | ✓ |

The brand "Holdpad" carries no search weight on its own. The words after the
dash do the work. It was picked because it is unique: *Napkin* was dropped
because a side-panel notes extension called *Napkin Notes* already exists and
napkin.one / napkin.ai own the word in Google.

## Dashboard checklist

- [ ] Category: **Productivity → Tools**
- [ ] Screenshots: 1280×800, from `npm run e2e -- store` (`e2e/screenshots/store/`). Upload 5.
- [ ] Small promo tile 440×280 (needed to be featured)
- [ ] Privacy policy URL → `docs/privacy.html` once hosted
- [ ] Support email / site → replace `SUPPORT_EMAIL` in `docs/`
- [ ] Homepage URL → the `docs/` site
- [ ] Privacy practices tab: "does not collect user data"; justify each permission with the table in `docs/privacy.html`
- [ ] Verify the publisher domain (for the verified-publisher badge)

## Ranking beyond the words

The listing only makes Holdpad *eligible* to rank. Where it lands depends on
usage: weekly active users, ratings, and a low uninstall rate. What moves those:

1. **First reviews.** Ask a few real users to rate it in the first week. A
   listing with ratings outranks one without, and it can't be faked (policy).
2. **Keep updating.** Listings updated recently rank better than stale ones.
3. **Onboarding** (ROADMAP 0.4). Someone who saves a first note in the first
   minute stays installed.
4. **Links from outside.** The `docs/` site, a Product Hunt launch, a short
   post on Reddit (r/chrome_extensions, r/productivity) or dev.to. Each is a
   backlink to the listing, and Google ranks listing pages like any other page.
