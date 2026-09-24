/**
 * The injected overlay: that it mounts into a page at all, that it is isolated
 * from the host page in both directions — including that a hostile page cannot
 * read the notes, hear what is typed into them, or click the panel's buttons —
 * that the genie runs and cleans up after itself, and that the panel inside is
 * still a working notes panel.
 */
import { Session, targets, waitFor } from '../cdp.mjs';
import { ID, check, inShell, overlayPanel, report, settle, shot } from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;

/**
 * A deliberately hostile host page.
 *
 * It has to be a real http page: `<all_urls>` does not match `data:` URLs, so
 * a data document cannot be injected into at all. The styles are applied after
 * navigation instead of being served with the page.
 */
const HOST_PAGE = 'https://example.com/';

const HOSTILE_CSS = `
  html { font-size: 10px; }
  * { box-sizing: content-box !important; color: red !important;
      font-family: "Comic Sans MS" !important; line-height: 3 !important;
      text-transform: uppercase !important; letter-spacing: 4px !important; }
  /* These two are the ones that actually reached the panel: an !important
     author rule outranks a normal inline style, and a transform on an
     ancestor becomes the containing block for anything fixed inside it. */
  * { transform: rotate(5deg) !important; opacity: 0.25 !important; }
  div { border: 4px dashed lime !important; background: magenta !important; }
`;

const list = await targets(PORT);
const page = list.find((t) => t.type === 'page');
const s = await Session.open(page.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Emulation.setDeviceMetricsOverride', {
  width: 1100, height: 780, deviceScaleFactor: 1, mobile: false,
});
await s.send('Page.navigate', { url: HOST_PAGE });
await settle(s, 1200);
await s.evalJson(`
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(HOSTILE_CSS)};
  document.head.append(style);
  return true;
`);
await settle(s, 300);

// Drive the same path the toolbar click takes.
const swTarget = await waitFor(
  async () => (await targets(PORT)).find((t) => t.type === 'service_worker' && t.url.includes(ID)),
  { label: 'the service worker' },
);
const sw = await Session.open(swTarget.webSocketDebuggerUrl);
await sw.send('Runtime.enable');

const injected = await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return true;
  } catch (e) { return String(e); }
`);
check('the overlay injects into a page', injected === true, String(injected));
await settle(s, 1600);

// --- Mounting -------------------------------------------------------------
console.log('\n# Mounting');
const shellMount = await inShell(s, `
  const frame = this.querySelector('.fn-frame');
  const r = frame.getBoundingClientRect();
  return {
    iframe: !!frame.querySelector('iframe'),
    // Measured against the layout viewport, which is what a fixed element
    // sits inside; innerWidth/innerHeight would include the scrollbars.
    rect: { right: Math.round(document.documentElement.clientWidth - r.right),
            bottom: Math.round(document.documentElement.clientHeight - r.bottom),
            top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
  };
`);
check('it mounts into the page', shellMount !== null);
check('the panel is framed, not rendered into the page', shellMount?.iframe === true);

const panel = await overlayPanel();
const panelMount = await panel.evalJson(`
  return {
    hasEditor: !!document.querySelector('.fn-prose'),
    hasToolbar: !!document.querySelector('[role=toolbar]'),
  };
`);
check('the editor and toolbar come with it', panelMount.hasEditor && panelMount.hasToolbar);
check('it is a floating card anchored bottom-right',
  shellMount.rect.right <= 24 && shellMount.rect.bottom <= 24, JSON.stringify(shellMount.rect));
const heightShare = shellMount.rect.h / shellMount.viewport.h;
check('it takes nearly the full height of the viewport', heightShare >= 0.92,
  `${Math.round(heightShare * 100)}% of ${shellMount.viewport.h}px`);
check('it is still a floating card, not a docked sidebar',
  shellMount.rect.w <= 600 && shellMount.rect.top >= 12, JSON.stringify(shellMount.rect));
await shot(s, `${OUT}/40-overlay.png`);

// --- Resizing -------------------------------------------------------------
console.log('\n# Resizing');
check('it opens at the default width', shellMount.rect.w === 600, String(shellMount.rect.w));

const mouse = async (type, x, y) => s.send('Input.dispatchMouseEvent', {
  type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
});
const frameRect = () => inShell(s, `
  const r = this.querySelector('.fn-frame').getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top),
           w: Math.round(r.width), h: Math.round(r.height) };
