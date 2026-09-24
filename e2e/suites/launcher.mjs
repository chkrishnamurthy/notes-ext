/**
 * The quick-open button.
 *
 * Three separate things have to hold, and they fail independently:
 *
 *  1. The shipped manifest still asks for nothing. The button's site access is
 *     optional and requested at runtime, so a regression here would mean every
 *     future installer being shown a scary prompt — and nothing in the UI would
 *     look any different.
 *  2. The setting genuinely registers and unregisters the content script.
 *  3. The button itself survives a hostile page and actually opens the panel.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Session, targets, waitFor } from '../cdp.mjs';
import { ID, OPTIONS, check, clickReal, inShell, openPage, report, settle, shot } from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;
const HOST_PAGE = 'https://example.com/';

const HOSTILE_CSS = `
  html { font-size: 10px; }
  * { opacity: 0.1 !important; transform: rotate(7deg) !important;
      border-radius: 0 !important; background: magenta !important; }
  button { width: 400px !important; height: 20px !important; }
`;

// --- The shipped manifest -------------------------------------------------
// Read from `dist/`, never from the harness's patched copy: the whole point of
// this check is that the copy's extra permission cannot hide a regression.
console.log('\n# The shipped manifest');
const shipped = JSON.parse(readFileSync(join(process.env.FORNOW_DIST, 'manifest.json'), 'utf8'));

check('the button’s site access is optional, not required',
  Array.isArray(shipped.optional_host_permissions) &&
    shipped.optional_host_permissions.includes('<all_urls>'),
  JSON.stringify(shipped.optional_host_permissions));
check('nothing is granted at install time',
  shipped.host_permissions === undefined, JSON.stringify(shipped.host_permissions));
check('no content script is declared in the manifest',
  shipped.content_scripts === undefined, JSON.stringify(shipped.content_scripts));
check('the button ships as its own bundle', (() => {
  const bytes = readFileSync(join(process.env.FORNOW_DIST, 'launcher.js')).length;
  // It runs on every page load, so its size is the number that matters. The
  // panel bundle next to it is roughly 675 kB.
  return bytes < 20_000;
})(), `${readFileSync(join(process.env.FORNOW_DIST, 'launcher.js')).length} bytes`);

// --- Off by default -------------------------------------------------------
console.log('\n# Off by default');
const swTarget = await waitFor(
  async () => (await targets(PORT)).find((t) => t.type === 'service_worker' && t.url.includes(ID)),
  { label: 'the service worker' },
);
const sw = await Session.open(swTarget.webSocketDebuggerUrl);
await sw.send('Runtime.enable');

// A freshly started worker target answers Runtime.evaluate before the
// extension APIs are bound to its global, so the first call can come back with
// `chrome is not defined`. Wait for the real thing rather than for a guess at
// how long it takes.
await waitFor(() => sw.evalJson('return typeof chrome?.scripting?.getRegisteredContentScripts === "function";'),
  { label: 'the extension APIs in the worker' });

/**
 * Find and focus a tab by its URL.
 *
 * `tabs.query({ active: true })` is not usable here: this suite keeps the
 * Settings tab open the whole way through, so "active" is Settings, not the
 * page under test. Injecting into an extension page fails outright, and a
 * background tab is not hit-tested in headless Chrome, so real mouse input
 * would land nowhere.
 */
const tabIdFor = (needle) => sw.evalJson(`
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => (t.url ?? '').includes(${JSON.stringify(needle)}));
  return tab ? tab.id : null;
`);

const activate = (id) => sw.evalJson(`await chrome.tabs.update(${id}, { active: true }); return true;`);

await sw.evalJson(`
  await chrome.storage.local.clear();
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  if (scripts.length) {
    await chrome.scripting.unregisterContentScripts({ ids: scripts.map((s) => s.id) });
  }
  return true;
`);

check('the setting starts off', await sw.evalJson(`
  const { settings } = await chrome.storage.local.get('settings');
  return settings === undefined || settings.showLauncher !== true;
`));
check('no content script is registered while it is off', await sw.evalJson(`
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return scripts.every((s) => s.id !== 'for-now-launcher');
`));

// --- Turning it on from Settings ------------------------------------------
console.log('\n# Turning it on');
const options = await openPage(OPTIONS, { width: 900, height: 900 });

