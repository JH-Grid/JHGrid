---
title: Changelog
nav_order: 10
has_children: true
description: Release notes for the JHGrid JavaScript data grid - the newest release in full, and every earlier version with what it added, changed and fixed.
---

# Changelog

The newest release in full, and a page per release below it. A release that can need a code
change opens with a *Change / Who is affected / What to do* table; where that table is missing,
or says nobody, the upgrade is drop-in.

| Version | Date |
|---|---|
| [0.4.0](changelog/v0.4.0.md) | 2026-10-18 |
| [0.3.4](changelog/v0.3.4.md) | 2026-10-11 |
| [0.3.3](changelog/v0.3.3.md) | 2026-10-11 |
| [0.3.2](changelog/v0.3.2.md) | 2026-10-08 |
| [0.3.1](changelog/v0.3.1.md) | 2026-10-05 |
| [0.3.0](changelog/v0.3.0.md) | 2026-10-01 |
| [0.2.0](changelog/v0.2.0.md) | 2026-09-23 |
| [0.1.3](changelog/v0.1.3.md) | 2026-09-17 |
| [0.1.2](changelog/v0.1.2.md) | 2026-09-13 |
| [0.1.1](changelog/v0.1.1.md) | 2026-09-11 |
| [0.1.0](changelog/v0.1.0.md) | 2026-09-08 |

---

## 0.4.0 - 2026-10-18

| Change | Who is affected | What to do |
|---|---|---|
| `state.sorts` can now carry more than one key; `setState()` used to keep only the first entry | A host that reads only `state.sorts[0]` in `fetchData` / `fetchMeta`; it silently ignores the extra keys | Read the whole array, in priority order: `state.sorts.map(s => s.field + ' ' + s.dir).join(', ')` |
| When a selection reaches rows that were never loaded, those rows are left out of the copied text instead of appearing as empty lines | Code that assumes the copied text has one line per selected row | The number of rows left out is reported by the copy banner (`i18n.copyIncomplete`), as before. Use `exportCsv({ full: true })` when every row is needed |
| `getState()` has a `userSizedColumns` field, and with `stretchColumns` on its `columnWidths` holds each column's own width rather than its stretched one | Only grids that turn `stretchColumns` on; with it off nothing changes | Read the on-screen widths from the grid when that is what you need |
| `getState()` takes an argument. The no-argument call is exactly what it was | Nobody | Switch to `getState({ rowChanges: false })` where you are saving a view |
| Restoring a state saved with `getState({ rowChanges: false })` leaves the rows already added to the grid, and their edits, in place; a state that carries `rowChanges` still replaces all of it | Code that expected a layout restore to clear the rows as well | Call `clearEdits()` alongside it, or restore a state that carries `rowChanges` |
| The row indexes `validateAll()` reports can change | Code that reads the keys of `validateAll()` / `getInvalidCells()` after inserting or permanently deleting a row | The old values were wrong. The keys are now the visual row indexes they claim to be |
| A multi-line cell in a row too short for it draws whole lines from the top, ending in an ellipsis, instead of a centred block with half-cut lines | Screens with line breaks in their values and no extra row height | A drawing change only. Turn on `autoRowHeight`, or give the row height with `setRowHeight()`, to see every line |
| `role="grid"` moved off the grid's root element onto a container of its own, into which the rows on screen are mirrored as real DOM (`ariaRowMirror`, on by default) | Code that finds the root with `[role="grid"]`, and tests or snapshots that count DOM nodes inside the grid | Find the root through `GRID_CLASSES`. Turn the mirror off with `ariaRowMirror: false` if it is in the way |
| The TypeScript return type of `getEdits()` widened from `Record<number, Record<string, string>>` to `Record<string \| number, Record<string, unknown>>`, because of `byKey` / `typed`. At runtime the default call still answers with text keyed by row index | TypeScript users calling string methods straight on a value, which no longer compiles | Wrap in `String(v)`, or narrow with `getEdits() as Record<number, Record<string, string>>` |

### Added

