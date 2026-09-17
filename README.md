# JH Grid

High-performance Canvas-based data grid with smooth 2D virtualization.  
Renders millions of rows and columns with near-zero DOM overhead.

**[▶ Try the live demo](https://jh-grid.github.io/JHGrid/docs/demo)**: 1,000,000-row scroll
performance, editing, filtering, and frozen columns, running in your browser right now.

![JH Grid screenshot](docs/images/jhgrid.png)

> This repository distributes the **pre-built bundle** (`jhgrid.esm.js` / `jhgrid.js` /
> `jhgrid.min.js`) plus its documentation, not the buildable source tree. See [`docs/`](docs/README.md)
> for the full reference.

---

## Features

- **Canvas rendering + 2D virtualization** — smooth at 60/120/144Hz, HiDPI-aware
- **Large-data loading** — chunk-based async loading with prefetch & cache
- **Frozen columns & scrollbars** — left/right freezing with draggable vertical/horizontal scrollbars
- **Selection & row operations** — cell/range selection, single/multi row selection, row drag reorder
- **Editing** — inline editing, validation, undo/redo, TSV copy & paste
- **Rich cell types** — dropdown, multiselect, checkbox, date, richtext, image, button, plus custom editors/renderers
- **Filtering & sorting** — set filter, quick filter, single-column sort
- **CRUD & change tracking** — row/column add/delete with diff-based persistence
- **Headers & styling** — multi-level headers, conditional row/cell styling
- **State & export** — state snapshot/restore, CSV export, print preview
- **i18n & accessibility** — KO/JA/ZH localization, ARIA, keyboard navigation, high-contrast support
- **Zero dependencies & theming** — fully themeable with no runtime dependencies

---

## Installation

### Option A: npm (recommended for bundled apps)

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

### Option B: Static ES module (no bundler)

`jhgrid.esm.js` is a single self-contained ES module file: deploy it as-is as a static resource
(e.g. from a Spring Boot static resource path) and import it directly, no build step required:

```html
<script type="module">
  import { JHGrid } from '/static/jhgrid.esm.js';
</script>
```

### Option C: CDN (single bundled script)

`jhgrid.min.js` is an IIFE build served straight from this repository via jsDelivr, no npm
install required. Everything is exposed on a single global, `JHGrid` (the grid constructor is
`JHGrid.JHGrid`):

```html
<!-- pin an exact tag/commit for production; @latest always serves the latest commit on that branch -->
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
<div id="my-grid"></div>

<script type="module">
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#my-grid',
  width:     1200,
  height:    700,

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
behave against a plain array.

### Server-paginated data

For a large dataset that shouldn't be loaded into memory all at once, fetch it page by page
instead:

```html
<div id="my-grid"></div>

<script type="module">
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#my-grid',
  width:     1200,
  height:    700,
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

---

## Documentation

**[Browse the docs online](https://jh-grid.github.io/JHGrid/)**, or read them directly in
[`docs/`](docs/README.md):

- **[API Reference](docs/api.md)**: every constructor option, the data source interface, pagination, and all public methods
- **[Theming](docs/theming.md)**: the full theme object, styling with your own CSS via `--jhg-*` custom properties, and canvas motion tuning
- **[Interaction Reference](docs/interaction.md)**: every mouse and keyboard interaction
- **[Spring Boot Integration](docs/integration.md)**: backend API shape and SQL pagination
- **[Architecture](docs/architecture.md)**: internal structure and the virtual rendering flow
- **[Browser Support](docs/browser-support.md)**: minimum versions and what sets them

---

## Browser Support

Chrome/Edge 92+, Firefox 90+, Safari 15.4+: no IE, no legacy Edge, no transpilation or polyfills.
See [docs/browser-support.md](docs/browser-support.md) for exactly what sets that floor.

---

## License

Proprietary: free to use in your own applications, no redistribution or reverse engineering of
the compiled bundle. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