`);
const beforeResize = await frameRect();
const grabX = beforeResize.left + 3;
const grabY = beforeResize.top + Math.round(beforeResize.h / 2);
await mouse('mousePressed', grabX, grabY);
for (let i = 1; i <= 5; i += 1) await mouse('mouseMoved', grabX - i * 30, grabY);
await mouse('mouseReleased', grabX - 150, grabY);
await settle(s, 300);
const widened = await frameRect();
check('dragging the left edge widens the panel', widened.w === beforeResize.w + 150,
  `${beforeResize.w} -> ${widened.w}`);
const stored = await sw.evalJson(`
  return (await chrome.storage.local.get('overlayWidth')).overlayWidth;
`);
check('the chosen width is saved', stored === widened.w, String(stored));
check('the panel stays inside the viewport while wide',
  widened.left >= 12, JSON.stringify(widened));
await shot(s, `${OUT}/40b-overlay-resized.png`);

// Double-click on the edge goes back to the default.
await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: widened.left + 3, y: grabY, button: 'left', buttons: 1, clickCount: 1 });
await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: widened.left + 3, y: grabY, button: 'left', buttons: 0, clickCount: 1 });
await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: widened.left + 3, y: grabY, button: 'left', buttons: 1, clickCount: 2 });
await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: widened.left + 3, y: grabY, button: 'left', buttons: 0, clickCount: 2 });
await settle(s, 300);
const reset = await frameRect();
check('double-clicking the edge resets the width', reset.w === 600, String(reset.w));

// The toolbar follows the panel's width: compact and wrapping when narrow,
// larger and spread across the row when wide.
const toolbarAt = async (width) => {
  await sw.evalJson(`await chrome.storage.local.set({ overlayWidth: ${width} }); return true;`);
  await settle(s, 300);
  return panel.evalJson(`
    const bar = document.querySelector('.fn-toolbar');
    const buttons = [...bar.querySelectorAll('.fn-tool')];
    const b = bar.getBoundingClientRect();
    const last = buttons[buttons.length - 1].getBoundingClientRect();
    return {
      icon: Math.round(buttons[0].querySelector('svg').getBoundingClientRect().width),
      gapRight: Math.round(b.right - last.right),
    };
  `);
};
check('the panel cannot be made narrower than 600px',
  (await toolbarAt(360), (await frameRect()).w) === 600);
const narrowBar = await toolbarAt(600);
const wideBar = await toolbarAt(900);
await shot(s, `${OUT}/40d-toolbar-900.png`);
check('toolbar icons grow with the panel', wideBar.icon > narrowBar.icon,
  `${narrowBar.icon}px -> ${wideBar.icon}px`);
check('on a wide panel the toolbar spans the full row', wideBar.gapRight <= 24,
  `${wideBar.gapRight}px left empty`);
await toolbarAt(600);

// --- Clicking into the editor ---------------------------------------------
console.log('\n# Clicking into the editor');
await panel.evalJson(`document.activeElement?.blur(); return true;`);
const area = await panel.evalJson(`
  const prose = document.querySelector('.fn-prose');
  const r = prose.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
`);
check('the editable surface fills the writing area', area.h > 150, JSON.stringify(area));
// Well below the placeholder line, in what used to be dead space.
const clickX = reset.left + 120;
const clickY = reset.top + area.bottom - 30;
await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', buttons: 1, clickCount: 1 });
await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', buttons: 0, clickCount: 1 });
await settle(s, 200);
const focused = await panel.evalJson(`
  return document.activeElement?.classList.contains('fn-prose') === true;
`);
check('clicking empty space below the text focuses the editor', focused === true);

// --- Collapsing the notes list --------------------------------------------
console.log('\n# Collapsing the notes list');
const layout = () => panel.evalJson(`
  return {
    list: !!document.querySelector('input[type=search], [role=search]'),
    editorH: Math.round(document.querySelector('.fn-editor').getBoundingClientRect().height),
    toggle: document.querySelector('[aria-expanded][aria-label*="notes list"], [aria-expanded][aria-label*="writing area"]')?.getAttribute('aria-expanded') ?? null,
  };
