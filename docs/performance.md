---
title: Performance
nav_order: 8
description: How the JHGrid data grid performs at 1,000,000 rows, measured against Grid A, Grid B and Grid C, plus the options that decide what a large grid costs.
---

# Performance

[← Docs index](README.md)

What a million-row grid costs, how that was measured, and the options that decide the cost on your
own data. The internals behind the numbers are in [Architecture](architecture.md).

## Measured

1,000,000 rows (1M) by sixteen columns, in-memory data, every grid on its documented default
configuration with no large-data tuning. Windows 11, i7-12700H, 32GB, headless Chromium. Timed from
the API call to each grid's own "done" signal plus two painted frames. Each figure is the median of
three runs, except Grid B: a second load of a million rows takes the renderer past
Chromium's heap cap, so it is measured once.

Grid A, Grid B and Grid C are three widely used open-source grids, each on its current release and
its own defaults. The figures are one machine's, and the script that produced them is in the
repository, so anyone can install those grids and re-run the same measurements.

| 1M rows | **JHGrid** | Grid A | Grid B | Grid C |
|---|---:|---:|---:|---:|
| Create grid, first paint | **67 ms** | 822 ms | 5.94 s | 470 ms |
| Sort sequential text, pre-sorted | 417 ms | **150 ms** | 1.93 s | 250 ms |
| Sort near-sorted ISO dates | **100 ms** | 151 ms | 4.98 s | 233 ms |
| Sort number, high cardinality | **476 ms** | 2.02 s | 3.73 s | 2.07 s |
| Sort name text, many repeats | **217 ms** | 1.42 s | 3.17 s | 2.42 s |
| Sort CJK text, locale collation | **320 ms** | 3.27 s | 9.15 s | 7.88 s |
| Sort text, mostly unique (email) | **967 ms** | 3.87 s | 22.15 s | 5.88 s |
| Sort free text, mixed case | **1.28 s** | 3.50 s | 14.21 s | 5.42 s |
| Sort 5-digit numeric text | **266 ms** | 3.13 s | 15.43 s | 2.82 s |
| Sort 5 distinct values | **134 ms** | 567 ms | 1.60 s | 1.12 s |
| Sort 50 distinct values, skewed | **189 ms** | 968 ms | 9.83 s | 1.88 s |
| Sort number, 0-100 | **333 ms** | 983 ms | 4.68 s | 817 ms |
| Filter one value | **33 ms** | 266 ms | 248 ms | 100 ms |
| Filter one value, other column | **49 ms** | 267 ms | 416 ms | 84 ms |
| Filter, contains | **117 ms** | 268 ms | 283 ms | 116 ms |
| Filter, then sort inside it | **368 ms** | 1.60 s | 5.54 s | 1.43 s |
| Quick search, every column | **933 ms** | 1.12 s | 1.68 s | 783 ms |
| JS heap after load | **399 MB** | 866 MB | 2,991 MB | 798 MB |
| Scroll 3s, frame p95 / frames over 50ms | **16.7 ms / 0** | 16.7 ms / 0 | 16.8 ms / 0 | 16.7 ms / 4 |

## At 100,000 rows

The size most evaluations actually bring. Same dataset, same three runs, same defaults.

| 100k rows | **JHGrid** | Grid A | Grid B | Grid C |
|---|---:|---:|---:|---:|
| Create grid, first paint | **61 ms** | 150 ms | 426 ms | 151 ms |
| Sort CJK text, locale collation | **67 ms** | 216 ms | 500 ms | 600 ms |
| Sort text, mostly unique (email) | **100 ms** | 217 ms | 1.45 s | 417 ms |
| Sort free text, mixed case | **150 ms** | 266 ms | 1.02 s | 449 ms |
| Filter, then sort inside it | **82 ms** | 149 ms | 216 ms | 150 ms |
| JS heap after load | **47 MB** | 97 MB | 579 MB | 90 MB |
| Scroll 3s, frame p95 / frames over 50ms | **16.8 ms / 0** | 16.7 ms / 0 | 16.8 ms / 0 | 33.4 ms / 3 |
| Whole set, three runs | **10.3 s** | 20.2 s | 33.1 s | 31.8 s |

