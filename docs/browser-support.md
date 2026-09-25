---
title: Browser Support
nav_order: 9
---

# Browser Support

[← Docs index](README.md)

| Browser | Minimum version |
|---|---|
| Chrome | 99+ |
| Edge | 99+ |
| Firefox | 112+ |
| Safari | 15.4+ |

The same versions are exported as the `SUPPORTED_BROWSERS` constant if you want to check them in
code.

JHGrid ships as modern JavaScript with no transpilation and no polyfills, so it relies on syntax and
APIs such as private class methods and `Array.prototype.at()`. On a browser that lacks them the
script fails to parse and nothing renders, without an error banner.

`canvas.roundRect()`, `ResizeObserver`, and the `forced-colors` media query are all
feature-detected with a fallback (square-corner rendering, non-responsive layout, or no
high-contrast auto-switch, respectively); they degrade gracefully and do **not** raise
the minimum version.

Not supported at any version: Internet Explorer (11 or earlier) and legacy Edge; the
script fails to parse.