`);
const expanded = await layout();
check('the collapse toggle sits in the editor’s action row', expanded.toggle === 'true',
  String(expanded.toggle));
await panel.evalJson(`document.querySelector('[aria-label="Expand writing area"]').click(); return true;`);
await settle(s, 200);
const collapsed = await layout();
check('collapsing hides the notes list', expanded.list && !collapsed.list);
check('the editor takes the space the list gave up', collapsed.editorH > expanded.editorH + 150,
  `${expanded.editorH}px -> ${collapsed.editorH}px`);
await shot(s, `${OUT}/40f-list-collapsed.png`);
await panel.evalJson(`location.reload(); return true;`);
await settle(s, 1200);
const afterReload = await layout();
check('the collapsed state is remembered', !afterReload.list);
await panel.evalJson(`document.querySelector('[aria-label="Show notes list"]').click(); return true;`);
await settle(s, 200);
check('expanding brings the list back', (await layout()).list);

// --- What the page can reach ----------------------------------------------
// Everything here runs in the page's main world, the way a hostile site's own
// scripts would. Before the panel moved into a frame, all of these succeeded.
console.log('\n# Privacy from the host page');
const reach = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  return {
    shadowRoot: host.shadowRoot === null,
    frames: window.frames.length,
    editor: !!document.querySelector('.fn-prose'),
  };
`);
check('the page cannot open the shell’s shadow root', reach.shadowRoot === true);
check('the page cannot find the panel’s frame', reach.frames === 0, String(reach.frames));
check('the page cannot find the editor', reach.editor === false);

const probe = await s.evalJson(`
  const tryFetch = (url) => fetch(url).then(() => true, () => false);
  return {
    // Web-accessible on purpose, so it is the control for the probe itself.
    icon: await tryFetch('chrome-extension://${ID}/icons/icon-16.png'),
    panel: await tryFetch('chrome-extension://${ID}/overlay.html'),
  };
`);
check('the probe can reach an ordinary web-accessible file', probe.icon === true);
check('the page cannot load the panel on the extension’s fixed id', probe.panel === false);

// Keys typed into the panel must not reach the page's listeners. They did when
// the panel lived in the page's DOM: a shadow root does not stop a key event.
await s.evalJson(`
  window.__heard = [];
  for (const type of ['keydown', 'keypress', 'keyup', 'input', 'beforeinput']) {
    window.addEventListener(type, (e) => window.__heard.push(type + ':' + (e.key ?? e.data)), true);
  }
  return true;
`);
await panel.evalJson('document.querySelector(".fn-prose").focus(); return true;');
for (const ch of 'secret') {
  const k = { key: ch, text: ch, unmodifiedText: ch, code: `Key${ch.toUpperCase()}` };
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: k.code });
}
await settle(s, 300);
const typed = await panel.evalJson('return document.querySelector(".fn-prose").innerText;');
const heard = await s.evalJson('return window.__heard;');
check('real keystrokes reach the panel', typed.includes('secret'), JSON.stringify(typed));
check('the page hears none of them', heard.length === 0, JSON.stringify(heard).slice(0, 200));

// Anyone can post to the page's window. Only the panel's own frame is obeyed.
await s.evalJson(`window.postMessage({ type: 'for-now:close' }, '*'); return true;`);
await settle(s, 900);
check('a forged close message from the page is ignored', await inShell(s, `
  return getComputedStyle(this.querySelector('.fn-frame')).visibility === 'visible';
`));

// --- Isolation, both directions -------------------------------------------
console.log('\n# Isolation');
const isolation = await panel.evalJson(`
  const style = getComputedStyle(document.querySelector('header span'));
  return { colour: style.color, font: style.fontFamily, lineHeight: style.lineHeight };
`);
const frameStyle = await inShell(s, `
  const cs = getComputedStyle(this.querySelector('.fn-frame'));
  return {
    border: cs.borderTopStyle,
    paper: cs.getPropertyValue('--fn-paper').trim(),
    bg: cs.backgroundColor,
  };
`);
const pageSide = await s.evalJson(`
  return {
    untouched: !document.documentElement.hasAttribute('data-theme'),
    h1: getComputedStyle(document.querySelector('h1')).color,
  };
`);
check('the host page cannot recolour the panel', isolation.colour !== 'rgb(255, 0, 0)',
  isolation.colour);
check('the host page cannot restyle the panel’s font', !isolation.font.includes('Comic'),
  isolation.font);
check('the host page cannot break the panel’s spacing',
  isolation.lineHeight !== 'normal' && !isolation.lineHeight.startsWith('3'), isolation.lineHeight);
check('the host page cannot force borders onto the panel',
  frameStyle.border !== 'dashed', frameStyle.border);
