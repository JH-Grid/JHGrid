---
title: State & Saving
parent: Guides
nav_order: 12
description: Persisting the JHGrid data grid - snapshot and restore layout state, incremental save per row, and batch save with diff-based change tracking.
---

# State & Saving

Two separate things to persist: what the grid looks like (`getState`) and what the user changed (`getEdits` / `getChanges`).

Methods documented here: `acknowledgeChanges()`, `acknowledgeInsert()`, `acknowledgeSave()`, `getChanges()`, `getOriginalRowData()`, `getState()`, `isNewRow()`, `setState()`.


## State Snapshot/Restore (`getState` / `setState`)

Extracts the grid's current state (filters, sort, column order/visibility, edits, etc.) as a
serializable object, and can restore it later exactly as it was (e.g. saving a per-user view).

```js
// The view: column order and widths, hidden columns, frozen counts, sort, filters.
const state = grid.getState({ rowChanges: false });
localStorage.setItem('gridState', JSON.stringify(state));

grid.setState(JSON.parse(localStorage.getItem('gridState')));
```

A plain `getState()` also carries `rowChanges` - every unsaved edit, added row and delete mark -
which is what lets a snapshot restore an editing session, and what makes it large. Measured on a
million-row grid:

| State | `getState()` | `getState({ rowChanges: false })` |
|---|---|---|
| No edits | 959 bytes | 897 bytes |
| 200,000 edited cells | 5.4MB | 897 bytes |
| One column edited in every row | 21.9MB | 897 bytes |

`sessionStorage` and `localStorage` usually stop at about 5MB, so the first of those already fails
to store and a larger one throws `Invalid string length` inside `JSON.stringify` before it gets
that far. Pass `{ rowChanges: false }` when you are saving a view; the call then skips building the
edit map as well (0.7ms against 56ms at 200,000 edits).

Use the default when you are saving the editing session itself - a tab that may be closed with work
in it - and keep it under whatever budget your storage has.

```js
// The editing session, edits included.
sessionStorage.setItem('gridWork', JSON.stringify(grid.getState()));
```

A snapshot survives `JSON.stringify` / `JSON.parse` with one exception: a column added with
`addColumn()` that carries a function (a custom `renderer`, `editor`, `validator` or `button.onClick`)
keeps it only while the snapshot stays in memory. Restore such a column from your own definition
instead of from the saved copy.

A `setState()` call is recorded as a single undoable action. `setState()` returns a `Promise` that
resolves once the grid is actually showing that state; if the snapshot carries `sorts`,
`filters`, or `quickFilter`, those only describe what the *server* should return, so the grid
re-fetches and the promise waits for the answer. A snapshot that only moves columns around
resolves immediately, since there's nothing to ask for. Unknown fields are ignored, so a snapshot
taken with an older version of the grid still applies as far as it goes.

`GridState`'s fields:

