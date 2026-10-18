
export interface GridTheme {
  headerBg?:       string;
  headerText?:     string;
  headerBorder?:   string;
  rowEven?:        string;
  rowOdd?:         string;
  cellBorder?:     string;
  cellText?:       string;
  loadingText?:    string;
  skeletonBar?:    string;
  skeletonSheen?:  string;
  cellPadding?:    number;
  selectionColor?: string;
  selectionFill?:  string;
  selRowBg?:       string;
  hoverRowBg?:     string | null;
  scrollbarBg?:    string;
  scrollbarThumb?: string;
  scrollbarArrow?: string;
  scrollbarRadius?:number;
  frozenBorder?:   string;
  filterIconBg?:   string;
  sortIconBg?:     string;
  filterIconColor?:    string;
  sortIconColor?:      string;
  headerIconColor?:    string;
  hiddenColIndicator?: string;
  editableCellBg?:    string;
  readonlyCellBg?:    string;
  imagePlaceholderBg?: string;
  imageErrorBg?:       string;
  imageErrorIcon?:     string;
  fontSize?:       number;
  headerFontSize?: number;
  fontFamily?:     string;
  locale?:         string;

  invalidCellBorder?: string;

  deletedRowFill?:    string;
  deletedRowStrike?:  string;

  dragGhostShadow?:   string;
  dragIndicatorFill?: string;
  dragIndicatorLine?: string;

  overlayBg?:          string;
  overlayBorder?:      string;
  overlayHeaderBg?:    string;
  overlayDivider?:     string;
  overlayText?:        string;
  overlayMutedText?:   string;
  overlayHintText?:    string;
  overlayHoverBg?:     string;
  overlayItemHoverBg?: string;
  overlayShadow?:      string;
  overlayMenuShadow?:  string;
  overlayAccentText?:  string;

  pagerBg?:           string;
  pagerText?:         string;
  pagerBorder?:       string;
  pagerButtonBg?:     string;
  pagerButtonBorder?: string;
}


export interface CellTextOptions {
  /** Defaults to the column's own align. */
  align?:   'left' | 'center' | 'right';
  color?:   string;
  /** px size, keeps the theme font family. Ignored when `font` is given. */
  size?:    number;
  bold?:    boolean;
  /** Full CSS font shorthand, overrides `size`/`bold`. */
  font?:    string;
  padding?: number;
}

export interface CellRendererArgs {
  x:        number;
  y:        number;
  w:        number;
  h:        number;
  value:    unknown;
  rowData:  Record<string, unknown>;
  rowIndex: number;
  colIndex: number;
  theme:    Required<GridTheme>;
  padding:  number;
  /**
   * Draws text in the current cell: column alignment, vertical centring and ellipsis
   * clipping are handled, so no coordinates are needed. Only valid synchronously,
   * while the renderer runs.
   */
  text:     (str: unknown, opts?: CellTextOptions) => void;
}

export type CellRendererFn = (ctx: CanvasRenderingContext2D, args: CellRendererArgs) => void;


export interface CellContextMenuItemContext {
  row:      number;
  col:      number;
  field:    string;
  rowData:  Record<string, unknown> | null;
  clientX:  number;
  clientY:  number;
}

export interface CellContextMenuItem {
  label:     string;
  onClick:   (ctx: CellContextMenuItemContext) => void;
  disabled?: boolean;
}


/** No `text()`: it belongs to a column's renderer, which owns the cell box it draws into. A
 *  decorator draws on top of a cell that has already been drawn, on plain `ctx` with `x`/`y`/`w`/`h`.
 *  The canvas state it inherits is whatever the previous cell left, so set `textAlign`,
 *  `textBaseline` and `fillStyle` before drawing text. */
export interface CellDecoratorArgs extends Omit<CellRendererArgs, 'text'> {
  field: string;
}

export type NumberRounding = 'ceil' | 'floor' | 'expand' | 'trunc'
  | 'halfCeil' | 'halfFloor' | 'halfExpand' | 'halfEven' | 'halfTrunc';

export declare const CellRenderers: {
  progressBar(opts?: { max?: number; showLabel?: boolean }): CellRendererFn;
  badge(opts?: { colorMap?: Record<string, { bg?: string; fg?: string }> }): CellRendererFn;
  checkmark(opts?: { trueColor?: string; falseColor?: string; showFalse?: boolean }): CellRendererFn;
  image(opts?: {
    fit?: 'cover' | 'contain';
    radius?: number;
    size?: number | { width?: number; height?: number };
    align?: 'center' | 'left' | 'right';
  }): CellRendererFn;
  number(opts?: {
    locale?:   string;
    decimals?: number;
    /** Intl rounding mode. Ignored, with one console warning, where Intl.NumberFormat v3 is missing. */
    rounding?: NumberRounding;
    /** `'parens'` writes a negative as `(1,234)`. Default `'minus'`. */
    negative?: 'minus' | 'parens';
    /** Text colour for a negative value. The theme's cell text colour otherwise. */
    negativeColor?: string;
  }): CellRendererFn;
  date(opts?: { format?: string; locale?: string; dateStyle?: 'full' | 'long' | 'medium' | 'short'; align?: 'left' | 'center' | 'right' }): CellRendererFn;
  currency(opts?: {
    locale?:   string;
    currency?: string;
    /** Fraction digits, overriding the currency's own default (KRW 0, USD 2). */
    decimals?: number;
    rounding?: NumberRounding;
    negative?: 'minus' | 'parens';
    negativeColor?: string;
  }): CellRendererFn;
  link(opts?: {
    color?:      string;
    mutedColor?: string;
    underline?:  boolean;
    align?:      'left' | 'center' | 'right';
    linked?:     boolean | ((rowData: Record<string, unknown> | null) => boolean);
  }): CellRendererFn;
  dropdown(opts?: { placeholder?: string }): CellRendererFn;
  multiselect(opts?: { placeholder?: string }): CellRendererFn;
  checkbox(opts?: { checkedColor?: string; size?: number }): CellRendererFn;
  /** Radio circles drawn in the cell; the labels drop out when the column is too narrow for them. */
  radio(opts?: {
    options?: DropdownOption[] | ((rowData: Record<string, unknown>) => DropdownOption[]);
    align?: 'left' | 'center' | 'right';
    checkedColor?: string;
  }): CellRendererFn;
  button(opts?: {
    label?:    string | ((rowData: Record<string, unknown> | null, rowIndex: number) => string | null);
    disabled?: boolean | ((rowData: Record<string, unknown> | null, rowIndex: number) => boolean);
    variant?:  ButtonVariant | ((rowData: Record<string, unknown> | null, rowIndex: number) => ButtonVariant);
  }): CellRendererFn;
};

