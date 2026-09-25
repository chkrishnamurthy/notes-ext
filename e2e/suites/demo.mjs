/**
 * The ~30-second Chrome Web Store demo video, recorded from the real extension.
 *
 * Every step is the extension doing the real thing, driven by real mouse and
 * keyboard input over DevTools. Two things Chrome does not draw into a page
 * capture are drawn in instead: the mouse pointer, and the right-click menu.
 * Choosing the menu item then runs the same capture the menu does (reading the
 * selection with capture.js and saving it through storage).
 *
 * Frames come from Page.startScreencast and are encoded to MP4 by Chrome's own
 * MediaRecorder, so no ffmpeg is needed. Not part of the default run, and it
 * needs a visible Chrome window: in headless mode the compositor stalls about
 * 20 seconds in, once the overlay's frame has had keyboard focus, and the
 * screencast stops.
 *
 *   FORNOW_HEADFUL=1 npm run e2e -- demo
 *
 * Output: store/assets/demo-video.mp4 (or .webm where Chrome cannot record MP4).
 * With FORNOW_DEMO_THEME=dark, the same demo in dark mode: demo-video-dark.mp4.
 * FORNOW_DEMO_PAGE_THEME sets the web page (and the drawn menu) apart from the
 * extension, e.g. FORNOW_DEMO_THEME=dark FORNOW_DEMO_PAGE_THEME=light for a
 * dark panel on a light page: demo-video-dark-extension-on-light-page.mp4.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Session, targets, waitFor } from '../cdp.mjs';
import { check, inShell, overlayPanel, report, settle, workerTarget } from '../driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../store/assets');
// The extension icon, for the end card. Its artwork is the middle 96 of 128px.
const ICON_128 = 'data:image/png;base64,' + readFileSync(resolve(HERE, '../../src/public/icons/icon-128.png')).toString('base64');
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;
const HOST_PAGE = 'https://en.wikipedia.org/wiki/Spaced_repetition';
const THEME = process.env.FORNOW_DEMO_THEME === 'dark' ? 'dark' : 'light';
const PAGE_THEME = ['dark', 'light'].includes(process.env.FORNOW_DEMO_PAGE_THEME)
  ? process.env.FORNOW_DEMO_PAGE_THEME
  : THEME;
const W = 1280;
const H = 800;
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Name the step when an evaluation fails; the protocol error alone does not.
const evalJson = Session.prototype.evalJson;
Session.prototype.evalJson = async function (expression) {
  try {
    return await evalJson.call(this, expression);
  } catch (error) {
    throw new Error(`${error.message}\n  in: ${expression.trim().slice(0, 160)}`);
  }
};
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// --- Sample notes: a few, so the list looks lived-in but the new ones stand out.
function sampleNotes(now) {
  const notes = [
    { ago: 3 * DAY, pinned: true, tag: 'thesis',
      html: '<p><strong>Thesis draft due Friday</strong> — chapter 3 still needs the forgetting-curve citation.</p>' },
    { ago: 2 * HOUR, tag: 'work',
      html: '<p>Squash the last three commits before opening the PR:</p><pre><code>git rebase -i HEAD~3</code></pre>' },
    { ago: 1 * DAY + 2 * HOUR,
      html: '<p>Design review moved to <strong>Thursday 3pm</strong>. Send the prototype link the day before.</p>' },
    { ago: 2 * DAY + 4 * HOUR,
      html: '<h2>Lisbon weekend</h2><ul><li>Tram 28 early, before the queues</li><li>Pastéis in Belém</li></ul>' },
  ];
  return notes.map((n, i) => {
    const at = now - n.ago;
    const text = n.html.replace(/<\/(p|h2|li|pre)>/g, '\n').replace(/<[^>]+>/g, '').replace(/\n+/g, '\n').trim();
    const { ago, ...rest } = n;
    return {
      id: `00000000-0000-4000-8000-0000000000d${i}`, kind: 'thought', pinned: false, ...rest,
      text, createdAt: at, updatedAt: at, rev: 1, contentRev: 1, schemaVersion: 4,
    };
  });
}

// --- The director layer: captions, pointer, menu and end card, drawn into the
// host page in the top layer so they sit above the overlay panel.
const DIRECTOR = `
  if (!window.__demo) {
    const layer = document.createElement('div');
    layer.setAttribute('popover', 'manual');
    layer.style.cssText = 'position:fixed;inset:0;width:auto;height:auto;margin:0;padding:0;border:0;'
      + 'background:transparent;overflow:visible;pointer-events:none;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;';
    layer.innerHTML = \`
      <style>
        .cap { position:absolute; left:40px; bottom:40px; max-width:540px; display:flex; gap:12px; align-items:center;
          background:rgb(22 30 26 / .92); color:#fbfaf7; padding:14px 20px 14px 14px; border-radius:14px;
          font-size:21px; font-weight:600; line-height:1.3; box-shadow:0 12px 32px rgb(0 0 0 / .28);
          ${PAGE_THEME === 'dark' ? 'outline:1px solid rgb(255 255 255 / .16);' : ''}
          opacity:0; transform:translateY(10px); transition:opacity .35s, transform .35s; }
        .cap.on { opacity:1; transform:none; }
        .cap b { flex:none; width:34px; height:34px; border-radius:9px; background:#315e49; display:grid; place-items:center; font-size:17px; }
        .ptr { position:absolute; left:-40px; top:-40px; width:22px; height:32px; transition:left .7s cubic-bezier(.3,.7,.3,1), top .7s cubic-bezier(.3,.7,.3,1); }
        .ring { position:absolute; width:34px; height:34px; margin:-17px 0 0 -17px; border-radius:50%;
          background:rgb(49 94 73 / .35); transform:scale(.2); opacity:0; }
        .ring.go { animation:ring .45s ease-out; }
        @keyframes ring { from { transform:scale(.2); opacity:1 } to { transform:scale(1.4); opacity:0 } }
        .menu { position:absolute; display:none; min-width:250px; padding:5px; background:${PAGE_THEME === 'dark' ? '#2b2b2b' : '#fff'}; color:${PAGE_THEME === 'dark' ? '#ececec' : '#1f1f1f'}; border-radius:9px;
          box-shadow:0 10px 30px rgb(0 0 0 / .22), 0 0 0 1px rgb(0 0 0 / .08); font-size:13.5px; }
        .menu div { padding:5px 10px; border-radius:5px; display:flex; align-items:center; gap:8px; white-space:nowrap; }
        .menu hr { border:0; border-top:1px solid ${PAGE_THEME === 'dark' ? '#454545' : '#e3e3e3'}; margin:4px 6px; }
        .menu .hi { background:#0a64d6; color:#fff; }
        .menu img { width:16px; height:16px; }
        .end { position:absolute; inset:0; background:#315e49; color:#fbfaf7; display:grid; place-content:center; justify-items:center;
          text-align:center; gap:14px; opacity:0; transition:opacity .6s; }
        .end.on { opacity:1; }
        .end .mk { width:160px; height:160px; margin:-20px 0 -10px;
          filter:drop-shadow(0 0 1.5px rgb(255 255 255 / .7)) drop-shadow(0 10px 20px rgb(0 0 0 / .3)); }
        /* The host page styles its own h1 and p; reset what reaches these. */
        .end h1 { margin:0; padding:0; border:0; color:#fbfaf7; font:750 64px/1.1 -apple-system,"Segoe UI",Roboto,sans-serif; letter-spacing:-.02em; }
        .end p { margin:0; padding:0; color:#fbfaf7; font:600 28px/1.3 -apple-system,"Segoe UI",Roboto,sans-serif; }
        .end small { font-size:20px; opacity:.8; }
      </style>
      <div class="cap"><b></b><span></span></div>
      <div class="menu"></div>
      <div class="ring"></div>
      <svg class="ptr" viewBox="0 0 22 32"><path d="M1 1 L1 25 L7 19.5 L11 30 L15 28.5 L11 18 L19 18 Z"
        fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div class="end"><img class="mk" src="${ICON_128}" alt=""><h1>Holdpad</h1>
        <p>Quick Notes &amp; Notepad for Any Page</p><small>Free · Private · Offline — your notes never leave your device</small></div>\`;
    document.documentElement.append(layer);
    layer.showPopover();
    const $ = (s) => layer.querySelector(s);
    window.__demo = {
      raise() { layer.hidePopover(); layer.showPopover(); },
      caption(step, text) {
        const c = $('.cap');
        if (!text) { c.classList.remove('on'); return; }
        c.classList.remove('on');
        setTimeout(() => { c.querySelector('b').textContent = step; c.querySelector('span').textContent = text; c.classList.add('on'); }, text && c.textContent.trim() ? 250 : 0);
      },
      point(x, y, fast) {
        const p = $('.ptr');
        p.style.transitionDuration = fast ? '0s' : '';
        p.style.left = x + 'px'; p.style.top = y + 'px';
      },
      ring(x, y) {
        const r = $('.ring'); r.style.left = x + 'px'; r.style.top = y + 'px';
        r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
      },
      menu(x, y, items) {
        const m = $('.menu');
        if (!items) { m.style.display = 'none'; return; }
        m.innerHTML = items.map((it) => it === '-' ? '<hr>' : '<div data-k="' + (it.k || '') + '">' + (it.icon ? '<img src="' + it.icon + '">' : '') + it.t + '</div>').join('');
        m.style.left = x + 'px'; m.style.top = y + 'px'; m.style.display = 'block';
      },
      hover(k) { for (const d of layer.querySelectorAll('.menu div')) d.classList.toggle('hi', d.dataset.k === k); },
      menuItem(k) { const r = layer.querySelector('.menu div[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; },
      end() { $('.end').classList.add('on'); $('.cap').classList.remove('on'); $('.ptr').style.display = 'none'; },
    };
  }
  return true;
`;

// --- Browser plumbing -------------------------------------------------------

const page = (await targets(PORT)).find((t) => t.type === 'page');
const s = await Session.open(page.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: PAGE_THEME }] });

