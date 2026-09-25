/**
 * Draft restoration, one draft shared live across panels, a real conflict
 * between an edit and a change made underneath it, and the light theme.
 */
import { Session, targets, waitFor } from '../cdp.mjs';
import { META, PANEL, check, clickExact, editorContent, has, key, openPage, report, settle, shot, storedNotes, text, typeInEditor } from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const s = await openPage(PANEL);

await s.evalJson(`
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ settings: { theme: 'light', trashRetentionDays: 30 } });
  return true;
`);
await s.send('Page.reload');
await settle(s, 1200);

console.log('\n# Light theme');
check('the light theme is applied from settings', await s.evalJson(`
  return document.documentElement.getAttribute('data-theme') === 'light';
`));
check('the panel repaints light', await s.evalJson(`
  return getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)';
`));

console.log('\n# Draft restoration');
await typeInEditor(s, 'An unfinished thought I did not commit');
await settle(s, 800);
check('the draft reaches storage', await s.evalJson(`
  const { draft } = await chrome.storage.local.get('draft');
  return draft?.text === 'An unfinished thought I did not commit';
`));
check('an uncommitted draft is not a note', (await storedNotes(s)).length === 0);

// Closing and reopening the panel is a reload of this page.
await s.send('Page.reload');
await waitFor(async () => s.evalJson('return !!document.querySelector(".fn-prose");'), {
  label: 'the panel to come back',
});
await settle(s, 800);
check('the draft comes back after the panel is reopened',
  (await editorContent(s)).text.trim() === 'An unfinished thought I did not commit');
check('the restored draft says it was saved', has(await text(s), 'Draft saved on this device'));

// Cmd+Enter is an editor shortcut, so focus goes back into the editor first,
// exactly as it would when the user clicks into their restored draft.
await s.evalJson('document.querySelector(".fn-prose").focus(); return true;');
await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 600);
check('committing the restored draft makes exactly one note', (await storedNotes(s)).length === 1);
check('the restored draft is cleared once committed', await s.evalJson(`
  const { draft } = await chrome.storage.local.get('draft');
  return draft === undefined;
`));
await shot(s, `${OUT}/09-light.png`);

console.log('\n# One draft, every panel');
// A second panel, as a second window — or the overlay in another tab — has.
const second = await Session.open(
  (await (await fetch(`http://127.0.0.1:${process.env.FORNOW_CDP_PORT ?? 9222}/json/new?` + encodeURIComponent(PANEL), { method: 'PUT' })).json())
    .webSocketDebuggerUrl,
);
await second.send('Runtime.enable');
await waitFor(async () => second.evalJson('return !!document.querySelector(".fn-prose");'), {
  label: 'the second panel',
});
await settle(second, 800);

// Before this, typing in one panel silently overwrote the other's draft, and
// whichever closed last decided which unfinished thought survived.
await typeInEditor(s, 'half a thought, started in the first panel');
await settle(s, 900);
check('an unfinished thought shows up in the other panel',
  (await editorContent(second)).text.includes('half a thought, started in the first panel'));

await second.evalJson(`
  document.querySelector('.fn-prose').focus();
  document.execCommand('insertText', false, ' and finished in the second');
  return true;
`);
await settle(s, 900);
check('and carries on in the first when continued in the second',
  (await editorContent(s)).text.includes('and finished in the second'));

await second.evalJson('document.querySelector(".fn-prose").focus(); return true;');
await key(second, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 900);
let notes = await storedNotes(s);
check('committing it from either panel makes one note',
  notes.filter((n) => n.text.includes('half a thought')).length === 1, String(notes.length));
check('the other panel’s composer empties too', (await editorContent(s)).text.trim() === '');

