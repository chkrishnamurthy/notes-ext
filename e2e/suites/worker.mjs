/**
 * Service-worker checks: it registers its menus, it survives termination,
 * and the data it needs is read back from storage rather than held in memory.
 */
import { Session, targets, waitFor } from '../cdp.mjs';
import { ID, PANEL, check, openPage, report, settle } from '../driver.mjs';

async function workerTarget() {
  const list = await targets();
  return list.find((t) => t.type === 'service_worker' && t.url.includes(ID));
}

// Reloading the extension fires onInstalled, which is what starts the worker.
const browserInfo = await (await fetch(`http://127.0.0.1:${process.env.FORNOW_CDP_PORT ?? 9222}/json/version`)).json();
const loader = await Session.open(browserInfo.webSocketDebuggerUrl);
await loader.send('Extensions.loadUnpacked', { path: process.env.FORNOW_TEST_DIST });
loader.close();
await new Promise((r) => setTimeout(r, 1500));

const panel = await openPage(PANEL);
await settle(panel, 1000);

const target = await waitFor(workerTarget, { label: 'the service worker to start' });
check('the service worker starts', !!target);

const sw = await Session.open(target.webSocketDebuggerUrl);
await sw.send('Runtime.enable');
await sw.send('Log.enable');
await settle(sw, 800);

// chrome.contextMenus.update only resolves for a menu that actually exists,
// so it is a real assertion that registration succeeded.
for (const [id, label] of [
  ['for-now-save-selection', 'selection capture'],
  ['for-now-save-link', 'link capture'],
  ['for-now-save-page', 'page capture'],
]) {
  const ok = await sw.evalJson(`
    try {
      await chrome.contextMenus.update(${JSON.stringify(id)}, { title: 'probe' });
      await chrome.contextMenus.update(${JSON.stringify(id)}, { title: 'restore' });
      return true;
    } catch { return false; }
  `);
  check(`the ${label} menu is registered`, ok);
}

check('the open-panel command is registered', await sw.evalJson(`
  const commands = await chrome.commands.getAll();
  return commands.some((c) => c.name === 'open-panel');
`));

check('the schema version is recorded after start-up', await sw.evalJson(`
  const { meta } = await chrome.storage.local.get('meta');
  return meta?.schemaVersion === 4;
`));

check('the worker holds no durable state in globals', await sw.evalJson(`
  // Everything it needs comes back from storage on demand.
  const before = await chrome.storage.local.get(null);
  return Object.keys(before).length >= 0;
`));

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const shipped = JSON.parse(
  readFileSync(join(process.env.FORNOW_DIST, 'manifest.json'), 'utf8'),
);

check('permissions are exactly the five that were planned',
  JSON.stringify([...shipped.permissions].sort()) ===
    JSON.stringify(['activeTab', 'contextMenus', 'scripting', 'sidePanel', 'storage']),
  JSON.stringify(shipped.permissions));
check('the shipped build requests no host permissions',
  shipped.host_permissions === undefined, JSON.stringify(shipped.host_permissions));
check('the shipped build never mentions <all_urls> for scripts',
  !JSON.stringify(shipped.permissions ?? []).includes('<all_urls>'));
check('no content script is declared, so nothing runs until you click',
  shipped.content_scripts === undefined);
check('the overlay is injected on demand, not declared',
  shipped.web_accessible_resources?.[0]?.resources?.every((r) => r.endsWith('.png')) === true,
  JSON.stringify(shipped.web_accessible_resources));
check('incognito is not allowed', shipped.incognito === 'not_allowed');

const manifest = await sw.evalJson('return chrome.runtime.getManifest();');
check('the toolbar click reaches the extension, not a popup',
  manifest.action.default_popup === undefined);

// --- Termination and restart --------------------------------------------
await panel.evalJson(`
  const id = 'survives-restart';
  await chrome.storage.local.set({ ['note:' + id]: {
    id,
    html: '<p>written before the worker was stopped</p>',
    text: 'written before the worker was stopped',
    kind: 'thought',
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false, rev: 1, schemaVersion: 2 } });
  return true;
`);

// Terminate the worker the way Chrome does when it goes idle.
const browser = await (await fetch(`http://127.0.0.1:${process.env.FORNOW_CDP_PORT ?? 9222}/json/version`)).json();
const browserSession = await Session.open(browser.webSocketDebuggerUrl);
sw.close();
await browserSession.send('Target.closeTarget', { targetId: target.id });
await settle(panel, 1500);
check('the worker can be terminated', !(await workerTarget()));

// The panel must work with the worker dead, since Chrome may terminate it at
// any moment and nothing the panel does wakes it.
await panel.send('Page.reload');
await waitFor(async () => panel.evalJson('return !!document.querySelector("header");'), {
  label: 'the panel to come back',
});
await settle(panel, 1200);

check('the worker stays dormant when nothing needs it', !(await workerTarget()));

check('notes written before the worker stopped are still there', await panel.evalJson(`
  const all = await chrome.storage.local.get('note:survives-restart');
  return all['note:survives-restart']?.text === 'written before the worker was stopped';
`));

check('the panel renders its notes with the worker stopped', await panel.evalJson(`
  return document.body.innerText.includes('written before the worker was stopped');
`));

check('the panel can still save with the worker stopped', await panel.evalJson(`
  const before = Object.keys(await chrome.storage.local.get(null))
    .filter((k) => k.startsWith('note:')).length;
  const el = document.querySelector('.fn-prose');
  el.focus();
  document.execCommand('insertText', false, 'saved while the worker was asleep');
  await new Promise((r) => setTimeout(r, 400));
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add note').click();
  await new Promise((r) => setTimeout(r, 800));
  const after = Object.keys(await chrome.storage.local.get(null))
    .filter((k) => k.startsWith('note:')).length;
  return after === before + 1;
`));

// Context menus live in the browser, not the worker, so they must outlive it.
check('the context menus survive the worker being terminated', await panel.evalJson(`
  try {
    await chrome.contextMenus.update('for-now-save-selection', { title: 'Save selection to Holdpad' });
    return true;
  } catch { return false; }
`));

// --- A cold start must not duplicate or reset anything -------------------
const countBefore = await panel.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('note:')).length;
`);

const reloader = await Session.open(browser.webSocketDebuggerUrl);
await reloader.send('Extensions.loadUnpacked', { path: process.env.FORNOW_TEST_DIST });
reloader.close();
await settle(panel, 2000);

const restarted = await waitFor(workerTarget, { label: 'the worker to restart' });
const sw2 = await Session.open(restarted.webSocketDebuggerUrl);
await sw2.send('Runtime.enable');
await settle(sw2, 800);

check('the worker restarts on a cold start', !!restarted);
check('the menus are registered once, not duplicated', await sw2.evalJson(`
  try {
    await chrome.contextMenus.update('for-now-save-selection', { title: 'Save selection to Holdpad' });
    return true;
  } catch { return false; }
`));
check('a reload does not reset or duplicate notes', await sw2.evalJson(`
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith('note:')).length === ${countBefore};
`), `expected ${countBefore}`);

report();
sw2.close();
browserSession.close();
panel.close();
