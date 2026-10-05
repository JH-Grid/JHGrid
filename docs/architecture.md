---
title: Architecture
nav_order: 8
description: How the JHGrid data grid works internally - the canvas rendering pipeline, 2D virtualization, chunked data loading and the render scheduling flow.
---

# Architecture

[← Docs index](README.md)

```
JHGrid (public API + event handling)
  ├── DataManager    (chunk cache, async fetch, prefetch)
  ├── Renderer       (Canvas 2D drawing: header, cells, scrollbars)
  ├── EditorSurface  (the one place real DOM is mounted: cell editors)
  └── RowPlan / RowLayout / PinnedRows / UndoManager
                     (which row is where, how tall it is, what is pinned, what can be undone)
```

## Virtual rendering flow

```
scroll event
  → compute visible row/col range from scrollTop / scrollLeft
  → DataManager.getRow(r) → cache hit → value
                           → cache miss → trigger async fetch, return null ("…")
  → Renderer draws only the ~30–60 visible cells per frame
  → on chunk loaded → re-render
```

## Row indices

Three kinds of index appear in the API, and knowing which one a method uses avoids most surprises:

| Index | What it is | Used by |
|---|---|---|
| **Row index** (screen position) | The row's position in the grid as the user sees it, counted from 0 across the whole dataset even with pagination. Rows you added count, rows removed with `deleteRow(i, { permanent: true })` do not | Nearly everything: `getRowData`, `getEdits`, `setCellValue`, `onCellChange`, `onRowSelect`, `scrollTo`, `deleteRow`... |
| **Server index** | The row's position in the result your `fetchData` returned for the filter and sort in effect (`page * size + i`), whatever has been added or removed on screen | `getDeletedRows()`, `getRemovedRows()`, and the `rowChanges` of `getState()` |
| **Pinned-row index** | A row in a pinned band: `-(i + 1)` for top row `i`, `totalRows + i` for bottom row `i`. It is an opaque handle to pass back in | The same methods as a row index, when the row is pinned |

Adding a row above another one moves the lower row down a screen position but not its server
index. Sorting, filtering, `refresh()` and `reloadData()` change which record sits behind a row
index, which is why they clear the state keyed by it (edits, selection, undo history, row heights).

## Where things live

| Module | Role |
|---|---|
| `JHGrid` | The public API, the event handling and the wiring of everything below |
| `DataManager` | Fetches chunks (two requests at a time, retried up to three times), keeps the most recent ones in an LRU cache, and prefetches around the viewport |
| `Renderer` | Draws the header, cells, selection and scrollbars on the canvas, and owns the built-in `CellRenderers` |
| `Editors`, `EditorSurface` | The built-in cell editors, and the `cellBox` / `popup` / `done` anchoring they share with custom editors |
| `Overlays` | The DOM panels built outside `JHGrid`: the filter panel, the column menu and the column chooser |
| `ColumnValidator` | Runs a column's `validation` rules and the built-in dropdown, multiselect and date checks |
| `RowPlan`, `RemovedRows` | Maps a screen row to its server row or its locally added row, and tracks removed rows |
| `RowLayout` | Row heights: the default plus per-row overrides |
| `PinnedRows` | The pinned top and bottom bands |
| `RowSelection` | Row selection, installed as a plugin |
| `UndoManager` | The undo and redo stacks (100 steps) |
| `ShardedMap` | The store for unsaved edits. It spreads entries over many maps, so a million rows by twenty columns of edits does not hit the engine's limit on one map |
| `LocalDataSource` | Turns a `data` array into `fetchMeta` / `fetchData` |
| `ImageCache` | The page-wide, size-bounded cache behind image cells |
| `Export`, `csv`, `cellFormat`, `fillSeries` | CSV and print output, TSV copy and paste, date formatting, fill-handle series |
| `locales` | The text packs (`en`, `ko`, `ja`, `zh`) |

## Where the DOM is, and where it isn't

A canvas grid's performance comes from *not* building DOM per cell: however many rows are loaded,
the visible ones are pixels the `Renderer` paints, not elements the browser has to lay out. Almost
everything on screen — cell values, gridlines, selection, the row-number gutter, sort and filter
marks — is drawn, not built.

Editing is the exception, and it has to be. IME composition (Korean, Japanese, Chinese), screen
readers, and a native `<input type="date">` picker are browser behaviours that only exist for real
focused elements; a canvas cannot fake any of them. So an edit session mounts real DOM over the
cell, and JHGrid keeps exactly one alive at a time — `_editing` is a single slot, and starting
another edit, scrolling the grid, or mousing down anywhere commits the previous one first.

That bound is what makes the exception safe, and it is the reason the editor surfaces
are attached to the *editor* context and to nothing else:

```
JHGrid._buildEditorCtx(row, col)
  → attachEditorSurface(ctx)
      ctx.cellBox()   → a box over the cell, inside the wrapper (moves with the grid)
      ctx.popup()     → a panel anchored to the cell, fixed + on <body> (escapes overflow:hidden)
      ctx.done()      → the { value, remove } the grid commits from, plus keys/outside-click
```

`popup()` is `position: fixed` and parented to `<body>` so no ancestor's `overflow: hidden` can clip
it; the cost is that it must be re-anchored whenever anything scrolls. Every open popup registers
with one shared loop in that module rather than attaching its own `scroll`/`resize` pair: the loop
coalesces a burst of events into a single animation frame and drains its measure pass fully before
its write pass, so re-anchoring costs one forced layout per frame no matter how many anchors exist.

The renderer and `cellDecorator` contexts deliberately have no equivalent. Handing them a way to
mount DOM would turn a per-editor cost into a per-cell one, which is the property this architecture
exists to have. Anything a cell needs to *show* is drawn instead — which is why affordances like
`columnDefs[].cellButton` are drawn by the renderer from the same definition the hit test reads,
rather than by host code positioning an element.

## Advanced / low-level exports

These are exported mainly for building tooling *around* JHGrid (an alternate render surface, a
print view) rather than for everyday app code; most consumers never need them:

- **`Renderer`** / **`DataManager`**: the two internal classes above, exported so advanced code
  can drive the canvas-drawing or chunk-caching logic independently of a full `JHGrid` instance.
  A `DataManager` is built from `{ fetchData, chunkSize, maxChunks }` and offers `getRow(i)` (the
  row, or `null` while its chunk loads), `prefetch(start, end)`, `setFetch(fn)`, `forEachLoaded(cb)`,
  `clear()` and an `onChunkLoaded` hook.
- **`DEFAULT_THEME`**: the fully-resolved theme object every `GridTheme` partial is merged
  against (i.e. every default value listed in [Themes](theming.md), as one object).
- **`computeHeaderCells(headerRows, columns)`**: the same merged-header layout engine the canvas
  header draw uses internally, exposed so a custom print or HTML view can reproduce identical
  multi-level header spans instead of re-deriving them.
- **`BuiltinRenderers`**: the same map as `CellRenderers`, under a second name.
- **`GRID_CLASSES`**, **`VERSION`** and **`SUPPORTED_BROWSERS`**: the class names of the DOM surfaces (see [Themes](theming.md#styling-with-your-own-css)), the package version string, and the minimum browser versions (see [Browser Support](browser-support.md)).

See the bundled TypeScript declarations (`index.d.ts`) for their exact signatures.