check('the panel does not restyle the host page', pageSide.h1 === 'rgb(255, 0, 0)', pageSide.h1);
check('the panel does not write a theme onto the host page', pageSide.untouched === true);

// The host element lives in the page's own DOM, so the page's CSS applies to
// it directly. This is the regression test for the panel being rotated and
// faded out by rules the shadow root could do nothing about.
const shell = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  const cs = getComputedStyle(host);
  return {
    transform: cs.transform,
    opacity: Number(cs.opacity),
    textTransform: cs.textTransform,
    letterSpacing: cs.letterSpacing,
    visibility: cs.visibility,
    topLayer: host.matches(':popover-open'),
  };
`);
check('the host page cannot rotate the whole panel', shell.transform === 'none', shell.transform);
check('the host page cannot fade the whole panel out', shell.opacity === 1, String(shell.opacity));
check('inherited styles do not leak in through the host',
  shell.textTransform === 'none' && shell.letterSpacing === 'normal',
  `${shell.textTransform} / ${shell.letterSpacing}`);
check('the host page cannot hide the panel', shell.visibility === 'visible', shell.visibility);
// The top layer is what defeats a transform on <html>, which no fixed-position
// descendant can escape on its own.
check('the panel sits in the browser’s top layer', shell.topLayer === true);

// The colour tokens are declared on `:root`, which matches nothing inside a
// shadow root, so they must be declared on `:host` as well.
check('the colour tokens resolve inside the shadow root', frameStyle.paper.length > 0,
  frameStyle.paper);
check('the frame actually paints a background',
  frameStyle.bg !== 'rgba(0, 0, 0, 0)' && frameStyle.bg !== 'transparent', frameStyle.bg);

// --- rem independence -----------------------------------------------------
console.log('\n# Host font size');
// The host page sets html { font-size: 10px }. Anything sized in rem would
// come out at 62.5% if it were measured against the page.
const pageRoot = await s.evalJson('return getComputedStyle(document.documentElement).fontSize;');
const prose = await panel.evalJson('return getComputedStyle(document.querySelector(".fn-prose")).fontSize;');
const stage = await inShell(s, 'return getComputedStyle(this.querySelector(".fn-stage")).fontSize;');
check('the host page really is at 10px', pageRoot === '10px', pageRoot);
check('the panel keeps its own type scale', prose === '15px', prose);
check('the shell sets its own root size', stage === '16px', stage);

// --- The genie ------------------------------------------------------------
console.log('\n# Genie');
await s.evalJson(`
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
  return true;
`);
await settle(s, 140);
const midFlight = await inShell(s, `
  const layer = this.querySelector('.fn-genie-layer');
  if (!layer) return { slices: 0 };
  const rects = [...layer.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
  });
  return {
    slices: layer.children.length,
    // Cloning the iframe would load the whole app once per slice.
    iframes: layer.querySelectorAll('iframe').length,
    frameHidden: getComputedStyle(this.querySelector('.fn-frame')).visibility === 'hidden',
    widths: rects.map((r) => r.w),
    tops: rects.map((r) => r.y),
  };
`);
check('closing builds a stack of slices', midFlight.slices >= 24, String(midFlight.slices));
check('the slices are empty panels, not copies of the app', midFlight.iframes === 0,
  String(midFlight.iframes));
check('the live frame hands over to the clones', midFlight.frameHidden === true);
check('lower slices have travelled further than upper ones',
  midFlight.widths[midFlight.widths.length - 1] < midFlight.widths[0],
  `${midFlight.widths[0]} vs ${midFlight.widths[midFlight.widths.length - 1]}`);
check('the slices stay in vertical order',
  midFlight.tops.every((t, i) => i === 0 || t >= midFlight.tops[i - 1] - 2));
await shot(s, `${OUT}/41-genie.png`);

await settle(s, 900);
const closed = await inShell(s, `
  return {
    layer: !!this.querySelector('.fn-genie-layer'),
    frameHidden: getComputedStyle(this.querySelector('.fn-frame')).visibility === 'hidden',
    pointerEvents: this.host.style.pointerEvents,
  };
