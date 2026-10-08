
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
  number(opts?: { locale?: string; decimals?: number }): CellRendererFn;
  date(opts?: { format?: string; locale?: string; dateStyle?: 'full' | 'long' | 'medium' | 'short'; align?: 'left' | 'center' | 'right' }): CellRendererFn;
  currency(opts?: { locale?: string; currency?: string }): CellRendererFn;
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
  field:        string;
  label?:       string;
  align?:       'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  group?:       string | string[];
  width?:       number;
  renderer?:    string | CellRendererFn;
  type?:        'text' | 'dropdown' | 'multiselect' | 'checkbox' | 'button' | 'date' | 'richtext' | 'image';
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
  frozenCols:    number;
  frozenColsRight: number;
  sorts:         { field: string; dir: 'asc' | 'desc' }[];
  filters:       Record<string, string | string[]>;
  quickFilter:   string;
  selectedRows:  number[];
  headerCheckboxState: Record<string, boolean>;
  localColumns: (Omit<ColumnDef, 'field'> & { field: string })[];
  deletedColumns: string[];
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
  editAriaLabel?:       (col: string, row: number) => string;
  announceCell?:         (row: number, col: string, value: string) => string;
  columnHeaderAnnounce?: (col: string) => string;
  rowHeaderAnnounce?:    (row: number) => string;
  rowReorderAnnounce?:   (from: number, to: number) => string;
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
  fullScanConcurrency?: number;
  fullScanPageSize?:    number;
  editableCols?:    string[] | '*';
  rowKey?:          string;
  deleteMode?:      'mark' | 'permanent';
  rowContextMenuItems?: false | ('row-insert-above' | 'row-insert-below' | 'row-insert-top' | 'row-insert-bottom' | 'row-delete' | 'row-pin')[];
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
  columnLetterHeader?: boolean;
  showRowNumbers?:  boolean;
  rowNumberWidth?:  number;
  responsive?:      boolean;
  rowSelection?:    'none' | 'single' | 'multi';
  hiddenColumns?:   string[];
  theme?:           GridTheme;
  locale?:          string;
  i18n?:            GridI18n;
  ariaLabel?:       string;

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

export declare class JHGrid {
  static use(plugin: JHGridPlugin): void;

  constructor(opts: JHGridOptions);

  ready(): Promise<void>;

  repaint(): void;

  setOptions(patch: JHGridRuntimeOptions): void;

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

  getEdits(): Record<number, Record<string, string>>;
  /** Throws when the `rowKey` option is not set, since changed rows cannot be identified without it. */
  getChanges(): {
    updated: Record<string, unknown>[];
    added:   Record<string, unknown>[];
    deleted: unknown[];
  };
  acknowledgeChanges(opts?: { keepScroll?: boolean }): Promise<void>;
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

  getRowData(rowIndex: number): Record<string, unknown> | null;
  getOriginalRowData(rowIndex: number): Record<string, unknown> | null;
  isNewRow(rowIndex: number): boolean;
  acknowledgeSave(rowIndex: number, savedData: Record<string, unknown>): void;
  acknowledgeInsert(rowIndex: number, savedData: Record<string, unknown>): boolean;

  autoFitColumns(...fields: string[]): void;

  setRowHeight(height: number): void;
  setRowHeight(rowIndex: number, height: number): void;
  getRowHeight(rowIndex: number): number;
  resetRowHeight(rowIndex: number): void;

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

  getState(): GridState;
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
  deleteRow(rowIndex: number, opts?: { permanent?: boolean }): void;
  undeleteRow(rowIndex: number): void;
  getNewRows(): Record<string, unknown>[];
  getDeletedRows(): number[];
  getRemovedRows(): number[];

  /** Does not fire `onHeaderCheckboxChange`; that callback reports user clicks only. */
  setHeaderCheckbox(field: string, checked: boolean): void;
  getHeaderCheckbox(field: string): boolean;

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