export declare function registerCellRenderer(name: string, factory: (...args: any[]) => CellRendererFn): void;

export { CellRenderers as BuiltinRenderers };


export declare const CellEditors: Record<string, (...args: any[]) => unknown>;

export declare function registerCellEditor(name: string, factory: (...args: any[]) => unknown): void;

export interface CellEditorCtx {
  row:     number;
  col:     number;
  field:   string;
  rowData: Record<string, unknown> | null;
  x:    number;
  y:    number;
  colW: number;
  rowH: number;
  wrapper:      HTMLElement;
  kbProxy:      HTMLInputElement;
  theme:        Required<GridTheme>;
  i18n:         Record<string, any>;
  columnLabel:  string;
  initialValue: string;

  commit(): void;
  cancel(): void;
  insertLineBreak(): void;
  moveSel(dr: number, dc: number): void;
  focusWrapper(): void;
  suppressReopen?(): void;

  cellBox<T extends HTMLElement = HTMLDivElement>(opts?: {
    el?:          T;
    border?:      boolean;
    interactive?: boolean;
  }): T;

  popup(opts?: {
    placement?: 'below' | 'above' | 'over';
    align?:     'left' | 'right' | 'stretch';
    minWidth?:  'cell' | number | null;
    maxHeight?: number | null;
    flip?:      boolean;
    chrome?:    boolean;
    role?:      string;
    ariaLabel?: boolean | string;
  }): HTMLDivElement;

  done(opts: {
    value: (() => unknown) | unknown;
    outside?: 'commit' | 'cancel' | 'ignore';
    keys?: {
      enter?:  'commit' | 'cancel' | 'commit-and-move' | false;
      escape?: 'commit' | 'cancel' | 'commit-and-move' | false;
      tab?:    'commit' | 'cancel' | 'commit-and-move' | false;
    };
    onKey?(e: KeyboardEvent): boolean | void;
    onCommit?(): void;
    onCancel?(): void;
  }): CellEditorEl;
}

export interface CellEditorEl {
  readonly value: string;
  remove(): void;
  commit?(): void;
  cancel?(): void;
}


export type DropdownOption = string | { value: string; label?: string };

export interface ColumnDef {
  /**
   * Turns this column's text back into the type the host wants, at the save boundary only:
   * `getChanges()` and `getEdits({ typed: true })` run it. The grid itself keeps working in text.
   */
  parse?: (value: string, rowData: Record<string, unknown> | null, field: string) => unknown;
  field:        string;
  label?:       string;
  align?:       'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  group?:       string | string[];
  width?:       number;
  renderer?:    string | CellRendererFn;
  type?:        'text' | 'dropdown' | 'multiselect' | 'checkbox' | 'radio' | 'button' | 'date' | 'richtext' | 'image';
  /** `type: 'date'`: a pattern of YYYY/YY/MM/DD/HH/mm/ss, or 'locale'. Defaults to the locale's own
   *  pattern (`i18n.dateFormat`): 'MM/DD/YYYY' for en, 'YYYY-MM-DD' for ko, 'YYYY/MM/DD' for ja/zh. */
  format?:      string;
  editor?:      string | ((ctx: CellEditorCtx) => CellEditorEl | null | undefined);
  editorOptions?: Record<string, unknown>;
  options?:     DropdownOption[] | ((rowData: Record<string, unknown>) => DropdownOption[]);
  editable?:    boolean;
  validation?:  ColumnValidation;
  button?:      ButtonColumnDef;
  cellButton?:  CellButtonDef;
  headerCheckbox?: boolean;
}

export interface CellButtonDef {
  width?:     number;
  icon?:      string;
  style?:     'plain';
  iconSize?:  number;
  iconColor?: string;
  onClick(rowIndex: number, rowData: Record<string, unknown> | null, field: string): void;
}

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'neutral';

export interface ButtonColumnDef {
  label?:    string | ((rowData: Record<string, unknown> | null, rowIndex: number) => string | null);
  onClick:   (rowIndex: number, rowData: Record<string, unknown> | null, field: string) => void;
  disabled?: boolean | ((rowData: Record<string, unknown> | null, rowIndex: number) => boolean);
  variant?:  ButtonVariant | ((rowData: Record<string, unknown> | null, rowIndex: number) => ButtonVariant);
}

export interface ColumnValidation {
  required?:    boolean;
  pattern?:     RegExp | string;
  min?:         number;
  max?:         number;
  minLength?:   number;
  maxLength?:   number;
  validator?:   (value: string, rowData: Record<string, unknown>) => boolean | string;
  message?:     string;
}


export interface HeaderRowDef {
  label?:   string;
  fields?:  string[];
  colspan?: number;
  rowspan?: number;
  align?:   'left' | 'center' | 'right';
}

export declare function computeHeaderCells(headerRows: HeaderRowDef[][] | undefined, columns: string[]): HeaderCell[];


export interface GridMeta {
  totalRows: number;
  columns:   string[];
}

export interface GridData {
  rows: Record<string, unknown>[];
}

export interface GridFilterState {
  sorts:   { field: string; dir: 'asc' | 'desc' }[];
  filters: Record<string, string | string[]>;
  quickFilter: string;
}


