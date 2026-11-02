---
title: Data Source
parent: Guides
nav_order: 1
description: Where a JHGrid data grid gets its rows - the async fetchMeta/fetchData pair, the single-callback fetchPage, and passing a plain in-memory array.
---

# Data Source

A grid takes its rows from exactly one of these: an async backend pair, a single async callback, or an array you already have in memory.

**[See it running](demo.md#1000000-rows)**


## Data Source Interface

Give the grid `fetchMeta` + `fetchData` for a backend that answers the two questions separately,
`fetchPage` for one that answers both at once, or `data` for an array already in memory. Exactly one
of the three is required, and the first two are called again whenever a filter, a sort or a scroll
needs rows the grid does not have.

## `fetchMeta`

```ts
fetchMeta: (state?: GridFilterState | null) => Promise<{
  totalRows: number;   // total number of rows in the dataset (after state's filters, if any)
  columns: string[];   // ordered list of column keys
  summary?: Record<string, string | number | null> | null;  // optional: totals for summaryRow
}>
```

`state` is the sort/filter/quick-filter the grid wants applied, the same shape `fetchData`
receives (see below). A `fetchMeta` that ignores it still works, it just always reports the
unfiltered total, which makes the scrollbar/row count wrong the moment a filter or sort is active.

`summary` is for the grand total row (see [Rows](rows.md#summary-row-summaryrow)). The grid only
totals the rows it has loaded - it never reads the rest of the table to add it up - so a total over
the whole table is the server's to compute. Sending it here rather than through
`setSummaryValues()` ties it to the state it was asked about: a filter or sort change brings fresh
numbers with the new count. Leave the key out and nothing changes; `summary: null` hands the totals
back to the grid.

## `fetchData`

```ts
fetchData: (page: number, size: number, state?: GridFilterState | null) => Promise<{
  rows: Record<string, unknown>[];  // `size` rows starting at offset page*size, honoring `state`
}>
```

```ts
interface GridFilterState {
  sorts:   { field: string; dir: 'asc' | 'desc' }[];
  // string = substring match (setFilter()); string[] = exact-match checkbox selection (setFilterValues())
  filters: Record<string, string | string[]>;
  quickFilter: string; // '' when inactive
}
```

JHGrid never filters or sorts data itself; it only tracks *what* the user asked for (which
column, which values, which direction) and hands that to `fetchMeta`/`fetchData` as `state` on
every call. Applying it (a `WHERE`/`ORDER BY` on a real backend, or an `Array.filter`/`sort` for
an in-memory source) is entirely the host's responsibility; a callback that ignores `state`
simply never filters or sorts.

Row objects must use the **same keys** as the `columns` array returned by `fetchMeta`.

```json
// fetchMeta → { "columns": ["name", "age", "city"] }
// fetchData → { "rows": [{ "name": "Alice", "age": 30, "city": "Seoul" }] }
```

How `columns` and `columnDefs` combine:

- The order of `columnDefs` wins. Columns the server reports that `columnDefs` does not mention are
  appended after them, as plain text columns.
- A `columnDefs` entry whose `field` the server did not report is ignored.
- Without `columnDefs`, the grid shows exactly the columns `fetchMeta` reports, in that order.

`page` is the 0-based index of a chunk of `size` rows, not a row number: page `2` with `size: 300`
is rows 600 to 899. `size` is the `chunkSize` option (or the page size when `pagination` is on).

```js
const grid = new JHGrid({
  container: '#grid',
  editableCols: '*',
  fetchMeta: async (state) => {
    const res = await fetch('/api/users/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state ?? {}),           // sorts, filters, quickFilter
    });
    return res.json();                             // { totalRows: 1250, columns: ['id', 'name', 'dept'] }
  },
  fetchData: async (page, size, state) => {
    const res = await fetch('/api/users/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, size, ...(state ?? {}) }),
    });
    return res.json();                             // { rows: [ { id: 1, name: 'Alice', dept: 'Sales' }, ... ] }
  },
});
```

**Errors and retries.** A `fetchData` call that rejects (a network error, an HTTP error you turned
into a throw) is retried twice more, after 0.5 s and then 1 s. When the third attempt fails the grid
shows `i18n.loadError` in a banner for a few seconds, calls `onChunkError(err)`, and leaves that
chunk empty for about 5 seconds before it will ask for it again. A response that is not shaped like
`{ rows: [] }` is reported the same way but not retried, since asking again cannot fix it. Check
`res.ok` yourself, because `fetch` only rejects on network failure:

```js
fetchData: async (page, size, state) => {
  const res = await fetch(`/api/users?page=${page}&size=${size}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);   // retried, then onChunkError
  return res.json();
},
onChunkError: (err) => console.error('load failed', err),
```

A chunk that failed is not retried on sight: it stays empty for about five seconds, so a dead
backend is asked once per chunk per five seconds rather than on every frame that scrolls over it.
`reloadData()` and `refresh()` clear that cooldown, as does `setDataSource()`.

The grid keeps at most two chunk requests in flight and holds new requests while the user is
actively wheel-scrolling, so a fast scroll over a huge dataset asks only for the chunks it lands on.

## Host query contract

Your callback is asked for **one page at a time**, and three operations walk every page of the
current result:

| Operation | What it needs |
|---|---|
| A row-drag reorder, or `moveRow()` | every row, to know the order it is rewriting |
| `exportCsv({ full: true })` | every row that matches the filter |
| `printGrid({ full: true })` | the same |

Those scans use [`fullScanPageSize`](reference-options.md#constructor-options), which defaults to
`max(chunkSize, 10000)`. **Cache your result per `state`.** A callback that re-filters its array on
every call pays rows × pages; one that caches pays rows once. Measured on a million rows filtered
to 200,000, exporting the lot:

| Host | Calls | Rows the host walked | Time |
|---|---|---|---|
| re-filters per call | 20 | 20,000,000 | 299 ms |
| re-filters per call, `fullScanPageSize: 300` | 667 | 667,000,000 | 5,441 ms |
| caches per `state` | 20 | 1,000,000 | 125 ms |

```js
let cacheKey = null, cacheRows = null;
const resolve = (state) => {
  const key = JSON.stringify(state ?? {});
  if (key !== cacheKey) { cacheKey = key; cacheRows = myQuery(state); }
  return cacheRows;
};

fetchMeta: async (state) => ({ totalRows: resolve(state).length, columns: COLS }),
fetchData: async (page, size, state) => ({ rows: resolve(state).slice(page * size, page * size + size) }),
```

A backend that serves fewer rows than asked is handled for you: the scan takes the first page's
length as the size you are willing to serve and drives the rest at that size, so a cap of 1,000
costs more calls but never loses a row.

### A scan is not atomic

The pages of a scan are separate calls, so rows can change between them. Measured against SQL
Server, exporting 300,000 filtered rows while another connection deleted 40,000 of them: the file
came out with 260,000 rows and no duplicates - the same count as the rows that survived - but
40,000 surviving rows were missing from it and 40,000 already-deleted rows were in it. Offset-based
paging skips the tail when rows below the cursor disappear, and the row count alone does not show
it.

Pick one if the table can change under an export:

- hold the scan inside one `SNAPSHOT` or `REPEATABLE READ` transaction, so every page reads the
  same version of the table
- page by key (`WHERE id > @lastSeen ORDER BY id`) instead of by offset, so a deletion behind the
  cursor cannot shift the rows ahead of it
- freeze the result first - select the matching keys into a temp table per `state`, then read pages
  from that. This is also the fastest of the three for small pages

### The scan competes with the grid for connections

A scan runs [`fullScanConcurrency`](reference-options.md#constructor-options) queries at once
(2-8, from the machine's core count). On a small pool those queries crowd out the chunk fetches the
visible grid is making, and the rows on screen fail to load while the export runs. Lower
`fullScanConcurrency`, or give the pool more room than the scan takes.

### Matching what the `data` array path does

Nothing obliges your query to behave like the built-in one - a `WHERE` clause is yours to write.
But if you want a server-backed grid to answer exactly as the same data would through
[`data`](#local-array-data-data), these are the rules it follows:

- a **string** filter condition is a case-insensitive substring match; an **array** condition is an
  exact match against `String(value)`, and an **empty array** is ignored rather than matching nothing
- the **quick filter** is matched against every column of the grid, hidden ones included, and
  against nothing else; a Korean-initials term (`ㄱㅁㅅ`) is OR'd with the substring match rather
  than replacing it. **A SQL query has no equivalent of the initials half** - see below
- a **sort** compares numerically when both values parse as numbers and otherwise through
  `Intl.Collator(undefined, { numeric: true })`; `'item2'` sorts before `'item10'`
- a **date column** with a `format` compares by its pattern (see [Columns](columns.md)); the
  tie-breaker, after every key, is the row's original position

### Two things a SQL query cannot copy

Both came out of running the same million rows through a real SQL Server and through a `data`
array, and both are the host's to decide rather than the grid's.

**Korean initials have no SQL equivalent.** A term of initial consonants (`ㄱㅁㅅ`) matching the
names those are the initials of works by reading the initial out of each Hangul code point, which
`LIKE` cannot do and a collation does not change. A server-backed
grid gets `state.quickFilter = 'ㄱㅁㅅ'` and, with an ordinary `LIKE '%ㄱㅁㅅ%'`, finds nothing. If you
need it, keep a column of initials next to the text and search that:

```sql
-- filled on insert/update, or as a computed column
ALTER TABLE employee ADD name_chosung AS dbo.fn_chosung(name) PERSISTED;
```

**Edits arrive as display text, not as stored values.** Every value in `getEdits()` is the string the
cell holds, so a checkbox is `'true'`/`'false'`, not `1`/`0`; a number column is `'1,234'` if that is
what is shown; a date is in the column's `format`. Mapping them back is the host's job, and the
mapping is per column type:

| Column | Cell holds | SQL wants |
|---|---|---|
| `type: 'checkbox'` | `'true'` / `'false'` | `bit`: `1` / `0` |
| `type: 'number'` | `'1,234.50'` (as formatted) | `decimal`: `1234.50` |
| `type: 'date'`, `format: 'MM/DD/YYYY'` | `'12/31/2026'` | `date`: `'2026-12-31'` |

`getEdits({ typed: true })` runs each column's `parse` and hands back the type the original value
had, which covers the ordinary cases; a column whose stored form is its own (an enum, a code table)
still needs the host's own mapping. The same applies in the other direction to a filter condition:
a `bit` column filtered from the grid arrives as the text `'true'`, so
`CAST(active AS nvarchar) IN ('true')` matches no row - map it to `1` before it reaches the query.

## `fetchPage`: single-callback alternative

For a backend that already returns a page of rows *and* the total count together in one round
trip (e.g. a SQL `COUNT(*) OVER()` alongside the paged query), `fetchPage` collapses
`fetchMeta`+`fetchData` into a single callback instead of two:

```ts
fetchPage: (page: number, size: number, state?: GridFilterState | null) =>
  Promise<{
    rows: Record<string, unknown>[];
    totalRows: number;
    columns?: string[]; // only needed if not already provided via columnDefs
    summary?: Record<string, string | number | null> | null;  // optional: totals for summaryRow
  }>
```

```js
const grid = new JHGrid({
  container: '#grid',
  columnDefs: [{ field: 'id' }, { field: 'name' }, { field: 'dept' }],
  fetchPage: (page, size, state) =>
    fetch('/api/grid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, size, state }),
    }).then(res => res.json()), // { rows, totalRows }
});
```

The grid still asks for chunk 0 once at boot even though it needs both the row count and the rows
from that same call, so a plain `(page, size) => …` implementation isn't invoked twice for the
same page. Only one data source applies: supplying `fetchMeta`/`fetchData` alongside `fetchPage`
leaves those two in charge and `fetchPage` is ignored.

![A fetchPage-backed grid with frozen columns, loaded from a real HTTP endpoint](images/fetchpage-grid.png)

## Local Array Data (`data`)

For a dataset that already fits in memory (prototyping, a small/medium lookup table, tests)
pass a plain array via `data` instead of writing `fetchMeta`/`fetchData` yourself. Columns are
inferred from `columnDefs` if given, else from the keys of `data[0]`.

```js
const grid = new JHGrid({
  container: '#my-grid',
  data: [
    { name: 'Alice', age: 30, city: 'Seoul' },
    { name: 'Bob',   age: 25, city: 'Busan' },
  ],
  editableCols: '*',
});
```

![The exact two-row example above, rendered](images/local-array-data.png)

Filtering, sorting, and the quick filter are applied against the array directly (same semantics a
server-backed `fetchMeta`/`fetchData` is expected to implement; see `onFilter`/`onSort`). This
re-scans the whole array on every state change with no indexing, so it's meant for small/medium
datasets; a large dataset still belongs behind `fetchMeta`/`fetchData` against a real, indexed
backend. `refresh()` and `reloadData()` re-read the same array reference, so mutating it
externally and calling one of them picks up the change.

What the grid does with the array:

- **Columns.** With `columnDefs`, only the declared fields become columns; a key of the rows that
  is not declared is not shown. Without it, the columns are the keys of `data[0]`. An empty array
  needs `columnDefs`, otherwise the constructor throws.
- **Edits stay in the grid.** Editing a cell never writes into your array. Read the changes with
  [`getEdits()`](reference-methods.md#getedits) and apply them to your own data.
- **Text filter** (`setFilter`, the filter panel's search box): case-insensitive substring match on
  that field. **Set filter** (`setFilterValues`, the checklist): exact match on the value as text.
- **Quick filter** (`setQuickFilter`): case-insensitive substring match against every column of the
  grid, hidden ones included. A field with no column is not searched.
- **Sorting.** Two numbers compare as numbers; a `type: 'date'` column compares as dates read through
  its pattern, so `'12/31/2019'` sorts before `'03/01/2020'` under `MM/DD/YYYY`; anything else compares
  as text with numeric collation, so `'item2'` sorts before `'item10'`. Empty values, and a date value
  the pattern cannot read, compare as text.

```js
const users = [
  { id: 1, name: 'Alice', dept: 'Sales',       salary: 5200 },
  { id: 2, name: 'Bob',   dept: 'Engineering', salary: 6100 },
  { id: 3, name: 'Chloe', dept: 'Sales',       salary: 4800 },
];

