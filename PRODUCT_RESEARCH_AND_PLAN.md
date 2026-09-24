# For Now — Chrome Extension Research and Product Plan

**Working name:** For Now (name availability has not been checked)  
**Research date:** 23 September 2026  
**Status:** Design proposal; awaiting feedback before implementation  
**Scope:** Research, product definition, visual mockups, and implementation planning  
**Implementation status:** No extension code has been written or modified.

## 1. Recommendation

Build a small, local-first Chrome side-panel extension for notes needed during the current task or the next few days.

The product promise:

> Capture without filing, find without remembering where, and clear without worrying about accidental loss.

This is an established category. The opportunity is a better everyday experience, not a unique feature combination. The product must demonstrate an advantage over existing tools through lower capture friction, dependable retrieval, and safer cleanup.

The working assumption is a **general-purpose extension with no account required**, rather than a developer-only product or a service requiring cross-device sync from day one. This assumption has not yet been explicitly confirmed by the user.

## 2. Research method and limitations

The research reviewed current Chrome Web Store listings, official product documentation, pricing pages, accessible individual reviews, and relevant browser features.

- This is desk research, not an installation audit or a timed usability benchmark.
- Store ratings and prices are snapshots and may change.
- Individual reviews are qualitative signals, not verified failure rates.
- Historical complaints may describe bugs that have since been fixed.
- Vendor-selected testimonials are identified as such.
- Official product claims establish advertised behavior, not independently verified reliability.
- Workflow assessments and proposed product decisions are distinguished from observed evidence.
- Where a current price could not be verified, it is marked as unavailable rather than inferred.

## 3. Competitor comparison

### 3.1 Established and relevant alternatives

