/**
 * End-to-end suite runner.
 *
 * Launches an isolated Chrome with its own temporary profile, loads the built
 * extension into it over the DevTools protocol, runs each suite as its own
 * process, then shuts the browser down. It never touches the real Chrome
 * profile, and it leaves nothing behind but the screenshots.
 *
 *   npm run e2e            # all suites
 *   npm run e2e -- panel   # one suite
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Session, waitFor } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '../dist');
const SHOTS = resolve(HERE, 'screenshots');
const PORT = Number(process.env.FORNOW_CDP_PORT ?? 9222);

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

const ALL = ['panel', 'worker', 'options', 'conflicts'];
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const suites = requested.length > 0 ? requested : ALL;

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/manifest.json is missing. Run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'fornow-profile-'));
mkdirSync(SHOTS, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    ...(process.env.FORNOW_HEADFUL ? [] : ['--headless=new']),
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    chrome.kill('SIGTERM');
  } catch {
    // already gone
  }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // best effort
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(130));

try {
  // The extension is loaded over CDP because Chrome now ignores
  // --load-extension unless a kill-switch feature flag is also passed.
  const version = await waitFor(
    async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(),
    { timeout: 20000, label: 'Chrome to expose the DevTools endpoint' },
  );
  const browser = await Session.open(version.webSocketDebuggerUrl);
  const { id } = await browser.send('Extensions.loadUnpacked', { path: DIST });
  browser.close();
  console.log(`Loaded ${id} from dist/ into a temporary profile.\n`);

  let failed = 0;
  for (const suite of suites) {
    const file = join(HERE, 'suites', `${suite}.mjs`);
    if (!existsSync(file)) {
      console.error(`No such suite: ${suite}`);
      failed += 1;
      continue;
    }
    console.log(`\n=== ${suite} ===`);
    const result = spawnSync(process.execPath, [file], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FORNOW_EXT_ID: id,
        FORNOW_DIST: DIST,
        FORNOW_SHOTS: SHOTS,
        FORNOW_CDP_PORT: String(PORT),
      },
    });
    if (result.status !== 0) failed += 1;
  }

  console.log(
    `\n${suites.length - failed}/${suites.length} suites passed. Screenshots in e2e/screenshots.`,
  );
  shutdown(failed === 0 ? 0 : 1);
} catch (error) {
  console.error(error);
  shutdown(1);
}
