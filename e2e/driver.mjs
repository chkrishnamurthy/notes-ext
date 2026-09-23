/** Shared helpers for driving the For Now panel over CDP. */
import { Session, targets, waitFor } from './cdp.mjs';

/** Set by run.mjs after it loads the unpacked extension. */
export const ID = process.env.FORNOW_EXT_ID;
if (!ID) throw new Error('FORNOW_EXT_ID is not set — run these suites through e2e/run.mjs.');
export const PANEL = `chrome-extension://${ID}/sidepanel.html`;
export const OPTIONS = `chrome-extension://${ID}/options.html`;

export async function openPage(url, { width = 400, height = 880, ready = 'header, main' } = {}) {
  const list = await targets();
  const page = list.find((t) => t.type === 'page');
  const s = await Session.open(page.webSocketDebuggerUrl);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Log.enable');
  await s.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await s.send('Page.navigate', { url });
  await waitFor(
    async () => s.evalJson(`return !!document.querySelector(${JSON.stringify(ready)});`),
    { label: `${url} to render` },
  );
  return s;
}

export async function resize(s, width, height = 880) {
  await s.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
}

/** Click through the DOM; React's synthetic handlers see a real click event. */
export async function click(s, selector, index = 0) {
  const ok = await s.evalJson(`
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els[${index}];
    if (!el) return false;
    el.click();
    return true;
  `);
  if (!ok) throw new Error(`No element for ${selector}[${index}]`);
  await settle(s);
}

/** Click the first element whose text contains `label`. */
export async function clickText(s, selector, label) {
  const ok = await s.evalJson(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.textContent.includes(${JSON.stringify(label)}));
    if (!el) return false;
    el.click();
    return true;
  `);
  if (!ok) throw new Error(`No ${selector} containing "${label}"`);
  await settle(s);
}

/** Click the element whose trimmed text is exactly `label`. */
export async function clickExact(s, selector, label) {
  const ok = await s.evalJson(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.textContent.trim() === ${JSON.stringify(label)});
    if (!el) return false;
    el.click();
    return true;
  `);
  if (!ok) throw new Error(`No ${selector} whose text is exactly "${label}"`);
  await settle(s);
}

/**
 * Click through the browser rather than through the DOM.
 *
 * `el.click()` produces an untrusted event, which Chrome does not count as a
 * user gesture — and `permissions.request` refuses to run without one. This
 * dispatches real mouse input at the element's coordinates instead, so the
 * gesture is genuine.
 */
export async function clickReal(s, selector, { shadowHost = null } = {}) {
  const box = await s.evalJson(`
    const root = ${shadowHost ? `document.querySelector(${JSON.stringify(shadowHost)}).shadowRoot` : 'document'};
    const el = root.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  `);
  if (!box) throw new Error(`No element for ${selector}`);
  const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, button: 'none' });
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  await settle(s);
}

export async function focus(s, selector) {
  await s.evalJson(`document.querySelector(${JSON.stringify(selector)}).focus(); return true;`);
}

/** Real text input, so React's onChange fires exactly as it would for a user. */
export async function type(s, selector, text) {
  await focus(s, selector);
  await s.send('Input.insertText', { text });
  await settle(s);
}

/** Type into the rich text editor, the way a person would. */
export async function typeInEditor(s, text) {
  await s.evalJson('document.querySelector(".fn-prose").focus(); return true;');
  await s.send('Input.insertText', { text });
  await settle(s, 350);
}

/**
 * Type one character at a time, which is what markdown input rules react to.
 * A single bulk insert is a paste, and a paste deliberately does not trigger
 * them, so anything testing "- " or "# " must go through this.
 */
export async function typeChars(s, text, delay = 20) {
  await s.evalJson('document.querySelector(".fn-prose").focus(); return true;');
  for (const ch of text) {
    await s.send('Input.insertText', { text: ch });
    await new Promise((r) => setTimeout(r, delay));
  }
  await settle(s, 300);
}

/**
 * Empty the editor deterministically by dropping the saved draft and
 * reloading. Selecting-all and deleting leaves list structure behind, which
 * silently contaminates the next assertion.
 */
export async function resetEditor(s) {
  await s.evalJson("await chrome.storage.local.remove('draft'); return true;");
  await s.send('Page.reload');
  await waitFor(async () => s.evalJson('return !!document.querySelector(".fn-prose");'), {
    label: 'the editor to come back',
  });
  await settle(s, 600);
}

/** Replace the editor's whole content. */
export async function setEditor(s, text) {
  await s.evalJson(`
    const el = document.querySelector('.fn-prose');
    el.focus();
    document.execCommand('selectAll', false, null);
    return true;
  `);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
  await settle(s, 200);
  if (text) await s.send('Input.insertText', { text });
  await settle(s, 350);
}

/** Press a formatting button in the editor toolbar by its accessible name. */
export async function tool(s, label) {
  const ok = await s.evalJson(`
    const el = [...document.querySelectorAll('[role=toolbar] button')]
      .find((b) => (b.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)}));
    if (!el) return false;
    el.click();
    return true;
  `);
  if (!ok) throw new Error(`No toolbar button named "${label}"`);
  await settle(s, 250);
}

/** The editor's current HTML and plain text, as the app would commit them. */
export async function editorContent(s) {
  return s.evalJson(`
    const el = document.querySelector('.fn-prose');
    return { html: el.innerHTML, text: el.innerText };
  `);
}

export async function key(s, keyName, { modifiers = 0, code, keyCode } = {}) {
  const base = { modifiers, key: keyName, code: code ?? keyName, windowsVirtualKeyCode: keyCode };
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await settle(s);
}

export const META = 4; // Cmd on macOS
export const CTRL = 2;

/** Let React flush, the debounced draft write land, and storage settle. */
export async function settle(s, ms = 250) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Case-insensitive contains. Group headings are uppercased in CSS, so
 * innerText reports them uppercased regardless of the source text.
 */
export function has(body, needle) {
  return body.toLowerCase().includes(needle.toLowerCase());
}

export async function text(s) {
  return s.evalJson('return document.body.innerText;');
}

export async function storedNotes(s) {
  return s.evalJson(`
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith('note:'))
      .map(([, v]) => v);
  `);
}

export async function resetStorage(s) {
  await s.evalJson('await chrome.storage.local.clear(); return true;');
  await s.send('Page.reload');
  await waitFor(async () => s.evalJson('return !!document.querySelector("header");'), {
    label: 'reload',
  });
  await settle(s, 400);
}

export async function shot(s, file, fullPage = false) {
  const { data } = await s.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(data, 'base64'));
}

export function errors(s) {
  return s.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description ?? 'exception');
}

export function consoleErrors(s) {
  return s.events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
    .map((e) => e.params.args.map((a) => a.value ?? a.description).join(' '));
}

let passed = 0;
const failures = [];

export function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

export function report() {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}
