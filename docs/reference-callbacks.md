---
title: Callbacks
parent: Reference
nav_order: 3
description: Every JHGrid data grid callback option - what fires it, its payload, and the guide that covers the feature behind it.
---

# Callbacks

Every callback the constructor takes. All of them are plain options, so they are set the same way
as the rest: `new JHGrid({ onCellChange: ({ row, field, newValue }) => { ... } })`.

A constructor callback is one handler, fixed for the life of the grid. To add handlers later, to
have more than one, or to take one off again, subscribe to the matching event with
[`on()` / `off()`](#subscribing-at-runtime-on--off).

## Subscribing at runtime (`on` / `off`)

Every callback below is also an event: drop the `on` prefix and lowercase the first letter, so
`onCellChange` is `'cellChange'` and `onValidationError` is `'validationError'`. A handler receives
exactly what the constructor callback receives.

```js
const grid = new JHGrid({ container: '#my-grid', data: rows, editableCols: '*' });

// on() returns the function that removes this handler again
const stop = grid.on('cellChange', ({ row, field, newValue }) => {
  fetch('/api/cell', { method: 'POST', body: JSON.stringify({ row, field, newValue }) });
});

grid.on('sort', (sorts) => console.log('sorted by', sorts));
grid.on('rowSelect', (rows) => toolbar.setEnabled(rows.length > 0), { once: false });

stop();                        // this handler only
grid.off('sort', handler);     // a named handler
grid.off('rowSelect');         // every handler of that event
grid.listenerCount('sort');    // handlers subscribed, not counting the constructor callback
```

Inside a component, keep the return value of `on()` and call it when the component goes away. It
leaves the grid itself alone, which `destroy()` does not.

- **Order.** The constructor's own callback runs first, then the handlers in the order they were
  added.
- **The same function twice** on one event replaces the first subscription rather than running
  twice, so re-running the same setup code does not double up.
- **A handler that throws** is logged to the console and does not stop the handlers after it, the
  constructor callback, or the render.
- **During an event**, a handler may subscribe or unsubscribe: one taken off is not called for the
  event already running, and one added is called from the next event on, the way DOM listeners
  behave.
- **`{ once: true }`** runs the handler for the next event only and unsubscribes it.
- **`destroy()`** drops every subscription.
- An unknown event name throws a `RangeError` listing the events, rather than subscribing to
  nothing.

`setOptions()` can still replace the constructor callbacks it accepts; doing so does not disturb
anything subscribed with `on()`.

| Callback | Type | Default | Fires when |
|---|---|---|---|
| `onPageChange` | `Function` | `undefined` | Page-change callback `(page, pageCount) => void`, fired only when the page actually changes — see [Pagination](pagination.md#pagination) |
| `onPageSizeChange` | `Function` | `undefined` | Page-size callback `(pageSize) => void`, fired when the rows per page change (through the selector or `setPageSize()`) — see [Pagination](pagination.md#pagination) |
| `onRowPinToggle` | `Function` | `undefined` | Called right after the *user* pins or unpins a row through the pin icon or the row menu: `({ pinned, rowIndex, position, rowData, handle }) => void`. Not called for `pinRow()`/`unpinRow()`/`togglePinRow()` made from code. See [Pinned Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| `onCellChange` | `Function` | `undefined` | Cell value change callback `({ row, field, newValue, oldValue }) => void`. It fires for every cell a commit writes (each cell of a paste, fill or clear included), and also when the value came out the same, so compare `newValue` with `oldValue` if you only care about real changes. Values are strings - see [getEdits()](reference-methods.md#getedits) |
| `onCellClick` | `Function` | `undefined` | Fired when the left button is pressed and released on the same cell, or a cell is tapped, alongside the built-in selection `(rowIndex, rowData, field) => void` — see [Selection, Focus and Editing from Code](selection.md#selection-focus-and-editing-from-code-getselection--setselection--focuscell--startediting--stopediting) |
| `onCellDoubleClick` | `Function` | `undefined` | Fired on every cell double-click, editable or not, alongside (not instead of) the built-in edit-start `(rowIndex, rowData, field) => void` |
| `onRowSelect` | `Function` | `undefined` | Callback fired whenever the selected row index array changes `(rows: number[]) => void` — see [Row Selection](selection.md#row-selection-rowselection--header-checkbox) |
| `onRowReorder` | `Function` | `undefined` | Drag-reorder completion callback `(fromIndex, toIndex, rowData) => void` — see [Row Drag Reorder](rows.md#row-drag-reorder-rowreorder) |
| `onRowDragOut` | `Function` | `undefined` | A row of this grid was dropped on another grid of the same `rowDragGroup`. Return `false` to call the move off - see [Dragging Rows Between Grids](rows.md#dragging-rows-between-grids-rowdraggroup) |
| `onRowDropIn` | `Function` | `undefined` | A row from another grid of the same `rowDragGroup` was dropped here. Return `false` to refuse it, or a row object to insert that instead - see [Dragging Rows Between Grids](rows.md#dragging-rows-between-grids-rowdraggroup) |
| `onSelectionChange` | `Function` | `undefined` | Cell/range selection change callback (`null` = selection cleared) |
| `onSort` | `Function` | `undefined` | Sort applied/cleared callback `(sorts: {field,dir}[] \| null) => void` |
| `onFilter` | `Function` | `undefined` | Filter applied/cleared callback `(filters) => void` |
| `onColumnReorder` | `Function` | `undefined` | Column drag-reorder completion callback `(columns: string[]) => void` |
| `onColumnResize` | `Function` | `undefined` | Column width callback `(field, width) => void`. Fires on mouse-up after a drag-resize, and once per column when `autoFitColumns()` fits columns. A double-click on a header border fits the column too, but does not call it |
| `onColumnVisibilityChange` | `Function` | `undefined` | Fired after `hideColumn()`/`showColumn()` or the column chooser's Apply actually changes the hidden-column set `(hiddenColumns: string[]) => void` |
| `onRowHeightResize` | `Function` | `undefined` | Per-row height drag-resize completion callback from the row-number gutter `(rowIndex, height) => void` |
| `onRender` | `Function` | `undefined` | Callback fired after every render |
| `onChunkError` | `Function` | `undefined` | Data chunk load failure callback `(err: Error) => void` |
| `onValidationError` | `Function` | `undefined` | Cell validity change callback `(row, field, message: string \| null) => void` — see [Validation](reference-methods.md#isvalid--getinvalidcells--validateall) |
| `onHeaderCheckboxChange` | `Function` | `undefined` | Header checkbox click callback `(field, checked) => void` — see [Header Checkbox](selection.md#row-selection-rowselection--header-checkbox) |
