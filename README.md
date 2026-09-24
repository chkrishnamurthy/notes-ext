# For Now

A local-first Chrome side panel for notes you need during the current task or
the next few days.

> Capture without filing, find without remembering where, and clear without
> worrying about accidental loss.

Built to [`PRODUCT_RESEARCH_AND_PLAN.md`](PRODUCT_RESEARCH_AND_PLAN.md) — the
seven decisions in its §14, with the §9 Manifest V3 plan as the architecture.

What comes next is in [`ROADMAP.md`](ROADMAP.md): 22 candidate features in three
phases, the Chrome Web Store listing work that has to happen first, and the
evidence behind each one.

## Running it

```sh
npm install
npm run build        # -> dist/
```

Then in Chrome: **Extensions → Manage extensions → Developer mode → Load
unpacked**, and choose the `dist/` folder.

`npm run dev` rebuilds on change; press the reload button on the extension card
to pick the change up.

## Using it

| To do this | Do this |
| --- | --- |
| Open the panel | Click the toolbar icon, press **Alt+Shift+N**, or use the quick-open button on the page. It genies up out of the bottom-right corner |
| Close the panel | Press **Escape** or use the × — it genies back down into the corner. Clicking the page moves the keyboard there but leaves the panel open, so you can read and write side by side |
| Add a thought | Type in the composer, then **Ctrl/Cmd+Enter** |
| Format text | The toolbar, or type it: `- ` a list, `1. ` a numbered list, `# ` a heading, `> ` a quote, ``` a code block, `**bold**` |
| Keep a snippet | The code-block button — whitespace is preserved exactly |
| Switch layout | The list / card icons at the right of the filter row |
| Save a selection | Select text on any page → right-click → **Save selection to For Now**. Links, bold and italic, lists and code blocks are kept |
| Save a link | Right-click a link → **Save link to For Now** |
| Get a button on every page | Settings → **Quick-open button**. Off by default; turning it on asks Chrome for site access |
| Save a page | Right-click a page → **Save this page to For Now** |
| Find something | **Ctrl/Cmd+K**, or the search box in the filter row, below the editor |
| Edit a note | Click its text |
| Tag a note | **Add tag** on the note. One tag per note, never asked for when you save; empty the field to remove it |
| See one tag's notes | Click the tag on any note. **Escape** or the × shows everything again. Search matches tags too |
| Copy a note as Markdown | **Copy as Markdown** on the note |
| Clear one note | **Clear** on the note, then **Undo** if that was a mistake |
| Finish a task | **Clear unpinned…** — pinned notes are never included |
| Back up | The gear icon → **Export backup** |
| Take your notes elsewhere | The gear icon → **Export as Markdown** — one readable `.md` file for Obsidian, a document or an email. It is for reading, not restoring |

**Escape** steps back one layer at a time: it dismisses an error, then a
confirmation, then an edit, then a search, then a tag filter, and only then
closes the panel.

The interface follows Chrome's language: English, Hindi, Spanish, Portuguese
(Brazil), German, French, Indonesian or Japanese.

## How it is built

```
src/
  lib/            everything with rules in it, and all of it browser-free
    schema.ts       the Note shape, schema version, and untrusted-input parsing
    richtext.ts     the HTML allowlist sanitizer and the plain-text projection
    markdown.ts     note HTML to Markdown, and the Markdown export
    i18n.ts         t() and plural() over chrome.i18n
    storage.ts      the repository over chrome.storage.local
    notes.ts        create / edit / pin / tag / trash / restore / purge
    search.ts       matching, highlighting, snippets
    backup.ts       export, import validation, merge
    migrations.ts   per-record schema upgrades
    capture.ts      what a context-menu click becomes
    time.ts         grouping and relative timestamps
  background/     the service worker: menus, capture, panel routing, start-up
  content/        overlay.ts   the in-page shell: closed shadow root, iframe, genie
                  launcher.ts  the quick-open button, ~3 kB, no framework
                  capture.ts   reads a saved selection as rich text, ~3 kB
  sidepanel/      the React panel and the TipTap editor
  overlay/        the same panel, as the page framed inside the overlay
  popup/          the same panel again, as the toolbar popup on Chrome's own pages
  options/        settings and backup
  public/_locales/  every user-facing string, one messages.json per language
