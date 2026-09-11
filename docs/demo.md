---
title: Live Demo
nav_order: 2
---

# Live Demo

[← Docs index](README.md)

Four small grids, each isolating one thing: raw scroll performance at 1,000,000 rows, inline
editing, filtering, and frozen columns. Every grid on this page is a real `JHGrid` instance
loaded straight from the [jsDelivr CDN build](../README.md#option-b-cdn-single-bundled-script);
view source on this page to see the exact code.

<div id="jhg-demo-boot-error" style="display:none;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;
     padding:10px 12px;border-radius:8px;margin:12px 0;font:12px/1.6 ui-monospace,Menlo,monospace;
     white-space:pre-wrap;"></div>

## 1,000,000 rows

Scrolling stays smooth because only the visible cells are ever drawn; the other 999,900-odd rows
don't exist in the DOM. Drag the scrollbar to jump around; nothing gets slower the further down you
go.

<p id="jhg-demo-perf-status" class="jhg-demo-status">Booting…</p>
<div class="jhg-demo-card" id="jhg-demo-perf"></div>

## Editing

Double-click a cell to edit it. `Ctrl+Z` / `Ctrl+Y` undo and redo; `Ctrl+C` / `Ctrl+V` copy and
paste a range.

<div class="jhg-demo-card" id="jhg-demo-edit"></div>

## Filtering

Type in the box for a quick cross-column filter, or click the small `▾` indicator at the right edge
of a column header (it turns amber when that column has a filter applied) for a per-column filter
panel.

<div class="jhg-demo-bar">
  <input type="text" id="jhg-demo-filter-input" placeholder="Quick filter…">
</div>
<div class="jhg-demo-card" id="jhg-demo-filter"></div>

## Frozen columns

`frozenCols` / `frozenColsRight` pin columns to either edge. Scroll right: **Name** and **Dept**
stay put on the left, **Score** stays put on the right.

<div class="jhg-demo-card" id="jhg-demo-frozen"></div>

<style>
  .jhg-demo-card { border: 1px solid #dfe3e8; border-radius: 8px; display: block;
                   overflow-x: auto; overflow-y: hidden; max-width: 100%; margin: 8px 0 20px; }
  .jhg-demo-status { font-size: 13px; color: #5b6472; margin: 0 0 8px; }
  .jhg-demo-bar { margin: 0 0 8px; }
  .jhg-demo-bar input { font-size: 13px; padding: 6px 10px; border: 1px solid #dfe3e8;
                         border-radius: 6px; min-width: 220px; }
</style>

<script>
  function jhgDemoBootError(msg) {
    const el = document.getElementById('jhg-demo-boot-error');
    el.style.display = 'block';
    el.textContent = (el.textContent ? el.textContent + '\n\n' : '') + msg;
  }
  window.addEventListener('error', (e) =>
    jhgDemoBootError('[error] ' + (e.message || e.error) + '\n' + (e.error?.stack || '')));
  window.addEventListener('unhandledrejection', (e) =>
    jhgDemoBootError('[unhandled rejection] ' + (e.reason?.message || e.reason) + '\n' + (e.reason?.stack || '')));
</script>
<script type="module">
  /* @latest resolves to the newest git tag; pin an exact tag instead for production.
     Dynamic import, not a static `import ... from` declaration -- some browsers never fetch a
     static import inside an inline module script on this page, leaving it stuck on "Booting…"
     with no error at all. A dynamic import resolves reliably instead. */
  const { JHGrid, CellRenderers } = await import('https://cdn.jsdelivr.net/gh/JH-Grid/JHGrid@latest/dist/jhgrid.esm.js');

  const DEPTS  = ['Engineering', 'Sales', 'Marketing', 'Support', 'Design'];
  const GRADES = ['A', 'B', 'C', 'D'];

  function makeRows(n) {
    return Array.from({ length: n }, (_, i) => ({
      id:     i + 1,
      name:   `User ${i + 1}`,
      email:  `user${i + 1}@example.com`,
      dept:   DEPTS[i % DEPTS.length],
      grade:  GRADES[i % GRADES.length],
      salary: 3200000 + ((i * 137) % 5000) * 1000,
      score:  (i * 37) % 101,
      active: i % 3 !== 0,
      joined: `20${20 + (i % 5)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    }));
  }

  /* ── 1,000,000 rows ─────────────────────────────────────────────────────
     Static dataset, no filter/sort UI here - the point is raw virtualized-scroll
     performance, not re-proving the filtering demo below at a different row count. */
  const PERF_ROWS = makeRows(1_000_000);
  const perfStatus = document.getElementById('jhg-demo-perf-status');
  let lastFrame = performance.now();
  let frameEma = 0;

  const perfGrid = new JHGrid({
    container: '#jhg-demo-perf',
    width: 760, height: 360, responsive: true,
    editableCols: '*',
    showRowNumbers: true,
    rowSelection: 'multi',
    frozenCols: 1,
    columnDefs: [
      { field: 'id',     label: 'ID',    width: 70,  align: 'right', group: 'Basic Info', renderer: CellRenderers.number() },
      { field: 'name',   label: 'Name',  width: 140, group: 'Basic Info' },
      { field: 'email',  label: 'Email', width: 220, group: 'Basic Info' },
      { field: 'dept',   label: 'Dept',  width: 130, group: 'Attributes', type: 'dropdown', options: DEPTS },
      { field: 'grade',  label: 'Grade', width: 92,  group: 'Attributes' },
      { field: 'active', label: 'Active', width: 90, group: 'Attributes', type: 'checkbox' },
      { field: 'salary', label: 'Salary', width: 130, align: 'right', group: 'Performance', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
      { field: 'score',  label: 'Score', width: 90,  align: 'right', group: 'Performance' },
    ],
    fetchMeta: async () => ({ totalRows: PERF_ROWS.length, columns: ['id', 'name', 'email', 'dept', 'grade', 'active', 'salary', 'score'] }),
    fetchData: async (page, size) => ({ rows: PERF_ROWS.slice(page * size, page * size + size) }),
    onRender: () => {
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      /* Exponential moving average so one slow frame (e.g. a chunk fetch) doesn't
         make the readout flicker - smoothed frame time is what the eye actually sees. */
      frameEma = frameEma ? frameEma * 0.9 + dt * 0.1 : dt;
    },
  });
  perfGrid.ready().then(() => {
    perfStatus.textContent = `1,000,000 rows loaded · only the visible ~15 rows are ever in the DOM`;
    setInterval(() => {
      if (frameEma > 0) {
        perfStatus.textContent =
          `1,000,000 rows · ~${Math.round(1000 / frameEma)} fps while scrolling · only the visible ~15 rows are ever in the DOM`;
      }
    }, 500);
  });

  /* ── Editing ─────────────────────────────────────────────────────────── */
  new JHGrid({
    container: '#jhg-demo-edit',
    width: 620, height: 360, responsive: true,
    editableCols: '*',
    showRowNumbers: true,
    rowSelection: 'multi',
    data: makeRows(40),
    columnDefs: [
      { field: 'name',   label: 'Name',   width: 150, validation: { required: true, minLength: 2 } },
      { field: 'email',  label: 'Email',  width: 220 },
      { field: 'dept',   label: 'Dept',   width: 140, type: 'dropdown', options: DEPTS },
      { field: 'active', label: 'Active', width: 90,  type: 'checkbox' },
    ],
  });

  /* ── Filtering ──────────────────────────────────────────────────────── */
  const filterGrid = new JHGrid({
    container: '#jhg-demo-filter',
    width: 620, height: 360, responsive: true,
    showRowNumbers: true,
    rowSelection: 'multi',
    data: makeRows(500),
    columnDefs: [
      { field: 'name',   label: 'Name',  width: 150 },
      { field: 'dept',   label: 'Dept',  width: 140, type: 'dropdown', options: DEPTS },
      { field: 'grade',  label: 'Grade', width: 90 },
      { field: 'score',  label: 'Score', width: 90, align: 'right' },
    ],
  });
  document.getElementById('jhg-demo-filter-input').addEventListener('input', (e) => {
    filterGrid.setQuickFilter(e.target.value);
  });

  /* ── Frozen columns ─────────────────────────────────────────────────────
     Ten columns at 120-150px each add up to well past the 620px card, so the grid
     actually needs to scroll horizontally for the pinned edges to mean anything. */
  new JHGrid({
    container: '#jhg-demo-frozen',
    width: 620, height: 360, responsive: true,
    showRowNumbers: true,
    rowSelection: 'multi',
    frozenCols: 2,
    frozenColsRight: 1,
    data: makeRows(30),
    columnDefs: [
      { field: 'name',   label: 'Name',   width: 130 },
      { field: 'dept',   label: 'Dept',   width: 130 },
      { field: 'email',  label: 'Email',  width: 200 },
      { field: 'grade',  label: 'Grade',  width: 92 },
      { field: 'salary', label: 'Salary', width: 130, align: 'right', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
      { field: 'joined', label: 'Joined', width: 120 },
      { field: 'active', label: 'Active', width: 100, type: 'checkbox' },
      { field: 'score',  label: 'Score',  width: 90, align: 'right' },
    ],
  });
</script>