`);
check('the slices are cleaned up after the animation', closed.layer === false);
check('the closed panel is hidden', closed.frameHidden === true);
check('the closed overlay stops intercepting clicks', closed.pointerEvents === 'none');
await shot(s, `${OUT}/42-closed.png`);

// Closing has to hand the keyboard back. The panel used to listen for keys on
// the page's own window for as long as it was mounted, which took over the
// page's Cmd/Ctrl+K and let an Escape meant for the page cancel an edit.
console.log('\n# Keyboard after closing');
const afterClose = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  const shortcut = new KeyboardEvent('keydown', {
    key: 'k', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true,
  });
  document.body.dispatchEvent(shortcut);
  return { focusOnPage: document.activeElement !== host, shortcutFree: !shortcut.defaultPrevented };
`);
check('focus goes back to the page', afterClose.focusOnPage === true);
check('the page keeps its own Cmd/Ctrl+K', afterClose.shortcutFree === true);
await s.evalJson('window.__heard = []; return true;');
await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await settle(s, 200);
check('keys typed after closing go to the page, not the hidden panel',
  (await s.evalJson('return window.__heard;')).includes('keydown:Escape'));
check('an Escape meant for the page leaves the panel’s editor alone',
  (await panel.evalJson('return document.querySelector(".fn-prose").innerText;')).includes('secret'));

// --- Reopening ------------------------------------------------------------
console.log('\n# Reopening');
await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' });
  return true;
`);
await settle(s, 150);
const opening = await inShell(s, `
  const layer = this.querySelector('.fn-genie-layer');
  if (!layer) return { slices: 0, visible: 0 };
  // The clone-visibility bug produced slices that existed but painted nothing.
  const visible = [...layer.children].filter((el) => {
    const clone = el.firstElementChild;
    return clone && getComputedStyle(clone).visibility === 'visible';
  }).length;
  return { slices: layer.children.length, visible };
`);
check('the toolbar click toggles an injected overlay back open', opening.slices >= 24,
  String(opening.slices));
check('the opening slices are actually visible', opening.visible === opening.slices,
  `${opening.visible}/${opening.slices}`);

await settle(s, 900);
const reopened = await inShell(s, `
  return {
    visible: getComputedStyle(this.querySelector('.fn-frame')).visibility === 'visible',
    layer: !!this.querySelector('.fn-genie-layer'),
    pointerEvents: this.host.style.pointerEvents,
  };
`);
check('the panel is visible again after reopening', reopened.visible === true);
check('the reopen cleans up its slices too', reopened.layer === false);
check('the open overlay accepts clicks', reopened.pointerEvents === 'auto');
const caret = await panel.evalJson(`
  return { focus: document.hasFocus(), active: document.activeElement?.className ?? null };
`);
check('reopening puts the caret back in the editor',
  caret.focus && String(caret.active).includes('fn-prose'), JSON.stringify(caret));

// Tab cycles inside the panel rather than wandering into the page behind it.
console.log('\n# Keyboard inside the open panel');
const tab = async (shift) => {
  const base = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 };
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await settle(s, 150);
};
const ends = `
  const sel = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const items = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0);
`;
await panel.evalJson(`${ends} items[items.length - 1].focus(); return true;`);
await s.evalJson('window.__heard = []; return true;');
await tab(false);
check('Tab off the last control wraps to the first', await panel.evalJson(`${ends}
  return document.hasFocus() && document.activeElement === items[0];
`));
await tab(true);
check('Shift+Tab off the first control wraps to the last', await panel.evalJson(`${ends}
  return document.hasFocus() && document.activeElement === items[items.length - 1];
`));
check('Tab never reaches the page behind the panel',
  (await s.evalJson('return window.__heard;')).length === 0);
await panel.evalJson('document.querySelector(".fn-prose").focus(); return true;');

// Saving a capture opens the overlay rather than toggling it, so a second
// right-click save never closes the panel it is meant to show.
await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'open-overlay' });
  return true;
`);
await settle(s, 1000);
check('asking an open overlay to open leaves it open', await inShell(s, `
  return getComputedStyle(this.querySelector('.fn-frame')).visibility === 'visible';
`));

// The panel's own close button asks the shell to close, over postMessage.
await panel.evalJson(`
  document.querySelector('button[aria-label^="Close"]')?.click();
  return true;
`);
await settle(s, 1200);
check('the panel’s close button closes the overlay', await inShell(s, `
  return getComputedStyle(this.querySelector('.fn-frame')).visibility === 'hidden';
`));
await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' });
  return true;