- **`stretchColumns`** hands the space left over at the right edge to the columns, instead of leaving the rest of each row blank.

  ```js
  new JHGrid({
    container: '#grid',
    stretchColumns: 'last',   // the last scrollable column takes the leftover space
    // stretchColumns: 'all',  // split it between the columns, in proportion to their widths
    // stretchColumns: 'none', // the default, and what the grid did before
    data: rows,
  });
  ```

  It only ever **adds** width: no column ends up narrower than the width it would have had anyway (its `columnDefs` `width`, `colWidth`, or whatever the user dragged it to), and a grid whose columns already overflow is untouched.

  Two kinds of column keep their own width and take no share. **Frozen columns**, because widening one eats into the scrollable band and can push the grid into dropping it out of the frozen band and back as the window resizes. **Columns the user resized by hand**, by dragging the header border or through `autoFitColumns(field)` - otherwise dragging the column that absorbs the slack would do nothing, since the freed pixels would go straight back to it. With `'last'` the leftover then goes to the rightmost column they have not sized; if they have sized every one, the space stays blank. `refresh()` clears those manual widths and the stretch takes over again.

  The widths are recomputed when the layout changes - a resize, a column added, hidden, shown or deleted, a change of frozen counts, a restored state - and never per frame.

  `getState().columnWidths` reports each column's own width rather than its stretched one, and `getState().userSizedColumns` lists the columns the user sized by hand. That is what lets a layout saved on a 1,600px screen restore inside a 900px one without a horizontal scrollbar.

- **`getState({ rowChanges: false })`** returns the view settings on their own. The no-argument call still carries every unsaved edit, added row and delete mark, as before.

  ```js
  grid.getState();                        // unchanged: edits included
  grid.getState({ rowChanges: false });   // the view settings only
  ```

  Measured on the million-row demo:

  | State | `getState()` | `getState({ rowChanges: false })` |
  |---|---|---|
  | No edits | 959 bytes | 897 bytes |
  | 200,000 edited cells | 5,378,738 bytes (56ms) | 897 bytes (0.7ms) |
  | One column edited in every row | 21,889,848 bytes (694ms) | 897 bytes (0ms) |

  The lean call never builds the edit map at all, so neither its size nor its cost moves with the number of edits. What it removes is a snapshot that cannot be stored (`sessionStorage` stops at about 5MB) or cannot even be produced (`JSON.stringify` throwing `Invalid string length`).

  `setState()` already accepted a state without `rowChanges`; it now also leaves the grid's own added rows and their edits alone in that case, the way a sort or filter change does (edits on server rows still go, since the rows are re-fetched). A state that carries `rowChanges` replaces the row work entirely, as before.

- **`Shift` + wheel scrolls sideways.** Some browsers swap the axes before the event arrives and some leave it to the page, so a shift-held wheel that still carries a vertical delta is turned horizontal here. Line-mode wheels (`deltaMode: 1`) step by column width rather than row height.

- **Cut, `Ctrl+X`**: copies the selected range and then empties its editable cells. The clear is the one `Delete` already performs, so read-only columns keep their values, and the copy and the clear land as **a single undo step**. The browser's own `cut` event (the Edit menu, a context menu) takes the same path. `keyboardShortcuts: { cut: false }` switches it off without claiming the key, leaving it to a handler of your own. With only rows selected and no cell, there is nothing it could sensibly clear, so it does nothing.

- **Multi-column sort**: the grid holds more than one sort key at a time. There is no option to turn on.

  ```js
  await grid.setSorts([{ field: 'dept', dir: 'asc' }, { field: 'salary', dir: 'desc' }]);
  grid.getSorts();                      // [{ field: 'dept', dir: 'asc' }, { field: 'salary', dir: 'desc' }]

  await grid.addSort('score', 'desc');  // appends; an existing field is re-pointed and moved last
  await grid.moveSort('score', 0);      // change a key's priority
  await grid.clearSorts();              // sort by nothing
  ```

  `dir` defaults to `'asc'`. A field that is not a column (hidden columns are fine), a `dir` other than `'asc'`/`'desc'`, the same field twice, or a `priority` that is not a non-negative integer each throw. All four apply through `setState({ sorts })`, so they share the unsaved-edit confirmation and the reload path of a sort applied from the UI, and they return its Promise.

  From the UI, **Shift+click** Asc or Desc in a header's filter panel appends that column to the current sort, and the panel shows each sorted column's priority as `#1`, `#2` and so on; a plain click still replaces the sort with that one column. The header's sort arrow carries the same number.

  The sorting itself is the host's job. The grid only hands the key list to `fetchMeta` / `fetchData` as `state.sorts`, in priority order.