const found = await options.evalJson(`
  const label = [...document.querySelectorAll('label')]
    .find((l) => l.textContent.includes('Show the quick-open button'));
  return !!label?.querySelector('input[type=checkbox]');
`);
check('Settings offers the button as an explicit choice', found === true);

// A real mouse click, not el.click(): `permissions.request` refuses to run
// without a genuine user gesture, so an untrusted event would fail here in a
// way that says nothing about the code under test.
await clickReal(options, 'input[type=checkbox]');
await settle(options, 1200);

check('the setting is saved', await sw.evalJson(`
  const { settings } = await chrome.storage.local.get('settings');
  return settings?.showLauncher === true;
`));

const registered = await sw.evalJson(`
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return scripts.find((s) => s.id === 'for-now-launcher') ?? null;
`);
check('the content script is registered', registered !== null);
check('it is registered for every site',
  registered?.matches?.includes('<all_urls>') === true, JSON.stringify(registered?.matches));
check('it loads only the small bundle',
  JSON.stringify(registered?.js) === JSON.stringify(['launcher.js']), JSON.stringify(registered?.js));
check('it runs once per page, not once per frame',
  registered?.allFrames === false, String(registered?.allFrames));
await shot(options, `${OUT}/50-settings-launcher.png`);

// --- The button on a hostile page -----------------------------------------
console.log('\n# The button itself');
const optionsTab = await tabIdFor('options.html');

// A tab of its own: Settings is occupying the only one the browser started
// with, and this suite needs both open at the same time.
const pageTab = await sw.evalJson(`
  const tab = await chrome.tabs.create({ url: ${JSON.stringify(HOST_PAGE)}, active: true });
  return tab.id;
`);
check('the page under test is a real http page', typeof pageTab === 'number', String(pageTab));

const pageTarget = await waitFor(
  async () => (await targets(PORT)).find((t) => t.type === 'page' && t.url.includes('example.com')),
  { label: 'the host page' },
);
const s = await Session.open(pageTarget.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Emulation.setDeviceMetricsOverride', {
  width: 1100, height: 780, deviceScaleFactor: 1, mobile: false,
});
await waitFor(() => s.evalJson('return !!document.querySelector("h1");'),
  { label: 'the host page to render' });
await s.evalJson(`
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(HOSTILE_CSS)};
  document.head.append(style);
  return true;
`);
await settle(s, 300);

// This is the path a tab that was already open takes when the setting is
// switched on, so it exercises the worker's catch-up injection too.
await sw.evalJson(`
  await chrome.scripting.executeScript({ target: { tabId: ${pageTab} }, files: ['launcher.js'] });
  return true;
`);
await settle(s, 500);

const button = await s.evalJson(`
  const host = document.getElementById('for-now-launcher-host');
  if (!host) return { mounted: false };
  const el = host.shadowRoot.querySelector('button');
  const r = host.getBoundingClientRect();
  const style = getComputedStyle(el);
  const img = host.shadowRoot.querySelector('img');
  return {
    mounted: true,
    shadow: !!host.shadowRoot,
    centre: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    size: { w: Math.round(r.width), h: Math.round(r.height) },
    // The layout viewport, which is what a fixed element is measured against.
    // This page has a horizontal scrollbar, so it is shorter than innerHeight.
    viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
    genieTarget: (() => {
      const r = document.documentElement;
      const offset = 16 + 34 / 2;
      return { x: r.clientWidth - offset, y: r.clientHeight - offset };
    })(),
    opacity: Number(style.opacity),
    radius: style.borderRadius,
    background: style.backgroundColor,
    transform: style.transform,
    cursor: style.cursor,
    hasIcon: !!img && img.src.startsWith('chrome-extension://'),
    iconLoaded: !!img && img.naturalWidth > 0,
  };
`);

check('the button mounts on the page', button.mounted === true);
check('it is isolated in its own shadow root', button.shadow === true);
check('it is small and unobtrusive',
  button.size.w === 34 && button.size.h === 34, JSON.stringify(button.size));
check('it sits at the bottom-right corner',
  button.viewport.w - button.centre.x === 33 && button.viewport.h - button.centre.y === 33,
  JSON.stringify({ centre: button.centre, viewport: button.viewport }));
