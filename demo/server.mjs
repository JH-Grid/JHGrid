// Dependency-free static server, just for viewing the demo in a browser.
// Serving root is relative to this file's location (repo root), so it works from any cwd.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve, sep } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  // Send root to the demo page. Redirect rather than serve it straight from / so the browser's
  // base URL becomes /demo/ and any relative asset the page references resolves under /demo/.
  if (path === '/') {
    res.writeHead(302, { Location: '/demo/demo.html' });
    res.end();
    return;
  }

  // Checked as "does the resolved absolute path stay inside root", not a regex - catches every
  // ../ combination.
  const full = resolve(join(ROOT, path));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }

  try {
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + path);
  }
});

server.listen(8123, () => console.log('demo server on http://localhost:8123/demo/demo.html (root: ' + ROOT + ')'));
