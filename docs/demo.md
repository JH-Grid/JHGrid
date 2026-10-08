---
title: Live Demo
nav_order: 3
description: Live JavaScript data grid demos - scroll 1,000,000 rows, edit cells inline, filter and sort, freeze columns and pin total rows, all running in the browser.
---

# Live Demo

[← Docs index](README.md)

Eight small grids, each isolating one thing: raw scroll performance at 1,000,000 rows, inline
editing, filtering, frozen columns, pinned rows, row selection, column types/renderers, and theming. Every grid
on this page is a real `JHGrid` instance, loaded on the published site from the
[jsDelivr CDN build](../README.md#option-c-cdn); view source on this page to
see the exact code. The snippets under each heading are the options that section is about — the
page's own script has the whole thing.

<div id="jhg-demo-boot-error" style="display:none;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;
     padding:10px 12px;border-radius:8px;margin:12px 0;font:12px/1.6 ui-monospace,Menlo,monospace;
     white-space:pre-wrap;"></div>

## 1,000,000 rows

Scrolling stays smooth because only the visible cells are ever drawn; the other 999,900-odd rows
don't exist in the DOM. Drag the scrollbar to jump around; nothing gets slower the further down you
go.

<p id="jhg-demo-perf-status" class="jhg-demo-status">Booting…</p>
<div class="jhg-demo-card" id="jhg-demo-perf" ></div>

Nothing about the grid changes at this row count — it asks for one page of rows at a time and
throws away the pages it has scrolled past:

```js
new JHGrid({
  container: '#grid',
  columnDefs: [{ field: 'id', label: 'ID', width: 60, align: 'right' }, /* … */],
  fetchMeta: async () => ({ totalRows: 1_000_000, columns: ['id', 'name', 'email'] }),
  fetchData: async (page, size) => ({ rows: ROWS.slice(page * size, page * size + size) }),
});
```

Point `fetchData` at your API instead of an array and the row count stops mattering at all — see
[`fetchMeta`](api.md#fetchmeta) and [`fetchData`](api.md#fetchdata).

## Editing

Double-click a cell to edit it. `Ctrl+Z` / `Ctrl+Y` undo and redo; `Ctrl+C` / `Ctrl+V` copy and
paste a range.

<div class="jhg-demo-card" id="jhg-demo-edit" ></div>

`editableCols` decides what can be edited — `'*'` for every column, or a list of fields. `type`
picks the editor, and `validation` rejects a bad value with a red border and a message:

```js
new JHGrid({
  container: '#grid',
  data: rows,
  editableCols: '*',
  columnDefs: [
    { field: 'name',   label: 'Name',   width: 150, validation: { required: true, minLength: 2 } },
    { field: 'dept',   label: 'Dept',   width: 140, type: 'dropdown', options: DEPTS },
    { field: 'active', label: 'Active', width: 90,  type: 'checkbox' },
  ],
});
```

See [Validation](api.md#validation-columndefsvalidation) and
[Editor Options](api.md#editor-options-columndefseditoroptions).

## Filtering

Type in the box for a quick cross-column filter, or click the small `▾` indicator at the right edge
of a column header (it turns amber when that column has a filter applied) for a per-column filter
panel.

<div class="jhg-demo-bar">
  <input type="text" id="jhg-demo-filter-input" placeholder="Quick filter…">
</div>
<div class="jhg-demo-card" id="jhg-demo-filter"></div>

The per-column panel needs no wiring; the box above is one call against your own input:

```js
const grid = new JHGrid({ container: '#grid', data: rows, columnDefs });

document.querySelector('#quick-filter').addEventListener('input', (e) => {
  grid.setQuickFilter(e.target.value);
});
```

See [Set Filter / Quick Filter](api.md#set-filter--quick-filter) and
[`setFilter` / `setSort`](api.md#field-based-filter--sort-setfilter--setsort) for filtering from code.

## Frozen columns

`frozenCols` / `frozenColsRight` pin columns to either edge. Scroll right: **Name** and **Dept**
stay put on the left, **Score** stays put on the right.

<div class="jhg-demo-card" id="jhg-demo-frozen"></div>

Both are counts, not field names: the first `frozenCols` columns and the last `frozenColsRight`
columns of `columnDefs` are the ones that stay put.

```js
new JHGrid({
  container: '#grid',
  data: rows,
  frozenCols: 2,        // Name, Dept stay at the left edge
  frozenColsRight: 1,   // Score stays at the right edge
  columnDefs: [
    { field: 'name', label: 'Name', width: 130 },
    { field: 'dept', label: 'Dept', width: 130 },
    /* … */
    { field: 'score', label: 'Score', width: 90, align: 'right' },
  ],
});
```

Users can also freeze a column from its header menu — see
[Frozen Columns](api.md#frozen-columns-frozencols--frozencolsright).

## Pinned rows

`pinnedBottomRows` keeps a row fixed at the bottom of the grid, detached from scroll/sort/filter —
the classic use case is a totals row. Scroll or click a column header to sort; the total row never
moves and is never affected. `rowPinButton` draws a pin at the right edge of the row-number gutter
— hover a row to see it, click to pin a copy to the top. The button below does the same thing from
code with `pinRow()`, for when the pin should be triggered some other way. Either way it becomes
its own independent copy, so editing it afterward doesn't touch the original row.

<div class="jhg-demo-bar">
  <button type="button" id="jhg-demo-pin-btn">Pin selected row to top</button>
</div>
<div class="jhg-demo-card" id="jhg-demo-pinned" ></div>

A pinned row is a plain object, so a totals row is whatever you compute from the data you already
have — the grid never sums anything on its own:

```js
const grid = new JHGrid({
  container: '#grid',
  data: rows,
  rowPinButton: true,   // the pin in the row-number gutter
  columnDefs,
  pinnedBottomRows: [{
    name:   `Total (${rows.length})`,
    salary: rows.reduce((sum, r) => sum + r.salary, 0),
  }],
});

// Same thing from code, on a row the user has selected:
const [row] = grid.getSelectedRows();
if (row != null) grid.pinRow(row, 'top');
```

See [Pinned Rows](api.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow).

## Row selection

`rowSelection: 'multi'` selects rows by clicking the row-number gutter on the left (`Ctrl`/`Shift`
to extend a selection, the same as a spreadsheet). `onRowSelect(rows)` fires with the selected row
indices on every change; `getSelectedRows()` reads them back at any time.

<p id="jhg-demo-selection-status" class="jhg-demo-status">0 selected</p>
<div class="jhg-demo-card" id="jhg-demo-selection"></div>

```js
const grid = new JHGrid({
  container: '#grid',
  data: rows,
  showRowNumbers: true,     // the gutter the click lands in
  rowSelection: 'multi',    // or 'single', or 'none' (the default)
  columnDefs,
  onRowSelect: (rows) => {
    document.querySelector('#count').textContent = `${rows.length} selected`;
  },
});

grid.getSelectedRows();      // [3, 4, 7] - row indices, in ascending order
```

For the other pattern — a checkbox column with a tick-everything box in its header — see
[Row Selection / Header Checkbox](api.md#row-selection-rowselection--header-checkbox).

## Column types & renderers

`columnDefs[i].type` picks a built-in editor/renderer pair (`dropdown`, `checkbox`, `date`, ...);
`renderer` swaps in a different [`CellRenderers`](api.md#built-in-cell-renderers-cellrenderers) entry without changing the
editor, e.g. formatting a plain number as currency.

<div class="jhg-demo-card" id="jhg-demo-types"></div>

```js
// The Rating column's renderer: args.text() writes one line into the cell box, using the
// column's own alignment, so a renderer like this needs no coordinates.
registerCellRenderer('stars', () => (ctx, { value, text }) => {
  const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  text('★'.repeat(n) + '☆'.repeat(5 - n), { color: '#f59e0b', size: 15 });
});

new JHGrid({
  container: '#grid',
  data: rows,
  editableCols: '*',
  columnDefs: [
    { field: 'dept',   label: 'Dept',   width: 150, type: 'dropdown', options: DEPTS },
    { field: 'active', label: 'Active', width: 90,  type: 'checkbox' },
    { field: 'joined', label: 'Joined', width: 130, type: 'date', format: 'YYYY-MM-DD' },
    { field: 'salary', label: 'Salary', width: 140, align: 'right',
      renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
    { field: 'rating', label: 'Rating', width: 110, align: 'right', renderer: 'stars' },
  ],
});
```

The Joined column names its own `format`. Leave `format` out and the column follows the locale's
date pattern instead, so the same stored `2026-03-14` reads `03/14/2026` under `en` and
`2026/03/14` under `ja` — see [Date Columns](api.md#date-columns-type-date).

Thirteen renderers ship built in (`progressBar`, `badge`, `checkmark`, `link`, `image`, …) and
`registerCellRenderer()` adds your own — see
[Built-in Cell Renderers](api.md#built-in-cell-renderers-cellrenderers) and
[Column Types](api.md#column-types-date--richtext--image-and-custom-editorsrenderers).

## Themes

`theme` is a constructor-only option, so switching themes at runtime means rebuilding the grid:
the select below `destroy()`s the current instance and constructs a new one with the chosen
`theme` object — see [Themes](theming.md) for the full token reference.

<div class="jhg-demo-bar">
  <select id="jhg-demo-theme-select">
    <option value="light">Light (default)</option>
    <option value="dark">Dark</option>
  </select>
</div>
<div class="jhg-demo-card" id="jhg-demo-theme" ></div>

`theme` is a partial override: name only the tokens you want to change and the rest keep their
defaults.

```js
const DARK = {
  headerBg: '#111827', headerText: '#e5e7eb', headerBorder: '#374151',
  rowEven: '#1f2937', rowOdd: '#111827', cellText: '#f9fafb', cellBorder: '#374151',
  selectionColor: '#60a5fa', selectionFill: 'rgba(96,165,250,0.18)',
  selRowBg: 'rgba(96,165,250,0.14)', scrollbarBg: '#111827', scrollbarThumb: '#4b5563',
  frozenBorder: '#4b5563',
  // The default hover wash is a black tint - invisible over dark rows.
  hoverRowBg: 'rgba(255,255,255,0.055)',
};

let grid = null;
function build(dark) {
  grid?.destroy();
  grid = new JHGrid({
    container: '#grid',
    data: rows,
    editableCols: '*',    // otherwise every column gets the light readonlyCellBg tint
    theme: dark ? DARK : undefined,
    columnDefs,
  });
}
build(false);
```

All 58 tokens are listed in [Themes](theming.md), which also covers the CSS variables the
non-canvas parts (menus, panels, the pager) read.

<style>
  /* No border-radius here: the grid draws right to its own edges (scrollbar arrows included), and
     rounding this container's corners while it clips overflow (needed for the horizontal scrollbar)
     cuts a small notch out of the canvas's own corners - most visible bottom-right, where a vertical
     scrollbar's down-arrow sits right at the corner. */
  .jhg-demo-card { border: 1px solid #dfe3e8; display: block;
                   overflow-x: auto; overflow-y: hidden; max-width: 100%; margin: 8px 0 20px;
                   min-height: 360px; }
  .jhg-demo-status { font-size: 13px; color: #5b6472; margin: 0 0 8px; }
  .jhg-demo-bar { margin: 0 0 8px; }
  .jhg-demo-bar input { font-size: 13px; padding: 6px 10px; border: 1px solid #dfe3e8;
                         border-radius: 6px; min-width: 220px; }
  .jhg-demo-bar select { font-size: 13px; padding: 6px 10px; border: 1px solid #dfe3e8;
                          border-radius: 6px; }
  .jhg-demo-bar button { font-size: 13px; padding: 6px 12px; border: 1px solid #dfe3e8;
                          border-radius: 6px; background: #fff; cursor: pointer; }
  .jhg-demo-bar button:hover { background: #f5f7fa; }
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
  /* Dynamic import, not a static `import ... from` declaration -- some browsers never fetch a
     static import inside an inline module script on this page, leaving it stuck on "Booting…"
     with no error at all. A dynamic import resolves reliably instead.

     `/dist/` is only served by a local `jekyll serve`: the published site excludes dist/, which
     jsDelivr reads straight from the git tree instead. So a local preview checks this page against
     the bundle just built, and the published page falls through to the CDN. @latest resolves to the
     newest git tag; pin an exact tag instead if you copy this into a page of your own. */
  const CDN = 'https://cdn.jsdelivr.net/gh/JH-Grid/JHGrid@latest/dist/jhgrid.esm.js';
  const { JHGrid, CellRenderers, registerCellRenderer } =
    await import('/dist/jhgrid.esm.js').catch(() => import(CDN));
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
      rating: i % 6,
    }));
  }

  /* A custom renderer: 0-5 as stars. args.text() writes the line into the cell box with the
     column's own alignment, so there is no x/y arithmetic and nothing spills sideways. */
  registerCellRenderer('stars', () => (ctx, { value, text }) => {
    const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    text('★'.repeat(n) + '☆'.repeat(5 - n), { color: '#f59e0b', size: 15 });
  });

  /* ── 1,000,000 rows ─────────────────────────────────────────────────────
     Static dataset, no filter/sort UI here - the point is raw virtualized-scroll
     performance, not re-proving the filtering demo below at a different row count. */
  const PERF_ROWS = makeRows(1_000_000);
  const perfStatus = document.getElementById('jhg-demo-perf-status');
  let lastFrame = performance.now();
  let frameEma = 0;

  const perfGrid = new JHGrid({
    container: '#jhg-demo-perf',
    width: 820, height: 360,
    editableCols: '*',
    showRowNumbers: true,
    rowSelection: 'multi',
    frozenCols: 1,
    columnDefs: [
      { field: 'id',     label: 'ID',    width: 60,  align: 'right', group: 'Basic Info', renderer: CellRenderers.number() },
      { field: 'name',   label: 'Name',  width: 110, group: 'Basic Info' },
      { field: 'email',  label: 'Email', width: 150, group: 'Basic Info' },
      { field: 'dept',   label: 'Dept',  width: 100, group: 'Attributes', type: 'dropdown', options: DEPTS },
      { field: 'grade',  label: 'Grade', width: 90,  group: 'Attributes' },
      { field: 'active', label: 'Active', width: 85, group: 'Attributes', type: 'checkbox' },
      { field: 'salary', label: 'Salary', width: 100, align: 'right', group: 'Performance', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
      { field: 'score',  label: 'Score', width: 70,  align: 'right', group: 'Performance' },
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
    width: 650, height: 360,
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
    width: 520, height: 360,
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
    width: 620, height: 360,
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

  /* ── Pinned rows ─────────────────────────────────────────────────────────
     pinnedBottomRows is a snapshot, not a live view - the total below is computed once from
     this same PINNED_ROWS array, so it stays correct without the grid needing to know anything
     about "sum of salary column". */
  const PINNED_ROWS = makeRows(30);
  const pinnedGrid = new JHGrid({
    container: '#jhg-demo-pinned',
    width: 560, height: 360,
    showRowNumbers: true,
    rowSelection: 'multi',
    rowPinButton: true,
    data: PINNED_ROWS,
    columnDefs: [
      { field: 'name',   label: 'Name',   width: 150 },
      { field: 'dept',   label: 'Dept',   width: 140 },
      { field: 'grade',  label: 'Grade',  width: 90 },
      { field: 'salary', label: 'Salary', width: 140, align: 'right', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
    ],
    pinnedBottomRows: [{
      name: `Total (${PINNED_ROWS.length})`,
      dept: '', grade: '',
      salary: PINNED_ROWS.reduce((sum, r) => sum + r.salary, 0),
    }],
  });
  document.getElementById('jhg-demo-pin-btn').addEventListener('click', () => {
    const [row] = pinnedGrid.getSelectedRows();
    if (row == null) { alert('Select a row first (click its row number).'); return; }
    pinnedGrid.pinRow(row, 'top');
  });

  /* ── Row selection ──────────────────────────────────────────────────── */
  const selectionStatus = document.getElementById('jhg-demo-selection-status');
  new JHGrid({
    container: '#jhg-demo-selection',
    width: 520, height: 360,
    showRowNumbers: true,
    rowSelection: 'multi',
    data: makeRows(60),
    columnDefs: [
      { field: 'name',  label: 'Name',  width: 150 },
      { field: 'dept',  label: 'Dept',  width: 140 },
      { field: 'grade', label: 'Grade', width: 90 },
      { field: 'score', label: 'Score', width: 90, align: 'right' },
    ],
    onRowSelect: (rows) => {
      selectionStatus.textContent = `${rows.length} selected`;
    },
  });

  /* ── Column types & renderers ───────────────────────────────────────── */
  new JHGrid({
    container: '#jhg-demo-types',
    width: 700, height: 360,
    editableCols: '*',
    showRowNumbers: true,
    data: makeRows(40),
    columnDefs: [
      { field: 'dept',   label: 'Dept',   width: 150, type: 'dropdown', options: DEPTS },
      { field: 'active', label: 'Active', width: 90,  type: 'checkbox' },
      { field: 'joined', label: 'Joined', width: 130, type: 'date', format: 'YYYY-MM-DD' },
      { field: 'salary', label: 'Salary', width: 140, align: 'right', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
      { field: 'rating', label: 'Rating', width: 110, align: 'right', renderer: 'stars' },
    ],
  });

  /* ── Themes ──────────────────────────────────────────────────────────── */
  const DARK_THEME = {
    headerBg: '#111827', headerText: '#e5e7eb', headerBorder: '#374151',
    rowEven: '#1f2937', rowOdd: '#111827', cellText: '#f9fafb', cellBorder: '#374151',
    selectionColor: '#60a5fa', selectionFill: 'rgba(96,165,250,0.18)',
    selRowBg: 'rgba(96,165,250,0.14)', scrollbarBg: '#111827', scrollbarThumb: '#4b5563',
    frozenBorder: '#4b5563',
    hoverRowBg: 'rgba(255,255,255,0.055)',  /* default wash is a black tint, invisible over dark rows */
  };

  let themeGrid = null;
  function buildThemeGrid(dark) {
    themeGrid?.destroy();
    themeGrid = new JHGrid({
      container: '#jhg-demo-theme',
      width: 560, height: 360,
      editableCols: '*',   /* otherwise every column gets the default readonlyCellBg (#F5F5F5) tint,
                              which the dark theme below doesn't override and would wash out on rowEven/rowOdd */
      showRowNumbers: true,
      rowSelection: 'multi',
      data: makeRows(30),
      theme: dark ? DARK_THEME : undefined,
      columnDefs: [
        { field: 'name',   label: 'Name',   width: 150 },
        { field: 'dept',   label: 'Dept',   width: 140 },
        { field: 'grade',  label: 'Grade',  width: 90 },
        { field: 'salary', label: 'Salary', width: 130, align: 'right', renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
      ],
    });
  }
  buildThemeGrid(false);
  document.getElementById('jhg-demo-theme-select').addEventListener('change', (e) => {
    buildThemeGrid(e.target.value === 'dark');
  });
</script>