/**
 * A session on the extension's service worker, once its APIs are there.
 *
 * Attaching while Chrome is starting or stopping the worker can land in a
 * context without `chrome`, so check, and attach again if so.
 */
async function worker() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const session = await Session.open((await workerTarget()).webSocketDebuggerUrl);
    await session.send('Runtime.enable');
    const ready = await session.evalJson("return typeof chrome === 'object' && !!chrome.storage;").catch(() => false);
    if (ready) return session;
    session.close();
    await wait(500);
  }
  throw new Error('The service worker never exposed its chrome APIs');
}
const sw = await worker();

// Seed notes and the theme.
await sw.evalJson(`
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('note:') || k === 'draft'));
  const settings = { ...((await chrome.storage.local.get('settings')).settings ?? {}), theme: ${JSON.stringify(THEME)}, textSize: 'medium' };
  const items = { settings };
  for (const n of ${JSON.stringify(sampleNotes(Date.now()))}) items['note:' + n.id] = n;
  await chrome.storage.local.set(items);
  return true;
`);

await s.send('Page.navigate', { url: HOST_PAGE });
await settle(s, 2500);
await s.evalJson(`
  const html = document.documentElement;
  html.classList.remove('skin-theme-clientpref-os', 'skin-theme-clientpref-night', 'skin-theme-clientpref-day');
  html.classList.add(${JSON.stringify(PAGE_THEME === 'dark' ? 'skin-theme-clientpref-night' : 'skin-theme-clientpref-day')});
  const style = document.createElement('style');
  style.textContent = 'html::-webkit-scrollbar{display:none} #centralNotice,.cdx-message,#siteNotice{display:none!important}';
  document.head.append(style);
  window.scrollTo(0, 0);
  return true;
`);
await s.evalJson(DIRECTOR);
const ICON = await sw.evalJson(`return chrome.runtime.getURL('icons/icon-16.png');`);
// The page cannot load an extension image, so hand it over as data.
const ICON_DATA = await sw.evalJson(`
  const b = await (await fetch(${JSON.stringify(ICON)})).blob();
  return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
`);

