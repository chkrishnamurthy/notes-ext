/** Draft restoration, a real two-window conflict, and the light theme. */
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

console.log('\n# Two windows editing the same note');
// A second panel, as a second Chrome window would have.
const second = await Session.open(
  (await (await fetch(`http://127.0.0.1:${process.env.FORNOW_CDP_PORT ?? 9222}/json/new?` + encodeURIComponent(PANEL), { method: 'PUT' })).json())
    .webSocketDebuggerUrl,
);
await second.send('Runtime.enable');
await waitFor(async () => second.evalJson('return !!document.querySelector(".fn-prose");'), {
  label: 'the second panel',
});
await settle(second, 800);

// Both open the same note for editing.
await s.evalJson('document.querySelector(\'article button[aria-label^="Edit note"]\').click(); return true;');
await second.evalJson('document.querySelector(\'article button[aria-label^="Edit note"]\').click(); return true;');
await settle(s, 400);

// The second window commits first.
await second.evalJson(`
  const el = document.querySelector('.fn-prose');
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, 'the version from the second window');
  await new Promise((r) => setTimeout(r, 400));
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save changes').click();
  await new Promise((r) => setTimeout(r, 600));
  return true;
`);
check('the second window saves', await second.evalJson(`
  return document.body.innerText.includes('Changes saved on this device');
`));

// The first window now tries to commit its stale edit.
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

let notes = await storedNotes(s);
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
