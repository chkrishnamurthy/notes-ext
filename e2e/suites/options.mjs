/** Options page: backup export, import round trip, retention, and theme. */
import { OPTIONS, check, clickExact, clickText, consoleErrors, errors, has, openPage, report, settle, shot, text } from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const s = await openPage(OPTIONS, { width: 1440, height: 1100 });

// Seed a store that covers every shape a backup has to carry.
await s.evalJson(`
  await chrome.storage.local.clear();
  const now = Date.now();
  const notes = [
    { id: 'n1', html: '<h1>Plan</h1><ul><li><p>a <strong>pinned</strong> thought</p></li></ul>',
      text: 'Plan\\na pinned thought', kind: 'thought',
      createdAt: now, updatedAt: now, pinned: true, rev: 3, schemaVersion: 2 },
    { id: 'n2', html: '<pre><code>function f() {\\n    return 1;\\n}</code></pre>',
      text: 'function f() {\\n    return 1;\\n}', kind: 'thought',
      createdAt: now, updatedAt: now, pinned: false, rev: 1, schemaVersion: 2 },
    { id: 'n3', html: '<p>a captured passage</p>', text: 'a captured passage', kind: 'selection',
      sourceUrl: 'https://example.edu/learning/recall', sourceTitle: 'The Learning Notebook',
      createdAt: now, updatedAt: now, pinned: false, rev: 2, schemaVersion: 2 },
    { id: 'n4', html: '<p>cleared earlier</p>', text: 'cleared earlier', kind: 'thought',
      createdAt: now, updatedAt: now, pinned: false, deletedAt: now - 1000, rev: 1, schemaVersion: 2 },
  ];
  const items = {};
  for (const n of notes) items['note:' + n.id] = n;
  await chrome.storage.local.set(items);
  return true;
`);
await s.send('Page.reload');
await settle(s, 1200);

let body = await text(s);
console.log('\n# Reporting');
check('it counts active notes', has(body, '3'));
check('it counts notes in Trash', has(body, 'In Trash'));
check('it reports storage against the documented limit', has(body, 'of 10.0 MB'));
check('it warns that uninstalling deletes local notes', has(body, 'Removing the extension deletes'));
check('it describes local storage honestly', has(body, 'not an encrypted vault'));

console.log('\n# Export');
// Let the real download happen and read the file Chrome writes, so the CSP,
// the blob URL and the filename are all exercised for real.
const { mkdtempSync, readdirSync, readFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const downloadDir = mkdtempSync(join(tmpdir(), 'fornow-dl-'));
await s.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

await clickText(s, 'button', 'Export backup');
await settle(s, 1200);

const files = readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload'));
check('the export really downloads a file', files.length === 1, JSON.stringify(readdirSync(downloadDir)));
const exported = { name: files[0] ?? '', text: files[0] ? readFileSync(join(downloadDir, files[0]), 'utf8') : '{}' };

check('the file is named by date', /^for-now-backup-\d{4}-\d{2}-\d{2}\.json$/.test(exported.name),
  exported.name);
const parsed = JSON.parse(exported.text);
check('the export is valid JSON with a For Now marker', parsed.app === 'for-now');
check('it carries a schema version', parsed.schemaVersion === 4);
check('it includes every note, Trash included', parsed.notes.length === 4, String(parsed.notes.length));
check('pinned state is exported', parsed.notes.find((n) => n.id === 'n1')?.pinned === true);
check('trashed state is exported', parsed.notes.find((n) => n.id === 'n4')?.deletedAt !== undefined);
check('source metadata is exported', parsed.notes.find((n) => n.id === 'n3')?.sourceUrl ===
  'https://example.edu/learning/recall');
check('code whitespace is exported verbatim',
  parsed.notes.find((n) => n.id === 'n2')?.text === 'function f() {\n    return 1;\n}');
check('rich formatting is exported',
  parsed.notes.find((n) => n.id === 'n1')?.html.includes('<strong>'));
check('the export confirms what it wrote', has(await text(s), 'Exported 4 notes'));
await shot(s, `${OUT}/07-options.png`, true);

console.log('\n# Import round trip');
// Wipe, then restore from the file that was just exported.
await s.evalJson('await chrome.storage.local.clear(); return true;');
await s.send('Page.reload');
await settle(s, 1000);
check('the store is empty before the restore', await s.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('note:')).length === 0;
`));

await s.evalJson(`
  const file = new File([${JSON.stringify(exported.text)}], 'backup.json', { type: 'application/json' });
  const input = document.querySelector('input[type=file]');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  return true;
`);
body = await text(s);
check('an import is previewed before anything is written', has(body, '4 notes read'));
check('the preview offers merge and replace', has(body, 'Merge into my notes') && has(body, 'Replace everything'));
check('nothing is written until it is confirmed', await s.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('note:')).length === 0;
`));

await clickExact(s, 'button', 'Merge into my notes');
await settle(s, 800);
check('the import reports what it did', has(await text(s), 'Imported: 4 added'));

