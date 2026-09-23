// Dependency-free static server, just for viewing the demo in a browser.
// Serving root is relative to this file's location (repo root), so it works from any cwd.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve, sep } from 'node:path';
import { makeRows } from './data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ── Real server API for the "big data grid" demo ──────────────────────────────
// app.js's main grid filters a browser-memory array via fetchMeta+fetchData (applyState() in
// app.js plays the server's role there). This section is the other side: a mock backend with a
// real HTTP round trip, returning rows and totalRows together via opts.fetchPage.
const BIG_FIELDS = ['id', 'name', 'email', 'dept', 'active', 'grade', 'salary', 'score'];
const BIG_ROWS = makeRows(20000).map(r => Object.fromEntries(BIG_FIELDS.map(f => [f, r[f]])));

// An override set via the header checkbox makes the server always return that value for the
// column - so a page scrolled into view later (a row the client never had a chance to patch)
// still comes back pre-applied, instead of looking "half-applied".
const columnOverrides = new Map();
function applyOverrides(row) {
  return columnOverrides.size === 0 ? row : { ...row, ...Object.fromEntries(columnOverrides) };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (req.method === 'POST' && path === '/demo/gridView') {
    const { page = 0, size = 300, state = null } = await readJsonBody(req).catch(() => ({}));
    // Filters and sorts server-side, which is the whole point of the grid handing `state` over.
    // Kept deliberately plain - this stands in for the SQL a real backend would build.
    let matched = BIG_ROWS;
    for (const [field, want] of Object.entries(state?.filters ?? {})) {
      if (Array.isArray(want)) {
        if (want.length) matched = matched.filter(r => want.includes(String(r[field] ?? '')));
      } else if (want) {
        const needle = String(want).toLowerCase();
        matched = matched.filter(r => String(r[field] ?? '').toLowerCase().includes(needle));
      }
    }
    const q = state?.quickFilter;
    if (q) {
      const needle = String(q).toLowerCase();
      matched = matched.filter(r => BIG_FIELDS.some(f => String(r[f] ?? '').toLowerCase().includes(needle)));
    }
    const sort = state?.sorts?.[0];
    if (sort) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      matched = [...matched].sort((a, b) => {
        const x = a[sort.field], y = b[sort.field];
        const both = typeof x === 'number' && typeof y === 'number';
        return dir * (both ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'ko'));
      });
    }
    const rows = matched.slice(page * size, page * size + size).map(applyOverrides);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ rows, totalRows: matched.length, columns: BIG_FIELDS }));
    return;
  }
  if (req.method === 'POST' && path === '/demo/toggleColumn') {
    const { field, checked } = await readJsonBody(req).catch(() => ({}));
    if (field) columnOverrides.set(field, String(checked));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Must redirect, not serve directly - if demo/index.html were returned straight from /, the
  // browser's base URL stays / and the page's own ./app.js resolves to /app.js instead of
  // /demo/app.js.
  if (path === '/') {
    res.writeHead(302, { Location: '/demo/index.html' });
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

server.listen(8123, () => console.log('demo server on http://localhost:8123 (root: ' + ROOT + ')'));