console.log('\n# A note pinned while it is being edited');
await typeInEditor(s, 'a note to pin mid-edit');
await s.evalJson('document.querySelector(".fn-prose").focus(); return true;');
await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 800);
await s.evalJson(`
  [...document.querySelectorAll('article')]
    .find((a) => a.innerText.includes('a note to pin mid-edit'))
    .querySelector('button[aria-label^="Edit note"]').click();
  return true;
`);
await settle(s, 800);
// Pinning is not an edit. It used to make the open edit look stale, and the
// save was refused with a warning about a change that never happened.
await second.evalJson(`
  const all = await chrome.storage.local.get(null);
  // The open edit's draft carries the same text, so match note records only.
  const [key, note] = Object.entries(all)
    .find(([k, v]) => k.startsWith('note:') && v.text === 'a note to pin mid-edit');
  await chrome.storage.local.set({ [key]: { ...note, pinned: true, rev: note.rev + 1, updatedAt: Date.now() } });
  return true;
`);
await settle(s, 400);
await s.evalJson(`
  const el = document.querySelector('.fn-prose');
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, 'edited while pinned elsewhere');
  await new Promise((r) => setTimeout(r, 400));
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save changes').click();
  await new Promise((r) => setTimeout(r, 700));
  return true;
`);
check('a pin made elsewhere does not block saving the edit',
  !has(await text(s), 'changed in another window'));
const pinnedEdit = (await storedNotes(s)).find((n) => n.text === 'edited while pinned elsewhere');
check('the edit is saved and the pin is kept', pinnedEdit?.pinned === true, JSON.stringify(pinnedEdit ?? null).slice(0, 120));

console.log('\n# A note changed underneath an edit');
await s.evalJson('await chrome.storage.local.clear(); return true;');
await s.send('Page.reload');
await second.send('Page.reload');
for (const panel of [s, second]) {
  await waitFor(async () => panel.evalJson('return !!document.querySelector(".fn-prose");'), {
    label: 'the panels to come back',
  });
}
await settle(s, 800);
await typeInEditor(s, 'the note both windows have');
await s.evalJson('document.querySelector(".fn-prose").focus(); return true;');
await key(s, 'Enter', { modifiers: META, code: 'Enter', keyCode: 13 });
await settle(s, 800);

await s.evalJson('document.querySelector(\'article button[aria-label^="Edit note"]\').click(); return true;');
await settle(s, 800);

// Another window saves its own change to the same note while this edit is
// open — the path a pin, a restore or another device's write takes.
await second.evalJson(`
  const all = await chrome.storage.local.get(null);
  const [key, note] = Object.entries(all).find(([k]) => k.startsWith('note:'));
  await chrome.storage.local.set({ [key]: {
    ...note,
    html: '<p>the version from the second window</p>',
    text: 'the version from the second window',
    rev: note.rev + 1,
    contentRev: note.contentRev + 1,
    updatedAt: Date.now(),
  } });
  return true;
`);
await settle(s, 400);

await s.evalJson(`
  const el = document.querySelector('.fn-prose');
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, 'the version from the first window');
  await new Promise((r) => setTimeout(r, 400));
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save changes').click();
  await new Promise((r) => setTimeout(r, 700));
  return true;
`);

let body = await text(s);
check('the stale edit is refused, not applied', has(body, 'changed in another window'));
check('the first window keeps its text',
  (await editorContent(s)).text.includes('the version from the first window'));
check('it offers to keep both versions', has(body, 'Save mine as a separate note'));

notes = await storedNotes(s);
check('the winning version is intact', notes.some((n) => n.text === 'the version from the second window'));
check('nothing was overwritten', notes.length === 1, String(notes.length));

await clickExact(s, 'button', 'Save mine as a separate note');
await settle(s, 700);
notes = await storedNotes(s);
check('both versions now exist', notes.length === 2, String(notes.length));
check('neither version was lost',
  notes.some((n) => n.text === 'the version from the first window') &&
  notes.some((n) => n.text === 'the version from the second window'));
check('the conflicting copy is labelled as such',
  notes.some((n) => (n.sourceTitle ?? '').includes('Conflicting copy')));

report();
s.close();
second.close();