- **Wrapped cell text (`wrapCells`) and auto row height (`autoRowHeight`)**. Cell text wraps at the column's width instead of being cut off with an ellipsis, and each row takes the height its tallest cell needs. The two are separate options - wrapping alone leaves the row height as it is and clips the lines past the first.

  ```js
  new JHGrid({ container: '#grid', data: rows, wrapCells: true, autoRowHeight: true });
  ```

  A **word wider than the column is broken across lines**, so Korean, Japanese and Chinese text, which carries no spaces, wraps like a spaced sentence does. Line breaks inside a value still break lines, and `autoRowHeight` counts those too.

  Heights are measured against the column widths of the moment: dragging a column narrower, `autoFitColumns()`, or a container resize under `responsive` re-measures the loaded rows. Editing a cell re-fits its row both ways. A row set with `setRowHeight()` or dragged by the user keeps that height.

  **How much is measured depends on the row count.** Up to 5,000 rows every loaded row is measured, so the scrollbar is exact. Above that the grid measures a **window around the viewport** (the rows on screen plus 50 either side) and gives rows that scrolled far away their default height back, so a million-row grid still fits the rows you are looking at - at the cost of **the scrollbar shifting a little** as taller rows come into view. If that matters more, leave `autoRowHeight` off on a grid that size and fit the rows you need with `setRowHeight()` or a double-click on the bottom edge of a row number. `wrapCells` itself has no row limit.

  Multi-line cells in a row too short for them are drawn differently: the block used to be centred, cutting the first and last line in half. Whole lines are now drawn from the top, and the last visible one ends in an ellipsis.

- **Runtime event subscription: `on` / `off` / `listenerCount`**. All 19 constructor callbacks can be subscribed to after the grid exists. An event is its callback without the `on` prefix and with a lowercase first letter (`onCellChange` → `'cellChange'`), and a handler receives exactly what the callback received.

  ```js
  const stop = grid.on('cellChange', ({ row, field, newValue }) => save(row, field, newValue));
  grid.on('rowSelect', (rows) => toolbar.setEnabled(rows.length > 0));
  grid.on('sort', fn, { once: true });

  stop();                      // the unsubscribe function on() returns
  grid.off('sort', fn);        // one named handler
  grid.off('rowSelect');       // every handler of that event
  grid.listenerCount('sort');  // subscribers, not counting the constructor callback
  ```

  This removes the destroy-and-rebuild workaround for using the grid inside a component lifecycle: keep what `on()` returns, call it when the component goes away, and the grid itself is left alone.

  The constructor's own callback runs first, then the handlers in subscription order. Subscribing the same function twice replaces the first subscription instead of running it twice. A handler that throws is logged and does not stop the handlers after it or the render. During an event, a handler taken off is not called for the event already running and one added is called from the next event on, the way DOM listeners behave. An unknown event name throws a `RangeError` listing the events. `destroy()` drops every subscription.

  The core's call sites are unchanged: only an event that has been subscribed to swaps its option for a dispatcher, so an event nobody listens to - `onRender`, called on every frame - costs exactly what it did. Replacing a callback through `setOptions()` keeps the subscribers.

- **Runtime theme swap: `setTheme` / `getTheme`**. Changes the theme of a live grid: the keys given replace theirs, the rest stay, and **unsaved edits, the selection and the scroll position are kept** - the dark-mode toggle used to be destroy-and-rebuild, which lost all three. Open panels and menus close and are rebuilt in the new colours on the next open. A change to `fontSize` or `cellPadding` re-measures the rows under `autoRowHeight`.

- **Runtime data-source swap: `setDataSource`**. Takes the same three shapes the constructor takes (`{ fetchMeta, fetchData }`, `{ fetchPage }`, `{ data }`) and starts over exactly as `refresh()` does. There was no public way to do this before: `DataManager.setFetch` is plumbing and `reloadData()` overwrites it. When only the data behind the grid changed, `reloadData()` is still the right call - it keeps filters, sort and column state.