export interface GridState {
  columns:       string[];
  columnWidths:  Record<string, number>;
  hiddenColumns: string[];
  /** Rows the user hid, by their server index and the rowKey value they were hidden by. */
  hiddenRows: Array<{ index: number; key: unknown }>;
  frozenCols:    number;
  frozenColsRight: number;
  sorts:         { field: string; dir: 'asc' | 'desc' }[];
  filters:       Record<string, string | string[]>;
  quickFilter:   string;
  selectedRows:  number[];
  headerCheckboxState: Record<string, boolean>;
  localColumns: (Omit<ColumnDef, 'field'> & { field: string })[];
  deletedColumns: string[];
  /**
   * Columns the user resized by hand. With `stretchColumns` on they keep that width instead of
   * taking a share of the leftover space; with it off the list is informational.
   */
  userSizedColumns: string[];
  rowChanges: {
    added:   { anchor: number; data: Record<string, unknown>; edits: Record<string, string> }[];
    removed: number[];
    marked:  number[];
    edits:   Record<number, Record<string, string>>;
  };
  pinnedTopRows:    Record<string, unknown>[];
  pinnedBottomRows: Record<string, unknown>[];
}

export interface KeyboardShortcutsOptions {
  delete?: boolean;
  /** `Ctrl+X`: copies the selected range and then empties its editable cells, as one undo step. */
  cut?: boolean;
  undo?: boolean;
  redo?: boolean;
}

export type CellSelection =
  | { type: 'single'; row: number; col: number }
  | { type: 'range'; r1: number; c1: number; r2: number; c2: number };

export type CellSelectionInput =
  | { type?: 'single'; row: number; col: number | string }
  | { type?: 'range'; r1: number; c1: number | string; r2: number; c2: number | string };

export type PinnedRowPosition = 'top' | 'bottom';

export interface PinnedRowHandle {
  position: PinnedRowPosition;
  index: number;
  id: number;
}


export interface GridI18n {
  /** Default `format` of a `type: 'date'` column that sets none. A YYYY/YY/MM/DD/HH/mm/ss pattern. */
  dateFormat?:           string;
  loading?:              string;
  loadError?:            string;
  pasteTruncated?:       (n: number) => string;
  copyIncomplete?:       (n: number) => string;
  noData?:               string;
  emptyCell?:            string;
  ariaGrid?:             string;
  sortAsc?:              string;
  sortDesc?:             string;
  sortShiftHint?:        string;
  rowNumberLabel?:       string;
  filterLabel?:          string;
  filterPlaceholder?:    string;
  filterApply?:          string;
  filterReset?:          string;
  filterResetAll?:       string;
  filterClose?:          string;
  filterDialog?:         (col: string) => string;
  filterValuesLabel?:    string;
  filterSelectAll?:      string;
  filterTagPlaceholder?: string;
  filterTagLocalScope?:  string;
  filterTagNoMatch?:     string;
  filterTagMinChars?:    (n: number) => string;
  filterTagAllSelected?: string;
  filterTagMore?:        (n: number) => string;
  filterTagSelected?:    (n: number) => string;
  filterTagContains?:    (q: string) => string;
  filterTagRemove?:      (v: string) => string;
  colFreeze?:            string;
  colUnfreeze?:          string;
  colFreezeRight?:       string;
  colUnfreezeRight?:     string;
  colVisibility?:        string;
  colChooserTitle?:      string;
  colChooserApply?:      string;
  colChooserCancel?:     string;
  colChooserSelectAll?:  string;
  colInsertLeft?:        string;
  colInsertRight?:       string;
  colInsertTitle?:       string;
  colInsertPlaceholder?: string;
  colInsertConfirm?:     string;
  colInsertCancel?:      string;
  colDelete?:            string;
  colUndelete?:          string;
  rowInsertTop?:         string;
  rowInsertBottom?:      string;
  rowInsertAbove?:       string;
  rowInsertBelow?:       string;
  rowAddEnd?:            string;
  rowDelete?:            string;
  rowDeleteMark?:        string;
  rowDeletePermanent?:   string;
  rowUndelete?:          string;
  rowPinTop?:            string;
  rowPinBottom?:         string;
  rowUnpin?:             string;
  rowHide?:              string;
  rowShowAll?:           string;
  editAriaLabel?:       (col: string, row: number) => string;
  announceCell?:         (row: number, col: string, value: string) => string;
  columnHeaderAnnounce?: (col: string) => string;
  rowHeaderAnnounce?:    (row: number) => string;
  rowReorderAnnounce?:   (from: number, to: number) => string;
  rowDragOutAnnounce?:   (from: number, to: number) => string;
  sortAppliedAnnounce?:      (col: string, dir: 'asc' | 'desc') => string;
  filterAppliedAnnounce?:    (col: string) => string;
  filterClearedAnnounce?:    (col: string) => string;
  allFiltersClearedAnnounce?: string;
  rowsSelectedAnnounce?:      (n: number) => string;
  unsavedEditsWarning?:  string;
  exportCsvFilename?:    string;
  printButton?:          string;
  validationRequired?:   (col: string) => string;
  validationPattern?:    (col: string) => string;
  validationMin?:        (col: string, min: number) => string;
  validationMax?:        (col: string, max: number) => string;
  validationMinLength?:  (col: string, len: number) => string;
  validationMaxLength?:  (col: string, len: number) => string;
  validationInvalid?:    (col: string) => string;
  pagerFirst?:           string;
  pagerPrev?:            string;
  pagerNext?:            string;
  pagerLast?:            string;
  pagerPageSize?:        string;
  pagerPageLabel?:       (page: number, pageCount: number) => string;
  richtextToolbarLabel?: string;
}

export declare const KO_I18N: Required<GridI18n>;

export declare const JA_I18N: Required<GridI18n>;

export declare const ZH_I18N: Required<GridI18n>;


