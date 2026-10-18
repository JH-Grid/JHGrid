---
title: API Reference (index)
parent: Reference
nav_exclude: true
nav_order: 9
description: Index of every JHGrid data grid option, method and feature, pointing at the page that documents it.
---

# API Reference (index)

This page used to be the whole API reference. It is an index now: every heading below still
answers to the link it has always had, and points at the page that holds it.

To look something up by name, go to [Options](reference-options.md) or
[Methods](reference-methods.md). To find the guide behind a feature, go to
[Features](features.md).

---

## Constructor Options

[Options](reference-options.md#constructor-options)

---

## Data Source Interface

[Data Source](data-source.md#data-source-interface)

### `fetchMeta`

[Data Source](data-source.md#fetchmeta)

### `fetchData`

[Data Source](data-source.md#fetchdata)

### `fetchPage`: single-callback alternative

[Data Source](data-source.md#fetchpage-single-callback-alternative)

### Local Array Data (`data`)

[Data Source](data-source.md#local-array-data-data)

---

## Column Definition Reference

[Options](reference-options.md#column-definition-reference)

---

## Public Methods

[Methods](reference-methods.md#public-methods)

### `refresh()`

[Methods](reference-methods.md#refresh)

### `reloadData()`

[Methods](reference-methods.md#reloaddata)

### `repaint()`

[Methods](reference-methods.md#repaint)

### `scrollTo(rowIndex)`

[Methods](reference-methods.md#scrolltorowindex)

### `goToPage(page)` / `nextPage()` / `prevPage()`

[Methods](reference-methods.md#gotopagepage--nextpage--prevpage)

### `getCurrentPage()` / `getPageCount()`

[Methods](reference-methods.md#getcurrentpage--getpagecount)

### `setPageSize(n)` / `getPageSize()`

[Methods](reference-methods.md#setpagesizen--getpagesize)

### `getEdits()`

[Methods](reference-methods.md#getedits)

### `clearEdits()`

[Methods](reference-methods.md#clearedits)

### `setCellValue(row, field, value)`

[Methods](reference-methods.md#setcellvaluerow-field-value)

### `setCellValues(entries)`

[Methods](reference-methods.md#setcellvaluesentries)

### `undo()` / `redo()`

[Methods](reference-methods.md#undo--redo)

### `isValid()` / `getInvalidCells()` / `validateAll()`

[Methods](reference-methods.md#isvalid--getinvalidcells--validateall)

### `getRowData(rowIndex)` / `ready()`

[Methods](reference-methods.md#getrowdatarowindex--ready)

### `destroy()`

[Methods](reference-methods.md#destroy)

---

## Features

[Features](features.md#features)

---

### Pagination

[Pagination](pagination.md#pagination)

### Letting users pick the page size

[Pagination](pagination.md#letting-users-pick-the-page-size)

---

### Button Columns (`type: 'button'`)

[Cell Types](cell-types.md#button-columns-type-button)

### Cell Buttons (`columnDefs[].cellButton`)

[Cell Types](cell-types.md#cell-buttons-columndefscellbutton)

---

### Row Selection (`rowSelection`) / Header Checkbox

[Selection](selection.md#row-selection-rowselection--header-checkbox)

### Selection, Focus and Editing from Code (`getSelection` / `setSelection` / `focusCell` / `startEditing` / `stopEditing`)

[Selection](selection.md#selection-focus-and-editing-from-code-getselection--setselection--focuscell--startediting--stopediting)

---

### Context Menus (`rowContextMenuItems` / `colContextMenuItems` / `cellContextMenuItems` / `setOptions`)

[Context Menus](context-menus.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions)

---

### Set Filter / Quick Filter

[Filtering & Sorting](filtering-sorting.md#set-filter--quick-filter)

### Tag Filter (`fetchFilterValues`)

[Filtering & Sorting](filtering-sorting.md#tag-filter-fetchfiltervalues)

### Field-Based Filter / Sort (`setFilter` / `setSort`)

[Filtering & Sorting](filtering-sorting.md#field-based-filter--sort-setfilter--setsort)

### Multi-Column Sort (`getSorts` / `setSorts` / `addSort` / `moveSort` / `clearSorts`)

[Filtering & Sorting](filtering-sorting.md#multi-column-sort-getsorts--setsorts--addsort--movesort--clearsorts)

---

### Adding/Deleting Rows (`addRow` / `deleteRow`)

[Rows](rows.md#addingdeleting-rows-addrow--deleterow)

### Hiding Rows (`hideRow` / `showRow` / `showAllRows`)

[Rows](rows.md#hiding-rows-hiderow--showrow--showallrows)

---

### Adding/Deleting/Hiding Columns (`addColumn` / `deleteColumn` / `hideColumn`)

[Columns](columns.md#addingdeletinghiding-columns-addcolumn--deletecolumn--hidecolumn)

---

### Row Height (`setRowHeight` / `autoFitColumns`)

[Rows](rows.md#row-height-setrowheight--autofitcolumns)

---

### Responsive Sizing (`responsive`)

[Columns](columns.md#responsive-sizing-responsive)

### Filling the Width (`stretchColumns`)

[Columns](columns.md#filling-the-width-stretchcolumns)

### Frozen Columns (`frozenCols` / `frozenColsRight`)

[Columns](columns.md#frozen-columns-frozencols--frozencolsright)

---

### Pinned Rows (`pinnedTopRows` / `pinnedBottomRows` / `pinRow`)

[Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow)

---

### State Snapshot/Restore (`getState` / `setState`)

[State & Saving](state-and-saving.md#state-snapshotrestore-getstate--setstate)

### Incremental Save (`getOriginalRowData` / `isNewRow` / `acknowledgeSave` / `acknowledgeInsert`)

[State & Saving](state-and-saving.md#incremental-save-getoriginalrowdata--isnewrow--acknowledgesave--acknowledgeinsert)

### Batch Save (`rowKey` / `getChanges()` / `acknowledgeChanges()`)

[State & Saving](state-and-saving.md#batch-save-rowkey--getchanges--acknowledgechanges)

---

### Multi-Level Header Groups (`columnDefs[].group`)

[Columns](columns.md#multi-level-header-groups-columndefsgroup)

### Column Letter Header (`columnLetterHeader`)

[Columns](columns.md#column-letter-header-columnletterheader)

---

### Locale / Internationalization (`locale` / `i18n`)

[Localization](i18n.md#locale--internationalization-locale--i18n)

### Text Reference (`i18n`)

[Localization](i18n.md#text-reference-i18n)

---

### Conditional Styling (`rowHighlighter` / `cellBackground`)

[Themes](theming.md#conditional-styling-rowhighlighter--cellbackground)

### Cell Decorator / Tooltip (`cellDecorator` / `cellTooltip`)

[Themes](theming.md#cell-decorator--tooltip-celldecorator--celltooltip)

---

### Row Drag Reorder (`rowReorder`)

[Rows](rows.md#row-drag-reorder-rowreorder)

---

### Built-in Cell Renderers (`CellRenderers`)

[Renderers & Custom Editors](renderers-editors.md#built-in-cell-renderers-cellrenderers)

### Column Types: `date` / `richtext` / `image`, and Custom Editors/Renderers

[Renderers & Custom Editors](renderers-editors.md#column-types-date--richtext--image-and-custom-editorsrenderers)

---

### Text Cells and Line Breaks

[Editing](editing.md#text-cells-and-line-breaks)

---

### Checkbox Columns (`type: 'checkbox'`)

[Cell Types](cell-types.md#checkbox-columns-type-checkbox)

### Date Columns (`type: 'date'`)

[Cell Types](cell-types.md#date-columns-type-date)

### Radio Columns (`type: 'radio'`)

[Cell Types](cell-types.md#radio-columns-type-radio)

### Dropdown and Multiselect Columns (`type: 'dropdown'` / `'multiselect'`)

[Cell Types](cell-types.md#dropdown-and-multiselect-columns-type-dropdown--multiselect)

---

### Editor Options (`columnDefs[].editorOptions`)

[Editing](editing.md#editor-options-columndefseditoroptions)

### Validation (`columnDefs[].validation`)

[Editing](editing.md#validation-columndefsvalidation)

---

### Data Export (`exportCsv` / `printGrid`)

[Export & Print](export.md#data-export-exportcsv--printgrid)

---

### Plugins (`JHGrid.use`)

[Options](reference-options.md#plugins-jhgriduse)

---

### Accessibility

[Interaction Reference](interaction.md#accessibility)

---

### Exports

[Options](reference-options.md#exports)
