/**
 * The main panel, against the real extension in Chrome: capture, formatting,
 * search, clear, Undo, the two list layouts, a failed save, and the layout
 * rules the panel has to keep at narrow and short sizes.
 */
import {
  META, PANEL, check, click, clickExact, clickText, consoleErrors, editorContent,
  errors, focus, has, key, openPage, report, resetEditor, resetStorage, resize,
  setEditor, settle, shot, storedNotes, text, tool, typeChars, typeInEditor,
} from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const s = await openPage(PANEL);
await resetStorage(s);

// --- Empty state ---------------------------------------------------------
console.log('\n# Empty state');
let body = await text(s);
check('shows the empty-state heading', has(body, 'A little space to think.'));
check('explains both entry points', has(body, 'Save selection to For Now'));
check('says notes are local', has(body, 'on this device'));
await shot(s, `${OUT}/01-empty.png`);

// --- Capture -------------------------------------------------------------
console.log('\n# Capture');
await typeInEditor(s, 'Essay outline: compare recall with rereading');
await settle(s, 700);
check('draft is persisted while typing', has(await text(s), 'Draft saved on this device'));

await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 600);
let notes = await storedNotes(s);
check('Cmd+Enter commits the note', notes.length === 1, `got ${notes.length}`);
check('save is confirmed honestly', has(await text(s), 'Saved on this device.'));
check('the note keeps both rich and plain forms',
  notes[0]?.html?.includes('Essay outline') && notes[0]?.text?.includes('Essay outline'));
check('the editor is cleared after a save', (await editorContent(s)).text.trim() === '');
check('the committed draft is removed from storage', await s.evalJson(`
  const d = await chrome.storage.local.get('draft');
  return d.draft === undefined;
`));

// --- Rich text -----------------------------------------------------------
console.log('\n# Rich text');
await typeInEditor(s, 'plain and bold');
await s.evalJson(`
  const sel = window.getSelection();
  const node = document.querySelector('.fn-prose p').firstChild;
  const range = document.createRange();
  range.setStart(node, 10);
  range.setEnd(node, 14);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
`);
await tool(s, 'Bold');
let content = await editorContent(s);
check('the Bold button emphasises the selection', content.html.includes('<strong>bold</strong>'),
  content.html.slice(0, 120));

await resetEditor(s);
await typeChars(s, '- first item');
await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await s.send('Input.insertText', { text: 'second item' });
await settle(s, 400);
content = await editorContent(s);
check('typing "- " starts a bullet list, as in Jira', content.html.includes('<ul'), content.html.slice(0, 140));
check('the list holds both items',
  content.html.includes('first item') && content.html.includes('second item'));

await resetEditor(s);
await typeChars(s, '# A heading');
check('typing "# " makes a heading', (await editorContent(s)).html.includes('<h1'),
  (await editorContent(s)).html.slice(0, 120));

// A paste must not be reinterpreted as markdown.
await resetEditor(s);
await typeInEditor(s, '- pasted, not a list');
check('pasting markdown-looking text leaves it alone',
  !(await editorContent(s)).html.includes('<ul'));

await resetEditor(s);
await tool(s, 'Code block');
await typeInEditor(s, 'function f() {\n    return 1;\n}');
await settle(s, 400);
content = await editorContent(s);
check('the code block button is available in place of the old dropdown',
  content.html.includes('<pre'));
check('a code block keeps its indentation', content.text.includes('    return 1;'),
  JSON.stringify(content.text));
check('the plain-text format dropdown is gone', await s.evalJson(`
  return document.querySelector('#fn-format') === null;
`));

await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 600);
const codeNote = (await storedNotes(s)).find((n) => n.html.includes('<pre'));
check('the snippet is stored as a code block', !!codeNote);
check('its whitespace survives the round trip',
  codeNote?.text === 'function f() {\n    return 1;\n}', JSON.stringify(codeNote?.text));