export interface RowRect {
  /** Top of the row's cells, relative to the grid element. */
  top:    number;
  /** Height of the cells, without any reserved strip. */
  height: number;
  /** Top of the reserved strip: `top + height`. */
  reservedTop:    number;
  /** Height of the reserved strip, `0` when the row has none. */
  reservedHeight: number;
  /** Left edge of the scrollable band, past the row numbers and frozen columns. */
  left:  number;
  /** Width of that band. */
  width: number;
  /** Whether any part of the row (cells or strip) is inside the scrollable viewport. */
  visible: boolean;
}

export interface RowDragOutEvent {
  /** The grid the row is leaving. */
  grid:     JHGrid;
  /** The grid it is going to. */
  toGrid:   JHGrid;
  rowIndex: number;
  rowData:  Record<string, unknown>;
  /** The row index it will take in `toGrid`. */
  toIndex:  number;
}

export interface RowDropInEvent {
  /** The grid receiving the row. */
  grid:     JHGrid;
  /** The grid it came from. */
  fromGrid: JHGrid;
  rowData:  Record<string, unknown>;
  toIndex:  number;
}

export interface PaginationOptions {
  enabled:   boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  pageSizePosition?: 'left' | 'right';
}


export interface JHGridOptions {
  container:        string | Element;
  /** `totalRows` must be a non-negative integer; anything else is reported on the console and treated as 0. */
  fetchMeta?:       (state?: GridFilterState | null) => Promise<GridMeta>;
  fetchData?:       (page: number, size: number, state?: GridFilterState | null) => Promise<GridData>;
  fetchPage?:       (page: number, size: number, state?: GridFilterState | null) => Promise<GridData & { totalRows: number; columns?: string[] }>;
  /** An empty array needs `columnDefs` as well, since columns cannot be derived from no rows. */
  data?:            Record<string, unknown>[]
                    | Promise<Record<string, unknown>[]>
                    | (() => Promise<Record<string, unknown>[]> | Record<string, unknown>[]);
  width?:           number;
  height?:          number;
  rowHeight?:       number;
  colWidth?:        number;
  headerHeight?:    number;
  hoverFadeMs?:     number;
  selectionMoveMs?: number;
  scrollEaseMs?:    number;
  columnSlideMs?:   number;
  wrapHeader?:      boolean;
  /**
   * Wrap cell text onto as many lines as the column's width needs, instead of clipping it with an
   * ellipsis. Explicit line breaks in a value still break lines. A word wider than the column is
   * broken across lines, so text without spaces (Korean, Japanese, Chinese) wraps too.
   *
   * The row height does not change on its own: pair it with `autoRowHeight`, or the lines past the
   * first are clipped at the row's bottom edge.
   */
  /** A grand total row pinned above or below the data. See the Rows guide. */
  summaryRow?:      SummaryRowOptions | boolean;
  wrapCells?:       boolean;
  /**
   * Give every loaded row the height its tallest cell needs - wrapped lines when `wrapCells` is on,
   * explicit line breaks otherwise. Editing a cell re-fits its row. A row the user has resized by
   * hand keeps their height.
   *
   * Up to 5,000 rows every loaded row is measured, so the scrollbar is exact. Past that the rows
   * around the viewport are measured instead and the rest keep the default height, which is what
   * keeps the row-height model sparse - the trade-off is a scrollbar that shifts a little as taller
   * rows come into view.
   */
  autoRowHeight?:   boolean;
  scrollbarSize?:   number;
  chunkSize?:       number;
  maxCachedChunks?: number;
  pagination?:      PaginationOptions;
  frozenCols?:      number;
  frozenColsRight?: number;
  pinnedTopRows?:    Record<string, unknown>[];
  pinnedBottomRows?: Record<string, unknown>[];
  keyboardShortcuts?: KeyboardShortcutsOptions;
  rowReorder?:      boolean;
  /**
   * A name shared with other grids on the page. Rows can be dragged by the row-number gutter from
   * any grid carrying this name onto any other, which adds the row there with `addRow()` and
   * deletes it here with `deleteRow()` - so each half of the move shows up in that grid's own
   * `getChanges()`. `onRowDragOut` and `onRowDropIn` can veto or rewrite the row.
   *
   * Dragging out does not need `rowReorder`: only the one row travels, not the order. Set both
   * when the same grid should also reorder within itself.
   */
  rowDragGroup?:    string;
  fullScanConcurrency?: number;
  fullScanPageSize?:    number;
  editableCols?:    string[] | '*';
  rowKey?:          string;
  deleteMode?:      'mark' | 'permanent';
  rowContextMenuItems?: false | ('row-insert-above' | 'row-insert-below' | 'row-insert-top' | 'row-insert-bottom' | 'row-delete' | 'row-pin' | 'row-hide')[];
  rowPinButton?: boolean | PinnedRowPosition;
  onRowPinToggle?: (e: {
    pinned:   boolean;
    rowIndex: number;
    position: PinnedRowPosition;
    rowData:  Record<string, unknown> | null;
    handle:   PinnedRowHandle;
  }) => void;
  colContextMenuItems?: false | ('freeze' | 'freeze-right' | 'visibility' | 'insert-left' | 'insert-right' | 'delete')[];
  cellContextMenuItems?: false | ('col-insert-left' | 'col-insert-right' | 'col-delete' | 'row-insert-below' | 'row-delete')[];
  cellContextMenuExtraItems?: (ctx: CellContextMenuItemContext) => CellContextMenuItem[] | null | undefined;
  columnDefs?:      ColumnDef[];
  headerRows?:      HeaderRowDef[][];
  /**
   * Keeps header groups whole while the user drags a column: a grouped column can only move within
   * its own group, and a column from outside cannot be dropped into the middle of one. Off by
   * default, where a drag may split a group apart.
   */
  lockHeaderGroups?: boolean;
  columnLetterHeader?: boolean;
  showRowNumbers?:  boolean;
  rowNumberWidth?:  number;
  responsive?:      boolean;
  /**
   * What to do with the space left over when the columns do not fill the grid. `'last'` gives it
   * to the last scrollable column, `'all'` splits it between the columns in proportion to their
   * widths, `'none'` (the default) leaves it blank. Frozen columns and columns the user has
   * resized by hand keep their own width either way. With it on, `getState().columnWidths`
   * reports those own widths rather than the stretched ones, so a layout saved on a wide screen
   * restores correctly on a narrow one.
   */
  stretchColumns?:  'none' | 'last' | 'all';
  rowSelection?:    'none' | 'single' | 'multi';
  hiddenColumns?:   string[];
  theme?:           GridTheme;
  locale?:          string;
  i18n?:            GridI18n;
  ariaLabel?:       string;
  /**
   * Mirrors the rows on screen into real DOM, so a screen reader can walk the table with its own
   * keys instead of only hearing the active cell. On by default; `false` turns it off, and
   * `{ maxCells }` (default 2000) is where a very wide grid stops paying for it.
   */
  ariaRowMirror?:   boolean | { maxCells?: number };
  /**
   * Answers the "unsaved edits will be discarded" prompt that a filter, sort or quick-filter
   * change raises, in place of `window.confirm`. Return `true` to go ahead and discard them.
   * It has to answer synchronously, so a modal that resolves later cannot be used here.
   */
  confirmUnsaved?:  (message: string) => boolean;