| Field | Type | Description |
|---|---|---|
| `columns` | `string[]` | Current visible column order |
| `columnWidths` | `Record<string, number>` | Current width of every column, by field. With [`stretchColumns`](columns.md#filling-the-width-stretchcolumns) on, each column's own width rather than its stretched one |
| `hiddenColumns` | `string[]` | Currently hidden fields |
| `frozenCols` / `frozenColsRight` | `number` | Current frozen-column counts |
| `pinnedTopRows` / `pinnedBottomRows` | `object[]` | Current pinned row data (edits merged in) — see [Pinned Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| `sorts` | `{field, dir}[]` | Active sort |
| `filters` | `Record<string, string \| string[]>` | Active per-column filters: `string` (substring match) or `string[]` (Set filter) |
| `quickFilter` | `string` | Active quick-filter term, `''` when inactive |
| `selectedRows` | `number[]` | Currently selected row indices (`rowSelection` mode) |
| `headerCheckboxState` | `Record<string, boolean>` | Checked state of every `headerCheckbox` column's header checkbox |
| `userSizedColumns` | `string[]` | Columns the user resized by hand: with [`stretchColumns`](columns.md#filling-the-width-stretchcolumns) on they keep that width instead of taking a share of the leftover space |
| `hiddenRows` | `{ index, key }[]` | Rows the user hid, by their server index and the `rowKey` value they are found again by — see [Hiding Rows](rows.md#hiding-rows-hiderow--showrow--showallrows) |
| `localColumns` | `ColumnDef[]` | Columns added via `addColumn()` not yet committed (see `getNewColumns()`/`commitColumns()`) |
| `deletedColumns` | `string[]` | Server columns marked deleted via `deleteColumn()`, not yet committed (see `getDeletedColumns()`) |
| `rowChanges` | `object` | Unsaved row work: see below. Left out entirely by `getState({ rowChanges: false })` |

`rowChanges` is the row counterpart of `localColumns`/`deletedColumns`, keyed by **server index**
throughout (never screen position, since a snapshot is meant to outlive whatever arrangement
produced it):

| `rowChanges` field | Type | Description |
|---|---|---|
| `added` | `{anchor, data, edits}[]` | Rows from `addRow()`. `anchor` is the server index the row sits in front of (equal to the row count when appended at the end) |
| `removed` | `number[]` | Server indices removed via `deleteRow(i, { permanent: true })`: see `getRemovedRows()` |
| `marked` | `number[]` | Server indices marked for deletion: see `getDeletedRows()` |
| `edits` | `Record<number, Record<string, string>>` | Unsaved cell edits on server rows, `serverIndex -> field -> value` |

`setState()` treats `rowChanges` as a full replacement, not an addition; restoring the same
snapshot twice doesn't duplicate rows. A snapshot without the field says nothing about rows, so
restoring one leaves the rows added, deleted and edited in the grid alone - they ride through the
re-fetch the way they do through any sort or filter change (edits on server rows do not; see
[Field-Based Filter / Sort](filtering-sorting.md#field-based-filter--sort-setfilter--setsort)). Restoring against changed server data names different
records by index, the same caveat that applies to `filters` naming fields that may no longer exist.

## Incremental Save (`getOriginalRowData` / `isNewRow` / `acknowledgeSave` / `acknowledgeInsert`)

For a host that saves as the user goes (auto-save on commit) rather than in one batch via
`getEdits()`, these let a single row be reconciled with the server without the full reset
(scroll position, filters, sort, selection) that `refresh()` does.

```js
grid.getOriginalRowData(3); // row 3's pre-edit snapshot: what getRowData(3) returned before
                             // any unsaved edits, independent of later addRow()/deleteRow() calls
grid.isNewRow(3);           // true if row 3 came from addRow() and has no server counterpart yet
```

```js
// A server row the user just edited, saved successfully:
async function saveRow(rowIndex) {
  const saved = await fetch('/api/rows/' + rowIndex, {
    method: 'PUT',
    body: JSON.stringify(grid.getRowData(rowIndex)),
  }).then(r => r.json());
  grid.acknowledgeSave(rowIndex, saved); // patches the cache, drops the pending edit
}

// A row added via addRow(), just created on the server:
async function createRow(rowIndex) {
  const created = await fetch('/api/rows', {
    method: 'POST',
    body: JSON.stringify(grid.getRowData(rowIndex)),
  }).then(r => r.json());
  grid.acknowledgeInsert(rowIndex, created); // turns it into an ordinary server row in place
}
```

`acknowledgeSave()` is a no-op if `isNewRow(rowIndex)` is true (a brand-new row has no server slot
yet to patch; use `acknowledgeInsert()` for that case instead, which returns `false` if
`rowIndex` wasn't actually a local/unsaved row).

## Batch Save (`rowKey` / `getChanges()` / `acknowledgeChanges()`)

For a "Save" button that sends everything at once instead of reconciling row by row, set `rowKey`
to the column that uniquely identifies a row (e.g. `'id'`) and use `getChanges()` /
`acknowledgeChanges()` in place of hand-assembling a payload from `getEdits()`/`getNewRows()`/
`getDeletedRows()`:

```js
grid.getChanges();
// {
//   updated: [{ id: 2, qty: 999 }],    // the key plus only the fields that changed
//   added:   [{ id: 100, name: 'x' }], // rows created with addRow(), with their current values
//   deleted: [5],                      // keys of rows marked with deleteRow() (deleteMode 'mark')
// }

await grid.acknowledgeChanges(); // forgets the edits, the added rows and the delete marks, and
                                  // re-reads the data - filters, sorts and scroll position survive
```

A value edited in a cell whose original value was a number comes back as a number (an emptied cell
as `null`); anything else stays the string that was typed. `getChanges()` throws if `rowKey` was
not set.

Rows removed with `deleteMode: 'permanent'` are **not** included in `deleted` — that mode is meant
for lists that commit as they go, not a batch save, so fall back to `getRemovedRows()` for those.
Pinned rows are never included either. `acknowledgeChanges(opts?: { keepScroll? })` takes the place
of `clearEdits()` + `reloadData()` here specifically because that combination would keep the added
rows around and show them a second time once the server returns them.

## Undoing One Row's Edits (`revertRow`)

`revertRow(rowIndex)` throws away the unsaved edits of a single row and puts its cells back to the
values the data source gave. It is the counterpart of `clearEdits()`, which discards every row's
edits and the undo history with them.

```js
async function saveRow(rowIndex) {
  const response = await fetch('/api/rows/' + rowIndex, {
    method: 'PUT',
    body: JSON.stringify(grid.getRowData(rowIndex)),
  });
  if (response.ok) {
    grid.acknowledgeSave(rowIndex, await response.json());
    return;
  }
  if (response.status === 409) {        // someone else saved first: start that row over
    grid.revertRow(rowIndex);
  }
  // any other failure: leave the edits in place so the user can try again
}
```

- Returns `false` when the row had no edits, `true` when something went back.
- It is **one undo step**, so `Ctrl+Z` (or `undo()`) brings the edits back.
- The validation marks that came with those edits are cleared with them.
- It does not touch a delete mark - [`undeleteRow()`](rows.md#addingdeleting-rows-addrow--deleterow)
  does - and it does not remove a row added with `addRow()`: such a row goes back to the values it
  was added with.
- A save failure needs no call at all. Edits stay in the grid until `acknowledgeSave()` /
  `acknowledgeChanges()`, so doing nothing is already "keep the user's work and retry".

## Rows by Their Key (`getRowIndexByKey` / `getRowDataByKey` / `setCellValueByKey`)

Row indices move: a sort, a filter or a row inserted above changes which record row 3 is. The
`rowKey` value does not, so these three take that instead.

```js
const grid = new JHGrid({ container: '#my-grid', rowKey: 'id', data: rows, editableCols: '*' });

grid.getRowIndexByKey(4821);                      // the row index that record sits at, or -1
grid.getRowDataByKey(4821);                       // the row itself, or null
grid.setCellValueByKey(4821, 'status', 'Paid');   // false when the grid does not hold that row
```

Each one walks the rows the grid holds, so they are O(loaded rows) - fine in an event handler, not
in a render loop. All three need the `rowKey` option and throw without it.

## Typed and Keyed Edits (`getEdits` options)

`getEdits()` answers with the text the grid holds, keyed by row index. Two options change that at
the save boundary without changing anything inside the grid:

```js
grid.getEdits();                     // { 3: { score: '99' } }          - row index, text
grid.getEdits({ byKey: true });      // { 4821: { score: '99' } }       - rowKey value, text
grid.getEdits({ typed: true });      // { 3: { score: 99 } }            - row index, typed
grid.getEdits({ byKey: true, typed: true });
```

`typed` runs the column's own `parse` when it declares one, and otherwise restores the type the
original value had (a number stays a number, `'true'`/`'false'` become booleans).

```js
columnDefs: [
  { field: 'score',  parse: (value) => (value === '' ? null : Number(value)) },
  { field: 'tags',   parse: (value) => value.split(',').map((s) => s.trim()) },
],
```

[`getChanges()`](#batch-save-rowkey--getchanges--acknowledgechanges) goes through the same `parse`,
so a save path built on it gets the same types.