- **A grand total row: `summaryRow`**. Give a column an aggregate and a total row is pinned above or below the data.

  ```js
  new JHGrid({
    container: '#grid', data: rows, rowKey: 'id',
    summaryRow: { position: 'bottom', aggregates: { salary: 'sum', score: 'avg' }, label: 'Total', labelField: 'name' },
  });
  grid.getSummaryValues();   // { salary: 412000000, score: 81.4 }
  grid.getSummaryStats();    // { rows: 1000, missing: 0, capped: false, source: 'computed' }
  ```

  It is an ordinary pinned row, added after whatever the host pinned, so the host's own pinned row indices do not shift (`getSummaryRowIndex()` reports where it sits). Edits, sorts, filters and newly arrived chunks all update the numbers, and so do undo and redo. An edit does not count every row again - it is added to and subtracted from running totals, which costs 0.02ms per committed cell on a 200,000-row grid. Where that cannot be done (the smallest or largest value disappearing, a custom aggregate function, host-supplied totals) everything is counted again; `refreshSummary()` asks for that pass directly.

  `position` is `'bottom'` (the default), `'top'` or `'both'`; `label` and `labelField` place the label, and `background` paints the row (`null` leaves it unpainted). The aggregates share one implementation with group aggregation (`common-core/module/aggregate.js`), and a money total is carried as **an integer of the smallest unit seen**, so `0.1 + 0.2` style error never reaches the last digits: 200,000 rows of decimal text total in 25.6ms.

  A server-backed grid that is missing rows leaves the total blank, with one warning, rather than showing a plausible-looking wrong number (`getSummaryStats().missing`); `allowPartial` totals the loaded rows and `setSummaryValues()` takes a server's own totals. Past `maxRows` (200,000 by default) nothing is totalled and `capped: true` says so.

- **Rows by key: `getRowIndexByKey`, `getRowDataByKey`, `setCellValueByKey`**. A sort, a filter or a row inserted above moves row indices; the `rowKey` value keeps naming the same record. Each walks the rows the grid holds, so they are O(loaded rows) - not for a render loop.

- **Typed edits: `getEdits({ byKey, typed })` and `columnDefs[].parse`**. `getEdits()` still answers with text keyed by row index. `byKey` keys by the `rowKey` value instead, and `typed` runs the column's `parse(value, rowData, field)` - or restores the type the original value had - so numbers come back as numbers and `'true'`/`'false'` as booleans. `getChanges()` goes through the same `parse`. **The grid still works in text internally**; only the host boundary changed.

- **Row move from code: `moveRow(from, to)`**. Until now a row could only be moved by dragging the row-number gutter; this does the same thing from code.

  ```js
  await grid.moveRow(5, 0);        // row 5 goes first. true when it moved
  ```

  `to` is **where the row ends up** - the same number `onRowReorder` reports as `toIndex`. It goes through the drag's own path, so `onRowReorder` fires, the state keyed by row index (edits, selection, undo) is discarded exactly as a drag discards it, and an unsaved edit asks first. If the user keeps their edit at that confirm, the order stays as it was and the call answers `false`.

  It needs `rowReorder: true`. The order can only be rewritten once the scan that option starts has the rows in memory, so **the first call takes as long as that scan** - which is why it is a Promise: the caller starts the scan instead of waiting for a drag to start it. Rows added and not saved yet, and pinned rows, cannot be moved, as with the drag.

- **Screen-reader table navigation: `ariaRowMirror`**. The rows on screen are mirrored into real DOM. Until now only the active cell was exposed, so a reader's table mode had nothing to read around it and the cell to the left could not be heard without moving the selection. The grid carries `aria-rowcount` for the whole table and mirrors the window being looked at, as a virtualised ARIA grid does.

  It is rebuilt when that window moves, not per frame, and its nodes are reused, which puts a scrolled frame at **212µs** over five columns (Chromium: 744µs with the mirror against 460µs without). On by default; `ariaRowMirror: false` turns it off and `{ maxCells }` (default 2000) sets where a very wide grid stops paying for it - past that only the active cell is exposed, with one console warning.

  Pinned rows (`pinnedTopRows` / `pinnedBottomRows`) and the grand total row never leave the screen, so they are always mirrored, and `aria-rowindex` follows reading order: the header is 1, then the rows pinned above, the body, and the rows pinned below. The role sits on a container of its own rather than the grid's root, which also holds the canvas, the hidden text field that takes keyboard input, the live region and whatever panels a feature puts on it - none of which ARIA allows as children of a `grid`. The focused text field points at that container with `aria-controls` and at the active cell with `aria-activedescendant`.