  onCellChange?:    (params: { row: number; field: string; newValue: string; oldValue: string }) => void;
  onCellClick?: (rowIndex: number, rowData: Record<string, unknown> | null, field: string) => void;
  onCellDoubleClick?: (rowIndex: number, rowData: Record<string, unknown> | null, field: string) => void;
  onSelectionChange?: (sel: CellSelection | null) => void;
  onSort?:          (sorts: { field: string; dir: 'asc' | 'desc' }[] | null) => void;
  onFilter?:        (filters: Record<string, string | string[]>) => void;
  fetchFilterValues?: (field: string, query: string) => Promise<Array<string | number | null>>;
  filterValueMinChars?: number;
  onColumnReorder?: (columns: string[]) => void;
  onColumnResize?:  (field: string, width: number) => void;
  onColumnVisibilityChange?: (hiddenColumns: string[]) => void;
  onRowHeightResize?: (rowIndex: number, height: number) => void;
  onRowReorder?:    (fromIndex: number, toIndex: number, rowData: Record<string, unknown>) => void;
  /**
   * A row of this grid was dropped on another grid of the same `rowDragGroup`. Return `false` to
   * call the move off; the row stays where it is and the other grid gets nothing.
   */
  onRowDragOut?:    (e: RowDragOutEvent) => boolean | void;
  /**
   * A row from another grid of the same `rowDragGroup` was dropped on this one. Return `false` to
   * refuse it, or a row object to insert that object instead of the one that arrived - which is
   * where two grids with different columns are reconciled.
   */
  onRowDropIn?:     (e: RowDropInEvent) => boolean | Record<string, unknown> | void;
  onRowSelect?:     (selectedRows: number[]) => void;
  onPageChange?:    (page: number, pageCount: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRender?:        () => void;
  onChunkError?:    (err: Error) => void;
  onValidationError?: (row: number, field: string, message: string | null) => void;
  onHeaderCheckboxChange?: (field: string, checked: boolean) => void;
  rowHighlighter?:  (rowData: Record<string, unknown> | null, rowIndex: number) => string | null | undefined;
  cellBackground?:  (rowData: Record<string, unknown> | null, rowIndex: number, field: string, colIndex: number) => string | null | undefined;
  cellDecorator?:   (ctx: CanvasRenderingContext2D, args: CellDecoratorArgs) => void;
  cellTooltip?:     (rowData: Record<string, unknown> | null, rowIndex: number, field: string, colIndex: number) => string | null | undefined;
}


export interface HeaderCell {
  row:      number;
  col:      number;
  colspan:  number;
  rowspan:  number;
  label:    string | null;
  align:    string | null;
  isLeaf:   boolean;
}


export interface JHGridPlugin {
  install?: (grid: typeof JHGrid) => void;
  [hook: string]: unknown;
}

export type JHGridRuntimeOptions = Partial<Pick<JHGridOptions,
  | 'rowContextMenuItems' | 'colContextMenuItems' | 'cellContextMenuItems' | 'cellContextMenuExtraItems'
  | 'rowPinButton' | 'onRowPinToggle' | 'editableCols'
>>;

/**
 * Every event `on()` / `off()` take, and the arguments its handlers are called with. Each one is
 * the constructor callback of the same name without the `on` prefix, so `onCellChange` is the
 * event `'cellChange'` and both receive the same thing.
 */
export interface JHGridEventMap {
  cellChange: [params: { row: number; field: string; newValue: string; oldValue: string }];
  cellClick: [rowIndex: number, rowData: Record<string, unknown> | null, field: string];
  cellDoubleClick: [rowIndex: number, rowData: Record<string, unknown> | null, field: string];
  selectionChange: [sel: CellSelection | null];
  sort: [sorts: { field: string; dir: 'asc' | 'desc' }[] | null];
  filter: [filters: Record<string, string | string[]>];
  columnReorder: [columns: string[]];
  columnResize: [field: string, width: number];
  columnVisibilityChange: [hiddenColumns: string[]];
  rowHeightResize: [rowIndex: number, height: number];
  rowReorder: [fromIndex: number, toIndex: number, rowData: Record<string, unknown>];
  rowSelect: [selectedRows: number[]];
  rowPinToggle: [e: {
    pinned:   boolean;
    rowIndex: number;
    position: PinnedRowPosition;
    rowData:  Record<string, unknown> | null;
    handle:   PinnedRowHandle;
  }];
  pageChange: [page: number, pageCount: number];
  pageSizeChange: [pageSize: number];
  render: [];
  chunkError: [err: Error];
  validationError: [row: number, field: string, message: string | null];
  headerCheckboxChange: [field: string, checked: boolean];
}

// Summary row

export type SummaryAggregate =
  | 'sum' | 'avg' | 'min' | 'max' | 'count'
  | ((rows: Record<string, unknown>[], field: string) => string | number | null);

export interface SummaryRowOptions {
  /** Which band the total row is pinned to. Default `'bottom'`. */
  position?: 'top' | 'bottom' | 'both';
  /** One aggregate per column. At least one is required. */
  aggregates: Record<string, SummaryAggregate>;
  /** Text put in `labelField`. Defaults to the `locale`'s own word for a total. */
  label?: string;
  /** Column the label goes in. Default: the first column. */
  labelField?: string;
  /** Row background. `null` leaves the row unpainted. Default `'#f1f5f9'`. */
  background?: string | null;
  /** Past this many rows nothing is totalled, and `capped` says so. Default 200000. */
  maxRows?: number;
  /**
   * The records to total, instead of the rows the grid is showing. For a host that keeps its own
   * rows and shows a shaped view of them, where the total is about
   * the records, not about what is on screen.
   */
  rows?: () => Record<string, unknown>[] | null;
  /** Leaves a row out of the total: a header row that already shows a subtotal, for instance. */
  excludeRow?: (rowData: Record<string, unknown>, rowIndex: number) => boolean;
  /** Total the loaded rows even when some rows of a server-backed grid are missing. Default false. */
  allowPartial?: boolean;
  locale?: string;
}

export interface SummaryStats {
  /** Rows the aggregates actually ran over. */
  rows: number;
  /** Rows the grid counts but has not loaded. */
  missing: number;
  /** `maxRows` was exceeded, so nothing was totalled. */
  capped: boolean;
  /** `'computed'`, `'host'` after `setSummaryValues()`, or `'blank'` when the row was left empty. */
  source: 'computed' | 'host' | 'blank';
}


export declare class JHGrid {
  static use(plugin: JHGridPlugin): void;

