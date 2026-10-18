---
title: Browser Support
nav_order: 9
description: Browser versions the JHGrid data grid supports (Chrome/Edge 99+, Firefox 112+, Safari 15.4+) and the platform features that set that floor.
---

# Browser Support

[← Docs index](README.md)

The browser versions this JavaScript data grid runs on, and the canvas and DOM features that set
that floor.

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

One option is newer than this floor: the `rounding` mode of the `number()` and `currency()`
renderers comes from `Intl.NumberFormat` v3 (Chrome/Edge 106, Firefox 116, Safari 15.4). Where
it is missing the renderer says so in the console once and draws with the default `halfExpand`
rounding, so a column keeps working - it just rounds the ordinary way. Everything else in
[Money columns](renderers-editors.md#money-columns-rounding-and-negatives) works at the floor above.

Not supported at any version: Internet Explorer (11 or earlier) and legacy Edge; the
script fails to parse.

## Right-to-left layouts

JHGrid has no RTL mode. It draws its cells on a canvas, where `direction: rtl` on an ancestor
changes nothing, so under an RTL locale the columns keep their left-to-right order and the
header, frozen bands, overlays and hit testing all stay as they are. Arabic, Hebrew and Persian
*text* renders correctly inside a cell, and a column can be right-aligned with
[`align: 'right'`](reference-options.md#column-definition-reference); it is the layout that does not mirror.