- **One row's edits as pairs: `getRowChanges(rowIndex, { typed })`**. Each edited field with the value it had: `{ qty: { before: '10', after: '99' } }`. The two halves used to come from different calls (`getOriginalRowData()` and `getEdits()`) and lining them up was the host's job.

- **A number-only editor: `editor: 'number'`**. Digits, one decimal separator and a leading minus. Arrow Up and Down step by `step`, and the committed value is rounded to `decimals` and clamped into `min`/`max`. An empty cell stays empty rather than becoming 0.

  ```js
  { field: 'qty',  editor: 'number', editorOptions: { min: 0, step: 10 } }
  { field: 'rate', editor: 'number', editorOptions: { decimals: 2 } }
  ```

- **A radio column: `type: 'radio'`**. Hand it a list of options and they are drawn as circles inside the cell, one click away from being chosen. No popup, no editor.

  ```js
  { field: 'stage', type: 'radio', options: ['Waiting', 'Running', 'Done'] }
  ```

  `options` is what `dropdown` takes - an array of strings, an array of `{ value, label }`, or a function giving a different list per row. The cell holds the chosen option's `value`, so to a filter, `getEdits()`, CSV and Excel it is an ordinary text column: **a CSV carries the chosen value as it is**.

  **It shrinks itself to the column.** Labels are drawn where they fit; where they do not, the circles alone; where even those are too many, the gaps close; and past that the row of circles is pushed so that **the chosen one stays visible**. Nothing is ever drawn outside the cell (checked in pixels in a browser for two to six options at widths of 320, 200, 120 and 70px).

  A click picks the option whose circle or label was hit, and `Space` steps to the next one and wraps around (the arrow keys still move between cells). A read-only column is drawn and never changes.

  For a different alignment or circle colour, give the renderer directly: `renderer: CellRenderers.radio({ options, align: 'center', checkedColor: '#2563eb' })`.

- **Hiding rows: `hideRow` / `hideRows` / `showRow` / `showAllRows` / `getHiddenRows` / `isRowHidden`**. Takes a row off the screen without deleting it. Right-clicking the row-number gutter offers **Hide this row**, and **Show all hidden rows** next to it once something is hidden (both go away with `'row-hide'` left out of `rowContextMenuItems`). A hidden row leaves an extra line in the gutter where it was.

  A hidden row drops out of the row plan the same way a permanently deleted one does, so `getTotalRows()`, the row indexes below it, a CSV or Excel export and every aggregate that walks the rows **already leave it out**. It is not a change to save, so it appears in neither `getChanges()` nor `getRemovedRows()`; it is a view setting, so `getState()` carries it as `hiddenRows`.

  ```js
  grid.hideRow(3);
  grid.hideRows([0, 2, 5]);        // one undo step; answers with how many were hidden
  grid.getHiddenRows();            // [{ index: 3, key: '42' }]
  grid.showRow(3);                 // by the index above
  grid.showAllRows();
  ```

  **Give the grid a `rowKey`.** A sort, a filter and `reloadData()` renumber every server row, so a hidden row is found again by its `rowKey` value (and hidden as its chunk arrives, if it lands in a range that is not loaded yet). Without a `rowKey` there is nothing to follow it by, so hidden rows come back after a re-fetch and the console says so once. A row added to the grid and not saved yet has no value to identify it with and cannot be hidden - the menu does not offer it either.

- **`summaryRow.rows` and `summaryRow.excludeRow`**. The host says which records the grand total counts. `rows` returns the records to total instead of the rows on screen, and `excludeRow` drops a row that is on screen but is not data - a header row that already shows a subtotal, say. It is what a host that owns its records and shows a shaped view of them needs.

  ```js
  summaryRow: { aggregates: { amount: 'sum' }, rows: () => myRecords, excludeRow: (r) => r.isHeader }
  ```