  constructor(opts: JHGridOptions);

  ready(): Promise<void>;

  repaint(): void;

  setOptions(patch: JHGridRuntimeOptions): void;

  /**
   * Points the grid at a different data source and starts over, exactly as refresh() does: unsaved
   * edits, filters, sorts, selection and column state are dropped, because the new source need not
   * even have the same columns. Takes the same shapes the constructor takes.
   */
  setDataSource(source: Pick<JHGridOptions, "fetchMeta" | "fetchData"> | Pick<JHGridOptions, "fetchPage"> | Pick<JHGridOptions, "data">): void;
  refresh(): void;

  reloadData(opts?: { keepScroll?: boolean }): Promise<void>;

  scrollTo(rowIndex: number): void;

  getSelection(): CellSelection | null;
  setSelection(selection: CellSelectionInput | null, options?: { scroll?: boolean }): void;
  focusCell(row: number, col: number | string): void;
  /**
   * Opens the cell editor. Returns false when the column is not editable and for
   * `type: 'checkbox'` / `type: 'button'` columns, which have no editor.
   * Throws RangeError/TypeError for an out-of-range row, an unknown field, or a hidden column.
   */
  startEditing(row: number, col: number | string): boolean;
  stopEditing(options?: { cancel?: boolean }): void;

  goToPage(page: number): void;
  nextPage(): void;
  prevPage(): void;
  getCurrentPage(): number;
  getPageCount(): number;
  setPageSize(pageSize: number): void;
  getPageSize(): number;

  /**
   * The unsaved edits, keyed by row index. `{ byKey: true }` keys them by the `rowKey` value
   * instead, which survives sorts, filters and rows inserted above; `{ typed: true }` runs each
   * column's `parse` (or restores the type the original value had) instead of handing back text.
   */
  getEdits(opts?: { byKey?: boolean; typed?: boolean }): Record<string | number, Record<string, unknown>>;
  /** The row index a `rowKey` value sits at, or -1. O(loaded rows). */
  getRowIndexByKey(key: unknown): number;
  /** The row a `rowKey` value names, or null when the grid does not hold it. */
  getRowDataByKey(key: unknown): Record<string, unknown> | null;
  /** setCellValue() for a row named by its `rowKey` value. False when the row is not there. */
  setCellValueByKey(key: unknown, field: string, value: string): boolean;
  /** Throws when the `rowKey` option is not set, since changed rows cannot be identified without it. */
  getChanges(): {
    updated: Record<string, unknown>[];
    added:   Record<string, unknown>[];
    deleted: unknown[];
  };
  acknowledgeChanges(opts?: { keepScroll?: boolean }): Promise<void>;
  /**
   * Throws one row's unsaved edits away, putting its cells back to the values the data source gave
   * and clearing their validation marks. One undo step, so `Ctrl+Z` brings them back. Returns
   * false when that row had no edits. Delete marks are left alone (`undeleteRow()` clears those),
   * and a row added with `addRow()` goes back to the values it was added with.
   */
  /**
   * One row's unsaved edits as before/after pairs, or null when it has none:
   * `{ qty: { before: '10', after: '12' } }`. `typed` runs the column's own `parse`, the same
   * way `getEdits({ typed: true })` does, on both sides of the pair.
   */
  getRowChanges(rowIndex: number, opts?: { typed?: boolean }): Record<string, { before: unknown; after: unknown }> | null;
  revertRow(rowIndex: number): boolean;
  clearEdits(): void;
  /**
   * Writes a cell edit from code. Unlike user editing this ignores `editableCols`,
   * so a read-only column can still be changed programmatically. Hidden columns are accepted.
   */
  setCellValue(row: number, field: string, value: string): void;
  /** Same rules as `setCellValue`, applied as a single undo step. */
  setCellValues(entries: Array<{ row: number; field: string; value: string }>): void;

