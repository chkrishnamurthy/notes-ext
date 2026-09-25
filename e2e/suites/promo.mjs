/**
 * The Chrome Web Store promo images, rendered from HTML: the small promo tile
 * (440×280, required) and the marquee (1400×560, used only if Google features
 * the extension).
 *
 * Uses the first store screenshot, so run `store` first:
 *
 *   npm run e2e -- store promo
 *
 * Output: store/assets/promo-tile-440x280.png, store/assets/marquee-1400x560.png
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Session, targets } from '../cdp.mjs';
import { check, report, settle, shot } from '../driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'store/assets');
const PORT = process.env.FORNOW_CDP_PORT ?? 9222;
mkdirSync(OUT, { recursive: true });

const b64 = (file) => readFileSync(file).toString('base64');
const icon = b64(join(ROOT, 'src/public/icons/icon-128.png'));
const screenshot = b64(join(process.env.FORNOW_SHOTS ?? join(ROOT, 'e2e/screenshots'), 'store/light/1-notes-over-page.png'));

// Brand colours from scripts/make-icons.mjs.
const HTML = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
  body {
    position: relative; background: #315e49; color: #fbfaf7;
    font-family: -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  }
  body::before { /* soft light from the top left */
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(420px 300px at 0% 0%, rgb(255 255 255 / 0.10), transparent 70%);
  }
  .copy { position: absolute; left: 28px; top: 34px; width: 200px; }
  /* The extension icon itself. Its 128px file keeps 16px of clear space on
     every side, so the image is drawn larger and pulled back by that margin;
     the light rim and shadow lift the green plate off the green tile. */
  .mark {
    display: block; width: 75px; height: 75px; margin: -9px 0 9px -9px;
    filter: drop-shadow(0 0 1px rgb(255 255 255 / 0.7)) drop-shadow(0 6px 12px rgb(0 0 0 / 0.3));
  }
  h1 { font-size: 38px; line-height: 1; margin: 0 0 10px; letter-spacing: -0.02em; font-weight: 750; }
  p { font-size: 17px; line-height: 1.25; margin: 0 0 14px; font-weight: 550; }
  small { font-size: 12.5px; letter-spacing: 0.02em; opacity: 0.78; font-weight: 500; }
  .card {
    position: absolute; left: 238px; top: 34px; width: 299px; height: 191px;
    border-radius: 12px; overflow: hidden; transform: rotate(-4deg); background: #fff;
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(255 255 255 / 0.25);
  }
  /* Two slices of the panel in the 1280×800 shot, at half size: its header
     and toolbar (y 20–105), then its note list (y 445–740), skipping the
     empty composer between them. */
  .card div {
    background: url(data:image/png;base64,${screenshot}) no-repeat;
    background-size: 640px auto;
  }
  .card .head { height: 43px; background-position: -330.5px -10px; }
  .card .list { height: 148px; background-position: -330.5px -222.5px; }
</style></head><body>
  <div class="copy">
    <img class="mark" src="data:image/png;base64,${icon}" alt="">
    <h1>Holdpad</h1>
    <p>Quick notes beside<br>any page</p>
    <small>Free · Private · Offline</small>
  </div>
  <div class="card"><div class="head"></div><div class="list"></div></div>
</body></html>`;

// The marquee: the same brand block, larger, beside the whole first
// screenshot in a browser window that runs off the bottom edge.
const MARQUEE = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1400px; height: 560px; overflow: hidden; }
  body {
    position: relative; background: #315e49; color: #fbfaf7;
    font-family: -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  }
  body::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(900px 600px at 0% 0%, rgb(255 255 255 / 0.10), transparent 70%);
  }
  .copy { position: absolute; left: 80px; top: 92px; width: 520px; }
  .mark {
    display: block; width: 150px; height: 150px; margin: -19px 0 14px -19px;
    filter: drop-shadow(0 0 1.5px rgb(255 255 255 / 0.7)) drop-shadow(0 10px 22px rgb(0 0 0 / 0.3));
  }
  h1 { font-size: 92px; line-height: 1; margin: 0 0 18px; letter-spacing: -0.025em; font-weight: 750; }
  p { font-size: 38px; line-height: 1.2; margin: 0 0 22px; font-weight: 600; }
  small { font-size: 23px; letter-spacing: 0.01em; opacity: 0.82; font-weight: 500; }
  .win {
    position: absolute; left: 610px; top: 78px; width: 760px; border-radius: 14px; overflow: hidden;
    transform: rotate(-3deg); background: #fff;
    box-shadow: 0 30px 70px rgb(0 0 0 / 0.38), 0 0 0 1px rgb(255 255 255 / 0.25);
  }
  .bar { height: 34px; background: #e8eaed; display: flex; align-items: center; gap: 8px; padding-left: 14px; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; background: #c4c7cc; }
  .bar i:nth-child(1) { background: #ff5f57; } .bar i:nth-child(2) { background: #febc2e; } .bar i:nth-child(3) { background: #28c840; }
  .shot { display: block; width: 760px; height: 475px; }
</style></head><body>
  <div class="copy">
    <img class="mark" src="data:image/png;base64,${icon}" alt="">
    <h1>Holdpad</h1>
    <p>Quick notes and a notepad<br>beside any page</p>
    <small>Free · Private · Offline<br>Your notes never leave your device</small>
  </div>
  <div class="win"><div class="bar"><i></i><i></i><i></i></div>
    <img class="shot" src="data:image/png;base64,${screenshot}" alt=""></div>
</body></html>`;

const page = (await targets(PORT)).find((t) => t.type === 'page');
const s = await Session.open(page.webSocketDebuggerUrl);
await s.send('Page.enable');
await s.send('Runtime.enable');
const frameId = (await s.send('Page.getFrameTree')).frameTree.frame.id;

async function render(html, width, height, name) {
  await s.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await s.send('Page.setDocumentContent', { frameId, html });
  await settle(s, 600);
  const file = join(OUT, name);
  await shot(s, file);
  const png = readFileSync(file);
  // PNG width and height sit at bytes 16–23.
  check(`${name} is exactly ${width}×${height}`, png.readUInt32BE(16) === width && png.readUInt32BE(20) === height);
}

await render(HTML, 440, 280, 'promo-tile-440x280.png');
await render(MARQUEE, 1400, 560, 'marquee-1400x560.png');

s.close();
report();
