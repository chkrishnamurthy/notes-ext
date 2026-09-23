/**
 * The injected overlay: that it mounts into a page at all, that it is isolated
 * from the host page in both directions, that the genie runs and cleans up
 * after itself, and that the things a content script cannot do are routed to
 * the service worker instead.
 */
import { Session, targets, waitFor } from '../cdp.mjs';
import { ID, check, has, report, settle, shot } from '../driver.mjs';

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
const mount = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  if (!host) return { mounted: false };
  const frame = host.shadowRoot.querySelector('.fn-frame');
  const r = frame.getBoundingClientRect();
  return {
    mounted: true,
    shadow: !!host.shadowRoot,
    hasEditor: !!host.shadowRoot.querySelector('.fn-prose'),
    hasToolbar: !!host.shadowRoot.querySelector('[role=toolbar]'),
    // Measured against the layout viewport, which is what a fixed element
    // sits inside; innerWidth/innerHeight would include the scrollbars.
    rect: { right: Math.round(document.documentElement.clientWidth - r.right),
            bottom: Math.round(document.documentElement.clientHeight - r.bottom),
            top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
  };
`);
check('it mounts into the page', mount.mounted === true);
check('it is isolated in a shadow root', mount.shadow === true);
check('the editor and toolbar come with it', mount.hasEditor && mount.hasToolbar);
check('it is a floating card anchored bottom-right',
  mount.rect.right <= 24 && mount.rect.bottom <= 24, JSON.stringify(mount.rect));
const heightShare = mount.rect.h / mount.viewport.h;
check('it takes nearly the full height of the viewport', heightShare >= 0.92,
  `${Math.round(heightShare * 100)}% of ${mount.viewport.h}px`);
check('it is still a floating card, not a docked sidebar',
  mount.rect.w < 500 && mount.rect.top >= 12, JSON.stringify(mount.rect));
await shot(s, `${OUT}/40-overlay.png`);

// --- Isolation, both directions -------------------------------------------
console.log('\n# Isolation');
const isolation = await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  const frame = shadow.querySelector('.fn-frame');
  const brand = shadow.querySelector('header span');
  const style = getComputedStyle(brand);
  const frameStyle = getComputedStyle(frame);
  return {
    colour: style.color,
    font: style.fontFamily,
    lineHeight: style.lineHeight,
    frameBorder: frameStyle.borderTopStyle,
    frameBg: frameStyle.backgroundColor,
    pageUntouched: !document.documentElement.hasAttribute('data-theme'),
    pageH1: getComputedStyle(document.querySelector('h1')).color,
  };
`);
check('the host page cannot recolour the panel', isolation.colour !== 'rgb(255, 0, 0)',
  isolation.colour);
check('the host page cannot restyle the panel’s font', !isolation.font.includes('Comic'),
  isolation.font);
check('the host page cannot break the panel’s spacing',
  isolation.lineHeight !== 'normal' && !isolation.lineHeight.startsWith('3'), isolation.lineHeight);
check('the host page cannot force borders onto the panel',
  isolation.frameBorder !== 'dashed', isolation.frameBorder);
check('the panel does not restyle the host page', isolation.pageH1 === 'rgb(255, 0, 0)',
  isolation.pageH1);
check('the panel does not write a theme onto the host page', isolation.pageUntouched === true);

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

// This is the regression test for the bug that made the overlay render
// unthemed: the colour tokens are declared on `:root`, which matches nothing
// inside a shadow root, so they must be declared on `:host` as well.
const tokens = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  const frame = host.shadowRoot.querySelector('.fn-frame');
  const value = getComputedStyle(frame).getPropertyValue('--fn-paper').trim();
  const bg = getComputedStyle(frame).backgroundColor;
  return { value, bg };
`);
check('the colour tokens resolve inside the shadow root', tokens.value.length > 0, tokens.value);
check('the panel actually paints a background',
  tokens.bg !== 'rgba(0, 0, 0, 0)' && tokens.bg !== 'transparent', tokens.bg);

// --- rem independence -----------------------------------------------------
console.log('\n# Host font size');
// The host page sets html { font-size: 10px }. Anything sized in rem would
// come out at 62.5% here.
const sizing = await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  const prose = shadow.querySelector('.fn-prose');
  const stage = shadow.querySelector('.fn-stage');
  return {
    pageRoot: getComputedStyle(document.documentElement).fontSize,
    stage: getComputedStyle(stage).fontSize,
    prose: getComputedStyle(prose).fontSize,
  };
`);
check('the host page really is at 10px', sizing.pageRoot === '10px', sizing.pageRoot);
check('the panel keeps its own type scale', sizing.prose === '14px', sizing.prose);
check('the panel sets its own root size', sizing.stage === '16px', sizing.stage);

