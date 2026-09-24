/**
 * Chrome's own pages: no overlay is allowed there, so the toolbar click opens
 * the panel as a popup that floats over the page instead of the side panel,
 * which docks and squeezes it.
 */
import { Session, targets, waitFor } from '../cdp.mjs';
import { ID, check, report, settle, shot, workerTarget } from '../driver.mjs';

const OUT = process.env.FORNOW_SHOTS ?? '.';
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;

const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = await Session.open(info.webSocketDebuggerUrl);

const sw = await Session.open((await workerTarget()).webSocketDebuggerUrl);
await sw.send('Runtime.enable');
await waitFor(() => sw.evalJson('return typeof chrome?.action?.getPopup === "function";'), {
  label: 'the worker’s extension APIs',
});

// A Chrome page, in the foreground, the way a user would be looking at it.
const { targetId } = await browser.send('Target.createTarget', { url: 'chrome://version' });
await browser.send('Target.activateTarget', { targetId });
await new Promise((r) => setTimeout(r, 800));

console.log('\n# Clicking the toolbar icon on a Chrome page');
// Without the "tabs" permission the worker cannot read a Chrome page's
// address, so the tab is found by being the active one.
const tabId = await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
`);
// The action is triggered on the tab itself, which CDP lists as its own
// target alongside the page loaded in it.
const { targetInfos } = await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] });
const tabTarget = targetInfos.find((t) => t.url.startsWith('chrome://version'));
check('the Chrome page is open', typeof tabId === 'number', String(tabId));

// Earlier suites leave sidepanel.html open in ordinary tabs, so only a side
// panel that appears because of this click counts.
const panelsBefore = new Set(
  (await targets(PORT)).filter((t) => t.url.includes(`${ID}/sidepanel.html`)).map((t) => t.id),
);

let triggered = true;
try {
  await browser.send('Extensions.triggerAction', { id: ID, targetId: tabTarget?.targetId });
} catch (error) {
  triggered = String(error);
}
check('the toolbar click can be driven', triggered === true, String(triggered));

const popup = await waitFor(
  async () => (await targets(PORT)).find((t) => t.url.includes(`${ID}/popup.html`)),
  { label: 'the popup', timeout: 5000 },
).catch(() => null);
check('the panel opens as a popup', popup !== null);

const sidePanelOpened = (await targets(PORT)).some(
  (t) => t.url.includes(`${ID}/sidepanel.html`) && !panelsBefore.has(t.id),
);
check('the side panel is not used, so the page is not squeezed', !sidePanelOpened);

if (popup) {
  const p = await Session.open(popup.webSocketDebuggerUrl);
  await p.send('Runtime.enable');
  await waitFor(() => p.evalJson('return !!document.querySelector(".fn-prose");'), {
    label: 'the popup to render',
  });
  await settle(p, 300);
  const layout = await p.evalJson(`
    return {
      w: document.documentElement.clientWidth,
      h: window.innerHeight,
      scrolls: (window.scrollTo(0, 500), window.scrollY > 0),
      fits: document.querySelector('footer').getBoundingClientRect().bottom <= window.innerHeight + 1,
      editor: !!document.querySelector('.fn-prose'),
      list: !!document.querySelector('input[type=search]'),
      focused: document.activeElement?.classList.contains('fn-prose') === true,
      close: !!document.querySelector('button[aria-label="Close notes"]'),
    };
  `);
  check('it is a working notes panel', layout.editor && layout.list, JSON.stringify(layout));
  check('it opens at the saved width, within Chrome’s popup limit',
    layout.w === 600 && layout.h > 400 && layout.h <= 600, `${layout.w}×${layout.h}`);
  // Chrome shrinks a popup to fit a small screen; the panel must shrink with
  // it rather than scroll as a whole.
  check('the whole panel fits the popup, footer included, with no page scroll',
    layout.fits && !layout.scrolls, JSON.stringify(layout));
  check('the editor has focus, ready to type', layout.focused === true);
  await shot(p, `${OUT}/60-popup.png`);
  p.close();
}

const detached = await sw.evalJson(`return await chrome.action.getPopup({ tabId: ${tabId} });`);
check('the popup is detached again, so the next click on a web page shows the overlay',
  detached === '', detached);

await browser.send('Target.closeTarget', { targetId });
browser.close();
sw.close();
report();