// The panel has to funnel into the button, not into the corner near it.
check('the genie aims at the button, scrollbars and all',
  Math.abs(button.genieTarget.x - button.centre.x) < 1 &&
    Math.abs(button.genieTarget.y - button.centre.y) < 1,
  JSON.stringify({ target: button.genieTarget, centre: button.centre }));
check('it is a pointer target', button.cursor === 'pointer', button.cursor);
check('its icon is the extension’s own, and it loads',
  button.hasIcon && button.iconLoaded, JSON.stringify({ has: button.hasIcon, loaded: button.iconLoaded }));

// The hostile page sets opacity, transform, border-radius and background on
// everything. None of it may reach inside the shadow root.
check('the host page cannot fade the button out', button.opacity > 0.5, String(button.opacity));
check('the host page cannot rotate it', button.transform === 'none', button.transform);
check('the host page cannot square off its corners',
  button.radius.startsWith('999'), button.radius);
check('the host page cannot recolour it',
  button.background !== 'rgb(255, 0, 255)', button.background);
check('the host page cannot stretch it', button.size.w === button.size.h,
  JSON.stringify(button.size));
await shot(s, `${OUT}/51-launcher.png`);

check('it refuses to mount twice', await sw.evalJson(`
  await chrome.scripting.executeScript({ target: { tabId: ${pageTab} }, files: ['launcher.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: ${pageTab} },
    func: () => document.querySelectorAll('#for-now-launcher-host').length,
  });
  return result === 1;
`));

// --- Clicking it opens the panel ------------------------------------------
console.log('\n# Clicking it');
await clickReal(s, 'button', { shadowHost: '#for-now-launcher-host' });
await settle(s, 1800);

const opened = await (async () => {
  const shell = await inShell(s, `
    const frame = this.querySelector('.fn-frame');
    const r = frame.getBoundingClientRect();
    return {
      visible: getComputedStyle(frame).visibility === 'visible',
      heightShare: r.height / window.innerHeight,
    };
  `);
  if (!shell) return { opened: false };
  const launcher = await s.evalJson(`
    const launcher = document.getElementById('for-now-launcher-host');
    return {
      launcherOpacity: Number(launcher.style.opacity || '1'),
      launcherClickable: launcher.style.pointerEvents !== 'none',
    };
  `);
  return { opened: true, ...shell, ...launcher };
})();
check('clicking the button opens the panel', opened.opened === true);
check('the panel finishes opening', opened.visible === true);
check('the panel takes nearly the full height', opened.heightShare >= 0.92,
  `${Math.round((opened.heightShare ?? 0) * 100)}%`);
check('the button gets out of the way while the panel is up',
  opened.launcherOpacity === 0, String(opened.launcherOpacity));
check('the hidden button cannot be clicked through the panel',
  opened.launcherClickable === false);
await shot(s, `${OUT}/52-launcher-open.png`);

await s.evalJson(`
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
  return true;
`);
await settle(s, 1400);
check('the button comes back when the panel closes', await s.evalJson(`
  const launcher = document.getElementById('for-now-launcher-host');
  return Number(launcher.style.opacity || '1') === 1 && launcher.style.pointerEvents !== 'none';
`));

// --- Turning it off again -------------------------------------------------
console.log('\n# Turning it off');
// Back to Settings, so the checkbox is on screen and can be really clicked.
await activate(optionsTab);
await settle(options, 400);
await clickReal(options, 'input[type=checkbox]');
await settle(options, 1400);

check('the setting is saved as off', await sw.evalJson(`
  const { settings } = await chrome.storage.local.get('settings');
  return settings?.showLauncher === false;
`));
check('the content script is unregistered', await sw.evalJson(`
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return scripts.every((s) => s.id !== 'for-now-launcher');
`));
check('the button is taken off pages that are already open', await s.evalJson(`
  return !document.getElementById('for-now-launcher-host');
`));

// --- Console --------------------------------------------------------------
console.log('\n# Console');
for (const [label, session] of [['page', s], ['settings', options]]) {
  const errs = session.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description ?? 'exception');
  check(`no uncaught exceptions in the ${label}`, errs.length === 0, errs.join(' | ').slice(0, 300));
}

report();
s.close();
sw.close();
options.close();
