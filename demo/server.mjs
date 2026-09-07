// 의존성 없는 정적 서버 — 데모를 브라우저로 확인하기 위한 것뿐이다.
// 서빙 루트는 이 파일 위치 기준(레포 루트)이라 어느 cwd에서 실행하든 동일하게 동작한다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve, sep } from 'node:path';
import { makeRows } from './data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ── "대용량 그리드" 데모용 실제 서버 API ────────────────────────────────────────
// app.js의 메인 그리드는 fetchMeta+fetchData로 브라우저 메모리 위 배열을 걸러낸다(데모 서버
// 역할은 app.js 안 applyState()가 함). 이 섹션은 그 반대편 짝인 opts.fetchPage 하나로 rows와
// totalRows를 한 번에 돌려주는, 진짜 HTTP 왕복이 있는 백엔드를 흉내낸다.
const BIG_FIELDS = ['id', 'name', 'email', 'dept', 'active', 'grade', 'salary', 'score'];
const BIG_ROWS = makeRows(20000).map(r => Object.fromEntries(BIG_FIELDS.map(f => [f, r[f]])));

// 헤더 체크박스로 켠 override는 그 컬럼에 대해 서버가 항상 이 값을 내려주게 만든다 — 아직
// 로드 안 된 페이지를 나중에 스크롤해서 처음 불러와도(클라이언트가 patch할 수 없는 행) 서버가
// 이미 적용된 값으로 내려주기 때문에 화면이 "half-applied" 상태로 보이지 않는다.
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
    // Kept deliberately plain — this stands in for the SQL a real backend would build.
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

  // 리다이렉트로 보내야 한다. /에서 demo/index.html을 바로 내려주면 브라우저의 기준 URL이
  // /로 남아 페이지 안의 ./app.js가 /demo/app.js가 아니라 /app.js로 해석된다.
  if (path === '/') {
    res.writeHead(302, { Location: '/demo/index.html' });
    res.end();
    return;
  }

  // 정규식 대신 "해석된 절대경로가 루트 안에 있는가"로 판정 — ../ 조합을 놓치지 않는다.
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
