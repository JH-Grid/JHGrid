# JH Grid

High-performance Canvas-based data grid with smooth 2D virtualization.  
Renders millions of rows and columns with near-zero DOM overhead.

![JH Grid screenshot](docs/images/jhgrid.png)

> This repository distributes the **pre-built bundle** (`jhgrid.esm.js` / `jhgrid.js` /
> `jhgrid.min.js`) plus its documentation — not the buildable source tree. See [`docs/`](docs/README.md)
> for the full reference.

---

## Features

- Smooth rendering via `requestAnimationFrame` + Canvas 2D — synced to your display's native refresh rate (60Hz, 120Hz, 144Hz, etc.), not capped at 60fps
- 2D virtual scrolling — only visible cells are drawn
- Chunk-based async data loading with prefetch & cache
- HiDPI / Retina display support (devicePixelRatio scaling)
- Draggable scrollbars (vertical + horizontal)
- Left/right frozen columns (`frozenCols` / `frozenColsRight`)
- **Cell click** — single cell selection with blue border highlight
- **Cell drag** — multi-cell range selection with fill overlay
- **Row selection** — single/multi row selection (`rowSelection: 'single' | 'multi'`), with an optional select-all header checkbox (`columnDefs[].headerCheckbox`)
- **Row drag reorder** — drag rows by the row-number gutter (`rowReorder: true`)
- **Double-click to edit** — per-column editable/readonly control
- **Ctrl+C / Ctrl+V** — copy & paste (single cell or range, TSV format)
- **Ctrl+Z / Ctrl+Y** — undo / redo (cell edits, row/column add/delete)
- **Column validation** — declarative required/pattern/min/max/length/custom rules with red-border + tooltip error display (`min`/`max` compare chronologically on a `type: 'date'` column)
- **In-cell action buttons** — `type: 'button'` columns render a clickable pill per row (e.g. "Delete", "Approve") independent of `editableCols`
- **Date / rich-text / image cell types** — `type: 'date'` opens a native date/datetime picker; `type: 'richtext'` opens an inline bold/italic/underline/strikethrough editor; `type: 'image'` renders a cell image (`fit: 'cover' | 'contain'`, size-aware decoding, shared LRU cache) — plus a pluggable `CellEditors`/`CellRenderers` registry (`registerCellEditor()`/`registerCellRenderer()`) for fully custom editors and renderers
- **Set filter** — checkbox list of a column's distinct values in the header filter panel (`setFilterValues()`)
- **Quick filter** — global cross-column search term (`setQuickFilter()` / `getQuickFilter()` / `clearQuickFilter()`)
- **Single-column sort** — `setSort()` / `removeSort()` / `clearSort()`
- **Row / column CRUD** — `addRow()`/`deleteRow()`/`undeleteRow()`, `addColumn()`/`deleteColumn()`/`undeleteColumn()`, with matching `getNew*()`/`getDeleted*()` accessors for diff-based saves
- **Column hide/show** — `hideColumn()` / `showColumn()` / `isColumnVisible()` / `getHiddenColumns()`, plus per-row/column resize (`setRowHeight()`, `autoFitColumns()`)
- **Multi-level header groups** — `columnDefs[].group` (or explicit `headerRows`) merges header cells across levels
- **Per-row / per-cell styling callbacks** — `rowHighlighter` / `cellBackground` for conditional formatting
- **State snapshot/restore** — `getState()` / `setState()` for saving and restoring grid state (filters, sort, column order/visibility, edits)
- **Built-in localization** — `locale` option with bundled `KO_I18N` / `JA_I18N` / `ZH_I18N` text packs, per-key `i18n` overrides, and locale-aware number/date/currency cell rendering
- **Accessibility** — ARIA labeling, keyboard-navigable header/row focus, and automatic high-contrast (`forced-colors`) theme remapping
- **CSV export + print preview** — `exportCsv()`, `printGrid()`
- **Arrow key navigation** — keyboard-driven cell movement
- **Enter / Tab** — commit edit and move to next row / column
- Text overflow with ellipsis (`…`) — O(log n) binary search
- Fully themeable
- Zero dependencies

---

## Installation

> **npm package coming soon.** For now, use one of the two options below.

### Option A — Static ES module (no bundler)

`jhgrid.esm.js` is a single self-contained ES module file — deploy it as-is as a static resource
(e.g. from a Spring Boot static resource path) and import it directly, no build step required:

```html
<script type="module">
  import { JHGrid } from '/static/jhgrid.esm.js';
</script>
```

### Option B — CDN (single bundled script)

`jhgrid.min.js` is an IIFE build served straight from this repository via jsDelivr — no npm
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
import { JHGrid } from './dist/jhgrid.esm.js'; // adjust to wherever you host the file

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
import { JHGrid } from './dist/jhgrid.esm.js'; // adjust to wherever you host the file

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

See [`fetchPage`](docs/api.md#fetchpage--single-callback-alternative) for a single-callback
alternative to `fetchMeta`+`fetchData` when your backend already returns both together.

---

## Documentation

**[Browse the docs online](https://jh-grid.github.io/JHGrid/)**, or read them directly in
[`docs/`](docs/README.md):

- **[API Reference](docs/api.md)** — every constructor option, the data source interface, pagination, and all public methods
- **[Theming](docs/theming.md)** — the full theme object, styling with your own CSS via `--jhg-*` custom properties, and canvas motion tuning
- **[Interaction Reference](docs/interaction.md)** — every mouse and keyboard interaction
- **[Spring Boot Integration](docs/integration.md)** — backend API shape and SQL pagination
- **[Architecture](docs/architecture.md)** — internal structure and the virtual rendering flow
- **[Browser Support](docs/browser-support.md)** — minimum versions and what sets them

---

## Browser Support

Chrome/Edge 92+, Firefox 90+, Safari 15.4+ — no IE, no legacy Edge, no transpilation or polyfills.
See [docs/browser-support.md](docs/browser-support.md) for exactly what sets that floor.

---

## License

Proprietary — free to use in your own applications, no redistribution or reverse engineering of
the compiled bundle. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
