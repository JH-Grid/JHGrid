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

1. **A container** - `container`, a CSS selector or an element. Leave `width`/`height` out and the
   grid fits the container's own CSS size by default (falling back to 1200×700 if the container has
   no size of its own yet); pass `width`/`height` for a fixed size instead.
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

## Using it in a framework

JH Grid is plain DOM and canvas, created with `new JHGrid()` against an element. In any framework
the recipe is the same: create it once the element exists, keep the instance, and call
[`destroy()`](api.md#destroy) when the element goes away, which removes its listeners and DOM.

**Angular**

```ts
@Component({ selector: 'app-user-grid', template: '<div #host></div>' })
export class UserGridComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host') host!: ElementRef<HTMLElement>;
  @Input() users: Record<string, unknown>[] = [];
  private grid?: JHGrid;

  ngAfterViewInit() {
    this.grid = new JHGrid({ container: this.host.nativeElement, data: this.users, editableCols: '*' });
  }
  ngOnDestroy() { this.grid?.destroy(); }
}
```

Keep in mind:

- **Keep the instance out of reactive/observable state.** The grid's internals use private class
  fields, which do not survive being wrapped in a change-detection proxy. A plain class property
  (as in the example above) or an untracked variable both work; a signal or an `@Input`-bound object
  does not.
- **Client only.** The constructor throws outside a browser, so with server-side rendering (Angular
  Universal or similar) create the grid inside a lifecycle hook that only runs in the browser, never
  during the render itself.
- **Options are read once.** Changing `columnDefs` and most other options later has no effect on an
  existing grid; only the ones listed under [`setOptions()`](api.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions)
  - including `editableCols`, for switching view mode/edit mode without a rebuild - can change. Build
  a new grid (after `destroy()`) for the rest.
- **Sizing.** Give the container a height, and add `responsive: true` to make the grid fill it. See
  [Responsive Sizing](api.md#responsive-sizing-responsive).
- **Straight after construction,** `await grid.ready()` before calling methods that need the columns,
  such as `hideColumn()`.

## If something does not look right

| You see | Usually because |
|---|---|
| A 1200 x 700 grid that ignores its container | The container has no CSS size of its own yet (auto-fit falls back to 1200×700 until it does), or `width`/`height` was passed explicitly, which turns off the auto-fit. Give the container a CSS size, or drop `width`/`height` |
| Cells that will not edit | Nothing is editable until `editableCols` says so (`'*'` or a list), or the column has `editable: true` |
| "Loading…" that never ends, or an error banner | `fetchMeta` / `fetchData` did not resolve `{ totalRows, columns }` / `{ rows }`. Check the network tab, and see [errors and retries](api.md#fetchdata) |
| Filtering or sorting that does nothing | With `fetchMeta` / `fetchData` the server does the filtering: your callbacks must apply `state`. A `data` array does it for you |
| A column missing | With `data` and `columnDefs`, only the declared fields are shown. With `fetchMeta`, only the columns it reports |
| `getEdits()` values that are text (`'25'`, `'true'`) | Edits are always strings. Convert them when you save |
| `JHGrid requires a browser environment` | The grid was created during server rendering. Create it on the client |

## Where to go next

Pick by what you are trying to do:

| Goal | Read |
|---|---|
| See it working before writing anything | [Live Demo](demo.md) |
| Look up an option by name | [Constructor Options](api.md#constructor-options) |
| Look up a method by name | [Public Methods](api.md#public-methods) - the index at the top links to wherever each one is written up |
| Turn on a capability (paging, selection, filters, export, header groups …) | [Features](api.md#features) |
| Check what a user typed, or save what they changed | [Validation](api.md#validation-columndefsvalidation), [`getEdits()`](api.md#getedits) and [adding/deleting rows](api.md#addingdeleting-rows-addrow--deleterow) |
| Choose how a cell is shown and edited | [Column Types](api.md#column-types-date--richtext--image-and-custom-editorsrenderers), [Date Columns](api.md#date-columns-type-date), [Dropdown and Multiselect](api.md#dropdown-and-multiselect-columns-type-dropdown--multiselect) |
| Add or restrict right-click actions | [Context Menus](api.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions) |
| Translate the grid's text | [Locale / Internationalization](api.md#locale--internationalization-locale--i18n) and the [Text Reference](api.md#text-reference-i18n) |
| Export or print | [Data Export](api.md#data-export-exportcsv--printgrid) |
| Change how it looks | [Themes](theming.md) |
| Know what a click, a drag or a key does | [Interaction Reference](interaction.md) |
| Understand how it renders millions of rows | [Architecture](architecture.md) |
| Check a browser version | [Browser Support](browser-support.md) |