  isValid(): boolean;
  getInvalidCells(): Record<number, Record<string, string>>;
  validateAll(): Record<number, Record<string, string>>;

  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  getSelectedRows(): number[];
  clearRowSelection(): void;

  /**
   * Filter, sort and quick-filter changes ask for confirmation (`window.confirm`) when there are
   * unsaved edits on server rows. If the user cancels, the call is a no-op: the filter/sort state
   * is left untouched, so `getState()` never reports a condition the rows do not have.
   * Hidden columns are accepted by `setFilter` / `setFilterValues` / `setSort`.
   */
  clearFilters(): void;
  setFilter(field: string, value: string | null): void;
  setFilterValues(field: string, values: string[] | null): void;
  removeFilter(field: string): void;
  setQuickFilter(value: string | null): void;
  getQuickFilter(): string;
  clearQuickFilter(): void;
  setSort(field: string, dir?: 'asc' | 'desc'): void;
  removeSort(field: string): void;
  clearSort(): void;

  /**
   * Multi-column sort. The grid never sorts rows itself: the whole key list goes to
   * `fetchMeta`/`fetchData` in priority order and the host turns it into its own ORDER BY.
   * `setSorts`/`addSort`/`moveSort` apply through `setState`, so they share its unsaved-edit
   * confirmation and return its Promise. From the UI, Shift+click Asc/Desc in a header's filter
   * panel appends a key instead of replacing the list.
   */
  getSorts(): { field: string; dir: 'asc' | 'desc' }[];
  setSorts(list: { field: string; dir?: 'asc' | 'desc' }[]): Promise<void>;
  addSort(field: string, dir?: 'asc' | 'desc'): Promise<void>;
  moveSort(field: string, priority: number): Promise<void>;
  clearSorts(): Promise<void>;

  getRowData(rowIndex: number): Record<string, unknown> | null;
  /** One cell's current value, unsaved edits applied. `null` when the row is not loaded. */
  getCellValue(rowIndex: number, field: string): unknown;
  /** Rows the grid currently shows, filters applied, pinned rows aside. */
  getTotalRows(): number;
  getOriginalRowData(rowIndex: number): Record<string, unknown> | null;
  isNewRow(rowIndex: number): boolean;
  acknowledgeSave(rowIndex: number, savedData: Record<string, unknown>): void;
  acknowledgeInsert(rowIndex: number, savedData: Record<string, unknown>): boolean;

  autoFitColumns(...fields: string[]): void;

  setRowHeight(height: number): void;
  setRowHeight(rowIndex: number, height: number): void;
  getRowHeight(rowIndex: number): number;
  /**
   * Keeps `height` pixels under a row's cells that the grid lays out but never draws in, and that
   * clicks pass through: the row grows, everything below it moves down, and the strip is left for
   * whatever the host puts over it (an expanded detail panel). `0` gives the space back.
   *
   * Separate from `setRowHeight()`, which sets how tall the row's own cells are. A row can have
   * both, and `autoRowHeight` keeps measuring the cells as if the strip were not there.
   */
  reserveRowSpace(rowIndex: number, height: number): void;
  /** How much space that row has reserved, in pixels. `0` when it has none. */
  getReservedRowSpace(rowIndex: number): number;
  /** The rows that currently have space reserved, in no particular order. */
  getReservedRows(): number[];
  /**
   * Where a row sits on screen right now, in pixels relative to the grid's own element. Paired
   * with `onRender`, this is what holds a panel over the strip `reserveRowSpace()` kept: the grid
   * redraws on scroll, resize, sort and row-height changes, and this says where the strip landed.
   *
   * `left` starts after the row numbers and the frozen band. Null for an index the grid does not
   * have, and for pinned rows, which cannot reserve space.
   */
  getRowRect(rowIndex: number): RowRect | null;
  /**
   * The scrollable band of the grid, between the header and the pinned rows and scrollbars, in
   * pixels relative to the grid's own element. Clip DOM held over the grid to this.
   */
  getViewportRect(): { top: number; left: number; width: number; height: number };
  resetRowHeight(rowIndex: number): void;
  /**
   * Changes the theme of a live grid: the keys given replace theirs, the rest stay. Open panels and
   * menus close (they are rebuilt in the new colours on the next open); the selection, the scroll
   * position and unsaved edits are kept.
   */
  setTheme(patch: GridTheme): void;
  /** The theme the grid is drawing with, as a copy. */
  getTheme(): Required<GridTheme>;

  pinRow(rowIndex: number, position?: PinnedRowPosition): PinnedRowHandle | null;
  unpinRow(handle: PinnedRowHandle): boolean;
  isRowPinned(rowIndex: number): boolean;
  togglePinRow(rowIndex: number, position?: PinnedRowPosition): PinnedRowHandle | null;
  getPinnedRows(position?: PinnedRowPosition): Record<string, unknown>[];
  setPinnedRows(rows: Record<string, unknown>[], position?: PinnedRowPosition): void;

  hideColumn(field: string): void;
  showColumn(field: string): void;
  isColumnVisible(field: string): boolean;
  getHiddenColumns(): string[];

  addColumn(field: string, def?: Omit<ColumnDef, 'field'>, opts?: { index?: number }): boolean;
  deleteColumn(field: string): boolean;
  undeleteColumn(field: string): void;
  getNewColumns(): (Omit<ColumnDef, 'field'> & { field: string })[];
  getDeletedColumns(): string[];
  commitColumns(fields?: string | string[]): void;

  /**
   * A snapshot of the view. `rowChanges` (every unsaved edit, added row and delete mark) is part
   * of it by default, which is what makes the snapshot restorable and what makes it large - with
   * 200,000 edited cells it stringifies to ~5.4MB, past the usual `sessionStorage` limit, against
   * under a kilobyte for the view settings alone. Pass `{ rowChanges: false }` to leave the
   * editing session out; `setState()` accepts either shape.
   */
  getState(): GridState;
  getState(opts: { rowChanges: false }): Omit<GridState, 'rowChanges'>;
  getState(opts: { rowChanges?: boolean }): GridState | Omit<GridState, 'rowChanges'>;
  setState(state: Partial<GridState>): Promise<void>;