| Alternative | Current pricing evidence | Capture → retrieval → cleanup | User feedback and product implications |
| --- | --- | --- | --- |
| **[Google Keep extension](https://chromewebstore.google.com/detail/google-keep-chrome-extens/lpcaedmchfhocbbapmcbpinfpgnhiddi)** | Free; Google account required. | Toolbar capture of pages; context-menu capture of selections/images. Labels and additional notes help retrieval. Subsequent management happens in Keep. | Store: **4.0/5, approximately 8K ratings**. Sampled reviews praise convenient text capture; others report image/text capture failures and authentication trouble, especially outside Chrome. [Review sample](https://extpose.com/ext/7863). |
| **[Note Board](https://chromewebstore.google.com/detail/note-board-sticky-notes-a/goficmpcgcnombioohjcgdhbaloknabb)** | Free installation and free registered sync advertised; no paid price established on reviewed official pages. | Sticky notes on pages, clipping, screenshots, boards, Kanban, reminders, and sharing. Strong visual organization. Assessment: choosing and maintaining boards adds decisions for a disposable thought. | Store: **4.8/5, approximately 8K ratings**. Recent reviews praise simplicity and daily usefulness; an isolated September 2026 review alleges note loss. Predominantly positive feedback argues against assuming all board products are frustrating. [Reviews](https://chrome-stats.com/d/goficmpcgcnombioohjcgdhbaloknabb/reviews). |
| **[Note Anywhere](https://chromewebstore.google.com/detail/note-anywhere/bohahkiiknkelflnjjlipnaeapefmjbh?hl=en)** | Free installation; paid pricing not disclosed in the listing reviewed. | Put notes directly on pages; they reappear on revisits. A summary page, CSV export, and batch deletion support management. The current listing advertises My Atoms sync. | Store: **3.9/5, approximately 1.8K ratings**. Users like contextual sticky notes. Individual 2026 reviews report failed creation, missing saves, and confusing URL association. The April release explicitly fixed idle-loading and batch-delete problems. [Reviews](https://chrome-stats.com/d/bohahkiiknkelflnjjlipnaeapefmjbh/reviews). |
| **[Note Sidebar](https://chromewebstore.google.com/detail/note-sidebar/emiochiflnnegkecnjndifbobmbepdne?hl=en-US)** | **Free/open source**, donations optional. [Official site](https://www.stefanvd.net/project/note-sidebar/browser-extension/). | Open beside the page and type; context menu appends selected text. Autosave, browser sync, formatting, configurable controls, and TXT export. Assessment: the experience centers on editing notes rather than processing a capture inbox. | Store: **4.4/5, 115 ratings**. Sampled 2025 reviews value quick thoughts and class notes; others describe lost notes, recovery shortcomings, and difficulty discovering options. These are historical reports, not verified current defects. [Reviews](https://chrome-stats.com/d/emiochiflnnegkecnjndifbobmbepdne/reviews). |
| **[Side Notepad](https://chromewebstore.google.com/detail/side-notepad-notes-note-t/jnajbdnopbhnfjjhkpichjdbfobeokjh)** | Free local version; Pro **$4.99/month, $10.99/quarter, or $39/year**, as listed. [Pricing/features](https://sidenotepad.com/en). | Side-panel editor, separate notes, rich text, offline use, and export. Pro adds cloud sync, web access, and full-text search. A particularly close competitor. | Store: **4.6/5, 38 ratings**. Vendor-selected testimonials praise staying beside the current page and avoiding accounts; requests concern width, positioning, and dark-mode readability. Treat curated testimonials cautiously. |
| **[Tab Notes — Maciej Szafraniec](https://chromewebstore.google.com/detail/tab-notes/mhgiefelomcdfcdbknkkohpibdpbdhmo)** | Free installation; no paid tier disclosed. | A different note in each new tab; local/offline, toolbar search, and JSON backup. Assessment: new-tab access is fast, but takes over a heavily used browser surface. | Store: **4.2/5, 73 ratings**. Reviews praise simplicity and using notes as task dividers. Repeated complaints concern address-bar focus; others request bulk deletion or clearer backup transfer. [Reviews](https://chrome-stats.com/d/mhgiefelomcdfcdbknkkohpibdpbdhmo/reviews). |
| **[Notion Web Clipper](https://chromewebstore.google.com/detail/notion-web-clipper/knheggckgoiihginacbkhaalnibhilkk)** | Free clipper; a free individual workspace is available. Paid workspace plans are optional. [Plans](https://www.notion.com/pricing). | Save a page into a chosen destination; retrieve and manage it in Notion. Assessment: useful when research already belongs in a project, with more organizational overhead for a temporary fragment. | Store: **3.3/5, 618 ratings**. March–June 2026 reviews report incomplete clipping and frustration at opening Notion to fill database properties. [Individual reviews](https://exthunter.com/extension/notion-web-clipper). |
| **[Raindrop.io](https://chromewebstore.google.com/detail/raindropio/ldgfbffkinooeloadekpmfoklnobpien)** | Free unlimited bookmarks, collections, and devices. Pro exists, but the live pricing page did not expose a numeric price during verification. [Official plans](https://raindrop.io/pro/buy). | Link capture, collections/tags, and retrieval across devices. Pro adds full-page-content search, archiving, and duplicate/broken-link cleanup. Assessment: less natural for an independent debugging thought. | Store: **4.1/5, 783 ratings**. Sampled older reviews praise cross-device organization; complaints include sign-in requirements and requests for undo. An old claim that export requires payment conflicts with today's official free-plan listing and should not be treated as current fact. [Reviews](https://chrome-stats.com/d/ldgfbffkinooeloadekpmfoklnobpien/reviews). |
| **[Obsidian Web Clipper](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf?hl=es)** | Clipper and core app free. Optional Sync: **US$4/user/month billed annually, or $5 monthly**. [Pricing](https://obsidian.md/pricing). | Highlights and selected content become durable Markdown in a vault; templates and hotkeys support repeat capture. Retrieval and cleanup move into Obsidian. | Store: **4.8/5, 561 ratings**. Local files and exportability are concrete strengths. Assessment: excellent for existing Obsidian users, but vault setup and permanent-note maintenance can be disproportionate for temporary needs. [Official features](https://obsidian.md/clipper). |

**Raindrop pricing caveat:** A February 2026 independent report lists Pro at **$2.99/month or $28/year**. Those amounts were not confirmed on the current official page, so they are indicative, not verified current pricing. [Independent report](https://mb.appaddict.app/2026/02/06/raindropio-gets-a-significant-new.html).

### 3.2 Related browser features and emerging competition

**Vivaldi Notes** already provides selected-text capture with source links, a notes panel, search, folders, Trash, and text/Markdown export. A side-panel notes workflow is therefore not new. [Vivaldi documentation](https://help.vivaldi.com/desktop/panels/notes/).

**Chrome Reading List** is a meaningful substitute for saving pages. Users can add a tab through its context menu and manage saved pages in a side panel. It solves “read this page later,” although it does not provide the mixed scratchpad proposed here. Desktop offline reading requires separately downloading the page. [Chrome documentation](https://support.google.com/chrome/answer/7343019?hl=eN).

**Scrawl** is a particularly relevant emerging competitor. Its July 2026 announcement describes window-specific Chrome side-panel notes that clear when the window closes, with five-minute recovery. The creator also describes selection capture, link cards, and text export. The announcement was verified, but its store listing could not be independently loaded during this research. It is evidence of a closely related concept, not established adoption or independently verified behavior. [Announcement](https://www.reddit.com/r/SideProject/comments/1urvlpo/gave_chrome_a_piece_of_scratch_paper_youre/).

## 4. Research findings and product hypotheses

### 4.1 Evidence-backed signals

Users value **proximity, simplicity, persistence, and ownership**. Positive feedback in the linked Tab Notes, Note Sidebar, and Side Notepad sources describes capturing something without switching applications or learning a system.

The most consequential frustrations in the sample are:

1. **Uncertain saving and recovery.** Complaints about lost work appear across several products. Visible save confirmation, recoverable deletion, and tested backup restoration deserve priority over formatting.
2. **Interference with browsing.** Tab Notes reviews repeatedly describe new-tab focus disrupting searches and URL entry.
3. **Extra work after capture.** Notion users describe another trip into the application to finish organizing a clip.
4. **Portability friction.** Some users value local storage; others struggle to transfer notes or expect access on another device.

These are qualitative patterns from the cited review samples, not estimates of complaint frequency or market size.

### 4.2 Hypotheses to validate

| Hypothesis | Why it is plausible | What remains unproven |
| --- | --- | --- |
| A dedicated home for short-lived information is useful. | Existing scratchpad workflows and Scrawl's positioning demonstrate interest in temporary notes. | Whether enough people prefer another extension to their existing setup. |
| One inbox plus search and pins is sufficient initially. | Users praise simple tools and dislike organizational overhead. | The note volume at which folders or tags become necessary. |
| Recoverable manual cleanup is safer than automatic expiration. | Lost-work complaints make unexpected deletion risky. | Whether users will actually clear notes without reminders or automation. |
| A local-first launch can succeed without sync. | Several alternatives offer useful local workflows without accounts. | How many intended users need mobile or second-computer access immediately. |
| Hosted sync could become a paid feature. | Paid sync exists in nearby products. | Willingness to pay for this specific product and its support costs. |

Automatic expiration, complex organization, and willingness to pay are **not established requirements**.

## 5. Target user and product concept

### 5.1 Initial target

Target people completing a browser-based task across several tabs, especially students and researchers gathering fragments for an assignment, comparison, or explanation.

Developers fit the same behavior when collecting reproduction steps, snippets, and debugging observations. Everyday comparison shopping or travel planning also fits. The interface should use familiar note-taking language, with code handling available when needed.

### 5.2 Main job

> Keep this close while I work. Let me find or reuse it quickly, then clear it when I’m finished.

Hold separate, lightweight notes in one inbox. Capturing should never require a title, folder, tag, account, or expiration date.

### 5.3 Why choose this product?

| Existing option | Proposed reason to choose For Now | When the existing option remains better |
| --- | --- | --- |
| Bookmarks / Reading List | Keep thoughts, quotations, and snippets alongside links. | Saving only pages for later reading. |
| A full notes app | Capture and retrieve beside the current webpage with fewer context changes. | Long-form writing, a permanent knowledge base, or collaboration. |
| Another notes extension | Dependable saving, source context, free local search, and recoverable cleanup in a small interface. | The user already has a satisfying workflow with an incumbent. |

These advantages are proposed positioning, not measured superiority. Users satisfied with Keep, Obsidian, or Side Notepad may have little reason to switch.

## 6. Everyday workflows

| Task | Proposed workflow |
| --- | --- |
| Save selected text | Select a passage → right-click **Save selection to For Now** → save immediately with its source URL. Show confirmation in the panel. |
| Save a link | Right-click a link → **Save link to For Now**. Capture the target URL separately from the page it came from. |
| Capture a quick thought | Open from the toolbar or shortcut → type → **Ctrl/Cmd+Enter** adds the note. An unfinished draft survives closing the panel. |
| Keep a temporary code snippet | Paste → choose **Code snippet** if desired. Preserve whitespace, display monospace text, and copy the exact text later. Do not execute code. |
| Find something later | Open the panel → search a word from the body, source title, or URL → inspect the matched snippet → copy, edit, or reopen the source. |
| Finish a task | Copy useful material into a permanent document → clear individual notes or all unpinned notes → use Undo if needed. |

## 7. Visual mockups and experience design

### 7.1 Existing interactive design artifact

[Open the For Now mockup source](</Users/krishna/.codex/visualizations/2026/09/23/01a0ce58-a71c-7000-aea5-986cc0c0e01e/for-now-mockups.html>)

The interactive preview is embedded in the preceding design response in this Codex task. The link above points to the local HTML fragment used by that preview; it is not a packaged extension or a standalone hosted website. The absolute path is specific to this workspace and will not travel with this Markdown file if the document is shared elsewhere.

The preview contains these screens and states:

| Screen | Purpose | Main interactions |
| --- | --- | --- |
| Main notes | Show a single-column inbox with pins, source context, recency, and code examples. | Edit, copy, pin/unpin, clear, open source, and bulk clear. |
| Open from browser | Show how the extension opens alongside the current page. | Toolbar button; selection-capture example. |
| Quick capture | Show a focused composer for an unfinished thought. | Add note; select plain text or code presentation. |
| Search and retrieval | Show matching notes with highlighted terms. | Search note text and sources; clear the query; reuse a result. |
| Empty state | Explain the two main entry points without a long onboarding tour. | Write a first note or capture selected text. |
| Save failure | Preserve the draft and clearly distinguish failure from a successful save. | Retry save or copy the draft. |
| Trash / recovery | Make clearing reversible. | Undo immediately or restore from Trash. |

**Suggested walkthrough:** choose **Quick capture**, select **Add note**, search for “study,” clear the result, then select **Undo**.

The prototype uses sample data and simulated save states. Clipboard, source-opening, and backup controls do not access real user data. It does not validate Chrome extension APIs or storage reliability.

Prototype verification completed: capture → search → clear → Undo, empty state, failed-save retry, and a narrow layout inspection. These checks concern the design artifact only.

### 7.2 Surface recommendation

Use a **native side panel plus context-menu capture** for the MVP.

| Surface | Advantages | Costs | Decision |
| --- | --- | --- | --- |
| Toolbar popup | Quick, compact, does not resize the webpage. | Closes when focus moves outside it; awkward when copying between a page and notes. | Consider later only if testing reveals a clear need. |
| Native side panel | Remains beside browsing; supports repeated reading, writing, and copying. | Uses horizontal space and competes with other panels. | **MVP home.** |
| New-tab page | More room and frequent visibility. | Replaces an existing habit and requires leaving the source page. | Do not replace New Tab. |
| Separate full-page view | Useful for long notes and bulk management. | Another surface to maintain and navigate. | Possible later expansion. |

Chrome documents popup dismissal on outside focus and persistent side-panel behavior across tabs. [Popup documentation](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [side-panel documentation](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

### 7.3 Design rationale and interaction rules

- Use a single column, readable text, restrained color, and visible actions.
- Show source and time so a note can be recognized without a mandatory title.
- Pinning keeps a few useful notes nearby without creating another filing system.
- Opening from the toolbar shows recent notes and restores an unfinished draft.
- Selection/link capture saves directly, without a form or filing step.
- **Ctrl/Cmd+K** focuses search while inside the panel.
- **Ctrl/Cmd+Enter** adds or commits editor content.
- Provide a configurable Chrome shortcut to open the panel; check conflicts rather than assuming one combination works everywhere.
- Escape dismisses the current search/edit state before closing the panel.
- Production layout should keep search and capture accessible while the notes list scrolls.
- Support native focus indicators, labeled controls, screen-reader save announcements, dark/light themes, and keyboard access to every action.
- Avoid drag-only interactions and color-only status indicators.

## 8. MVP and feature priorities

| Area | MVP decision | Useful later, if validated |
| --- | --- | --- |
| Capture | Thoughts, pasted snippets, selected text, and links; source metadata for explicit web captures. | Append a selection to an existing note. |
| Editing | Plain text plus simple code presentation; durable drafts. | Lightweight Markdown and syntax highlighting. |
| Organization | One inbox, pinned section, recent-first grouping. | One optional tag per note if retrieval tests justify it. |
| Search | Local search across body, source title, and URL; matching snippets. | Source/type filters when note volume makes them useful. |
| Cleanup | Individual clear, confirmed clear-unpinned, Undo, and Trash. | Review older notes in a batch. |
| Expiration | **No automatic expiration of active notes.** | Opt-in move-to-Trash after a chosen interval; pinned notes exempt. |
| Reminders | Omit scheduled notifications. | Add only if users repeatedly need time-specific action. |
| Portability | JSON backup **and tested restore**; readable text/Markdown export. | Optional cross-device sync. |
| Reliability | Honest saving/error states, storage-limit handling, and update-safe migrations. | Longer revision history. |

### 8.1 Retention rules

Temporary should not mean fragile:

- Closing a tab, window, or Chrome retains active notes.
- Clearing a note moves it to Trash.
- Pinned notes are excluded from bulk clear-unpinned.
- Propose a clearly disclosed **30-day recovery window** for Trash.
- The 30-day duration is a design choice to validate, not a research finding.
- Any later automatic expiration must be opt-in and initially move notes to Trash rather than permanently deleting them.

### 8.2 Features excluded from the MVP

Do not include boards, nested folders, collaboration, AI summaries, screenshots/OCR, attachments, calendars, automatic clipboard history, or an embedded code editor.

Each adds substantial scope without strengthening the core workflow enough at this stage.

## 9. Manifest V3 implementation plan

### 9.1 Proposed architecture

Use a packaged side-panel interface, a small event-driven service worker, a storage/repository layer, and an options/backup screen. A lightweight TypeScript UI is sufficient; the framework choice can wait until implementation approval.

| Component | Responsibility |
| --- | --- |
| Side-panel interface | Composer, editor, search, notes list, pins, Trash, and save/error feedback. |
| Service worker | Toolbar/shortcut/context-menu events, capture validation, coordinated writes, and migrations. |
| Storage/repository layer | Note records, drafts, revision checks, schema versions, backup/import validation, and retention rules. |
| Options/backup screen | Export/restore, storage usage, retention explanation, and shortcut guidance. |

Chrome can terminate idle extension workers. Durable state must live in storage rather than worker globals. [Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

### 9.2 Proposed data model

Each note should have:

- Stable note ID.
- Body and presentation format.
- Optional source URL and source title.
- Creation and update timestamps.
- Pin status.
- Optional deletion timestamp.
- Revision number and schema version.

For captured links, distinguish the target URL from the source page URL. Keep unfinished drafts separate from committed notes.

### 9.3 Storage and saving

1. Start with `chrome.storage.local`, storing notes separately rather than rewriting one large collection.
2. Serialize mutations and check revisions to detect stale edits from another window.
3. Preserve a conflicting copy rather than silently overwriting it.
4. Persist draft changes frequently. Show **Saving…**, **Saved on this device**, or **Couldn’t save** based on actual write results.
5. A failed save must keep the text available and offer retry/copy/export.
6. Monitor storage usage and give actionable warnings. Never silently truncate text or evict active notes.
7. Test migrations against old data fixtures. Updates must not reset storage.
8. Restrict storage access to trusted extension contexts.

Chrome documents a **10 MB** local-storage limit unless `unlimitedStorage` is requested. Extension removal clears local data. Export and restore therefore belong in the MVP, with a clear uninstall warning in settings. [Storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).

Implementation must test the gap between an in-memory draft and an acknowledged durable write. The design must not promise that unacknowledged text survives every crash.

### 9.4 Minimum permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Notes, drafts, and preferences. |
| `sidePanel` | Native side panel. |
| `contextMenus` | Explicit selection, page, and link capture. |
| `activeTab` | Temporary access to the invoked tab's metadata. |

Use context-menu payloads for selected text and link URLs, avoiding an always-running content script. `activeTab` grants temporary access following defined user actions; it does not give continuous access to every tab. If access is unavailable, ask the user to invoke capture again or allow manual paste rather than requesting broad access.

Sources: [context-menu API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

The proposed MVP should not need `<all_urls>`, browsing history, clipboard-read, identity, notifications, scripting, or broad `tabs` permissions. Normal paste remains user-controlled. Verify gesture-triggered copying before adding a clipboard permission.

> **As built (24 Sep 2026):** two deliberate departures from this list. `scripting` was added so the in-page overlay and the rich-selection reader can be injected into the tab the user clicked, under `activeTab`; it carries no install warning. `<all_urls>` appears only under `optional_host_permissions`, requested at the moment the user turns on the quick-open button and released when they turn it off. The install prompt still asks for no host access. See the README's *Permissions* section.

### 9.5 Browser support and restricted pages

A practical proposed minimum is **Chrome 141**, which supports programmatic panel closing. Supporting older versions is possible with Chrome's native close control; opening through `sidePanel.open()` dates to Chrome 116. [API availability](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

Validate capture behavior on restricted browser pages and the Chrome Web Store. Manual note entry and paste should remain available even where webpage capture is unavailable. Do not imply that page access works everywhere.

### 9.6 Offline behavior

All note creation, editing, searching, pinning, clearing, and restoration should work offline.

A saved URL remains a reference, but the extension does not promise an offline copy of the original webpage. Fonts, icons, scripts, and other core interface assets should be packaged with the extension.

### 9.7 Privacy and security

- No account, backend, analytics, or external content fetches in the free MVP.
- Capture only what the user explicitly saves.
- Avoid fetching favicons or link previews, which can disclose saved destinations.
- Treat pasted content and imports as untrusted text.
- Do not execute pasted HTML or code snippets.
- Validate import schemas and safely handle URL schemes.
- Package executable dependencies locally under a restrictive content security policy.
- Describe local storage accurately: it is not an encrypted vault.
- Initially disable incognito support rather than accidentally mixing private-session captures into ordinary notes.
- Keep note contents and source URLs out of diagnostic logs.

### 9.8 Optional cross-device sync

Do not use Chrome sync as the primary note database. Its documented quota is approximately **100 KB total and 8 KB per item**, making it better suited to small preferences than growing snippets. [Chrome storage limits](https://developer.chrome.com/docs/extensions/reference/api/storage).

If users demonstrate a strong need, add a separate opt-in sync service with:

- Local writes first and an offline upload queue.
- Explicit upload/merge choices when connecting.
- Conflict copies, deletion tombstones, and recovery.
- Clear device status, account export, and account deletion.
- A deliberate encryption and key-recovery design before promising end-to-end encryption.

Sync is a substantial second project, especially if “cross-device” includes phones rather than another desktop Chrome installation. It must not become a prerequisite for reliable local use.

### 9.9 Chrome Web Store preparation

- Keep the listing focused on a single, understandable purpose.
- Provide accurate screenshots, permission explanations, a privacy policy, and a support contact.
- Make truthful storage, offline, and sync claims.
- Bundle executable code rather than loading remote scripts.
- Secure the publisher account with two-step verification.
- Leave time for review and possible revisions.

Google requires narrow permissions, accurate privacy disclosures, and a clear single purpose. [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

## 10. Milestones and rough complexity

Estimates assume one experienced extension developer, begin after design approval, and exclude Chrome Web Store review delays. They are planning estimates, not commitments.

| Milestone | Scope and exit condition | Estimate / complexity |
| --- | --- | --- |
| **1. Validate the design** | Test the mockup with eight people; compare capture, retrieval, and cleanup with their current tool. | 3–5 working days; low engineering effort. |
| **2. Verify Chrome constraints** | Test panel opening/focus, context capture, restricted pages, clipboard gestures, and multiple windows. | 2–3 days; medium. |
| **3. Build the local core** | Capture, drafts, editing, source metadata, search, pinning, Trash, and export/import. | 7–10 days; medium. |
| **4. Harden reliability and accessibility** | Restart/update recovery, failed writes, quota exhaustion, competing edits, keyboard access, and screen-reader checks. | 5–7 days; high importance. |
| **5. Pilot and store preparation** | Two-week private pilot, observed-problem fixes, listing, and privacy disclosures. | 3–5 development days plus pilot time. |
| **6. Evaluate sync** | Separate decision based on retention and demonstrated demand. | Later; high complexity. |

## 11. Major risks

| Risk | Consequence | Mitigation / validation |
| --- | --- | --- |
| Silent data loss or misleading save status | Users stop trusting the product. | Acknowledge writes accurately; test restart, crash, quota, update, and conflicting-edit scenarios. |
| Notes accumulate indefinitely | The temporary inbox becomes another neglected archive. | Easy clear, pins, Trash, and observation of cleanup behavior before adding expiration. |
| Capture fails on restricted pages | The product appears inconsistent. | Explain unavailable capture and retain manual paste; test realistic browser contexts. |
| Side panel consumes too much space | Users close it or abandon the workflow. | Test on laptop widths; use a responsive single column and restrained controls. |
| Backup exists but restore is unreliable | Users cannot recover or move their data. | Round-trip export/import tests and versioned import validation. |
| Weak differentiation | Users see no reason to switch. | Compare against their current tools and close competitors before expanding scope. |
| Sync adds conflicts and support burden | Complexity undermines reliability and margins. | Separate phase with explicit demand, conflict handling, and recovery design. |

## 12. Validation with real users

### 12.1 Initial study

Recruit eight people who already keep temporary browser information:

- Four students/researchers.
- Two developers.
- Two everyday users.

Give each the same tasks:

1. Capture a quotation and its source.
2. Save a link and an unrelated thought.
3. Paste and retrieve a whitespace-sensitive snippet.
4. Find an item among 30 realistic notes.
5. Clear a finished task and recover an accidental deletion.

Compare the proposed experience with each participant's existing tool. Include a close side-panel competitor where practical. Counterbalance tool order to reduce practice effects.

### 12.2 Proposed success targets

These are targets, not measured results:

- Capture within **three seconds excluding typing**.
- Retrieve a specified note within **ten seconds**.
- Recover an accidental deletion without assistance for at least **seven of eight participants**.
- Understand where notes are stored and whether closing Chrome deletes them.

### 12.3 Two-week pilot

Look for repeated voluntary use and actual reuse or clearing of notes. Ask why users return to their old tool. Use consented observation and interviews initially rather than collecting note contents or browsing histories.

Stop expanding the feature set if the side panel does not improve the task. Revisit the concept if participants consistently need a permanent notes app, a bookmark library, or mobile sync instead.

### 12.4 Engineering acceptance

Separately verify:

- Worker suspension and resumption.
- Browser restarts and extension updates.
- Storage failures and quota exhaustion.
- Draft restoration.
- Concurrent edits from multiple windows.
- Corrupt and older-version imports.
- Export/import round trips.
- Code whitespace fidelity.
- Search correctness and keyboard access.

A small user study cannot establish storage reliability.

## 13. Monetization

Monetization is premature until repeat use is demonstrated. Strong free alternatives already exist.

Keep capture, local search, pinning, offline access, Trash, export, and restore free. These features constitute the useful product and its trust contract.

If users later want hosted sync, backup history, and mobile/web access, a subscription could fund those ongoing services. Test a **$2–4/month or $20–30/year** range as a pricing hypothesis, not established willingness to pay.

A one-time supporter purchase is another option if the product remains entirely local. Do not fund the product through selling note data, replacing saved links, or intrusive advertising.

## 14. Decisions awaiting feedback

The following are proposed, not approved implementation decisions:

1. A general-purpose product with students/researchers as the initial recruiting focus.
2. A native side panel plus context-menu capture.
3. A local-first MVP with no account and no cross-device sync requirement.
4. One inbox, search, and pins rather than boards or folders.
5. Retain active notes until explicitly cleared; provide recoverable Trash.
6. Plain text and code presentation before richer editing.
7. The visual direction shown in the interactive mockup.

**Next step:** Review the mockups and product plan. Revise the design based on feedback before starting extension implementation.