- **Space under a row: `reserveRowSpace(rowIndex, px)`, with `getRowRect` and `getViewportRect`**. Keeps a strip under a row's cells that the grid lays out but **never draws in and that clicks pass through**. The row grows, the rows below move down, and the strip is the host's to cover with its own element.

  ```js
  grid.reserveRowSpace(3, 180);
  grid.on('render', () => {                    // scroll, sort and resize all redraw
    const rect = grid.getRowRect(3);
    Object.assign(panel.style, { top: `${rect.reservedTop}px`, left: `${rect.left}px`,
                                 width: `${rect.width}px`, height: `${rect.reservedHeight}px` });
  });
  ```

  The strip is **not part of the row's cells**: `getRowHeight()` still reports the cell height, `setRowHeight()` still sets it, `autoRowHeight` measures text as if the strip were not there, and an editor covers the cells only. `getViewportRect()` gives the band to clip host DOM to, so it cannot cover the header, a pinned row or the scrollbars. `getReservedRowSpace(rowIndex)` and `getReservedRows()` report what is reserved where. Opening or closing several strips at once updates the layout immediately - `getRowRect()` right after the call is correct - while the painting is coalesced into one per frame.

- **Reverting one row: `revertRow(rowIndex)`**. Throws that row's unsaved edits away and puts its cells back to the values the data source gave. One undo step, so `Ctrl+Z` brings them back, and the validation marks that came with those edits are cleared with them. Until now the choice was `clearEdits()`, which discards every row's edits and the undo history, or reading `getOriginalRowData()` and writing it back by hand with `setCellValues()`.

  ```js
  if (response.status === 409) grid.revertRow(rowIndex);   // someone saved first: start that row over
  ```

  It leaves delete marks alone (`undeleteRow()` clears those), and a row added with `addRow()` is not removed - it goes back to the values it was added with. A failed save needs no call at all: edits stay until `acknowledgeSave()` / `acknowledgeChanges()`, so doing nothing already means "keep the user's work and retry".

- **Header groups survive a column drag: `lockHeaderGroups`**. A group cell is drawn over the columns of that group that sit next to each other, so a column dragged out of its group - or an outsider dropped into the middle of one - split that one cell into two. With this on, the insertion point moves to the nearest edge that leaves every group in one piece.

  ```js
  new JHGrid({ lockHeaderGroups: true, columnDefs: [
    { field: 'bpNm', label: 'Customer', group: 'Trade' },
    { field: 'loNm', label: 'Centre',   group: 'Trade' },
    { field: 'qty',  label: 'Qty' },
  ] });
  ```

  A grouped column moves within its own group and no further; an ungrouped one can go before or after a group, never inside it. Off by default (the old behaviour), and it changes only **what a drag can do** - not the starting column order, `hideColumn()` or `addColumn()`. Only the top header row is enforced.

- **Dragging rows between grids: `rowDragGroup`**. Grids given the same name exchange rows through the row-number gutter. The grid the row lands on draws the drop line; the one it is leaving keeps it shaded until the button comes up.

  ```js
  new JHGrid({ container: '#backlog', rowDragGroup: 'tasks', columnDefs, data: backlogRows });
  new JHGrid({
    container: '#sprint', rowDragGroup: 'tasks', columnDefs, data: sprintRows,
    onRowDropIn: ({ rowData, toIndex }) => console.log('took', rowData.task, toIndex),
  });
  ```

  The move is made of **two public APIs**: `addRow(rowData, { index: toIndex })` on the receiving grid and `deleteRow(rowIndex)` on the sending one. Each half therefore shows up in that grid's own `getChanges()`, and each host saves its own. Under the default `deleteMode: 'mark'` the row that left stays visible and struck through; give the sending grid `deleteMode: 'permanent'` to have it go at once.

  `onRowDragOut` can call the whole move off with `false`, and `onRowDropIn` can refuse with `false` or **return a row object to insert instead** - which is where two grids with different columns meet.

  ```js
  onRowDropIn: ({ rowData }) => ({ title: rowData.task, assignee: rowData.who, state: 'todo' }),
  ```

  **Dragging out does not need `rowReorder`**: only the one row travels, so the full scan that option starts is not involved. Set both when the same grid should also reorder within itself. Rows added and not saved yet, and pinned rows, still cannot be dragged, and the move is announced through the live region as `i18n.rowDragOutAnnounce`.

