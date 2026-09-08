---
title: Browser Support
nav_order: 8
---

# Browser Support

[← Docs index](README.md)

| Browser | Minimum version | Determined by |
|---|---|---|
| Chrome | 92+ | `Array.prototype.at()` |
| Edge | 92+ | `Array.prototype.at()` |
| Firefox | 90+ | private class methods (`#method(){}`) / `Array.prototype.at()` (tie) |
| Safari | 15.4+ | `Array.prototype.at()` |

The hard floor is set by **private class methods** (parse-time; unsupported browsers fail
before any code runs, with no error banner) combined with **`Array.prototype.at()`**
(`core/RowSelection.js`), which ships later than private methods on every engine except
Firefox. Together they push the effective floor above the "private methods alone" numbers
you may see quoted elsewhere for similarly-shaped codebases. Private fields and optional
chaining/nullish coalescing are supported even earlier and are not the limiting factor.

> **Note:** `index.js` exports a `SUPPORTED_BROWSERS` constant (`{ chrome: 99, edge: 99,
> firefox: 112, safari: 15.4 }`) that is more conservative than the table above on
> Chrome/Edge/Firefox. Treat that constant as the project's official support commitment if
> the two ever disagree; this table reflects the minimum the *current* syntax actually
> requires, which is a floor, not a promise that older-but-still-`.at()`-capable browsers
> are tested/supported.

`canvas.roundRect()`, `ResizeObserver`, and the `forced-colors` media query are all
feature-detected with a fallback (square-corner rendering, non-responsive layout, or no
high-contrast auto-switch, respectively); they degrade gracefully and do **not** raise
the minimum version.

Not supported at any version: Internet Explorer (11 or earlier) and legacy Edge; the
script fails to parse.

No transpilation or polyfills are applied; the source files (`index.js`, `JHGrid.js`,
`Renderer.js`, `core/*.js`) are served and imported as-is, so the browser running them sees
exactly the same syntax requirements listed above.
