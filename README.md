# JH Grid

Canvas-based data grid with 2D virtualization, built-in editing, filtering and undo/redo, and zero runtime dependencies.

**[▶ Try the live demo](https://jh-grid.github.io/JHGrid/docs/demo)**: 1,000,000-row scroll
performance, editing, filtering, and frozen columns, running in your browser right now.

![JH Grid screenshot](docs/images/jhgrid.png)

---

## Features

- **Canvas rendering + 2D virtualization** - smooth at 60/120/144Hz, HiDPI-aware
- **Sizes itself to its container** - fills the element it is given and follows it as the page reflows, or takes a fixed `width`/`height` instead
- **Large-data loading** - chunk-based async loading with prefetch & cache
- **Frozen columns, pinned rows & scrollbars** - left/right column freezing, top/bottom pinned rows (totals), draggable vertical/horizontal scrollbars
- **Pagination** - continuous scrolling or classic pages, with an optional page-size selector
- **Selection & row operations** - cell/range selection, single/multi row selection, row drag reorder
- **Editing** - inline editing, validation, undo/redo, TSV copy & paste, fill handle
- **Rich cell types** - dropdown, multiselect, checkbox, date, richtext, image, button, plus custom editors/renderers
- **Filtering & sorting** - set filter, tag filter for huge columns, quick filter, single-column sort
- **CRUD & change tracking** - row/column add/delete with diff-based persistence
- **Headers & styling** - multi-level headers, conditional row/cell styling, context menus you can narrow or extend
- **State & export** - state snapshot/restore, CSV export, print preview
- **i18n & accessibility** - KO/JA/ZH localization, ARIA, keyboard navigation with remappable shortcuts, high-contrast support
- **Zero dependencies & theming** - fully themeable with no runtime dependencies

---

## Benchmarks

1,000,000 rows x 15 columns, 2 runs, the slower of the two. Every grid on its documented default
configuration, with no large-data tuning options. Windows 11, i7-12700H, 32GB, headless Chromium
153. Timed from the API call to each grid's own "done" signal plus two painted frames.

| | **JH Grid 0.3.0** | Grid A | Grid B | Grid C |
|---|---:|---:|---:|---:|
| Create grid, first paint | **47ms** | 719ms | 404ms | 160ms |
| Sort text, many repeats | **366ms** | 2.80s | 6.57s | 1.38s |
| Sort text, mostly unique | **867ms** | 3.47s | 4.87s | 1.95s |
| Sort number | **433ms** | 1.75s | 1.85s | 641ms |
| Filter one value | **51ms** | 267ms | 100ms | not measured |
| Filter, then sort inside it | **381ms** | 1.38s | 1.25s | not measured |
| JS heap after load | **391MB** | 859MB | 777MB | 424MB |

Two cases go the other way. Sorting text that is *already* in order (a sequential `ORD-...` key)
takes 450ms against Grid A's 186ms - Grid A's default comparator skips locale- and numeric-aware
comparison, so it is doing less work rather than the same work faster. Quick search across every
column takes 934ms against Grid B's 751ms; Grid B has no built-in quick search, so that
figure is a filter function scanning all fields, not the same feature.

Grid C's filter rows are blank because its `filter` property stops taking effect once its
custom element has been created and removed on the same page, which is what this benchmark
does between runs; no public API worked around it, so those numbers were not collected.

Scrolling is not a differentiator: all four grids hold a 16.7-16.8ms p95 frame time with zero
frames over 50ms, at every row count tested.

---

## Installation

### Option A: npm

```bash
npm install @jh-grid/jhgrid-js
```

```js
import { JHGrid } from '@jh-grid/jhgrid-js';
```

The package ships as **ES Modules only** and includes its own TypeScript declarations
(`index.d.ts`), so no `@types/` package is needed. Any bundler (Vite, webpack, Rollup, esbuild) and
modern Node ESM can consume it directly. CommonJS `require('@jh-grid/jhgrid-js')` is *not* supported; use a
dynamic `await import('@jh-grid/jhgrid-js')` if you must load it from a CJS file.

### Option B: ES Module

No build step or package manager: copy `dist/jhgrid.esm.js` to a static resource path of your own
(e.g. a Spring Boot static resource folder) and import it as an ES Module.

```html
<script type="module">
  import { JHGrid } from '/static/jhgrid.esm.js';
</script>
```

### Option C: CDN

A pre-bundled IIFE build is served straight from GitHub via jsDelivr, no npm required.
Everything is exposed on a single global, `JHGrid` (the grid constructor is `JHGrid.JHGrid`):

```html
<!-- pin an exact tag for production; @latest resolves to the newest git tag -->
<script src="https://cdn.jsdelivr.net/gh/JH-Grid/JHGrid@latest/dist/jhgrid.min.js"></script>
<script>
  const grid = new JHGrid.JHGrid({
    container: '#my-grid',
    // ...
  });
</script>
```

---

## Quick Start

### Data already in memory (default)

Pass an array you already have (an API response, a small/medium table) straight in via `data`,
no fetch functions needed:

```html
<!-- With no width/height the grid fills this element and follows it as the page reflows,
     so give the container a size. Pass width/height instead for a fixed size. -->
<div id="my-grid" style="width: 100%; height: 700px"></div>

<script type="module">
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#my-grid',

  data: [
    { name: 'Alice', age: 30, city: 'Seoul' },
    { name: 'Bob',   age: 25, city: 'Busan' },
  ],

  // Columns allowed to be edited (all columns are readonly if omitted)
  editableCols: '*',   // or ['name', 'age'] for a subset

  // Called whenever a cell value changes. oldValue is the prior edit if the cell was already
  // dirty, otherwise the row's original (pre-edit) value.
  onCellChange: ({ row, field, newValue, oldValue }) => {
    console.log(`[${row}] ${field}: ${oldValue} -> ${newValue}`);
  },
});
</script>
```

See [Local Array Data](docs/api.md#local-array-data-data) for how filtering/sorting/`refresh()`
behave against a plain array, and [Responsive Sizing](docs/api.md#responsive-sizing-responsive) for
sizing to the container versus a fixed `width`/`height`.

### Server-paginated data

For a large dataset that shouldn't be loaded into memory all at once, fetch it page by page
instead:

```html
<div id="my-grid" style="width: 100%; height: 700px"></div>

<script type="module">
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#my-grid',
  editableCols: '*',

  fetchMeta: async () => {
    const res = await fetch('/api/grid/meta');
    return res.json(); // { totalRows: number, columns: string[] }
  },

  fetchData: async (page, size) => {
    const res = await fetch(`/api/grid/data?page=${page}&size=${size}`);
    return res.json(); // { rows: object[] }
  },
});
</script>
```

See [`fetchPage`](docs/api.md#fetchpage-single-callback-alternative) for a single-callback
alternative to `fetchMeta`+`fetchData` when your backend already returns both together.

A local copy of four of the grids on [`docs/demo.md`](docs/demo.md) — 1,000,000 rows, editing,
filtering, and frozen columns — runs from this repo without hitting the CDN:

```bash
node demo/server.mjs
# open http://localhost:8123/
```

---

## Documentation

**[Browse the docs online](https://jh-grid.github.io/JHGrid/)**, or read them directly in
[`docs/`](docs/README.md), since this README stays a quick landing page:

- **[Getting Started](docs/getting-started.md)**: what a grid needs, the decisions to make up front, React/Vue/Angular setup, and a troubleshooting table
- **[API Reference](docs/api.md)**: every constructor option, the data source interface, column types and editors, validation, pagination, all public methods (filtering, sorting, row/column CRUD, pinned rows, context menus, export) and the text reference for translating the grid
- **[Theming](docs/theming.md)**: the full theme object, styling with your own CSS via `--jhg-*` custom properties, and canvas motion tuning
- **[Interaction Reference](docs/interaction.md)**: every mouse and keyboard interaction, including copy, paste and the fill handle
- **[Spring Boot Integration](docs/integration.md)**: backend API shape, SQL paging, sorting and filtering, saving edits
- **[Architecture](docs/architecture.md)**: internal structure and the virtual rendering flow
- **[Browser Support](docs/browser-support.md)**: minimum supported versions

---

## Browser Support

Chrome/Edge 99+, Firefox 112+, Safari 15.4+: no IE, no legacy Edge, no transpilation or polyfills.
See [docs/browser-support.md](docs/browser-support.md) for details.

---

## License

Proprietary: free to use in your own applications, no redistribution or reverse engineering of
the compiled bundle. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