- **Number and money formatting: `rounding`, `negative`, `negativeColor`, and `decimals` on `currency`**. Accounting rounding and bracketed negatives without writing a renderer.

  ```js
  { field: 'amount', renderer: CellRenderers.number({
      decimals: 0, rounding: 'halfEven',                   // banker's rounding
      negative: 'parens', negativeColor: '#ef4444' }) }    // -1234 -> (1,234), in red
  { field: 'price', renderer: CellRenderers.currency({
      locale: 'ko-KR', currency: 'KRW', decimals: 2 }) }   // overrides the currency's own 0 digits
  ```

  `rounding` takes Intl's nine rounding modes (`ceil` `floor` `expand` `trunc` `halfCeil` `halfFloor` `halfExpand` `halfEven` `halfTrunc`). The option comes from `Intl.NumberFormat` v3, which is newer than the supported browser floor: where it is missing the renderer says so in the console once, rather than silently, and draws with the default `halfExpand`. An unknown mode, or an unknown `negative` value, throws as the renderer is built.

### Fixed

- `validateAll()` validated the wrong rows after a row was inserted or permanently deleted. Walking the loaded server rows, it passed `DataManager`'s **server** index straight to the validator, which keys everything by visual row. One locally added row shifts every row below it by one, so a row that really broke its rule came back clean while an untouched row was marked invalid. `getInvalidCells()` and `isValid()` reported the same wrong rows.

- Editing a cell in a bottom pinned row (`pinnedBottomRows`) made it appear in `getChanges().updated` as an edit to a server row. The pinned-row test was called without the total row count, so it caught only top pinned rows (negative indexes) and let bottom ones (indexes at or past the row count) through - which means sending an UPDATE for that row's `rowKey`. Bottom pinned rows are now filtered out like top ones.

- `aria-rowcount` left the pinned rows out. Eight code paths wrote it - a chunk arriving, a row added or deleted, a filter, `setState` and the rest - and every one of them wrote `body rows + 1`, so a grid using `pinnedTopRows` / `pinnedBottomRows` told a screen reader the wrong size: 5 body rows, 2 pinned rows and a total row reported `aria-rowcount="6"`. One function (`_syncA11yCounts`) writes it now, counting the header, the rows pinned above, the body and the rows pinned below, so the same grid reports `aria-rowcount="9"`.

- An automated audit reported a **critical** accessibility violation on every grid. `role="grid"` sat on the grid's root element, which also holds the canvas, the hidden text field that takes keyboard input, the live region and whatever panels a feature puts on it - and ARIA allows a `grid` no children but rows and rowgroups, so axe reported `aria-required-children` on all **seven** grids of the demo page. The role moved to a container of its own that only the row mirror writes into, so nothing added to the root can break it again. The focused text field points at that container with `aria-controls` and at the active cell with `aria-activedescendant`; `aria-rowcount`, `aria-colcount`, `aria-busy` and `aria-multiselectable` live on it too. Across the five demo states the report went from one critical and one serious violation type to **none**.

- Hint text in the overlays sat at 3.19:1 against their white background, under the 4.5:1 WCAG AA asks for body text. The default `theme.overlayHintText` went from `#909090` to `#6E6E6E` (5.10:1), and the dark-theme example's `#6b7280` (3.04:1) to `#9ca3af` (5.78:1).

- A panel or menu left open could stay on screen after the point it hangs from had scrolled out of view. Whether to close was decided inside a `requestAnimationFrame` callback, and a browser delays those when it is busy - with frames stopped altogether the panel never closed (measured: open before the fix, closed after). The decision is now made on the scroll event itself, and only the repositioning is still coalesced into a frame.

- A grid whose columns had not arrived yet put a **row with no cells** in the accessibility table. ARIA asks a `role="row"` for at least one cell, so an automated audit reports it as critical (`aria-required-children`) - which it did as soon as one still-booting grid shared the page. With no columns the mirror is left alone.

