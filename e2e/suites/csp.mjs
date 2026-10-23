/**
 * A page whose Content-Security-Policy forbids framing and inline styles.
 *
 * Whether Chrome exempts extension frames and content-script styles from a
 * page's policy is the thing being measured. Either outcome is acceptable —
 * the panel works, or the overlay notices it cannot and removes itself — but
 * a blank panel left floating over the page is not.
 */
import { createServer } from 'node:http';
import { Session, targets } from '../cdp.mjs';
import { check, inShell, report, settle, workerTarget } from '../driver.mjs';

const PORT = process.env.FORNOW_CDP_PORT ?? 9222;
const HTTP_PORT = 8765;

const server = createServer((_req, res) => {
  res.writeHead(200, {
    'content-type': 'text/html',
    'content-security-policy': "default-src 'none'; frame-src 'none'; child-src 'none'; style-src 'none'",
  });
  res.end('<!doctype html><title>strict</title><h1>strict page</h1>');
});
await new Promise((resolve) => server.listen(HTTP_PORT, resolve));

const page = (await targets(PORT)).find((t) => t.type === 'page');
const s = await Session.open(page.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Page.navigate', { url: `http://localhost:${HTTP_PORT}/` });
await settle(s, 1200);

const sw = await Session.open((await workerTarget()).webSocketDebuggerUrl);
await sw.send('Runtime.enable');
const injected = await sw.evalJson(`
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return true;
  } catch (e) { return String(e); }
`);
check('the overlay injects into a strict-policy page', injected === true, String(injected));

// Longer than the shell's wait for the panel to report in.
await settle(s, 7500);

const hosts = await s.evalJson(`return document.querySelectorAll('#for-now-overlay-host').length;`);
let outcome = 'removed itself';
if (hosts > 0) {
  const shell = await inShell(s, `
    const f = this.querySelector('.fn-frame');
    const r = f.getBoundingClientRect();
    return { visible: getComputedStyle(f).visibility === 'visible', w: r.width };
  `);
  outcome = shell?.visible ? 'panel shown' : 'BLANK';
}
console.log(`  info outcome: ${outcome}`);
check('it never leaves a blank panel over the page', outcome !== 'BLANK', outcome);

report();
s.close();
sw.close();
server.close();
