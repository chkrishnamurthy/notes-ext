# For Now

A local-first Chrome side panel for notes you need during the current task or
the next few days.

> Capture without filing, find without remembering where, and clear without
> worrying about accidental loss.

Built to [`PRODUCT_RESEARCH_AND_PLAN.md`](PRODUCT_RESEARCH_AND_PLAN.md) — the
seven decisions in its §14, with the §9 Manifest V3 plan as the architecture.

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
| Open the panel | Click the toolbar icon, or press **Alt+Shift+N** |
| Add a thought | Type in the composer, then **Ctrl/Cmd+Enter** |
| Format text | The toolbar, or type it: `- ` a list, `1. ` a numbered list, `# ` a heading, `> ` a quote, ``` a code block, `**bold**` |
| Keep a snippet | The code-block button — whitespace is preserved exactly |
| Switch layout | The list / card icons at the right of the filter row |
| Save a selection | Select text on any page → right-click → **Save selection to For Now** |
| Save a link | Right-click a link → **Save link to For Now** |
| Save a page | Right-click a page → **Save this page to For Now** |
| Find something | **Ctrl/Cmd+K**, or the search box in the filter row, below the editor |
| Edit a note | Click its text |
| Clear one note | **Clear** on the note, then **Undo** if that was a mistake |
| Finish a task | **Clear unpinned…** — pinned notes are never included |
| Back up | The gear icon → **Export backup** |

**Escape** steps back one layer at a time: it dismisses an error, then a
confirmation, then an edit, then a search, and only then closes the panel.

## How it is built

```
src/
  lib/            everything with rules in it, and all of it browser-free
    schema.ts       the Note shape, schema version, and untrusted-input parsing
    richtext.ts     the HTML allowlist sanitizer and the plain-text projection
    storage.ts      the repository over chrome.storage.local
    notes.ts        create / edit / pin / trash / restore / purge
    search.ts       matching, highlighting, snippets
    backup.ts       export, import validation, merge
    migrations.ts   per-record schema upgrades
    capture.ts      what a context-menu click becomes
    time.ts         grouping and relative timestamps
  background/     the service worker: menus, capture, panel opening, start-up
  sidepanel/      the React panel and the TipTap editor
  options/        settings and backup
```

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

`storage`, `sidePanel`, `contextMenus`, `activeTab` — and nothing else. No host
permissions, no content script, no `<all_urls>`, no network access at all
(`connect-src 'none'`). Captures come from context-menu payloads, so the
extension never watches pages you merely visit. Incognito is disabled.

## Testing

```sh
npm test       # 120 unit tests, including the sanitizer
npm run e2e    # 4 suites, 157 checks, against a real Chrome
npm run verify # build + both
```

`npm run e2e` launches its own headless Chrome with a throwaway profile, loads
`dist/` over the DevTools protocol, and tears everything down afterwards. It
never touches your real Chrome profile. `FORNOW_HEADFUL=1 npm run e2e` runs it
visibly; screenshots land in `e2e/screenshots`.

| Suite | Covers |
| --- | --- |
| `panel` | Capture → search → clear → Undo, rich-text formatting and markdown shortcuts, code whitespace, list and card views, editing, a failed save and its retry, narrow and short layouts, accessibility |
| `worker` | Menu registration, permissions, worker termination and cold start, no duplicate menus, no data reset |
| `options` | A real export download, a full import round trip, rejecting a foreign file, retention and theme |
| `conflicts` | Draft restoration across a panel reopen, and two windows editing one note |

## Not in this version

Boards, folders, collaboration, AI summaries, screenshots, image attachments,
tables, reminders, and cross-device sync — all deliberately out of scope per §8.2 of
the plan. There is no automatic expiration of active notes: clearing is always
something you do.