### Performance

- **Changing many columns at once was quadratic.** Each column added or deleted snapshotted the whole structure and repainted the canvas - deleting 1,000 columns meant 1,000 paints. A new method `batchStructural(fn)` runs the lot as one snapshot, one paint and one undo step: on the same grid, deleting 400 columns went from **1140ms to 12.3ms** and 1,000 from **6451ms to 58.8ms** (Chromium, each mode measured on its own freshly loaded page).

- A paste wrote one undo record per cell. On a million rows over five columns - five million cells - that record was **45%** of the whole operation. A paste over 50,000 cells now snapshots the edit map instead (`ShardedMap.fork()` is copy-on-write, so a fork costs nothing per cell): **12.8s down to 5.2s** for the same paste, still one undo step, and edits made before the paste still come back when it is undone. Resolving the row data once per row rather than once per cell is part of the same change.

- `autoFitColumns()` measured every loaded row with `measureText`. A server-backed grid is protected by its chunk cache, but in a `data` array grid every row counts as loaded, so one call on a million rows over nine columns froze the page for **12.9 seconds** - an `Intl` format and a canvas measurement per cell. It now shortlists the 32 longest raw values and formats and measures only those: **302ms** for the same grid, fitting to the same width.

- `exportCsv({ full: true })` and `printGrid({ full: true })` walked the rows one page at a time at `chunkSize` (300 by default) - 3,334 serial round trips for a million rows. Pages are now fetched `fullScanConcurrency` at a time (2-8, from the core count) and handed over in order, at `fullScanPageSize` when that option is set. Walking a million rows takes **93ms** against in-memory data and **6.2s** over HTTP (1.7s with `fullScanPageSize: 20000`), and a million-row, twenty-two-column CSV export went from **over 240 seconds to 5.3**.

- Selecting a million rows (`Ctrl+A`) and copying froze for 5.2 seconds and built a 22.4MB string, 999,400 of whose lines were nothing but tabs for rows that had never been loaded. Rows with nothing to copy are now skipped, and the same gesture finishes in **74ms and 0.41MB**. The number of rows left out is still reported by the copy banner.

- `getChanges()` found the locally added rows by walking the visual rows from the top - a row added at the end of a million meant a million `isNewRow()` calls. `_rowPlan` already knows each local row's visual index, so it is used directly: **11.5ms down to 0.3ms** in that case.

- **Changing a single column painted the canvas twice.** `deleteColumn`, `addColumn` and `hideColumn` each paint at the end, and the wrapper that turns them into one undo step painted the finished state again. The wrapper now owns the only paint: on a 300-column grid, 200 `deleteColumn` calls went from **355.8ms to 236.4ms** and 80 `hideColumn` calls from **271.8ms to 232.2ms** (Chromium, mean of three runs).

- **Every single column change rebuilt the whole accessibility header.** The header row a screen reader reads has one element per column, and `deleteColumn`, `addColumn` and `hideColumn` rebuilt all of it on each call - on a 1,000-column grid, deleting 1,000 columns meant building a million elements nobody read, which was nearly all of what was left once the paints were coalesced (**633.4ms** across 1,002 calls). A batch now defers it and builds it once at the end: those calls went from **633.4ms to 48.8ms**, the whole batched 1,000-column delete from **487ms to under 59ms**, and a 1,000-column rebuild down to 6 columns from **665.9ms to 84.9ms** (measured in Chromium). `aria-colcount` and `aria-colindex` match the final columns once the batch ends.

### Docs

- **The documentation is several pages instead of one.** `api.md` had grown past 2,500 lines and nothing could be found in it. It is now split by subject, with look-up-by-name references, a feature index and a guide list. `api.md` stays as an index in which **every old anchor still resolves**, so saved links need no fixing.

- **The README benchmark was measured again.** The other grids are named with their versions now and every figure was re-measured. Three sort cases were added along with a row for scrolled frame p95 and frames over 50ms, and the table says how the gap opens between 10,000, 100,000 and 1,000,000 rows. The run is reproducible: `node scripts/bench-vs-grids.mjs --sizes 1000000 --libs <node_modules holding the other grids>`.