```

### Three shells, one panel

The same React app runs in three places, and it does not know which:

- **An overlay injected into the page.** The everyday surface. It floats over
  the page as a card in the bottom-right, and animates in and out with a genie
  effect. Injected on the toolbar click under `activeTab`, so it needs **no
  host permission** — the install prompt stays clean. The panel inside is an
  extension page (`overlay.html`) in an iframe; only the window around it is
  part of the page. See *The page cannot read your notes* below.
- **The toolbar popup.** For pages Chrome will not let a content script
  touch: `chrome://` pages, the Web Store, the new tab page. It floats over the
  page like the overlay instead of docking beside it and squeezing it. The
  worker attaches the popup to the tab only for the moment it takes to open,
  so the next click on an ordinary page still gets the overlay. Unlike the
  overlay, Chrome closes it on any click outside, and that cannot be changed.
- **The native side panel.** The last resort, when even the popup cannot open
  (no focused window, for instance).

`src/lib/inject.ts` decides whether a page can take the overlay.

Everything that differs between them — opening a tab, opening settings,
closing, where the `data-theme` attribute belongs — goes through
`src/lib/host.ts`. The UI never calls a shell-specific API directly.

### The quick-open button

A toolbar icon is hard to find — pinned it is one small grey square among
others, unpinned it is behind a puzzle-piece menu. So the panel can also be
opened from a 34px button at the corner it genies out of.

It is **off by default**, and deliberately so. Drawing a button on a page means
running code on that page, and having it everywhere means access to every site.
That is a decision worth making on purpose, so it is an opt-in switch in
Settings that asks Chrome for the access at the moment it is needed, hands it
back when switched off, and turns itself off if the access is revoked from
Chrome's own extension page. The manifest declares it under
`optional_host_permissions`, never `host_permissions`, so the install prompt is
unaffected.

The button is its own ~3 kB bundle with no framework in it, because unlike the
panel it runs on every page load. It and the panel talk over a plain window
event — they share one isolated world — so the button knows to step aside while
the panel is up without a round trip through the worker. `src/lib/corner.ts`
holds the one pair of numbers they both have to agree on: get that wrong and the
panel shrinks into empty space *beside* the button, and neither file looks wrong
on its own. A test asserts they still meet.

### The genie effect

The browser has no primitive for warping live pixels, so `src/lib/genie.ts`
reproduces the macOS minimise animation the way it actually reads: the panel is
cloned into 32 horizontal slices, and each one is pulled toward the corner on
its own delay. The bottom slices arrive first and the upper ones trail, which
is what forms the curved neck; a mid-flight bend keyframe stops the tail
travelling in a straight line. Only `transform` and `opacity` animate, so it
stays on the compositor. `prefers-reduced-motion` gets a plain fade.

The geometry is pure and unit-tested; the DOM work around it is deliberately
thin.

### The page cannot read your notes

Anything rendered into a page's DOM belongs to that page: a shadow root keeps
CSS out but not scripts. An open root is one property away, key events typed
inside it bubble to the page's listeners, and its buttons answer
`element.click()`. So the overlay never renders notes into the page at all.

- The panel is **`overlay.html` in an iframe**, which runs on the extension's
  origin. A cross-origin frame is the one thing a page cannot read, listen to
  or script.
- The iframe sits in a **closed** shadow root, so the page cannot find it or
  learn its URL (`host.shadowRoot` is null, `window.frames` is empty).
- `overlay.html` is web-accessible with **`use_dynamic_url`**, so it answers
  only on an id that changes every session. A page cannot frame the panel
  itself to clickjack it, or probe for it to detect the extension.
- The panel asks to close over `postMessage`, and the shell obeys only messages
  whose source is its own frame. Closing hands focus back to the page, so the
  hidden panel never swallows keys meant for the page.

The genie slices are cut from an empty copy of the frame rather than the live
panel, since cloning the panel's contents is exactly what the frame prevents.

Clicking the page does not close the panel: it moves the keyboard to the page,
so you can copy from the page into a note without reopening it. Tab stays
trapped inside the panel while it has focus, so the keyboard never wanders into
a page nobody can see it on.

### Living on someone else's page

Four problems that only show up in a real browser. Every one of them was found
by the hostile-page test rather than by reading the code, and every one of them
looks completely fine on an ordinary page:

- The overlay's shell mounts in a **shadow root**, so the host page cannot
  restyle it and it cannot restyle the host page. That means the colour tokens have to be
  declared on `:host` as well as `:root` — `:root` matches nothing inside a
  shadow root, and without the second selector every colour silently resolves
  to an invalid value.