At 10,000 rows every grid finishes every operation in about 33-120ms, so the choice is about
other things at that size. The differences start here, at 100,000, and open up at 1,000,000.

One case goes the other way: text that is already in order sorts faster elsewhere, because the
comparator here is locale- and numeric-aware (`item2` before `item10`, CJK text by its own rules)
rather than a plain string compare. The CJK row is the other side of that same trade.

Run it yourself:

```
node scripts/bench-vs-grids.mjs --sizes 1000000 --libs <node_modules holding the other grids>
```

## Where the cost goes

A grid draws only what is on screen - roughly 15 rows, whatever the row count - and keeps the rest
as data. Scrolling costs a canvas repaint, not a DOM diff, so frame time does not move with the row
count. What *does* scale is anything that walks every row: a sort or filter the host runs, an
export, a fill over a huge range, a total.

| Operation | Scales with | Notes |
|---|---|---|
| Scrolling, drawing | visible cells | flat at any row count |
| Sorting, filtering | your data source | the grid asks `fetchData`; the work is the host's, or the array's |
| `exportCsv({ full: true })`, `printGrid({ full: true })` | total rows | fetched `fullScanConcurrency` pages at a time |
| `autoFitColumns()` | loaded rows | measures the 32 longest raw values per column, not every cell |
| Copy, fill, paste | selected cells | a paste over 50,000 cells switches to one snapshot instead of per-cell undo records |
| `summaryRow` | total rows, once | an edit then updates the running totals instead of counting again |
| `autoRowHeight` | loaded rows, or a window | see below |

## The knobs

| Option | Default | What it decides |
|---|---|---|
| [`chunkSize`](reference-options.md#constructor-options) | `300` | Rows per `fetchData` call. Larger means fewer round trips and more memory per chunk |
| [`maxCachedChunks`](reference-options.md#constructor-options) | `50` | How many chunks stay in memory. This is what caps a server-backed grid's footprint |
| [`fullScanConcurrency`](reference-options.md#constructor-options) | 2-8, from the core count | Pages fetched in parallel by a full export or print |
| [`fullScanPageSize`](reference-options.md#constructor-options) | `chunkSize` | Page size for that same scan. A larger page is far fewer round trips over HTTP |
| [`autoRowHeight`](rows.md#wrapped-cells-and-auto-row-height-wrapcells--autorowheight) | `false` | Up to 5,000 rows every loaded row is measured; past that only a window around the viewport is, and the scrollbar shifts a little as taller rows come into view |
| [`summaryRow.maxRows`](rows.md#summary-row-summaryrow) | `200000` | Past this many rows nothing is totalled, and `getSummaryStats().capped` says so |
| [`ariaRowMirror`](interaction.md#accessibility) | on, `maxCells: 2000` | The rows on screen are mirrored into DOM for screen readers; past `maxCells` only the active cell is |
| [`wrapCells`](rows.md#wrapped-cells-and-auto-row-height-wrapcells--autorowheight) | `false` | Wrapping measures text per visible cell. No row limit, but it is drawing work per frame |

## Operations that block

Some calls are synchronous by nature and will freeze the tab while they run on a very large grid:

- `clearEdits()` over a million edited rows.
- `autoFitColumns()` with no field, on an in-memory `data` array of a million rows (302ms after the
  0.4.0 shortlisting change, 12.9s before it).
- `exportCsv({ full: true })` over a million rows: the fetch is parallel, but building the file is
  one pass. A twenty-two-column million-row export takes about 5 seconds.

Everything else - scrolling, editing, selecting, filtering, sorting - stays inside a frame.
