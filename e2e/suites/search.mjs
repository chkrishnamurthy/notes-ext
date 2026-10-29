/**
 * Finding notes: ranked search that forgives accents and a typo, and the
 * filter for one site's notes. The notes are written straight to storage so
 * the suite does not depend on capturing them first.
 */
import { PANEL, check, clickExact, clickReal, key, openPage, report, resetStorage, settle, text } from '../driver.mjs';

const s = await openPage(PANEL);
await resetStorage(s);

const NOW = Date.now();
await s.evalJson(`
  const base = { kind: 'selection', pinned: false, rev: 1, contentRev: 1, schemaVersion: 4 };
  const make = (id, body, extra, age) => ({
    ...base, id, html: '<p>' + body + '</p>', text: body,
    createdAt: ${NOW} - age, updatedAt: ${NOW} - age, ...extra,
  });
  await chrome.storage.local.set({
    'note:a': make('a', 'Notes about the budget review', { kind: 'thought' }, 1000),
    'note:b': make('b', 'Something else entirely', { tag: 'budget', kind: 'thought' }, 2000),
    'note:c': make('c', 'Café menu for Friday', { sourceUrl: 'https://docs.example.com/guide', sourceTitle: 'Guide' }, 3000),
    'note:d': make('d', 'Recall beats rereading', { sourceUrl: 'https://www.other.test/page', sourceTitle: 'Study' }, 4000),
  });
  return true;
`);
await s.send('Page.reload');
await settle(s, 1200);

const search = async (query) => {
  await s.evalJson(`
    const input = document.querySelector('input[type=search]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await settle(s, 500);
  return text(s);
};

console.log('\n# Ranked search');
let body = await search('budget');
check('a tag hit is listed above a body hit', body.indexOf('Something else entirely') < body.indexOf('Notes about the budget review'),
  body.slice(0, 300));

console.log('\n# Forgiving search');
body = await search('cafe');
check('an unaccented query finds an accented note', body.includes('Café menu'));
body = await search('recal');
check('a typo still finds the note', body.includes('Recall beats rereading'));
body = await search('zzzzzz');
check('nothing matching shows the empty search state', !body.includes('Recall beats rereading'));
await search('');

console.log('\n# One site');
check('a captured note shows its site', (await text(s)).includes('docs.example.com'));
check('a leading www is not part of the site', (await text(s)).includes('other.test')
  && !(await text(s)).includes('www.other.test'));
await clickReal(s, 'button[title="Show only notes from docs.example.com"]');
await settle(s, 400);
body = await text(s);
check('choosing a site shows only its notes', body.includes('Café menu') && !body.includes('Recall beats rereading')
  && !body.includes('Notes about the budget review'));
check('the filter says what it is filtering by', body.includes('From docs.example.com'));
await key(s, 'Escape', { code: 'Escape', keyCode: 27 });
await settle(s, 400);
body = await text(s);
check('Escape returns to every note', body.includes('Recall beats rereading') && !body.includes('From docs.example.com'));

console.log('\n# One-time review request');
check('it stays away from a panel with few notes', !(await text(s)).includes('Finding Holdpad useful?'));
await s.evalJson(`
  const items = {};
  for (let i = 0; i < 10; i += 1) {
    items['note:r' + i] = {
      id: 'r' + i, html: '<p>note ' + i + '</p>', text: 'note ' + i, kind: 'thought', pinned: false,
      rev: 1, contentRev: 1, schemaVersion: 4, createdAt: ${NOW} - i, updatedAt: ${NOW} - i,
    };
  }
  await chrome.storage.local.set(items);
  return true;
`);
await s.send('Page.reload');
await settle(s, 1200);
check('it appears once there are ten notes', (await text(s)).includes('Finding Holdpad useful?'));
await clickExact(s, 'button', 'No thanks');
await settle(s, 400);
check('answering removes it', !(await text(s)).includes('Finding Holdpad useful?'));
check('and it is not asked again', await s.evalJson(`
  const r = await chrome.storage.local.get('settings');
  return r.settings?.reviewAsked === true;
`));
await s.send('Page.reload');
await settle(s, 1200);
check('not even after a reload', !(await text(s)).includes('Finding Holdpad useful?'));

report();
s.close();