// --- Input helpers ------------------------------------------------------------

let pointer = { x: 520, y: 430 };
async function moveTo(x, y, ms = 750) {
  await s.evalJson(`__demo.point(${x}, ${y}); return true;`);
  // Real mouse moves too, so hover states in the panel respond.
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    await s.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pointer.x + ((x - pointer.x) * i) / steps,
      y: pointer.y + ((y - pointer.y) * i) / steps,
    });
    await wait(ms / steps);
  }
  pointer = { x, y };
}
async function click(x, y) {
  await moveTo(x, y);
  await s.evalJson(`__demo.ring(${x}, ${y}); return true;`);
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(250);
}
async function typeText(text, delay = 55) {
  for (const ch of text) {
    await s.send('Input.insertText', { text: ch });
    await wait(delay + Math.random() * 35);
  }
}
async function key(k, code, keyCode, modifiers = 0) {
  const base = { modifiers, key: k, code, windowsVirtualKeyCode: keyCode };
  await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const marks = [];
const caption = (step, text) => {
  marks.push({ step, at: Date.now() / 1000 });
  return s.evalJson(`__demo.caption(${JSON.stringify(step)}, ${JSON.stringify(text)}); return true;`);
};

/** Page coordinates of an element inside the overlay panel. */
let frameAt = { x: 0, y: 0 };
async function inPanelAt(panel, js) {
  const r = await panel.evalJson(`const el = ${js}; if (!el) return null; const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
  if (!r) throw new Error(`Not found in the panel: ${js}`);
  return { x: Math.round(frameAt.x + r.x), y: Math.round(frameAt.y + r.y) };
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`;

// --- Recording ----------------------------------------------------------------

const frames = [];
s.ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method !== 'Page.screencastFrame') return;
  frames.push({ t: msg.params.metadata.timestamp, data: msg.params.data });
  s.send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
});
// Keep the shared event log from holding every frame twice.
const trim = setInterval(() => { s.events = s.events.filter((e) => e.method !== 'Page.screencastFrame'); }, 1000);

