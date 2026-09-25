/**
 * Chrome Web Store listing screenshots, not a test suite.
 *
 * Seeds believable notes, opens the overlay on a real article, and captures
 * each scene at exactly 1280×800 in both light and dark. Not part of the
 * default run:
 *
 *   npm run e2e -- store
 *
 * Output lands in e2e/screenshots/store/{light,dark}/.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Session, targets } from '../cdp.mjs';
import { OPTIONS, check, overlayPanel, report, settle, shot, workerTarget } from '../driver.mjs';

const OUT = join(process.env.FORNOW_SHOTS ?? '.', 'store');
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;
const HOST_PAGE = 'https://en.wikipedia.org/wiki/Spaced_repetition';
const W = 1280;
const H = 800;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Sample notes, newest first. All text is original; nothing personal. */
function sampleNotes(now) {
  const base = [
    {
      kind: 'thought',
      pinned: true,
      tag: 'thesis',
      ago: 3 * DAY,
      html: '<p><strong>Thesis draft due Friday</strong> — chapter 3 still needs the forgetting-curve citation.</p>',
    },
    {
      kind: 'selection',
      ago: 4 * MIN,
      sourceTitle: 'Spaced repetition - Wikipedia',
      sourceUrl: HOST_PAGE,
      tag: 'thesis',
      html: '<blockquote><p>Each time an item is recalled correctly, the gap before its next review grows.</p></blockquote>',
    },
    {
      kind: 'thought',
      ago: 25 * MIN,
      html: '<h2>Study plan — this week</h2><ul data-type="taskList">'
        + '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Make flashcards for ch. 2</p></div></li>'
        + '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Review deck (15 min)</p></div></li>'
        + '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Practice test on Thursday</p></div></li>'
        + '</ul>',
    },
    {
      kind: 'link',
      ago: 2 * HOUR,
      targetUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API',
      sourceTitle: 'Web Speech API - MDN',
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API',
      html: '<p>Web Speech API — try it for the voice-notes idea</p>',
    },
    {
      kind: 'thought',
      ago: 5 * HOUR,
      tag: 'work',
      html: '<p>Squash the last three commits before opening the PR:</p><pre><code>git rebase -i HEAD~3</code></pre>',
    },
    {
      kind: 'thought',
      ago: 1 * DAY + 2 * HOUR,
      tag: 'work',
      html: '<p>Design review moved to <strong>Thursday 3pm</strong>. Send the prototype link the day before.</p>',
    },
    {
      kind: 'thought',
      ago: 2 * DAY + 4 * HOUR,
      html: '<h2>Lisbon weekend</h2><ul><li>Tram 28 early, before the queues</li><li>Pastéis in Belém</li><li>Sunset at the Miradouro</li></ul>',
    },
    {
      kind: 'thought',
      ago: 6 * DAY,
      html: '<p>Gift idea for Sam: a good notebook and a fountain pen.</p>',
    },
  ];
  return base.map((n, i) => {
    const at = now - n.ago;
    const text = n.html
      .replace(/<\/(p|h2|li|blockquote|pre)>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n+/g, '\n')
      .trim();
    const { ago, ...rest } = n;
    return {
      id: `00000000-0000-4000-8000-00000000000${i}`,
      pinned: false,
      ...rest,
      text,
      createdAt: at,
      updatedAt: at,
      rev: 1,
      contentRev: 1,
      schemaVersion: 4,
    };
  });
}

const SETTINGS = (theme) => ({
  theme,
  lightPalette: undefined,
  darkPalette: undefined,
  accent: null,
  editorFont: 'sans',
  textSize: 'medium',
  trashRetentionDays: 30,
  showLauncher: false,
});

// --- Browser plumbing -----------------------------------------------------

const page = (await targets(PORT)).find((t) => t.type === 'page');
const s = await Session.open(page.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: false,
});

const sw = await Session.open((await workerTarget()).webSocketDebuggerUrl);
await sw.send('Runtime.enable');

async function seed(theme) {
  const notes = sampleNotes(Date.now());
  const ok = await sw.evalJson(`
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('note:') || k === 'draft'));
    const current = (await chrome.storage.local.get('settings')).settings ?? {};
    const next = ${JSON.stringify(SETTINGS(theme))};
    for (const k of Object.keys(next)) if (next[k] === undefined) next[k] = current[k];
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const items = { settings: next };
    for (const n of ${JSON.stringify(notes)}) items['note:' + n.id] = n;
    await chrome.storage.local.set(items);
    return true;
  `);
  check(`seeded ${notes.length} notes (${theme})`, ok === true, String(ok));
}