`);
await settle(s, 1200);

// --- It is still a working notes panel ------------------------------------
console.log('\n# Still a notes panel');
await sw.evalJson('await chrome.storage.local.clear(); return true;');
await settle(s, 300);
const livePanel = panel;

await livePanel.evalJson(`
  const el = document.querySelector('.fn-prose');
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, 'written from inside a web page');
  await new Promise((r) => setTimeout(r, 500));
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add note').click();
  await new Promise((r) => setTimeout(r, 900));
  return true;
`);

const saved = await sw.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.entries(all).filter(([k]) => k.startsWith('note:')).map(([, v]) => v.text);
`);
check('a note can be written and saved from the overlay',
  saved.some((t) => t.includes('written from inside a web page')), JSON.stringify(saved));

check('the note is real rich text, not a plain string', await sw.evalJson(`
  const all = await chrome.storage.local.get(null);
  const note = Object.entries(all).filter(([k]) => k.startsWith('note:')).map(([, v]) => v)[0];
  return typeof note?.html === 'string' && note.html.includes('<p>');
`));

check('the saved note is listed in the panel', await livePanel.evalJson(`
  return document.body.innerText.includes('written from inside a web page');
`));
check('the saved note appears nowhere in the page', await s.evalJson(`
  return !document.documentElement.outerHTML.includes('written from inside a web page')
    && !document.body.innerText.includes('written from inside a web page');
`));

console.log('\n# Opening tabs');
const before = await sw.evalJson('return (await chrome.tabs.query({})).length;');
await livePanel.evalJson(`
  document.querySelector('button[aria-label="Settings and backup"]').click();
  return true;
`);
await settle(s, 1600);
const after = await sw.evalJson('return (await chrome.tabs.query({})).length;');
check('settings opens a tab from inside the overlay', after === before + 1,
  `${before} -> ${after}`);

check('the worker refuses to open a script URL', await livePanel.evalJson(`
  const reply = await chrome.runtime.sendMessage({ type: 'open-tab', url: 'javascript:alert(1)' });
  return reply?.ok === false;
`));

check('the panel reports no failure to the user', await livePanel.evalJson(`
  return !document.body.innerText.includes('Could not open settings');
`));

// --- Saving a selection keeps its formatting -------------------------------
// The context-menu click itself cannot be produced over DevTools, so this runs
// the same two injections the worker makes on one: the capture bundle, then
// the call that reads the selection back.
console.log('\n# Saving a selection');
await s.evalJson(`
  document.body.insertAdjacentHTML('beforeend',
    '<div id="fn-capture"><p>Keep <strong>this bold</strong> and <a href="/more">this link</a>.</p>' +
    '<ul><li>one</li><li>two</li></ul><p onclick="alert(1)">tail<img src=x onerror=alert(1)></p></div>');
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('fn-capture'));
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  return true;
`);
const captured = await sw.evalJson(`
  // Not the active tab: the settings check above left its own tab in front.
  const [tab] = await chrome.tabs.query({ url: 'https://example.com/*' });
  const target = { tabId: tab.id, frameIds: [0] };
  await chrome.scripting.executeScript({ target, files: ['capture.js'] });
  const [injection] = await chrome.scripting.executeScript({
    target,
    func: () => globalThis.__forNowReadSelection?.() ?? null,
  });
  return injection.result;
`);
check('the selection is read as rich text', typeof captured?.html === 'string',
  JSON.stringify(captured).slice(0, 200));
check('emphasis survives', captured?.html?.includes('<strong>this bold</strong>'));
check('a relative link becomes a working absolute one',
  captured?.html?.includes('href="https://example.com/more"'));
check('lists survive', /<ul><li>one<\/li><li>two<\/li><\/ul>/.test(captured?.html ?? ''));
check('the page’s handlers and images are stripped before it leaves the page',
  !/onclick|onerror|<img/i.test(captured?.html ?? ''));
check('the plain-text projection matches', captured?.text?.startsWith('Keep this bold and this link.'),
  JSON.stringify(captured?.text));
check('the page cannot see the capture function', await s.evalJson(
  'return typeof globalThis.__forNowReadSelection === "undefined";'));

// --- Console --------------------------------------------------------------
console.log('\n# Console');
for (const [label, session] of [['page', s], ['panel', livePanel]]) {
  const errs = session.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description ?? 'exception');
  check(`no uncaught exceptions in the ${label}`, errs.length === 0, errs.join(' | ').slice(0, 300));
}

report();
s.close();
sw.close();
panel.close();