- **The design system is sized in px, not rem.** Inside a host document, `rem`
  resolves against *that page's* root font size, and plenty of sites set it to
  10px or 62.5%.
- **The host element is not protected by its own shadow root.** It lives in the
  page's DOM, so the page's CSS applies to it, and an author rule carrying
  `!important` outranks a normal inline style. A page with
  `* { transform: rotate(5deg) !important }` tilts the whole panel; one with
  `* { opacity: 0.25 !important }` all but erases it; and inherited properties
  like `text-transform` reach *through* the host into the shadow tree.
  `src/lib/shell.ts` pins every one of them inline as `!important`, which is
  the one thing an author rule cannot beat.
- **A transform on an ancestor becomes the containing block for anything
  fixed inside it**, and no descendant can opt out. So both shells are put in
  the browser's **top layer**, which is measured against the viewport instead —
  and as a side effect can no longer be out-stacked by any z-index on the page.

One more that is easy to get wrong in the other direction: `100vh` includes the
scrollbars and the fixed containing block does not, so the panel is sized by its
insets. On a page with a horizontal scrollbar the two differ by about 15px, and
the panel would hang off the top of the screen.

`src/lib` takes its storage area as an interface, so every rule in the product
is unit-testable without a browser. The React layer holds no rules of its own.

### The three reliability rules

1. **Nothing durable lives in a module global.** Chrome terminates idle
   extension workers, so every handler reads back from storage.
2. **A write that finds a newer revision is a conflict, never an overwrite.**
   Each note carries a `rev`. A losing edit is kept as its own note, so two
   windows editing the same note cannot lose either version.
3. **"Saved" means the storage area acknowledged the write.** A failed save
   says so, keeps your text in the editor, and offers retry and copy.

Notes are stored one per key, so a write never rewrites the whole collection.

### Rich text

Note bodies are HTML, produced by [TipTap](https://tiptap.dev) (ProseMirror) —
the same editor engine Jira uses. Every note stores two things: the `html`, and
a `text` projection of it.

Keeping `text` alongside rather than deriving it on demand is deliberate.
Search, snippets, match highlighting, list view and Copy all read it, none of
which should have to parse HTML, and the service worker has no DOM to parse it
with. A capture from the context menu therefore builds its HTML from plain
text, which is a pure string operation, while the editor supplies both.

All HTML passes through an allowlist sanitizer (`src/lib/richtext.ts`) before
it is stored and again before it is rendered. Unknown tags are unwrapped so
their text survives; `<script>`, `<style>`, `<iframe>` and friends are removed
with their contents, because for those the contents *are* the payload. Links
are limited to `http`, `https` and `mailto`.

Markdown only goes *out* (`src/lib/markdown.ts`), for Copy as Markdown and the
Markdown export. Because it only ever meets what the sanitizer allows, it can be
small: headings, emphasis, strikethrough, links, bullet, numbered and check
lists, quotes and fenced code. Code keeps its whitespace exactly and gets a
fence longer than any run of backticks inside it. Text that would otherwise
turn into formatting (`*`, `_`, a `# ` at the start of a line) is escaped.
Underline has no Markdown form, so it comes out as plain text.

### Tags

Each note can have **one** optional tag. That is deliberate: several tags per
note is a filing system, and this product exists so you do not need one. A tag
is added after the fact and is never asked for when you save. Tags compare
without regard to case, a leading `#` is dropped, and they are capped at 32
characters. Changing a tag is not an edit — it leaves `contentRev` alone — so it
never makes an edit open in another window look stale. Adding the field bumped
the schema to v4. That bump matters more than the field: it marks tagged
records as newer, so an older build leaves them alone instead of rewriting them
without the tag.

### Languages

Every user-facing string is in `src/public/_locales/<locale>/messages.json`,
including the manifest's name and description and the context-menu titles.
`src/lib/i18n.ts` reads them through `chrome.i18n`, which works the same in
the panel, the options page, the service worker and the content scripts. The
catalogue is never bundled into the code: the quick-open button runs on every
page load and stays about 4 kB.

Chrome's messages have no plural forms, so each counted string comes as a
`…One` / `…Other` pair and `plural()` picks between them. Placeholders are
`$1`…`$9` written straight into the message. `tParts()` returns a message split
around embedded elements (a `<code>` path, a `<strong>` phrase), so a
translation can move them wherever its grammar needs.

`tests/i18n.test.ts` fails if a locale is missing a key, drops or adds a
placeholder, or has a name or description over the Web Store's limits (45 and
132 characters). The product name is not translated.