async function openHost(theme) {
  await s.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  await s.send('Page.navigate', { url: HOST_PAGE });
  await settle(s, 2500);
  // Wikipedia's own night theme, and no banners or scrollbars in the shot.
  await s.evalJson(`
    const html = document.documentElement;
    html.classList.remove('skin-theme-clientpref-day', 'skin-theme-clientpref-os', 'skin-theme-clientpref-night');
    html.classList.add(${JSON.stringify(theme === 'dark' ? 'skin-theme-clientpref-night' : 'skin-theme-clientpref-day')});
    const style = document.createElement('style');
    style.textContent = 'html::-webkit-scrollbar{display:none} #centralNotice,.cdx-message,#siteNotice{display:none!important}';
    document.head.append(style);
    window.scrollTo(0, 0);
    return true;
  `);
  await settle(s, 400);
}

async function openOverlay() {
  const res = await sw.evalJson(`
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return true;
    } catch (e) { return String(e); }
  `);
  check('overlay injected', res === true, String(res));
  await settle(s, 1800);
  return overlayPanel();
}

/** Run in the overlay's panel frame. */
const inPanel = (p, body) => p.evalJson(body);

async function clickByLabel(p, label) {
  return inPanel(p, `
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === ${JSON.stringify(label)} || x.textContent.trim() === ${JSON.stringify(label)});
    if (!b) return false;
    b.click();
    return true;
  `);
}

// --- Scenes -----------------------------------------------------------------

for (const theme of ['light', 'dark']) {
  console.log(`\n# ${theme}`);
  const dir = join(OUT, theme);
  mkdirSync(dir, { recursive: true });

  await seed(theme);
  await openHost(theme);
  let p = await openOverlay();
  await clickByLabel(p, 'List view');
  await settle(s, 500);

  // 1. The panel over a page, with a week of notes.
  await shot(s, join(dir, '1-notes-over-page.png'));

  // 2. Rich text while writing, with a passage selected on the page.
  await s.evalJson(`
    const para = [...document.querySelectorAll('#mw-content-text p')].find((x) => x.innerText.length > 200);
    const range = document.createRange();
    range.selectNodeContents(para);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return true;
  `);
  await inPanel(p, `
    const el = document.querySelector('.fn-prose');
    el.focus();
    document.execCommand('insertHTML', false,
      '<h2>Why spacing works</h2><ul><li>Recall is effortful, so it <strong>sticks</strong></li><li>Longer gaps each time you get it right</li><li>Cheap: 10 minutes a day</li></ul>');
    return true;
  `);
  await settle(s, 800);
  await shot(s, join(dir, '2-rich-text-editor.png'));
  await s.evalJson('getSelection().removeAllRanges(); return true;');

  // Commit it, so the next scenes show it saved.
  await inPanel(p, `
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add note')?.click();
    return true;
  `);
  await settle(s, 900);

  // 3. Search.
  await inPanel(p, `
    const input = document.querySelector('input[type=search]');
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'review');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  await settle(s, 700);
  await shot(s, join(dir, '3-search.png'));
  await inPanel(p, `
    const input = document.querySelector('input[type=search]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    return true;
  `);
  await settle(s, 400);

  // 4. Card view.
  check('card view toggle', await clickByLabel(p, 'Card view'));
  await settle(s, 700);
  await shot(s, join(dir, '4-card-view.png'));
  await clickByLabel(p, 'List view');
  await settle(s, 400);

  // 5. Clear unpinned, with Undo on offer.
  await inPanel(p, `
    [...document.querySelectorAll('footer button')].find((b) => b.textContent.includes('Clear unpinned'))?.click();
    return true;
  `);
  await settle(s, 400);
  check('confirm Move to Trash', await clickByLabel(p, 'Move to Trash'));
  await settle(s, 700);
  await shot(s, join(dir, '5-clear-with-undo.png'));
  p.close();

  // 6. Settings: appearance.
  await s.send('Page.navigate', { url: OPTIONS });
  await settle(s, 1200);
  await s.evalJson(`
    const style = document.createElement('style');
    style.textContent = '::-webkit-scrollbar{display:none}';
    document.head.append(style);
    return true;
  `);
  await settle(s, 200);
  await shot(s, join(dir, '6-settings.png'));
}

sw.close();
s.close();
report();