const restored = await s.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.entries(all).filter(([k]) => k.startsWith('note:')).map(([, v]) => v);
`);
check('every note is restored', restored.length === 4, String(restored.length));
check('the restored snippet is byte-identical',
  restored.find((n) => n.id === 'n2')?.text === 'function f() {\n    return 1;\n}');
check('the restored formatting is intact',
  restored.find((n) => n.id === 'n1')?.html.includes('<strong>'));
check('the restored pin survives', restored.find((n) => n.id === 'n1')?.pinned === true);
check('the restored Trash entry stays in Trash',
  restored.find((n) => n.id === 'n4')?.deletedAt !== undefined);

console.log('\n# Rejecting a bad file');
await s.evalJson(`
  const file = new File(['{"app":"some-other-app","notes":[]}'], 'wrong.json', { type: 'application/json' });
  const input = document.querySelector('input[type=file]');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  return true;
`);
check('a file from another app is refused by name', has(await text(s), 'not exported by For Now'));
check('the refusal changes nothing', await s.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('note:')).length === 4;
`));

console.log('\n# Settings');
await s.evalJson(`
  const select = document.querySelector('#retention');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, '7');
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  return true;
`);
check('the retention window is saved', await s.evalJson(`
  const { settings } = await chrome.storage.local.get('settings');
  return settings?.trashRetentionDays === 7;
`));

const radio = (group, value) => `
  document.querySelector('[role=radiogroup][aria-label="${group}"] [data-value="${value}"], [role=radiogroup][aria-label="${group}"] [data-palette="${value}"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return true;
`;
const stored = () => s.evalJson(`return (await chrome.storage.local.get('settings')).settings;`);

console.log('\n# Appearance');
check('the mode defaults to following the system', (await stored())?.theme === 'system' ||
  (await stored())?.theme === undefined);
await s.evalJson(radio('Mode', 'light'));
check('choosing light theme applies immediately', await s.evalJson(`
  return document.documentElement.getAttribute('data-theme') === 'light';
`));
check('the light theme actually repaints', await s.evalJson(`
  return getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)';
`), await s.evalJson('return getComputedStyle(document.body).backgroundColor;'));
check('pinning light hides the dark palette picker', await s.evalJson(`
  return !document.querySelector('[role=radiogroup][aria-label="Dark theme"]') &&
    !!document.querySelector('[role=radiogroup][aria-label="Light theme"]');
`));

await s.evalJson(radio('Light theme', 'paper'));
check('choosing a palette repaints the page', await s.evalJson(`
  return getComputedStyle(document.body).backgroundColor === 'rgb(255, 253, 248)';
`), await s.evalJson('return getComputedStyle(document.body).backgroundColor;'));
check('the palette is saved', (await stored())?.lightPalette === 'paper');

await s.evalJson(radio('Mode', 'system'));
await s.evalJson(radio('Dark theme', 'slate'));
check('system mode offers a palette for each mode', (await stored())?.darkPalette === 'slate' &&
  (await stored())?.theme === 'system');
check('the preview shows the dark palette just chosen', await s.evalJson(`
  const p = document.querySelector('[data-preview-mode]');
  return p.dataset.previewMode === 'dark' && getComputedStyle(p).backgroundColor === 'rgb(26, 32, 41)';
`));

// Pinned light, so the check below does not depend on the machine's theme.
await s.evalJson(radio('Mode', 'light'));
// The native picker cannot be driven, so set its value the way it would.
await s.evalJson(`
  const input = document.querySelector('#accent-custom');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '#ffe45c');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 800));
  return true;
`);
check('a custom accent is saved as picked', (await stored())?.accent === '#ffe45c');
const accentOnPage = await s.evalJson(`
  return getComputedStyle(document.documentElement).getPropertyValue('--fn-accent').trim();
`);
check('a pale custom accent is darkened to stay readable in light mode',
  accentOnPage !== '#ffe45c' && accentOnPage.startsWith('#'), accentOnPage);

await s.evalJson(radio('Note font', 'serif'));
await s.evalJson(radio('Text size', 'large'));
check('typography is saved', (await stored())?.editorFont === 'serif' && (await stored())?.textSize === 'large');
check('typography reaches the page', await s.evalJson(`
  const cs = getComputedStyle(document.documentElement);
  return cs.getPropertyValue('--fn-text').trim() === '17px' &&
    cs.getPropertyValue('--fn-note-font').includes('Georgia');
`));
await shot(s, `${OUT}/08b-options-appearance.png`, true);

await s.evalJson(`
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reset appearance').click();
  await new Promise((r) => setTimeout(r, 400));
  return true;
`);
const reset = await stored();
check('reset returns to System, Sage and no accent',
  reset?.theme === 'system' && reset?.lightPalette === 'sage' && reset?.darkPalette === 'sage' &&
  reset?.accent === null && reset?.textSize === 'large', JSON.stringify(reset));
await s.evalJson(radio('Mode', 'light'));
await shot(s, `${OUT}/08-options-light.png`, true);

console.log('\n# Console');
check('no uncaught exceptions', errors(s).length === 0, errors(s).join(' | ').slice(0, 300));
check('no console errors or warnings', consoleErrors(s).length === 0, consoleErrors(s).join(' | ').slice(0, 300));

report();
s.close();