// --- The genie ------------------------------------------------------------
console.log('\n# Genie');
await s.evalJson(`
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
  return true;
`);
await settle(s, 140);
const midFlight = await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  const layer = shadow.querySelector('.fn-genie-layer');
  if (!layer) return { slices: 0 };
  const rects = [...layer.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
  });
  return {
    slices: layer.children.length,
    frameHidden: getComputedStyle(shadow.querySelector('.fn-frame')).visibility === 'hidden',
    widths: rects.map((r) => r.w),
    tops: rects.map((r) => r.y),
  };
`);
check('closing builds a stack of slices', midFlight.slices >= 24, String(midFlight.slices));
check('the live frame hands over to the clones', midFlight.frameHidden === true);
check('lower slices have travelled further than upper ones',
  midFlight.widths[midFlight.widths.length - 1] < midFlight.widths[0],
  `${midFlight.widths[0]} vs ${midFlight.widths[midFlight.widths.length - 1]}`);
check('the slices stay in vertical order',
  midFlight.tops.every((t, i) => i === 0 || t >= midFlight.tops[i - 1] - 2));
await shot(s, `${OUT}/41-genie.png`);

await settle(s, 900);
const closed = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  const shadow = host.shadowRoot;
  return {
    layer: !!shadow.querySelector('.fn-genie-layer'),
    frameHidden: getComputedStyle(shadow.querySelector('.fn-frame')).visibility === 'hidden',
    pointerEvents: host.style.pointerEvents,
  };
`);
check('the slices are cleaned up after the animation', closed.layer === false);
check('the closed panel is hidden', closed.frameHidden === true);
check('the closed overlay stops intercepting clicks', closed.pointerEvents === 'none');
await shot(s, `${OUT}/42-closed.png`);

// --- Reopening ------------------------------------------------------------
console.log('\n# Reopening');
await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' });
  return true;
`);
await settle(s, 150);
const opening = await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  const layer = shadow.querySelector('.fn-genie-layer');
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
const reopened = await s.evalJson(`
  const host = document.getElementById('for-now-overlay-host');
  const shadow = host.shadowRoot;
  return {
    visible: getComputedStyle(shadow.querySelector('.fn-frame')).visibility === 'visible',
    layer: !!shadow.querySelector('.fn-genie-layer'),
    pointerEvents: host.style.pointerEvents,
  };
`);
check('the panel is visible again after reopening', reopened.visible === true);
check('the reopen cleans up its slices too', reopened.layer === false);
check('the open overlay accepts clicks', reopened.pointerEvents === 'auto');

// --- It is still a working notes panel ------------------------------------
console.log('\n# Still a notes panel');
await sw.evalJson('await chrome.storage.local.clear(); return true;');
await settle(s, 400);

await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  const el = shadow.querySelector('.fn-prose');
  el.focus();
  document.execCommand('insertText', false, 'written from inside a web page');
  await new Promise((r) => setTimeout(r, 500));
  [...shadow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add note').click();
  await new Promise((r) => setTimeout(r, 900));
  return true;
`);

// Storage has to be read from the worker: this evaluate runs in the page's
// main world, which has no `chrome` object at all.
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

// A content script cannot call chrome.tabs, so the gear has to reach the
// worker instead. If the routing were broken the click would do nothing.
console.log('\n# Routing to the worker');
const before = await sw.evalJson('return (await chrome.tabs.query({})).length;');
await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  shadow.querySelector('button[aria-label="Settings and backup"]').click();
  return true;
`);
await settle(s, 1600);
const after = await sw.evalJson('return (await chrome.tabs.query({})).length;');
check('settings opens a tab through the service worker', after === before + 1,
  `${before} -> ${after}`);

check('the panel reports no failure to the user', await s.evalJson(`
  const shadow = document.getElementById('for-now-overlay-host').shadowRoot;
  return !shadow.querySelector('.fn-frame').innerText.includes('Could not open settings');
`));

// --- Console --------------------------------------------------------------
console.log('\n# Console');
const errs = s.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails?.exception?.description ?? 'exception');
check('no uncaught exceptions in the page', errs.length === 0, errs.join(' | ').slice(0, 300));

report();
s.close();
sw.close();