const grid = new JHGrid({
  container: '#grid',
  data: users,
  editableCols: ['name', 'salary'],
  columnDefs: [
    { field: 'id',     label: 'ID',     width: 60 },
    { field: 'name',   label: 'Name' },
    { field: 'dept',   label: 'Dept' },
    { field: 'salary', label: 'Salary', align: 'right' },
  ],
});

grid.setSort('salary', 'desc');     // Bob, Alice, Chloe
grid.setQuickFilter('sales');       // Alice, Chloe

// The array itself is untouched by edits. Merge them yourself before saving:
const edits = grid.getEdits();      // { 0: { salary: '5300' } }, row index -> field -> text
```

Ignored if `fetchMeta`/`fetchData` or `fetchPage` is also provided.

---

## Changing the Data Source at Runtime (`setDataSource`)

`setDataSource()` points a running grid at a different source. It takes the same three shapes the
constructor takes, and then starts over exactly as [`refresh()`](reference-methods.md#refresh)
does - unsaved edits, filters, sorts, selection, column widths and order are dropped, because the
new source need not even have the same columns.

```js
grid.setDataSource({ fetchMeta, fetchData });        // another backend
grid.setDataSource({ fetchPage });                   // the single-callback shape
grid.setDataSource({ data: rows });                  // an array already in memory
await grid.ready();                                  // resolves once the first rows are in
```

Use [`reloadData()`](reference-methods.md#reloaddata) instead when the source is the same and only
the data behind it changed: that keeps filters, sort and column state.

Columns declared in `columnDefs` stay declared: a source whose rows have other fields shows those
columns empty. Leave `columnDefs` out to let each source bring its own columns.
