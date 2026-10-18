---
title: Options
parent: Reference
nav_order: 1
description: Every JHGrid data grid constructor option and column definition property, with its type, default value and the guide that explains it.
---

# Options

Every option the constructor takes, with its type, its default and the guide page that explains it.


## Constructor Options

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `string \| Element` | **required** | CSS selector or DOM element |
| `fetchMeta` | `async (state?) => GridMeta` | one of these four required | Returns total row count and column list. Used together with `fetchData` — see [fetchMeta](data-source.md#fetchmeta) |
| `fetchData` | `async (page, size, state?) => GridData` | one of these four required | Returns a page of row data. Used together with `fetchMeta` — see [fetchData](data-source.md#fetchdata) |
| `fetchPage` | `async (page, size, state?) => GridData & { totalRows, columns? }` | one of these four required | Single-callback alternative to `fetchMeta`+`fetchData` for a backend that returns both together: see [`fetchPage`](data-source.md#fetchpage-single-callback-alternative) |
| `data` | `object[]` | one of these four required | In-memory array, a convenience alternative to `fetchMeta`/`fetchData`/`fetchPage`, see [Local Array Data](data-source.md#local-array-data-data) |
| `width` | `number` | `1200` (fallback when the container has no CSS size) | Grid width in CSS pixels. Setting this (or `height`) turns `responsive` off by default — see [Responsive sizing](columns.md#responsive-sizing-responsive) |
| `height` | `number` | `700` (fallback when the container has no CSS size) | Grid height in CSS pixels. Setting this (or `width`) turns `responsive` off by default — see [Responsive sizing](columns.md#responsive-sizing-responsive) |
| `rowHeight` | `number` | `28` | Row height in CSS pixels |
| `colWidth` | `number` | `130` | Column width in CSS pixels |
| `headerHeight` | `number` | `30` | Header row height in CSS pixels |
| `wrapHeader` | `boolean` | `false` | When `true`, header labels wrap onto multiple lines instead of being ellipsis-clipped |
| `wrapCells` | `boolean` | `false` | When `true`, cell text wraps at the column's width instead of being ellipsis-clipped, breaking a word that is wider than the column. The row height does not change on its own — see [Wrapped Cells and Auto Row Height](rows.md#wrapped-cells-and-auto-row-height-wrapcells--autorowheight) |
| `summaryRow` | `object | boolean` | `undefined` | A grand total row pinned above or below the data: `{ position, aggregates, label, labelField, background, maxRows, allowPartial, rows, excludeRow }` — see [Summary Row](rows.md#summary-row-summaryrow) |
| `autoRowHeight` | `boolean` | `false` | When `true`, every loaded row takes the height its tallest cell needs: wrapped lines with `wrapCells`, explicit line breaks without it. Above 5,000 rows it measures a window around the viewport instead of every row — see [Wrapped Cells and Auto Row Height](rows.md#wrapped-cells-and-auto-row-height-wrapcells--autorowheight) |
| `hoverFadeMs` | `number` | `110` | Fade duration (ms) for the row-hover highlight's entrance/exit. `0` = instant. Forced to `0` under `prefers-reduced-motion: reduce` |
| `selectionMoveMs` | `number` | `90` | Travel time (ms) for the selection box moving to a new cell/range. Snaps instead of easing during an active drag. `0` disables it |
| `scrollEaseMs` | `number` | `120` | Glide length (ms) for mouse-wheel scrolling. Sub-row deltas (precision trackpads) are applied immediately regardless |
| `columnSlideMs` | `number` | `220` | Travel time (ms) for columns displaced by a column-header drag-reorder. `0` puts them straight into place |
| `scrollbarSize` | `number` | `12` | Scrollbar thickness in CSS pixels |
| `chunkSize` | `number` | `300` | Rows fetched per API request |
| `maxCachedChunks` | `number` | `50` | Maximum number of chunks kept in memory (LRU) |
| `pagination` | `{ enabled, pageSize?, pageSizeOptions?, pageSizePosition? }` | `undefined` | When set, switches from continuous virtual scrolling to classic paging (fixed-size pages + a pager bar at the bottom). `pageSize` is the starting rows per page (default `50`) and takes priority over `chunkSize` when set. `pageSizeOptions` (e.g. `[25, 50, 100]`) adds a page-size dropdown to the pager bar, on the side `pageSizePosition` names (`'left'` by default, or `'right'`) — see [Pagination](pagination.md#pagination) |
| `frozenCols` | `number` | `0` | Number of columns frozen from the left. Frozen columns always stay visible during horizontal scroll |
| `frozenColsRight` | `number` | `0` | Number of columns frozen from the right |
| `pinnedTopRows` | `object[]` | `undefined` | Row-data snapshots pinned above the scrollable area, always visible regardless of scroll/sort/filter — see [Pinned Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| `pinnedBottomRows` | `object[]` | `undefined` | Row-data snapshots pinned below the scrollable area (e.g. a totals/summary row) — see [Pinned Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| `editableCols` | `string[] \| '*'` | `[]` | List of editable columns. All columns are readonly if omitted; `'*'` makes all columns editable. Changeable on a live grid via `setOptions()` — see [Context Menus / setOptions](context-menus.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions) |
| `rowKey` | `string` | `undefined` | The column that uniquely identifies a row (e.g. `'id'`). Required by `getChanges()`, which reports changed rows by this value instead of by row number — row numbers move whenever the grid is sorted or filtered, a key does not. See [Batch Save](state-and-saving.md#batch-save-rowkey--getchanges--acknowledgechanges) |
| `keyboardShortcuts` | `{ delete?, cut?, undo?, redo? }` | `undefined` (all on) | Switches built-in keys off with `false`: `delete` (`Delete`/`Backspace` clears the selection), `cut` (`Ctrl+X` copies the selection and clears it), `undo` (`Ctrl+Z`), `redo` (`Ctrl+Y` / `Ctrl+Shift+Z`) — see [`undo()` / `redo()`](reference-methods.md#undo--redo) |
| `deleteMode` | `'mark' \| 'permanent'` | `'mark'` | What `deleteRow()` does to a **server** row when the call doesn't say: `'mark'` dims it with a strikethrough and keeps it on screen (reported by `getDeletedRows()`); `'permanent'` removes it from the screen immediately (reported by `getRemovedRows()`). Either way the server itself is untouched; the grid only records the choice. `deleteRow(i, { permanent })` overrides this per call — see [Adding/Deleting Rows](rows.md#addingdeleting-rows-addrow--deleterow) |
| `rowContextMenuItems` | `false \| string[]` | `undefined` (all shown) | Narrows which items appear in the row-number gutter's right-click menu. `false` disables it entirely; an array keeps only the named keys: `'row-pin'`, `'row-insert-above'`, `'row-insert-below'`, `'row-insert-top'`, `'row-insert-bottom'`, `'row-delete'`, `'row-hide'`. `'row-delete'` covers mark/permanent/undelete together, `'row-hide'` covers hide and show-all, and `'row-pin'` covers pin-to-top, pin-to-bottom and unpin, since which of them renders is row state, not a host choice. See [Context menus](context-menus.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions) |
| `colContextMenuItems` | `false \| string[]` | `undefined` (all shown) | Narrows which items appear in the column header's right-click menu. Same shape as `rowContextMenuItems`. Valid keys: `'freeze'`, `'freeze-right'`, `'visibility'`, `'insert-left'`, `'insert-right'`, `'delete'` |
| `cellContextMenuItems` | `false \| string[]` | `undefined` (all shown) | Narrows which items appear in the plain-cell right-click menu. Valid keys: `'col-insert-left'`, `'col-insert-right'`, `'col-delete'`, `'row-insert-below'`, `'row-delete'` |
| `cellContextMenuExtraItems` | `(ctx) => {label, onClick, disabled?}[] \| null` | `undefined` | Adds custom items to the plain-cell right-click menu, after whichever built-ins `cellContextMenuItems` left in place. Called fresh every time the menu opens for a cell; `ctx` carries `row`/`col`/`field`/`rowData`/`clientX`/`clientY` |
| `rowPinButton` | `boolean \| 'top' \| 'bottom'` | `false` | Draws a pin toggle at the right edge of the row-number gutter: one click pins a copy of the row (to the top band for `true`/`'top'`, to the bottom band for `'bottom'`), another click on a pinned row removes the copy. Ignored, with a console warning, while `showRowNumbers` is `false`. Can be changed later with [`setOptions()`](context-menus.md#context-menus-rowcontextmenuitems--colcontextmenuitems--cellcontextmenuitems--setoptions) - see [Pinned Rows](rows.md#pinned-rows-pinnedtoprows--pinnedbottomrows--pinrow) |
| `columnDefs` | `ColumnDef[]` | `undefined` | Per-column definitions: type, editor, validation and the rest — see [Column Definition](#column-definition-reference) |
| `headerRows` | `HeaderRowDef[][]` | `undefined` | Explicitly defines multi-level header groups. Takes priority over auto-generation from `columnDefs[].group` when set — see [Multi-Level Header Groups](columns.md#multi-level-header-groups-columndefsgroup) |
| `lockHeaderGroups` | `boolean` | `false` | Keeps header groups whole while a column is dragged: a grouped column moves only within its group, and an outsider cannot be dropped into the middle of one - see [Multi-Level Header Groups](columns.md#multi-level-header-groups-columndefsgroup) |
| `columnLetterHeader` | `boolean` | `false` | Adds an Excel-style A/B/C/... row above the normal header row(s), one non-interactive cell per column (no sort/filter/checkbox) |
| `showRowNumbers` | `boolean` | `true` | Shows a row-number column on the left. Required for `rowReorder` |
| `rowNumberWidth` | `number` | `50` | Width of the row-number column, in pixels |
| `hiddenColumns` | `string[]` | `undefined` | Fields to hide on initial render — see [Hiding Columns](columns.md#addingdeletinghiding-columns-addcolumn--deletecolumn--hidecolumn) |
| `stretchColumns` | `'none' \| 'last' \| 'all'` | `'none'` | What to do with the space left over when the columns do not fill the grid - see [Filling the width](columns.md#filling-the-width-stretchcolumns) |
| `responsive` | `boolean` | `true` when neither `width` nor `height` is given, else `false` | Sizes the grid to its container and follows it when the container resizes, via `ResizeObserver` (ignored in unsupported browsers). While it is on, `width` and `height` are ignored with a console warning: give the container element a CSS size instead - see [Responsive sizing](columns.md#responsive-sizing-responsive) |
| `rowSelection` | `'none' \| 'single' \| 'multi'` | `'none'` | Row selection mode. Rows are selected by click (plus `Ctrl`/`Shift` for multi-select) — see [Row Selection](selection.md#row-selection-rowselection--header-checkbox) |
| `rowReorder` | `boolean` | `false` | Enables dragging rows by the row-number gutter to reorder them. Scans the entire dataset once when enabled — see [Row Drag Reorder](rows.md#row-drag-reorder-rowreorder) |
| `rowDragGroup` | `string` | `undefined` | Name shared with other grids: a row can be dragged by the gutter from any grid carrying it onto any other - see [Dragging Rows Between Grids](rows.md#dragging-rows-between-grids-rowdraggroup) |
| `fullScanConcurrency` | `number` | auto (`navigator.hardwareConcurrency` clamped to `[2, 8]`) | Worker-pool size for the full-dataset scan `rowReorder` runs via `fetchData` — see [Row Drag Reorder](rows.md#row-drag-reorder-rowreorder) |
| `fullScanPageSize` | `number` | falls back to `chunkSize` | Page size used by that same full-dataset scan — see [Row Drag Reorder](rows.md#row-drag-reorder-rowreorder) |
| `theme` | `object` | See [Themes](theming.md) | Partial theme override |
| `locale` | `string` | `'en-US'` | BCP-47 tag. Sets both the built-in UI text pack (e.g. `KO_I18N`) and the default locale for `CellRenderers.number/date/currency` — see [Localization](i18n.md#locale--internationalization-locale--i18n) |
| `i18n` | `object` | `undefined` | Per-key overrides layered on top of the text pack selected by `locale` — see [Localization](i18n.md#locale--internationalization-locale--i18n) |
| `ariaLabel` | `string` | `undefined` | `aria-label` of the grid container (defaults to `i18n.ariaGrid` if omitted) |
| `ariaRowMirror` | `boolean | { maxCells?: number }` | `true` | Mirrors the rows on screen into real DOM so a screen reader can walk the table with its own keys - see [Accessibility](interaction.md#accessibility) |
| `confirmUnsaved` | `(message) => boolean` | `undefined` | Answers the "unsaved edits will be discarded" prompt a filter/sort change raises, in place of `window.confirm`. Returning `true` discards them. Must answer synchronously - see [Field-Based Filter / Sort](filtering-sorting.md#field-based-filter--sort-setfilter--setsort) |
| `rowHighlighter` | `(rowData, rowIndex) => string \| null` | `undefined` | Callback that conditionally sets a row's background color. Called on every render — see [Conditional Styling](theming.md#conditional-styling-rowhighlighter--cellbackground) |
| `cellBackground` | `(rowData, rowIndex, field, colIndex) => string \| null` | `undefined` | Callback that conditionally sets a cell's background color. Painted above `rowHighlighter` and below cell content — see [Conditional Styling](theming.md#conditional-styling-rowhighlighter--cellbackground) |
| `cellDecorator` | `(ctx, args) => void` | `undefined` | Draws directly on the canvas on top of a cell's content, for a small mark, icon, or badge. Called for every visible, loaded cell on every render (`ctx` is the `CanvasRenderingContext2D`; `args` adds `field` to the usual `x`/`y`/`w`/`h`/`rowIndex`/`colIndex` renderer args). Exceptions are caught and logged, and don't interrupt rendering |
| `cellTooltip` | `(rowData, rowIndex, field, colIndex) => string \| null` | `undefined` | Custom tooltip text shown immediately (no hover delay) while the pointer idles over a cell. Takes priority over the built-in overflow-text tooltip, but a validation error on the cell still wins over this |
| `fetchFilterValues` | `async (field, query) => (string \| number \| null)[]` | `undefined` | Supplies the value suggestions for a column's tag filter, given the column and what the user typed. Without it the tag filter can only suggest values found in the rows currently loaded: see [Tag Filter](filtering-sorting.md#tag-filter-fetchfiltervalues) |
| `filterValueMinChars` | `number` | `2` | How many characters the tag filter waits for before it looks values up (through `fetchFilterValues`, or in the loaded rows when that is not set). One character against a large column is the most expensive question it can ask and the least useful answer it can get. `1` restores single-character lookups - see [Tag Filter](filtering-sorting.md#tag-filter-fetchfiltervalues) |

The 19 `on*` callbacks are options too, listed on their own page: [Callbacks](reference-callbacks.md).

---

## Column Definition Reference

Every entry in `columnDefs` is one `ColumnDef`. Most fields have a guide of their own
(`type`/`editor` under [Column Types](renderers-editors.md#column-types-date--richtext--image-and-custom-editorsrenderers),
`validation` under [Validation](editing.md#validation-columndefsvalidation) and
[`isValid()`/`getInvalidCells()`/`validateAll()`](reference-methods.md#isvalid--getinvalidcells--validateall),
`button` under [Button Columns](cell-types.md#button-columns-type-button), `headerCheckbox` under
[Row Selection](selection.md#row-selection-rowselection--header-checkbox), `group` under
[Multi-Level Header Groups](columns.md#multi-level-header-groups-columndefsgroup)); this table is the
complete field list in one place.

| Field | Type | Description |
|---|---|---|
| `field` | `string` | **Required.** The data key this column reads/writes |
| `label` | `string` | Header text. Defaults to `field` |
| `align` | `'left' \| 'center' \| 'right'` | Cell content alignment |
| `headerAlign` | `'left' \| 'center' \| 'right'` | Header label alignment. Defaults to `align` when omitted |
| `width` | `number` | Column width in CSS pixels. Falls back to `opts.colWidth` |
| `group` | `string \| string[]` | Group-header path (outermost → innermost). See [Multi-Level Header Groups](columns.md#multi-level-header-groups-columndefsgroup) |
| `type` | `'text' \| 'dropdown' \| 'multiselect' \| 'checkbox' \| 'radio' \| 'button' \| 'date' \| 'richtext' \| 'image'` | Selects the built-in editor + renderer pair. Defaults to `'text'`. See [Column Types](renderers-editors.md#column-types-date--richtext--image-and-custom-editorsrenderers) |
| `renderer` | `string \| (ctx, args) => void` | A `CellRenderers` key, or a custom draw function. Overrides the renderer `type` would otherwise select |
| `editor` | `string \| (ctx) => {value, remove}` | A `CellEditors` key, or a custom editor factory. Overrides the editor `type` would otherwise select. `ctx` carries the anchored-DOM surfaces a custom editor mounts its UI with - see [Editor surfaces](renderers-editors.md#editor-surfaces-ctxcellbox--ctxpopup--ctxdone) |
| `editorOptions` | `object` | Options for the column's built-in editor: the one `editor` names, or the one `type` selects (`'date'`, `'dropdown'`, `'multiselect'`, `'richtext'`). See [Editor options](editing.md#editor-options-columndefseditoroptions) |
| `format` | `string` | Date format for `type: 'date'` columns (e.g. `'YYYY-MM-DD'`, `'YY/MM/DD'`, `'YYYY-MM-DD HH:mm'`), or `'locale'` to write the date the way the grid's `locale` does (the editor is then the native date picker, see [`type: 'date'`](cell-types.md#date-columns-type-date)). With a pattern it drives the cell text, the editor's input mask, validation, clipboard copy, CSV export and printing. Default: the locale's own pattern - `'MM/DD/YYYY'` for `en`, `'YYYY-MM-DD'` for `ko`, `'YYYY/MM/DD'` for `ja` and `zh`, overridable for the whole grid with [`i18n.dateFormat`](i18n.md#text-reference-i18n) |
| `options` | `DropdownOption[] \| (rowData) => DropdownOption[]` | Option list for `type: 'dropdown'`/`'multiselect'`/`'radio'`: a string array, `{value,label}` array, or a function computing options per row. The cell stores the option's `value`; see [Dropdown and multiselect](cell-types.md#dropdown-and-multiselect-columns-type-dropdown--multiselect) |
| `editable` | `boolean` | Per-column override of `opts.editableCols`, in either direction: `true` makes the column editable even when `editableCols` leaves it out, `false` makes it read-only even under `editableCols: '*'`. Omit it to follow `editableCols` |
| `parse` | `(value, rowData, field) => unknown` | Turns this column's text back into the type you want, at the save boundary only: [`getChanges()`](state-and-saving.md#batch-save-rowkey--getchanges--acknowledgechanges) and `getEdits({ typed: true })` run it |
| `validation` | `ColumnValidation` | Declarative required/pattern/min/max/length/custom rules: see [Validation](editing.md#validation-columndefsvalidation) |
| `button` | `ButtonColumnDef` | Button config for `type: 'button'`: see [Button Columns](cell-types.md#button-columns-type-button) |
| `cellButton` | `{ width?, icon?, style?, iconSize?, iconColor?, onClick }` | A small click hotspot pinned to the cell's right edge, whatever the column's `type`: see [Cell Buttons](cell-types.md#cell-buttons-columndefscellbutton) |
| `headerCheckbox` | `boolean` | Draws a select-all checkbox in this column's header: see [Row Selection](selection.md#row-selection-rowselection--header-checkbox) |

---

## Plugins (`JHGrid.use`)

`JHGrid.use(plugin)` installs a plugin, an object whose optional `install(JHGrid)` runs once and whose
other members the grid calls where it supports them. Installing the same object again does nothing.
Row selection and pinned rows are built in this way, and a plugin package installs itself when you
import it, so an application normally never calls `use()` at all.

## Exports

Besides `JHGrid`, the package exports:

| Export | What it is |
|---|---|
| `CellRenderers`, `registerCellRenderer` | The built-in renderers and the way to add one |
| `CellEditors`, `registerCellEditor` | The built-in editors and the way to add one |
| `KO_I18N`, `JA_I18N`, `ZH_I18N` | The bundled text packs, see [Text Reference](i18n.md#text-reference-i18n) |
| `GRID_CLASSES` | The class names of the DOM surfaces, see [Themes](theming.md#styling-with-your-own-css) |
| `VERSION` | The package version, as a string |
| `SUPPORTED_BROWSERS` | The minimum browser versions, see [Browser Support](browser-support.md) |
| `Renderer`, `DataManager`, `DEFAULT_THEME`, `computeHeaderCells`, `BuiltinRenderers` | Low-level pieces, see [Architecture](architecture.md#advanced--low-level-exports) |

With the CDN build the `JHGrid` global is the grid constructor, and the rest hang off it
(`JHGrid.CellRenderers`, `JHGrid.KO_I18N`, ...). Before 0.3.4 the global held the exports instead,
so the grid was built with `new JHGrid.JHGrid({ ... })`; that form still works.