  /**
   * Prints the grid in a popup window. By default only rows already loaded into the cache are
   * printed and a console warning reports how many server rows were left out; pass
   * `{ full: true }` to fetch every filtered row first (returns a Promise in that case).
   */
  printGrid(opts?: { title?: string; includeHeaders?: boolean; full?: boolean }): void | Promise<void>;

  exportCsv(opts?: {
    filename?:       string;
    delimiter?:      string;
    includeHeaders?: boolean;
    bom?:            boolean;
    full?:           boolean;
  }): Promise<void>;

  addRow(rowData?: Record<string, unknown>, opts?: { index?: number }): number;
  /**
   * Inserts several rows as one undo step and one redraw. `index` places the first row and the
   * rest follow it in order; omitted, they go to the end. Returns the index of each new row.
   */
  addRows(rows: Record<string, unknown>[], opts?: { index?: number }): number[];
  /**
   * Moves a row the way a drag on the row-number gutter does: `to` is where the row ends up, the
   * new order shows at once, `onRowReorder` fires so the host can save it, and the state kept by
   * row index (edits, selection, undo) is discarded. Returns false when nothing moved.
   *
   * Needs `rowReorder: true`. Awaiting the call covers the row scan that option starts, so the
   * first move on a server-backed grid takes as long as that scan. Rows added with addRow() and
   * pinned rows cannot be moved, as with the drag.
   */
  /**
   * Runs several structural changes as one: one redraw and one undo step for the lot. Adding or
   * deleting columns in bulk is what this is for - each call otherwise snapshots the whole
   * structure, which turns a few hundred columns into seconds of work.
   */
  batchStructural<T>(fn: () => T): T;
  moveRow(from: number, to: number): Promise<boolean>;
  deleteRow(rowIndex: number, opts?: { permanent?: boolean }): void;
  undeleteRow(rowIndex: number): void;
  getNewRows(): Record<string, unknown>[];
  getDeletedRows(): number[];
  getRemovedRows(): number[];

  /**
   * Takes the row out of the view without deleting it. Hidden rows leave every row index, every
   * export and every total, exactly as a permanent delete does, and `showRow` / `showAllRows`
   * bring them back. A row added in the grid and not saved yet cannot be hidden.
   */
  hideRow(rowIndex: number): boolean;
  /** Hides several rows as one undo step. Returns how many were hidden. */
  hideRows(rowIndexes: number[]): number;
  /** Shows one hidden row again, by the server index getHiddenRows() reports. */
  showRow(serverIndex: number): boolean;
  /** Shows every hidden row. Returns how many came back. */
  showAllRows(): number;
  getHiddenRows(): Array<{ index: number; key: unknown }>;
  isRowHidden(serverIndex: number): boolean;

  /** Does not fire `onHeaderCheckboxChange`; that callback reports user clicks only. */
  setHeaderCheckbox(field: string, checked: boolean): void;
  getHeaderCheckbox(field: string): boolean;

  /**
   * Adds a handler for an event, which receives exactly what the matching constructor callback
   * receives (`on('cellChange', …)` for `onCellChange`). An event can have any number of handlers;
   * the constructor's own runs first. Returns a function that removes this handler again.
   *
   * Subscribing the same function twice to one event replaces the first subscription rather than
   * running it twice. A handler that throws is logged and does not stop the others.
   */
  on<K extends keyof JHGridEventMap>(
    event: K,
    handler: (...args: JHGridEventMap[K]) => void,
    opts?: { once?: boolean },
  ): () => void;
  /** Removes one handler, or every handler of that event when called without one. */
  off<K extends keyof JHGridEventMap>(event: K, handler?: (...args: JHGridEventMap[K]) => void): boolean;
  /** How many handlers an event has, not counting the constructor's own callback. */
  listenerCount(event: keyof JHGridEventMap): number;

  // ---- summary row (opts.summaryRow) --------------------------------------
  getSummaryValues(): Record<string, string | number | null> | null;
  getSummaryStats(): SummaryStats | null;
  /** The row index the summary row sits at, or -1 while it is not there. */
  getSummaryRowIndex(position?: 'top' | 'bottom'): number;
  refreshSummary(): void;
  /** Host-supplied totals, for a server that totals the whole table itself. `null` computes again. */
  setSummaryValues(values: Record<string, string | number | null> | null): void;

  destroy(): void;
}


export declare const DEFAULT_THEME: Required<GridTheme>;

export declare class Renderer {
  constructor(canvas: HTMLCanvasElement, opts: JHGridOptions & { theme: Required<GridTheme> });
}


export declare class DataManager {
  onChunkLoaded: (() => void) | null;
  constructor(opts: {
    fetchData: JHGridOptions['fetchData'];
    chunkSize?: number;
    maxChunks?: number;
  });
  getRow(rowIndex: number): Record<string, unknown> | null;
  prefetch(startRow: number, endRow: number): void;
  setFetch(fn: JHGridOptions['fetchData']): void;
  forEachLoaded(callback: (row: Record<string, unknown>, rowIndex: number) => void): void;
  clear(): void;
}


export declare const GRID_CLASSES: {
  root:     string;
  loading:  string;
  empty:    string;
  tooltip:  string;
  overlay:  string;
  panel:    string;
  dialog:   string;
  menu:     string;
  menuItem: string;
  btn:      string;
  pager:    string;
  pagerBtn: string;
  editor:   string;
  chip:         string;
  chipContains: string;
  treeGroup:    string;
  treeToggle:   string;
};

export declare const VERSION: string;

export declare const SUPPORTED_BROWSERS: {
  chrome:  number;
  edge:    number;
  firefox: number;
  safari:  number;
};
