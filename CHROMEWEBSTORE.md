# Chrome Web Store Listing — Holdpad

> Last Updated: 2026-10-29

The listing copy for every language lives in [`store/`](store/README.md); the image and video files are in
[`store/assets/`](store/assets/README.md). This file is the single place for what the Developer Dashboard asks
beyond that: the single purpose, a justification for every permission, the privacy disclosures and the
pre-publish checklist. Keep it in step with `src/public/manifest.json`.

## Store Listing

**Extension Name** — Holdpad – Quick Notes & Notepad for Any Page (44/75; `extStoreName`)

**Short Description** — Take quick notes in a side panel on any page. Save selected text and links, search it all. Private, offline, no sign-up. (120/132; `extDescription`)

**Detailed Description** — see [`store/en.md`](store/en.md) (and one file per other language).

Features added since the copy was written, to add to the "What you can do" list:
- Search forgives accents and a one-letter typo, and ranks tag and title matches first.
- Filter to the notes saved from one website.
- A "Check it yourself" section in Settings that shows the permissions Chrome has granted and whether the extension's network block is in place.

**Category** — Productivity

**Single Purpose** — Lets you write quick notes in a panel beside any web page, and save selected text, links and pages from the page into them.

**Primary Language** — English (plus German, Spanish, French, Hindi, Indonesian, Japanese and Brazilian Portuguese)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store icon | 128×128 PNG | ✅ Ready | `store/assets/store-icon-128.png` |
| Screenshots 1–5 | 1280×800 | 🟡 Needs update | `store/assets/screenshots/light/` — re-capture to show the site chip and the first-run card |
| Small promo tile | 440×280 | ✅ Ready | `store/assets/promo-tile-440x280.png` |
| Marquee promo tile | 1400×560 | ✅ Ready | `store/assets/marquee-1400x560.png` |
| Promo video | 1280×800, 31 s | ✅ Ready | `store/assets/demo-video.mp4` (upload to YouTube, paste the link) |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves the user's notes, an unfinished draft and their settings on their own device. Nothing is sent anywhere. |
| `sidePanel` | permissions | Shows the notes panel in Chrome's side panel on pages where it cannot be drawn over the page itself (Chrome's own pages, the Web Store). |
| `contextMenus` | permissions | Adds the right-click items "Save selection to Holdpad", "Save link to Holdpad" and "Save this page to Holdpad". |
| `activeTab` | permissions | When the user clicks the toolbar icon, presses the keyboard shortcut or uses a right-click item, lets Holdpad show its panel on that one page and read the text they selected. It grants no access to any other page, and none until the user acts. |
| `scripting` | permissions | Used only together with `activeTab`: puts the notes panel on the page the user clicked from, and reads the selected text (with its links, bold and lists) for "Save selection". It runs nothing on pages the user has not acted on. |
| `<all_urls>` | optional_host_permissions | **Optional and off by default.** Requested only if the user turns on the "quick-open button" in Settings, so a small button can be drawn in the corner of each page. It reads no page content. It is released when the button is turned off. |
| `commands` (`Alt+Shift+N`) | manifest key | Keyboard shortcut to open the notes panel. The user can change it at `chrome://extensions/shortcuts`. |
| `web_accessible_resources` | manifest key | The notes panel is an extension page shown in a frame over the web page, and the small icon on the quick-open button. Its address changes every browser session (`use_dynamic_url`), so a web page cannot load or detect it. |

No `host_permissions` are declared. There is no `tabs`, `history`, `cookies`, `identity` or network-related permission.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No data leaves the device. Holdpad stores, on the user's own computer only, the notes the user writes or chooses to save, including (for saved selections, links and pages) the address and title of the page they came from.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No — page addresses are stored only for notes the user explicitly saves | No | Shows where a saved note came from | No |
| User activity | No | No | — | No |
| Website content | Only text the user selects and chooses to save, stored locally | No | The note the user asked for | No |

The extension's own security policy sets `connect-src 'none'`, so it cannot make network requests at all. The Dashboard disclosure should be answered consistently with that: nothing is transmitted.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** — https://holdpad.vercel.app/privacy.html (source: [`docs/privacy.html`](docs/privacy.html)). Confirm it is live and matches the table above before submitting.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** — _fill in the name on the developer account_

**Contact Email** — chalapatikrishna@gmail.com (shown publicly; Google sends policy notices here)

**Support** — the same email, and the "Send feedback" button in Settings

**Homepage URL** — https://holdpad.vercel.app/

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-29 (build), not yet submitted | First release: quick notes in a side panel or in-page overlay, selection / link / page capture, search, tags, Trash with undo, backup and Markdown export, 8 languages. Includes ranked search, per-site filter, first-run tips and the Settings "Check it yourself" section. | Draft |

## Review Notes

### Known Issues / Limitations
- Everything is stored on one device. There is no sync, and uninstalling the extension deletes the notes unless the user exported a backup. The Settings page and the listing both say so.
- The extension is disabled in Incognito windows (`"incognito": "not_allowed"`).
- `minimum_chrome_version` is 141.
- Reviewers may ask why `scripting` is present without host permissions: it is used with `activeTab` only (see above).

### Rejection History
None yet.

## Pre-publish checklist

Run through [`.claude/skills/chrome-extensions/references/webstore/review-checklist.md`](.claude/skills/chrome-extensions/references/webstore/review-checklist.md), and also:

- [ ] `npm run verify` passes (build, unit tests, e2e)
- [ ] Manual site checks in [`e2e/manual-checks.md`](e2e/manual-checks.md) done on real sites
- [ ] Native-speaker review of the non-English strings and listing files
- [ ] Screenshots re-captured to match the current UI
- [ ] Trademark and domain check on the name "Holdpad"
- [ ] ZIP built from `dist/` only — no source maps, no `CHROMEWEBSTORE.md`, no `node_modules`
