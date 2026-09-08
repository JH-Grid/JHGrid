---
title: Architecture
nav_order: 7
---

# Architecture

[← Docs index](README.md)

```
JHGrid (public API + event handling)
  ├── DataManager  (chunk cache, async fetch, prefetch)
  └── Renderer     (Canvas 2D drawing: header, cells, scrollbars)
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

## Advanced / low-level exports

These are exported mainly for building tooling *around* JHGrid (a custom exporter, an alternate
render surface) rather than for everyday app code; most consumers never need them:

- **`Renderer`** / **`DataManager`**: the two internal classes above, exported so advanced code
  can drive the canvas-drawing or chunk-caching logic independently of a full `JHGrid` instance.
- **`DEFAULT_THEME`**: the fully-resolved theme object every `GridTheme` partial is merged
  against (i.e. every default value listed in [Theming](theming.md), as one object).
- **`computeHeaderCells(headerRows, columns)`**: the same merged-header layout engine the canvas
  header draw uses internally, exposed so a custom exporter (e.g. one writing to a spreadsheet
  format) can reproduce identical multi-level header spans instead of re-deriving them.

TypeScript type declarations aren't included in this distribution yet (npm package with
`index.d.ts` is coming soon); for now, these are documented by name only; check the exported
symbols directly (e.g. `console.log(Object.keys(await import('../dist/jhgrid.esm.js')))`) for their
exact shape.
