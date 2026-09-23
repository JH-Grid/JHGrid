---
title: Architecture
nav_order: 8
---

# Architecture

[← Docs index](README.md)

```
JHGrid (public API + event handling)
  ├── DataManager    (chunk cache, async fetch, prefetch)
  ├── Renderer       (Canvas 2D drawing: header, cells, scrollbars)
  └── EditorSurface  (the one place real DOM is mounted: cell editors)
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

That bound is what makes the exception safe, and it is the reason the editor surfaces in
`core/EditorSurface.js` are attached to the *editor* context and to nothing else:

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

These are exported mainly for building tooling *around* JHGrid (a custom exporter, an alternate
render surface) rather than for everyday app code; most consumers never need them:

- **`Renderer`** / **`DataManager`**: the two internal classes above, exported so advanced code
  can drive the canvas-drawing or chunk-caching logic independently of a full `JHGrid` instance.
- **`DEFAULT_THEME`**: the fully-resolved theme object every `GridTheme` partial is merged
  against (i.e. every default value listed in [Themes](theming.md), as one object).
- **`computeHeaderCells(headerRows, columns)`**: the same merged-header layout engine the canvas
  header draw uses internally, exposed so a custom exporter (e.g. one writing to a spreadsheet
  format) can reproduce identical multi-level header spans instead of re-deriving them.

See `index.d.ts` for their exact signatures.