// --- A note with a source, as a capture would write it --------------------
await s.evalJson(`
  const id = crypto.randomUUID();
  const now = Date.now() - 26 * 60 * 60 * 1000;
  await chrome.storage.local.set({ ['note:' + id]: {
    id,
    html: '<p>After reading, close the text and write down what you can recall.</p>',
    text: 'After reading, close the text and write down what you can recall.',
    kind: 'selection',
    sourceUrl: 'https://example.edu/learning/recall',
    sourceTitle: 'The Learning Notebook',
    createdAt: now, updatedAt: now, pinned: false, rev: 1, schemaVersion: 2,
  }});
  return true;
`);
await settle(s, 600);
body = await text(s);
check('a change from elsewhere appears without a reload', has(body, 'The Learning Notebook'));
check('notes are grouped by day', has(body, 'Today') && has(body, 'Yesterday'));

// --- Layouts -------------------------------------------------------------
console.log('\n# List and card views');
await clickText(s, 'button[aria-label="List view"]', '');
await settle(s, 400);
check('list view is dense, one row per note', await s.evalJson(`
  return document.querySelectorAll('article.group').length > 0;
`));
check('list view shows plain text, not rendered HTML', await s.evalJson(`
  const article = document.querySelector('article.group');
  return article.querySelector('.fn-prose-note') === null;
`));
check('a long note is clamped in list view', await s.evalJson(`
  const el = document.querySelector('article.group .line-clamp-2');
  if (!el) return false;
  return getComputedStyle(el).webkitLineClamp === '2';
`));
await shot(s, `${OUT}/02-list-view.png`);

await clickText(s, 'button[aria-label="Card view"]', '');
await settle(s, 400);
check('card view renders each note in its own card', await s.evalJson(`
  return document.querySelectorAll('article.rounded-lg').length > 0;
`));
check('card view renders the rich formatting', await s.evalJson(`
  return document.querySelector('.fn-prose-note pre') !== null;
`));
check('card view shows its actions without hovering', await s.evalJson(`
  const card = document.querySelector('article.rounded-lg');
  return [...card.querySelectorAll('button')].some((b) => b.textContent.includes('Copy'));
`));
await shot(s, `${OUT}/03-card-view.png`);

check('the layout choice survives a reload', await s.evalJson(`
  return localStorage.getItem('for-now:note-view') === 'card';
`));
await s.send('Page.reload');
await settle(s, 1500);
check('card view is still selected after reopening', await s.evalJson(`
  return document.querySelector('button[aria-label="Card view"]').getAttribute('aria-pressed') === 'true';
`));
await clickText(s, 'button[aria-label="List view"]', '');
await settle(s, 400);

// --- Pinning -------------------------------------------------------------
console.log('\n# Pinning');
await clickExact(s, 'article button[aria-label="Pin"]', '');
await settle(s, 500);
body = await text(s);
check('pinning is confirmed and explains the consequence',
  has(body, 'Bulk cleanup will skip this note'));
check('a Pinned group appears', has(body, 'Pinned'));

// --- Search, now in the filter row ---------------------------------------
console.log('\n# Search');
check('the old search box above the editor is gone', await s.evalJson(`
  const input = document.querySelector('input[type=search]');
  const bar = input.closest('div').parentElement;
  const toolbar = document.querySelector('[role=toolbar]');
  // The search field must sit below the editor, not above it.
  return input.getBoundingClientRect().top > toolbar.getBoundingClientRect().top;
`));
check('search sits in the same row as the view tabs', await s.evalJson(`
  const input = document.querySelector('input[type=search]');
  const tabs = document.querySelector('nav[aria-label="Notes views"]');
  const a = input.getBoundingClientRect();
  const b = tabs.getBoundingClientRect();
  // Same row means their vertical centres line up.
  return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6;
`));
check('search comes after Trash in the row', await s.evalJson(`
  const input = document.querySelector('input[type=search]').getBoundingClientRect();
  const trash = [...document.querySelectorAll('nav[aria-label="Notes views"] button')]
    .find((b) => b.textContent.includes('Trash')).getBoundingClientRect();
  return input.left >= trash.right - 1;
`));