The translations were machine-drafted and have **not** been reviewed by native
speakers. Have them checked before the store listing goes live in each
language.

### Where the data is

Everything lives in `chrome.storage.local`, one note per key (`note:<id>`),
plus `draft`, `settings` and `meta`. Nothing is sent anywhere — the extension
has no network access at all.

On disk that is your Chrome profile folder:

```
<Chrome profile>/Default/Local Extension Settings/<extension-id>/
```

a LevelDB database, stored as plain text. It is local storage, not an
encrypted vault: anyone who can use your Chrome profile can read it. The
settings page shows the exact id, the live byte count, and the 10 MB ceiling
Chrome imposes without `unlimitedStorage`.

Uninstalling the extension deletes that folder, which is why export and import
are in the MVP rather than a later nicety.

### Permissions

`storage`, `sidePanel`, `contextMenus`, `activeTab`, `scripting` — and nothing
else. **No host permissions**, no content script declared in the manifest, no
network access at all (`connect-src 'none'`). `scripting` is how the overlay and
the selection reader are injected under `activeTab`, and how the quick-open
button is registered once you switch it on. Captures come from context-menu payloads, so the
extension never watches pages you merely visit. Incognito is disabled.

`<all_urls>` appears once, under `optional_host_permissions`. It is not granted
at install time and is not needed to use the extension; it is requested only if
you turn the quick-open button on, and released the moment you turn it off.
Even then it is used to draw a 34px button and listen for a click — the button
reads no page content and sends nothing anywhere.

## Testing

```sh
npm test       # 268 unit tests, including the sanitizer, Markdown and the genie geometry
npm run e2e    # 7 suites, 323 checks, against a real Chrome
npm run verify # build + both
```

`npm run e2e` launches its own headless Chrome with a throwaway profile, loads
the build over the DevTools protocol, and tears everything down afterwards. It
never touches your real Chrome profile.

It injects using a **copy** of `dist/` with `<all_urls>` added, because
`activeTab` is granted only by a real click on the toolbar icon and the
DevTools protocol cannot produce that gesture. `dist/` is never modified, and
the `worker` and `launcher` suites assert the permission set by reading the
**shipped** manifest from disk — so the harness's extra permission can never
hide a regression in the real one. `FORNOW_HEADFUL=1 npm run e2e` runs it
visibly; screenshots land in `e2e/screenshots`.

| Suite | Covers |
| --- | --- |
| `panel` | Capture → search → clear → Undo, rich-text formatting and markdown shortcuts, code whitespace, list and card views, tagging and filtering by tag, editing, a failed save and its retry, narrow and short layouts, message placeholders in real Chrome, accessibility |
| `worker` | Menu registration, permissions, worker termination and cold start, no duplicate menus, no data reset |
| `options` | A real export download, a full import round trip, rejecting a foreign file, retention, and appearance: palettes, accent, font and text size |
| `conflicts` | Draft restoration across a panel reopen, one unfinished draft followed live by every open panel, and an edit refused (and kept) when the note changed underneath it |
| `overlay` | Injecting into a real page, that a hostile page cannot read the notes, hear keys typed into them, reach the shell or frame the panel itself, the panel staying open when the page is clicked, the keyboard returning to the page on close, shadow-root isolation in both directions, immunity to a hostile host stylesheet and a 10px root font, the genie running and cleaning up, and opening tabs from inside the frame |
| `launcher` | That the shipped manifest still asks for nothing, the Settings switch registering and unregistering the content script, and the button surviving a page that tries to rotate, fade, stretch and recolour it |
| `popup` | The toolbar click on a Chrome page opening the panel as a popup rather than the side panel, sized within Chrome's popup limits, with the editor focused, and detached again afterwards |

The `conflicts` suite is **flaky**, and it was flaky before tags and
localisation too (checked against the earlier commit). About half of runs fail
one of *an unfinished thought shows up in the other panel*, *committing it from
either panel makes one note*, or *the edit is saved and the pin is kept*. That
could be the fixed timing waits, or a real race between two panels. It has not
been diagnosed yet.

## Not in this version

Boards, folders, collaboration, AI summaries, screenshots, image attachments,
tables, reminders, and cross-device sync — all deliberately out of scope per §8.2 of
the plan. There is no automatic expiration of active notes: clearing is always
something you do.
