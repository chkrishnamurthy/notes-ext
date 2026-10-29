/**
 * A plain web page served from this machine, for suites that need a real http
 * page to inject into.
 *
 * They used to load https://example.com/, which made the run depend on the
 * network and on that site's markup staying as it was. This serves the same
 * small page — a heading, a paragraph and a link — with nothing to go stale.
 */
import { createServer } from 'node:http';

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Example Domain</title></head>
<body>
  <div>
    <h1>Example Domain</h1>
    <p>This domain is for use in illustrative examples in documents.</p>
    <p><a href="https://www.iana.org/domains/example">More information...</a></p>
  </div>
</body>
</html>`;

/** Start the page on `port`. The server never keeps the process alive on its own. */
export async function startHostPage(port = Number(process.env.FORNOW_HOST_PORT ?? 8766)) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  server.unref();
  const origin = `http://127.0.0.1:${port}`;
  return { origin, url: `${origin}/`, close: () => server.close() };
}
