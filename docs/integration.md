---
title: Spring Boot Integration
nav_order: 7
description: Connect the JHGrid data grid to a Spring Boot backend - REST API shape, SQL paging, server-side sorting and filtering, and saving edited rows.
---

# Spring Boot Integration

[← Docs index](README.md)

JHGrid pairs naturally with a Spring Boot REST backend. The grid never filters or sorts server rows
itself; it tells your endpoints what the user asked for, and renders whatever they return. This page
walks from the smallest working pair of endpoints to sorting, filtering and saving.

## Backend API shape

```
GET /api/grid/meta
→ { "totalRows": 100000, "columns": ["id", "name", "value"] }

GET /api/grid/data?page=0&size=300
→ { "rows": [ { "id": 1, "name": "Alice", "value": 42 }, ... ] }
```

`page` is the 0-based number of a chunk of `size` rows, so the SQL offset is `page * size`. Every
row must carry the keys `columns` lists.

## The smallest working setup

Front end:

```js
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#grid',
  fetchMeta: async () => (await fetch('/api/grid/meta')).json(),
  fetchData: async (page, size) => (await fetch(`/api/grid/data?page=${page}&size=${size}`)).json(),
});
```

Back end:

```java
@RestController
@RequestMapping("/api/grid")
class GridController {
  private final JdbcTemplate jdbc;

  GridController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  @GetMapping("/meta")
  Map<String, Object> meta() {
    Long total = jdbc.queryForObject("SELECT COUNT(*) FROM your_table", Long.class);
    return Map.of("totalRows", total, "columns", List.of("id", "name", "value"));
  }

  @GetMapping("/data")
  Map<String, Object> data(@RequestParam int page, @RequestParam int size) {
    int capped = Math.min(Math.max(size, 1), 1000);            // never trust the client's page size
    List<Map<String, Object>> rows = jdbc.queryForList("""
        SELECT id, name, value
        FROM your_table
        ORDER BY id
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """, (long) page * capped, capped);
    return Map.of("rows", rows);
  }
}
```

The SQL above is the ANSI form, which SQL Server, Oracle 12c+, PostgreSQL and H2 accept. On MySQL or
MariaDB write `LIMIT ? OFFSET ?`, with the arguments the other way round. Always page with a stable
`ORDER BY` (a unique column last), or rows can repeat or go missing between chunks.

## Sorting and filtering

With `fetchMeta` and `fetchData`, sorting and filtering are your endpoints' job. The grid hands each
callback a `state` object describing what the user chose:

```json
{
  "sorts":       [ { "field": "salary", "dir": "desc" } ],
  "filters":     { "dept": ["Sales", "Support"], "name": "ali" },
  "quickFilter": "seoul"
}
```

- `sorts`: one entry at most; `dir` is `"asc"` or `"desc"`.
- `filters`: per column, either a **string** (the text filter: rows whose value *contains* it) or an
  **array of strings** (the value checklist: rows whose value is *exactly one of* them). An empty
  string in an array stands for an empty or null value.
- `quickFilter`: a single term to look for in any column, `''` when there is none.

Send it on both calls. `fetchMeta` needs it too: the total has to be the count *after* filtering, or
the scrollbar is the wrong length.

```js
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);     // the grid retries, then reports onChunkError
  return res.json();
});

const grid = new JHGrid({
  container: '#grid',
  fetchMeta: (state) => post('/api/users/meta', { state }),
  fetchData: (page, size, state) => post('/api/users/data', { page, size, state }),
});
```

Column names and directions arrive from the browser, and SQL cannot bind an identifier as a
parameter, so a query built from them must **only ever use names from a fixed list**. Values, on the
other hand, are always bound parameters. A controller that does both:

```java
@RestController
@RequestMapping("/api/users")
class UserGridController {
  // The only columns a request may name. Anything else is rejected, never concatenated.
  private static final List<String> COLUMNS = List.of("id", "name", "dept", "salary");

  private final NamedParameterJdbcTemplate jdbc;

  UserGridController(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

  record SortSpec(String field, String dir) {}
  record GridState(List<SortSpec> sorts, Map<String, Object> filters, String quickFilter) {}
  record MetaRequest(GridState state) {}
  record DataRequest(int page, int size, GridState state) {}

  @PostMapping("/meta")
  Map<String, Object> meta(@RequestBody MetaRequest req) {
    MapSqlParameterSource params = new MapSqlParameterSource();
    String where = where(req.state(), params);
    Long total = jdbc.queryForObject("SELECT COUNT(*) FROM users" + where, params, Long.class);
    return Map.of("totalRows", total, "columns", COLUMNS);
  }

  @PostMapping("/data")
  Map<String, Object> data(@RequestBody DataRequest req) {
    int size = Math.min(Math.max(req.size(), 1), 1000);
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("offset", (long) req.page() * size)
        .addValue("size", size);
    String where = where(req.state(), params);
    String sql = "SELECT " + String.join(", ", COLUMNS) + " FROM users" + where
        + orderBy(req.state())
        + " OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY";
    return Map.of("rows", jdbc.queryForList(sql, params));
  }

  private static String column(String name) {
    if (!COLUMNS.contains(name)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown column");
    return name;
  }

  private static String orderBy(GridState state) {
    List<String> parts = new ArrayList<>();
    if (state != null && state.sorts() != null) {
      for (SortSpec s : state.sorts()) {
        parts.add(column(s.field()) + ("desc".equalsIgnoreCase(s.dir()) ? " DESC" : " ASC"));
      }
    }
    parts.add("id");                                   // a unique tie-breaker keeps paging stable
    return " ORDER BY " + String.join(", ", parts);
  }

  private static String where(GridState state, MapSqlParameterSource params) {
    List<String> conditions = new ArrayList<>();
    if (state != null && state.filters() != null) {
      int n = 0;
      for (Map.Entry<String, Object> f : state.filters().entrySet()) {
        String col = column(f.getKey());
        String p = "f" + n++;
        if (f.getValue() instanceof List<?> values) {                  // checklist: exact values
          if (values.isEmpty()) continue;
          boolean withEmpty = values.contains("");
          conditions.add("(" + col + " IN (:" + p + ")" + (withEmpty ? " OR " + col + " IS NULL" : "") + ")");
          params.addValue(p, values.stream().map(String::valueOf).toList());
        } else if (f.getValue() != null && !f.getValue().toString().isEmpty()) {   // text: contains
          conditions.add("LOWER(CAST(" + col + " AS VARCHAR(4000))) LIKE :" + p + " ESCAPE '\\'");
          params.addValue(p, like(f.getValue().toString()));
        }
      }
    }
    if (state != null && state.quickFilter() != null && !state.quickFilter().isEmpty()) {
      List<String> any = new ArrayList<>();
      for (String col : COLUMNS) any.add("LOWER(CAST(" + col + " AS VARCHAR(4000))) LIKE :q ESCAPE '\\'");
      conditions.add("(" + String.join(" OR ", any) + ")");
      params.addValue("q", like(state.quickFilter()));
    }
    return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
  }

  // Lower-cases the term and escapes LIKE's own wildcards so a typed % or _ is taken literally.
  private static String like(String term) {
    String escaped = term.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    return "%" + escaped + "%";
  }
}
```

`state` is `null` on the first call, before the user has filtered or sorted anything, so the code
above treats a missing state as "no conditions". An endpoint that ignores `state` altogether still
works, but the grid then never filters or sorts, and its total is always the unfiltered one.

For a backend that already returns a page and the total in one query (a `COUNT(*) OVER()` next to
the rows, say), use [`fetchPage`](api.md#fetchpage-single-callback-alternative) and one endpoint
instead of two.

## Saving what the user changed

Edits, added rows and deletions stay in the browser until you send them. Set `rowKey: 'id'` (or
whatever column is the primary key) on the grid, and [`getChanges()`](api.md#batch-save-rowkey--getchanges--acknowledgechanges)
gives back exactly the three arrays a save endpoint needs, keyed by that column instead of by
row position:

```js
new JHGrid({
  container: '#grid',
  rowKey: 'id',              // required by getChanges() below
  editableCols: EDITABLE,
  // ...fetchMeta/fetchData/columnDefs as elsewhere on this page
});
```

```js
saveBtn.addEventListener('click', async () => {
  grid.validateAll();
  if (!grid.isValid()) return alert('Fix the highlighted cells first.');

  const { updated, added, deleted } = grid.getChanges();
  // updated: [{ id: 2, salary: '95000' }]  the key plus only the fields that changed
  // added:   [{ id: null, name: 'New' }]   rows added with addRow(), current values
  // deleted: [7]                           keys of rows marked with deleteRow()

  const res = await fetch('/api/users/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updated, created: added, deleted }),
  });
  if (res.ok) await grid.acknowledgeChanges();   // forgets the edits/adds/marks, re-reads the data
});
```

Everything the grid reports is text (`'42'`, `'true'`), so convert on the server. And because the
column names come from the client again, apply the same rule as for sorting:

```java
record Change(long id, Map<String, String> changes) {}
record SaveRequest(List<Change> updated, List<Map<String, String>> created, List<Long> deleted) {}

private static final List<String> EDITABLE = List.of("name", "dept", "salary");

@PostMapping("/save")
@Transactional
void save(@RequestBody SaveRequest req) {
  for (Change c : req.updated()) {
    if (c.changes().isEmpty()) continue;
    List<String> sets = new ArrayList<>();
    MapSqlParameterSource params = new MapSqlParameterSource("id", c.id());
    int n = 0;
    for (Map.Entry<String, String> e : c.changes().entrySet()) {
      if (!EDITABLE.contains(e.getKey())) continue;       // only columns you allow to change
      sets.add(e.getKey() + " = :v" + n);
      params.addValue("v" + n++, e.getValue());
    }
    if (!sets.isEmpty()) jdbc.update("UPDATE users SET " + String.join(", ", sets) + " WHERE id = :id", params);
  }
  for (Map<String, String> c : req.created()) { /* INSERT, same column allowlist */ }
  if (!req.deleted().isEmpty()) {
    jdbc.update("DELETE FROM users WHERE id IN (:ids)", new MapSqlParameterSource("ids", req.deleted()));
  }
}
```

`deleted` here only covers rows removed with the default `deleteMode: 'mark'`; a grid using
`deleteMode: 'permanent'` needs [`getRemovedRows()`](api.md#addingdeleting-rows-addrow--deleterow)
instead, which reports positions in the last result rather than keys. For a screen that saves as
the user goes, one row at a time, instead of one batch, see
[Incremental Save](api.md#incremental-save-getoriginalrowdata--isnewrow--acknowledgesave--acknowledgeinsert).