await s.evalJson(`__demo.point(520, 430, true); return true;`);
await s.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await wait(400);

// 1. Open it.
await caption('1', 'Holdpad — quick notes beside any page. Open it with Alt+Shift+N.');
await wait(1800);
await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  return true;
`);
const panel = await overlayPanel();
await wait(1300);
await s.evalJson('__demo.raise(); return true;');
const frameRect = await inShell(s, `const b = this.querySelector('.fn-frame iframe').getBoundingClientRect(); return { x: b.left, y: b.top };`);
frameAt = frameRect;
check('the overlay opened', !!frameRect);

// 2. Jot a thought.
await caption('2', 'Jot a thought and press Ctrl/⌘+Enter.');
const editor = await inPanelAt(panel, `document.querySelector('.fn-prose')`);
await click(editor.x - 200, editor.y - 40);
await typeText('Call the dentist — Thursday 4pm', 55);
await wait(500);
await key('Enter', 'Enter', 13, 4);
await wait(1600);

// 3. Save a selection from the page.
await caption('3', 'Select text on any page → right-click → Save selection to Holdpad.');
const span = await s.evalJson(`
  const p = [...document.querySelectorAll('#mw-content-text p')].find((x) => x.innerText.startsWith('Although'));
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  const r1 = document.createRange(); r1.setStart(first, 0); r1.setEnd(first, 1);
  const a = r1.getBoundingClientRect();
  const r2 = document.createRange(); r2.selectNodeContents(p);
  const rects = [...r2.getClientRects()];
  const line = rects[2];
  return { x1: Math.round(a.left + 1), y1: Math.round(a.top + a.height / 2), x2: Math.round(line.right - 2), y2: Math.round(line.top + line.height / 2) };
