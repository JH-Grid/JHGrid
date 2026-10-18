---
title: Features
nav_order: 4
description: Every feature of the JHGrid JavaScript data grid and the page that documents it - data sources, columns, rows, selection, editing, cell types, filtering, sorting, state, export, localization and accessibility.
---

# Features

Everything the grid does, and the page that documents it. If you know what you want
to build, start here; if you want to look an option or a method up by name, start at
[Reference](reference.md).


## Data

| Feature | Option / API | Guide |
|---|---|---|
| Async data source | `fetchMeta` + `fetchData` | [Data Source](data-source.md#fetchmeta) |
| Single-callback data source | `fetchPage` | [Data Source](data-source.md#fetchpage-single-callback-alternative) |
| In-memory array | `data` | [Data Source](data-source.md#local-array-data-data) |
| Swapping the source at runtime | `setDataSource()` | [Data Source](data-source.md#changing-the-data-source-at-runtime-setdatasource) |
| Chunked loading, prefetch and cache | `chunkSize`, `prefetchChunks`, `maxCachedChunks` | [Architecture](architecture.md) |
| Continuous scroll or classic pages | `pagination`, `pageSize` | [Pagination](pagination.md) |
| Page-size selector | `pageSizeOptions` | [Pagination](pagination.md#letting-users-pick-the-page-size) |

## Columns

| Feature | Option / API | Guide |
|---|---|---|
| Add, delete, hide | `addColumn()`, `deleteColumn()`, `hideColumn()` | [Columns](columns.md#addingdeletinghiding-columns-addcolumn--deletecolumn--hidecolumn) |
| Resize and reorder by drag | (built in) | [Interaction](interaction.md) |
| Column chooser dialog | header context menu | [Context Menus](context-menus.md) |
| Multi-level header groups | `columnDefs[].group` | [Columns](columns.md#multi-level-header-groups-columndefsgroup) |
| Many column changes as one step | `batchStructural()` | [Columns](columns.md#changing-many-columns-at-once-batchstructural) |
| Keep a group whole while dragging | `lockHeaderGroups` | [Columns](columns.md#keeping-a-group-whole-while-dragging-lockheadergroups) |
| Frozen left and right | `frozenCols`, `frozenColsRight` | [Columns](columns.md#frozen-columns-frozencols--frozencolsright) |
| Size to container | `responsive` | [Columns](columns.md#responsive-sizing-responsive) |
| Fill the leftover width | `stretchColumns` | [Columns](columns.md#filling-the-width-stretchcolumns) |
| Spreadsheet letter headers | `columnLetterHeader` | [Columns](columns.md#column-letter-header-columnletterheader) |

## Rows

| Feature | Option / API | Guide |
|---|---|---|
| Add, delete, undelete | `addRow()`, `deleteRow()`, `undeleteRow()` | [Rows](rows.md#addingdeleting-rows-addrow--deleterow) |
| Hide and show | `hideRow()`, `showAllRows()` | [Rows](rows.md#hiding-rows-hiderow--showrow--showallrows) |
| Per-row height, auto-fit columns | `setRowHeight()`, `autoFitColumns()` | [Rows](rows.md#row-height-setrowheight--autofitcolumns) |
| Wrapped cell text, auto row height | `wrapCells`, `autoRowHeight` | [Rows](rows.md#wrapped-cells-and-auto-row-height-wrapcells--autorowheight) |
| Drag reorder | `rowReorder` | [Rows](rows.md#row-drag-reorder-rowreorder) |
| Move a row from code | `moveRow()` | [Rows](rows.md#moving-a-row-from-code-moverow) |
| Drag rows between grids | `rowDragGroup`, `onRowDropIn` | [Rows](rows.md#dragging-rows-between-grids-rowdraggroup) |
| Pinned top and bottom rows | `pinnedTopRows`, `pinnedBottomRows`, `pinRow()` | [Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| Space under a row for your own panel | `reserveRowSpace()`, `getRowRect()` | [Rows](rows.md#space-under-a-row-reserverowspace--getrowrect) |
| Summary (grand total) row | `summaryRow`, `getSummaryValues()` | [Rows](rows.md#summary-row-summaryrow) |

## Selection, clipboard and editing

| Feature | Option / API | Guide |
|---|---|---|
| Cell and range selection | `getSelection()`, `setSelection()` | [Selection](selection.md#selection-focus-and-editing-from-code-getselection--setselection--focuscell--startediting--stopediting) |
| Row selection and header checkbox | `rowSelection`, `getSelectedRows()` | [Selection](selection.md#row-selection-rowselection--header-checkbox) |
| Copy, cut, paste as TSV | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | [Interaction](interaction.md) |
| Fill handle | drag the selection corner | [Interaction](interaction.md#filling) |
| Inline editing | `editableCols`, `onCellChange` | [Editing](editing.md) |
| Editor behaviour per column | `columnDefs[].editorOptions` | [Editing](editing.md#editor-options-columndefseditoroptions) |
| Validation | `columnDefs[].validation`, `isValid()` | [Editing](editing.md#validation-columndefsvalidation) |
| Number-only editing | `editor: 'number'` | [Editing](editing.md#editor-options-columndefseditoroptions) |
| Undo and redo | `undo()`, `redo()` | [Methods](reference-methods.md#undo--redo) |

## Cells

| Feature | Option / API | Guide |
|---|---|---|
| Checkbox, radio, dropdown, multiselect | `columnDefs[].type` | [Cell Types](cell-types.md) |
| Date columns | `type: 'date'`, `datePattern` | [Cell Types](cell-types.md#date-columns-type-date) |
| Button columns and per-cell buttons | `type: 'button'`, `cellButton` | [Cell Types](cell-types.md#button-columns-type-button) |
| Built-in renderers | `CellRenderers` | [Renderers](renderers-editors.md#built-in-cell-renderers-cellrenderers) |
| Rounding and negatives on an amount | `CellRenderers.number({ rounding, negative })` | [Renderers](renderers-editors.md#money-columns-rounding-and-negatives) |
| Rich text and image cells | `type: 'richtext'`, `type: 'image'` | [Renderers](renderers-editors.md#column-types-date--richtext--image-and-custom-editorsrenderers) |
| Custom renderer and editor | `columnDefs[].renderer`, `columnDefs[].editor` | [Renderers](renderers-editors.md#column-types-date--richtext--image-and-custom-editorsrenderers) |

## Filtering and sorting

| Feature | Option / API | Guide |
|---|---|---|
| Set filter and quick filter | `setFilterValues()`, `setQuickFilter()` | [Filtering & Sorting](filtering-sorting.md#set-filter--quick-filter) |
| Tag filter for high-cardinality columns | `fetchFilterValues` | [Filtering & Sorting](filtering-sorting.md#tag-filter-fetchfiltervalues) |
| Field-based filter and sort | `setFilter()`, `setSort()` | [Filtering & Sorting](filtering-sorting.md#field-based-filter--sort-setfilter--setsort) |
| Multi-column sort | `addSort()`, `setSorts()`, `Shift`+click | [Filtering & Sorting](filtering-sorting.md#multi-column-sort-getsorts--setsorts--addsort--movesort--clearsorts) |

## Presentation

| Feature | Option / API | Guide |
|---|---|---|
| Theme object and CSS custom properties | `theme`, `--jhg-*` | [Themes](theming.md) |
| Changing the theme at runtime | `setTheme()`, `getTheme()` | [Themes](theming.md#changing-the-theme-at-runtime-settheme--gettheme) |
| Conditional row and cell styling | `rowHighlighter`, `cellBackground` | [Themes](theming.md#conditional-styling-rowhighlighter--cellbackground) |
| Cell decorators and tooltips | `cellDecorator`, `cellTooltip` | [Themes](theming.md#cell-decorator--tooltip-celldecorator--celltooltip) |
| Row, column and cell context menus | `rowContextMenuItems` and friends | [Context Menus](context-menus.md) |

## State, saving and output

| Feature | Option / API | Guide |
|---|---|---|
| Snapshot and restore layout | `getState()`, `setState()` | [State & Saving](state-and-saving.md#state-snapshotrestore-getstate--setstate) |
| Rows addressed by key | `getRowIndexByKey()`, `setCellValueByKey()` | [State & Saving](state-and-saving.md#rows-by-their-key-getrowindexbykey--getrowdatabykey--setcellvaluebykey) |
| Typed edits at the save boundary | `getEdits({ typed: true })`, `columnDefs[].parse` | [State & Saving](state-and-saving.md#typed-and-keyed-edits-getedits-options) |
| Read unsaved edits | `getEdits()` | [Methods](reference-methods.md#getedits) |
| A row's edits, before and after | `getRowChanges()` | [Rows](rows.md#a-rows-edits-before-and-after-getrowchanges) |
| Undo one row's edits | `revertRow()` | [State & Saving](state-and-saving.md#undoing-one-rows-edits-revertrow) |
| Save row by row | `acknowledgeSave()`, `isNewRow()` | [State & Saving](state-and-saving.md#incremental-save-getoriginalrowdata--isnewrow--acknowledgesave--acknowledgeinsert) |
| Save in one batch, keyed by row | `rowKey`, `getChanges()` | [State & Saving](state-and-saving.md#batch-save-rowkey--getchanges--acknowledgechanges) |
| CSV export and print preview | `exportCsv()`, `printGrid()` | [Export & Print](export.md) |

## Platform

| Feature | Option / API | Guide |
|---|---|---|
| Korean, Japanese, Chinese locales | `locale` | [Localization](i18n.md) |
| Every string translatable | `i18n` | [Localization](i18n.md#text-reference-i18n) |
| Keyboard navigation and remappable shortcuts | `keyMap` | [Interaction](interaction.md) |
| ARIA structure, live region, reduced motion, high contrast | `ariaLabel` | [Interaction](interaction.md#accessibility) |
| Screen-reader table navigation | `ariaRowMirror` | [Interaction](interaction.md#accessibility) |
| Runtime event subscription | `on()`, `off()`, `listenerCount()` | [Callbacks](reference-callbacks.md#subscribing-at-runtime-on--off) |
| Third-party extensions | `JHGrid.use()` | [Options](reference-options.md#plugins-jhgriduse) |
| Supported browsers | - | [Browser Support](browser-support.md) |
| Million-row budgets and tuning | `chunkSize`, `maxCachedChunks`, `fullScanPageSize` | [Performance](performance.md) |