await key(s, 'k', { modifiers: META, code: 'KeyK', keyCode: 75 });
check('Cmd+K moves focus to search', await s.evalJson(`
  return document.activeElement?.getAttribute('aria-label')?.includes('Search') === true;
`));

await s.send('Input.insertText', { text: 'recall' });
await settle(s, 500);
body = await text(s);
check('search finds a match in the body', has(body, 'matching note'));
check('matches are highlighted', await s.evalJson('return document.querySelectorAll("mark").length > 0;'));
await shot(s, `${OUT}/04-search.png`);

await s.send('Input.insertText', { text: ' notebook' });
await settle(s, 400);
check('every term must match', has(await text(s), '1 matching note'));

await s.send('Input.insertText', { text: ' zebra' });
await settle(s, 400);
check('a search with no results explains what to try',
  has(await text(s), 'Try a word from the note or its source'));

await key(s, 'Escape', { code: 'Escape', keyCode: 27 });
await settle(s, 400);
check('Escape clears the search first', await s.evalJson(`
  return document.querySelector('input[type=search]').value === '';
`));

await focus(s, 'input[type=search]');
await s.send('Input.insertText', { text: 'example.edu' });
await settle(s, 400);
check('search reaches the source URL', has(await text(s), '1 matching note'));
await focus(s, 'input[type=search]');
await key(s, 'Escape', { code: 'Escape', keyCode: 27 });
await settle(s, 400);

// --- Clear and Undo ------------------------------------------------------
console.log('\n# Clear and Undo');
const before = (await storedNotes(s)).length;
await clickExact(s, 'article button[aria-label="Clear"]', '');
await settle(s, 500);
body = await text(s);
check('clearing offers immediate Undo', has(body, 'Undo'));
check('clearing names the recovery window', has(body, 'recover for 30 days'));
notes = await storedNotes(s);
check('a cleared note is kept, not deleted', notes.length === before, `${notes.length} vs ${before}`);
check('it is marked as trashed', notes.filter((n) => n.deletedAt !== undefined).length === 1);

await clickExact(s, 'button', 'Undo');
await settle(s, 500);
check('Undo restores the note', (await storedNotes(s)).every((n) => n.deletedAt === undefined));

console.log('\n# Clear unpinned');
await clickText(s, 'footer button', 'Clear unpinned');
await settle(s, 300);
body = await text(s);
check('bulk clear asks first', has(body, 'Move') && has(body, 'to Trash?'));
check('the confirmation says pinned notes stay', has(body, 'Pinned notes stay'));
await clickExact(s, 'button', 'Move to Trash');
await settle(s, 600);
const active = (await storedNotes(s)).filter((n) => n.deletedAt === undefined);
check('the pinned note survives a bulk clear',
  active.length === 1 && active[0].pinned === true, `${active.length} active`);

// --- Trash ---------------------------------------------------------------
console.log('\n# Trash');
await clickText(s, 'nav button', 'Trash');
await settle(s, 400);
body = await text(s);
check('Trash lists the cleared notes', has(body, 'Recently cleared'));
check('Trash shows the time left to recover', has(body, 'days left to recover'));
check('the editor is still available while viewing Trash', await s.evalJson(`
  return document.querySelector('.fn-prose') !== null;
`));
await clickExact(s, 'article button[aria-label="Restore"]', '');
await settle(s, 500);
check('a note can be restored from Trash', has(await text(s), 'Restored to your notes'));
await clickText(s, 'nav button', 'All');
await settle(s, 400);

// --- A failed save is not a silent one -----------------------------------
console.log('\n# Save failure');
await s.evalJson(`
  window.__realSet = chrome.storage.local.set.bind(chrome.storage.local);
  chrome.storage.local.set = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
  return true;
`);
await setEditor(s, 'Compare this with the study from last week.');
await settle(s, 700);
await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 600);

body = await text(s);
check('a failed save says so', has(body, 'Not saved'));
check('it explains what to do', has(body, 'out of space') || has(body, 'Export a backup'));
check('the text is still in the editor',
  (await editorContent(s)).text.includes('study from last week'));