`);
await moveTo(span.x1, span.y1);
await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: span.x1, y: span.y1, button: 'left', clickCount: 1 });
const dragSteps = 24;
for (let i = 1; i <= dragSteps; i += 1) {
  const x = span.x1 + ((span.x2 - span.x1) * i) / dragSteps;
  const y = span.y1 + ((span.y2 - span.y1) * i) / dragSteps;
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  await s.evalJson(`__demo.point(${x}, ${y}, true); return true;`);
  await wait(45);
}
await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: span.x2, y: span.y2, button: 'left', clickCount: 1 });
pointer = { x: span.x2, y: span.y2 };
const selected = await s.evalJson('return getSelection().toString().trim().length;');
check('a passage is selected on the page', selected > 40, String(selected));
await wait(500);
await s.evalJson(`__demo.ring(${span.x2}, ${span.y2}); __demo.menu(${span.x2 + 4}, ${span.y2 + 6}, [
  { t: 'Copy' }, { t: 'Copy link to highlight' }, { t: 'Search Google for “Although the principle…”' }, '-',
  { t: 'Save selection to Holdpad', k: 'save', icon: ${JSON.stringify(ICON_DATA)} }, '-', { t: 'Inspect' }]); return true;`);
await wait(700);
const item = await s.evalJson(`return __demo.menuItem('save');`);
await moveTo(item.x, item.y, 600);
await s.evalJson(`__demo.hover('save'); return true;`);
await wait(450);
await s.evalJson(`__demo.ring(${item.x}, ${item.y}); return true;`);
await wait(150);
await s.evalJson(`__demo.menu(0, 0, null); return true;`);
// What the menu item does: read the selection with capture.js, save it.
const saved = await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
  const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__forNowReadSelection?.() ?? null });
  const v = inj?.result;
  if (!v?.text) return false;
  const now = Date.now();
  const note = { id: crypto.randomUUID(), html: v.html, text: v.text.trim(), kind: 'selection', sourceUrl: tab.url,
    sourceTitle: tab.title, createdAt: now, updatedAt: now, pinned: false, rev: 1, contentRev: 1, schemaVersion: 4 };
  await chrome.storage.local.set({ ['note:' + note.id]: note });
  chrome.runtime.sendMessage({ type: 'capture-saved', note }).catch(() => undefined);
  return true;
`);
check('the selection is saved as a note', saved === true);
await moveTo(900, 600, 700);
await wait(1900);

// 4. Search.
await caption('4', 'Find anything instantly with Ctrl/⌘+K.');
const search = await inPanelAt(panel, `document.querySelector('input[type=search]')`);
await click(search.x, search.y);
await typeText('spaced', 90);
await wait(2000);
// Escape clears the search first, before it would close anything.
await key('Escape', 'Escape', 27);
await wait(400);

// 5. Clear, then Undo.
await caption('5', 'Done with a task? Clear unpinned notes — Undo is right there.');
const clearBtn = await inPanelAt(panel, byText('footer button', 'Clear unpinned'));
await click(clearBtn.x, clearBtn.y);
await wait(700);
const confirmBtn = await inPanelAt(panel, byText('button', 'Move to Trash'));
await click(confirmBtn.x, confirmBtn.y);
await wait(1700);
const undoBtn = await inPanelAt(panel, byText('button', 'Undo'));
await click(undoBtn.x, undoBtn.y);
await wait(1600);

// End card.
await s.evalJson('__demo.end(); return true;');
await wait(3000);

