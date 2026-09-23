---
title: Getting Started
nav_order: 2
---

# Getting Started

[← Docs index](README.md)

This page is the map: what a grid needs, which decisions you have to make up front, and where each
one is written up. Installation and a copy-paste starter live in the
[main README](https://github.com/JH-Grid/JHGrid#readme).

## What a grid needs

Exactly two things:

1. **A container** - `container`, a CSS selector or an element. The grid sizes itself to
   `width`/`height` (1200×700 by default), or to the element's own CSS size with `responsive: true`.
2. **A source of rows** - one of three ways, below.

Everything else has a default. A grid with just those two renders, scrolls and is read-only:

```js
import { JHGrid } from '@jh-grid/jhgrid-js';

const grid = new JHGrid({
  container: '#my-grid',
  data: [
    { name: 'Alice', age: 30, city: 'Seoul' },
    { name: 'Bob',   age: 25, city: 'Busan' },
  ],
});
```

Columns are inferred from the data when you don't declare any, so this is a complete, working grid.

## Decision 1: where the rows come from

This is the one choice you cannot defer - it decides how filtering, sorting and `refresh()` behave.

| You have | Use | Notes |
|---|---|---|
| An array already in memory | [`data`](api.md#local-array-data-data) | Filtering and sorting happen in the grid. Simplest start |
| A backend that pages rows, with a separate count/columns call | [`fetchMeta`](api.md#fetchmeta) + [`fetchData`](api.md#fetchdata) | The grid asks for one page at a time and caches chunks |
| A backend that returns rows *and* the total together | [`fetchPage`](api.md#fetchpage-single-callback-alternative) | One callback instead of two |

With the fetch callbacks, filtering and sorting are **your** server's job - the grid hands you the
current state and renders whatever comes back. See [Data Source Interface](api.md#data-source-interface)
for the exact shapes and for what `state` carries.

Backend already in Spring Boot? [Spring Boot Integration](integration.md) has the endpoint shapes
and the SQL paging that matches them.

## Decision 2: declared columns, or inferred

Leaving `columnDefs` out gets you every field as a plain text column - from the keys of `data[0]`
for an array source, or from whatever `fetchMeta` reports as `columns` for a fetched one. Declare
it as soon as you want any of: a label different from the field name, a width, an alignment, a
type, validation, or a custom renderer.

```js
columnDefs: [
  { field: 'name', label: 'Name',   width: 160 },
  { field: 'age',  label: 'Age',    width: 80, align: 'right' },
  { field: 'dob',  label: 'Joined', type: 'date', format: 'YYYY-MM-DD' },
],
```

Every key is listed in [Column Definition Reference](api.md#column-definition-reference).

## Decision 3: editable or read-only

**Read-only is the default.** Nothing is editable until you say so:

```js
editableCols: '*',              // everything
editableCols: ['name', 'age'],  // a subset
```

What a cell looks like when you edit it comes from the column's `type` - text, dropdown,
multiselect, checkbox, date, richtext - or from an editor you write yourself. See
[Column Types and Custom Editors/Renderers](api.md#column-types-date--richtext--image-and-custom-editorsrenderers).

Edits are held in the grid, not pushed anywhere, until you collect them with
[`getEdits()`](api.md#getedits). For a screen that saves row by row, see
[Incremental Save](api.md#incremental-save-getoriginalrowdata--isnewrow--acknowledgesave--acknowledgeinsert).

## Where to go next

Pick by what you are trying to do:

| Goal | Read |
|---|---|
| See it working before writing anything | [Live Demo](demo.md) |
| Look up an option by name | [Constructor Options](api.md#constructor-options) |
| Look up a method by name | [Public Methods](api.md#public-methods) - the index at the top links to wherever each one is written up |
| Turn on a capability (paging, selection, filters, export, header groups …) | [Features](api.md#features) |
| Change how it looks | [Theming](theming.md) |
| Know what a click, a drag or a key does | [Interaction Reference](interaction.md) |
| Understand how it renders millions of rows | [Architecture](architecture.md) |
| Check a browser version | [Browser Support](browser-support.md) |