check('retry and copy are offered', has(body, 'Retry save') && has(body, 'Copy draft'));
check('an alert role announces the failure', await s.evalJson('return !!document.querySelector("[role=alert]");'));
await shot(s, `${OUT}/05-failure.png`);

await s.evalJson('chrome.storage.local.set = window.__realSet; return true;');
await clickExact(s, 'button', 'Retry save');
await settle(s, 700);
check('retry succeeds once storage recovers', has(await text(s), 'Saved on this device.'));
check('the retried note is stored exactly once', (await storedNotes(s))
  .filter((n) => n.text.includes('study from last week')).length === 1);

// --- Editing -------------------------------------------------------------
console.log('\n# Editing');
await click(s, 'article button[aria-label^="Edit note"]');
await settle(s, 500);
body = await text(s);
check('a note opens in the editor', has(body, 'Save changes'));
check('the original is kept until changes are saved', has(body, 'original note is kept'));
check('the note content is loaded into the editor',
  (await editorContent(s)).text.trim().length > 0);
await key(s, 'Escape', { code: 'Escape', keyCode: 27 });
await settle(s, 400);
check('Escape cancels the edit', has(await text(s), 'Edit cancelled'));

// --- The Add button sits below the writing surface -----------------------
console.log('\n# Layout');
check('the Add button is below the editor, not inside it', await s.evalJson(`
  const add = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add note');
  const prose = document.querySelector('.fn-prose').getBoundingClientRect();
  return add.getBoundingClientRect().top >= prose.bottom - 2;
`));
check('the header is a single compact row', await s.evalJson(`
  return document.querySelector('header').getBoundingClientRect().height <= 40;
`), await s.evalJson('return String(document.querySelector("header").getBoundingClientRect().height);'));
check('the editor is the tallest single region', await s.evalJson(`
  const prose = document.querySelector('.fn-prose').closest('.overflow-y-auto').getBoundingClientRect().height;
  const list = document.querySelectorAll('.overflow-y-auto')[1].getBoundingClientRect().height;
  return prose >= list;
`));
check('the notes list still gets real space', await s.evalJson(`
  const list = document.querySelectorAll('.overflow-y-auto')[1].getBoundingClientRect().height;
  return list >= 110;
`), await s.evalJson('return String(document.querySelectorAll(".overflow-y-auto")[1].getBoundingClientRect().height);'));

// --- Settings and sources ------------------------------------------------
console.log('\n# Leaving the panel');
// Put a sourced note back in place: earlier steps moved things through Trash,
// so which notes are active at this point is not worth depending on.
await s.evalJson(`
  await chrome.storage.local.set({ 'note:sourced': {
    id: 'sourced',
    html: '<p>a captured passage</p>', text: 'a captured passage', kind: 'selection',
    sourceUrl: 'https://example.edu/learning/recall', sourceTitle: 'The Learning Notebook',
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false, rev: 1, schemaVersion: 2,
  }});
  return true;
`);
await settle(s, 600);

const opened = await s.evalJson(`
  window.__opened = [];
  const realCreate = chrome.tabs.create.bind(chrome.tabs);
  chrome.tabs.create = (o) => { window.__opened.push(o.url); return Promise.resolve({}); };
  const src = document.querySelector('article button[aria-label="Open source"]');
  if (src) src.click();
  await new Promise((r) => setTimeout(r, 300));
  chrome.tabs.create = realCreate;
  return window.__opened;
`);
check('the Source button opens the saved page',
  opened[0] === 'https://example.edu/learning/recall', JSON.stringify(opened));

const settings = await s.evalJson(`
  const before = (await chrome.tabs.query({})).length;
  document.querySelector('button[aria-label="Settings and backup"]').click();
  await new Promise((r) => setTimeout(r, 1500));
  const tabs = await chrome.tabs.query({});
  return { before, after: tabs.length, failed: document.body.innerText.includes('Could not open settings') };
`);
check('the settings gear actually opens a tab', settings.after === settings.before + 1,
  JSON.stringify(settings));
check('the settings gear does not fail silently', settings.failed === false);