marks.push({ step: 'stop', at: Date.now() / 1000 });
await s.send('Page.stopScreencast');
if (process.env.FORNOW_DEMO_FRAMES) {
  console.log('  first frame', frames[0].t, 'last', frames.at(-1).t, 'count', frames.length);
  for (const m of marks) console.log('  mark', m.step, (m.at - frames[0].t).toFixed(1));
  const gaps = frames.slice(1).map((f, i) => [f.t - frames[i].t, frames[i].t - frames[0].t]).filter(([g]) => g > 0.8);
  console.log('  gaps > 0.8 s:', gaps.map(([g, at]) => g.toFixed(1) + 's@' + at.toFixed(1)).join(', '));
}
clearInterval(trim);
check('frames were captured', frames.length > 100, String(frames.length));
const restored = await sw.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.entries(all).filter(([k, v]) => k.startsWith('note:') && v.deletedAt === undefined).length;
`);
check('Undo brought every note back', restored === 6, String(restored));

if (process.env.FORNOW_DEMO_FRAMES) {
  mkdirSync(process.env.FORNOW_DEMO_FRAMES, { recursive: true });
  let next = 0;
  for (const f of frames) {
    const at = f.t - frames[0].t;
    if (at < next) continue;
    writeFileSync(join(process.env.FORNOW_DEMO_FRAMES, `${String(Math.round(at)).padStart(2, '0')}s.jpg`), Buffer.from(f.data, 'base64'));
    next = Math.floor(at) + 1;
  }
}

// --- Encode ----------------------------------------------------------------------

const browserInfo = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = await Session.open(browserInfo.webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const encTarget = await waitFor(async () => (await targets(PORT)).find((t) => t.id === targetId), { label: 'the encoder tab' });
const enc = await Session.open(encTarget.webSocketDebuggerUrl);
await enc.send('Runtime.enable');
await browser.send('Target.activateTarget', { targetId });

const mime = await enc.evalJson(`
  return ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
`);
check('Chrome can record video here', !!mime, String(mime));

await enc.evalJson('window.__frames = []; return true;');
const t0 = frames[0].t;
const length = marks.at(-1).at - t0;
for (let i = 0; i < frames.length; i += 25) {
  const batch = frames.slice(i, i + 25).map((f) => ({ t: f.t - t0, d: f.data }));
  await enc.evalJson(`
    for (const f of ${JSON.stringify(batch)}) {
      const bin = atob(f.d); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
      __frames.push({ t: f.t, blob: new Blob([u], { type: 'image/jpeg' }) });
    }
    return true;
  `);
}

const size = await enc.evalJson(`
  const canvas = document.createElement('canvas'); canvas.width = ${W}; canvas.height = ${H};
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: ${JSON.stringify(mime)}, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((r) => { rec.onstop = r; });
  // Repaint every tick, even when the frame has not changed: a canvas stream
  // only emits a frame when the canvas is drawn to.
  let shown = -1;
  let current = null;
  const draw = async (i) => { const bmp = await createImageBitmap(__frames[i].blob); current?.close(); current = bmp; shown = i; };
  await draw(0);
  ctx.drawImage(current, 0, 0, ${W}, ${H});
  rec.start(1000);
  const start = performance.now();
  // The recording's own length, not the last frame's: a still screen sends no frames.
  const total = ${length * 1000};
  while (performance.now() - start < total) {
    const now = (performance.now() - start) / 1000;
    let i = shown;
    while (i + 1 < __frames.length && __frames[i + 1].t <= now) i += 1;
    if (i !== shown) await draw(i);
    ctx.drawImage(current, 0, 0, ${W}, ${H});
    await new Promise((r) => setTimeout(r, 1000 / 30));
  }
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: ${JSON.stringify(mime)} });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
  window.__video = btoa(s);
  return { bytes: buf.length, seconds: total / 1000 };
`);

let b64 = '';
for (let i = 0; ; i += 4_000_000) {
  const part = await enc.evalJson(`return window.__video.slice(${i}, ${i + 4_000_000});`);
  if (!part) break;
  b64 += part;
}
const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
const name = THEME === PAGE_THEME
  ? `demo-video${THEME === 'dark' ? '-dark' : ''}`
  : `demo-video-${THEME}-extension-on-${PAGE_THEME}-page`;
const file = join(OUT, `${name}.${ext}`);
writeFileSync(file, Buffer.from(b64, 'base64'));
console.log(`  wrote ${file} — ${(size.bytes / 1e6).toFixed(1)} MB, ${size.seconds.toFixed(1)} s, ${frames.length} frames, ${mime}`);
check('the video is about 30 seconds', size.seconds > 24 && size.seconds < 40, String(size.seconds));

enc.close();
await browser.send('Target.closeTarget', { targetId });
browser.close();
panel.close();
sw.close();
s.close();
report();