// --- Cursors -------------------------------------------------------------
console.log('\n# Cursors');
const cursors = await s.evalJson(`
  const buttons = [...document.querySelectorAll('button')].filter((b) => !b.disabled);
  const wrong = buttons
    .map((b) => ({ label: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 24),
                   cursor: getComputedStyle(b).cursor }))
    .filter((b) => b.cursor !== 'pointer');
  return { wrong, search: getComputedStyle(document.querySelector('input[type=search]')).cursor };
`);
check('every enabled button shows the hand pointer', cursors.wrong.length === 0,
  JSON.stringify(cursors.wrong).slice(0, 300));
check('the search field keeps a text caret', cursors.search === 'auto', cursors.search);

// --- Narrow and short ----------------------------------------------------
console.log('\n# Narrow and short');
await resize(s, 320, 760);
await settle(s, 500);
let box = await s.evalJson(`
  return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
`);
check('no horizontal scroll at 320px', box.scroll <= box.client + 1, JSON.stringify(box));
check('the tabs, search and layout toggle stay on one row at 320px', await s.evalJson(`
  const tabs = document.querySelector('nav[aria-label="Notes views"]').getBoundingClientRect();
  const toggle = document.querySelector('button[aria-label="Card view"]').getBoundingClientRect();
  return Math.abs((tabs.top + tabs.bottom) / 2 - (toggle.top + toggle.bottom) / 2) < 6;
`));
check('search is still usable at 320px', await s.evalJson(`
  return document.querySelector('input[type=search]').getBoundingClientRect().width >= 80;
`), await s.evalJson('return String(document.querySelector("input[type=search]").getBoundingClientRect().width);'));
check('the tab counts give way to search at 320px', await s.evalJson(`
  const count = document.querySelector('.fn-count');
  return count === null || getComputedStyle(count).display === 'none';
`));
await shot(s, `${OUT}/06-narrow.png`);

await resize(s, 400, 560);
await settle(s, 500);
check('the notes list survives a short panel', await s.evalJson(`
  return document.querySelectorAll('.overflow-y-auto')[1].getBoundingClientRect().height >= 100;
`), await s.evalJson('return String(document.querySelectorAll(".overflow-y-auto")[1].getBoundingClientRect().height);'));
check('the footer is still on screen on a short panel', await s.evalJson(`
  return document.querySelector('footer').getBoundingClientRect().bottom <= window.innerHeight + 1;
`));
await resize(s, 400, 880);
await settle(s, 300);

// --- Accessibility -------------------------------------------------------
console.log('\n# Accessibility');
check('every control has an accessible name', await s.evalJson(`
  const unnamed = [...document.querySelectorAll('button')].filter((b) =>
    !b.textContent.trim() && !b.getAttribute('aria-label'));
  return unnamed.length === 0;
`));
check('a polite live region announces outcomes', await s.evalJson(`
  return !!document.querySelector('[role=status][aria-live=polite]');
`));
check('the formatting controls are a labelled toolbar', await s.evalJson(`
  const bar = document.querySelector('[role=toolbar]');
  return bar?.getAttribute('aria-label') === 'Text formatting';
`));
check('formatting buttons report their pressed state', await s.evalJson(`
  const bold = [...document.querySelectorAll('[role=toolbar] button')]
    .find((b) => (b.getAttribute('aria-label') || '').startsWith('Bold'));
  return bold?.hasAttribute('aria-pressed') === true;
`));
check('the editor is labelled and states its shortcut', await s.evalJson(`
  const el = document.querySelector('.fn-prose');
  return el.getAttribute('aria-label') === 'Note body'
    && (el.getAttribute('aria-keyshortcuts') || '').includes('Enter');
`));

// --- Console -------------------------------------------------------------
console.log('\n# Console');
const thrown = errors(s);
const logged = consoleErrors(s);
check('no uncaught exceptions', thrown.length === 0, thrown.join(' | ').slice(0, 300));
check('no console errors or warnings', logged.length === 0, logged.join(' | ').slice(0, 300));

report();
s.close();
