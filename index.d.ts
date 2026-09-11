// Theme

export interface GridTheme {
  headerBg?:       string;
  headerText?:     string;
  headerBorder?:   string;
  rowEven?:        string;
  rowOdd?:         string;
  cellBorder?:     string;
  cellText?:       string;
  loadingText?:    string;
  /**
   * Bar drawn in a cell whose row has not arrived yet, in place of leaving it blank. Defaults to
   * `'#E4E7EB'`.
   */
  skeletonBar?:    string;
  /**
   * The lighter band that sweeps across those bars, drawn over them so it reads as light passing
   * rather than as a second thing on the row. Held still when the viewer has asked for reduced
   * motion. Defaults to `'rgba(255,255,255,0.65)'`.
   */
  skeletonSheen?:  string;
  cellPadding?:    number;
  selectionColor?: string;
  selectionFill?:  string;
  selRowBg?:       string;
  /**
   * Wash painted over the row under the pointer. Defaults to a neutral `rgba(0,0,0,0.045)`, kept
   * distinct from `selRowBg` so hover and selection stay tellable apart on the same row. A theme
   * with a dark body should set a light value instead; a falsy value turns the highlight off.
   */
  hoverRowBg?:     string | null;
  scrollbarBg?:    string;
  scrollbarThumb?: string;
  scrollbarRadius?:number;
  frozenBorder?:   string;
  groupHeaderBg?:  string;
  groupHeaderText?:string;
  footerBg?:       string;
  footerText?:     string;
  filterIconBg?:   string;
  sortIconBg?:     string;
  filterIconColor?:    string;
  sortIconColor?:      string;
  headerIconColor?:    string;
  /** Border color for the Excel-style double-line drawn on column headers adjacent to hidden columns. Defaults to `'#94A3B8'`. */
  hiddenColIndicator?: string;
  /** Background tint applied to editable cells when `editableCols` is not `'*'`. Defaults to `undefined` (no tint). */
  editableCellBg?:    string;
  /** Background tint applied to readonly cells when `editableCols` is not `'*'`. Defaults to `'#F5F5F5'` (light gray). */
  readonlyCellBg?:    string;
  /** `CellRenderers.image()` cell background while an image is loading. Defaults to `'#F1F5F9'`. */
  imagePlaceholderBg?: string;
  /** `CellRenderers.image()` cell background on load failure. Defaults to `'#FEE2E2'`. */
  imageErrorBg?:       string;
  /** `CellRenderers.image()` "broken image" X glyph color. Defaults to `'#DC2626'`. */
  imageErrorIcon?:     string;
  fontSize?:       number;
  /** Header cell font size in px. Defaults to `fontSize` when omitted. */
  headerFontSize?: number;
  fontFamily?:     string;
  /** BCP-47 tag (e.g. `'en-US'`, `'ko-KR'`) that `CellRenderers.number/date/currency` fall back to when a column doesn't pin its own `locale`. Set from {@link JHGridOptions.locale}. */
  locale?:         string;

  // ── Cell state ───────────────────────────────────────────────────────────────────────────
  /** Outline drawn around a cell whose value fails its column's `validation`. Defaults to `'#dc2626'`. */
  invalidCellBorder?: string;

  // ── Rows marked for deletion ─────────────────────────────────────────────────────────────
  /** Wash over a row marked by `deleteRow()` but not yet committed. Defaults to `'rgba(239,68,68,0.10)'`. */
  deletedRowFill?:    string;
  /** Strike-through line drawn across that row's text. Defaults to `'rgba(239,68,68,0.55)'`. */
  deletedRowStrike?:  string;

  // ── Drag feedback ────────────────────────────────────────────────────────────────────────
  /** Drop shadow under the ghost that follows the pointer during a column-header drag. Defaults to `'rgba(15,23,42,0.30)'`. */
  dragGhostShadow?:   string;
  /** Fill of the band showing where a dragged column or row would land. Defaults to `'rgba(59,130,246,0.12)'`. */
  dragIndicatorFill?: string;
  /** The insertion line itself, at the edge of that band. Defaults to `'#3b82f6'`. */
  dragIndicatorLine?: string;

  /*
   * ── DOM surfaces ─────────────────────────────────────────────────────────────────────────
   * Everything below styles the parts of the grid that are real DOM rather than canvas — the
   * filter panel, context menus, the column chooser, cell editors, and the pager. They are
   * listed here because `theme` reaches them, but they are also bridged to CSS custom
   * properties (`--jhg-overlay-bg`, `--jhg-pager-bg`, …; see `GRID_CLASSES`). Each is emitted
   * as `var(--jhg-…, <theme value>)`: nothing in the library sets the variable, so the theme
   * value normally wins and a consumer who declares the variable takes over. Style through
   * whichever suits — the theme for a value known at construction, the variable for one a
   * stylesheet decides.
   */
  /** Background of panels, menus and dialogs. Defaults to `'#FFFFFF'`. */
  overlayBg?:          string;
  /** Their outer border. Defaults to `'#D0D0D0'`. */
  overlayBorder?:      string;
  /** Header strip inside a panel or dialog. Defaults to `'#F5F5F5'`. */
  overlayHeaderBg?:    string;
  /** Hairline between sections of a panel. Defaults to `'#E0E0E0'`. */
  overlayDivider?:     string;
  /** Primary text on those surfaces. Defaults to `'#212121'`. */
  overlayText?:        string;
  /** Secondary text — labels, counts. Defaults to `'#595959'`. */
  overlayMutedText?:   string;
  /** Placeholder and hint text. Defaults to `'#909090'`. */
  overlayHintText?:    string;
  /** Hover background for a row in a list, such as a filter checklist. Defaults to `'#F5F5F5'`. */
  overlayHoverBg?:     string;
  /** Hover — and keyboard-focus — background for a menu item. Defaults to `'#F0F0F0'`. */
  overlayItemHoverBg?: string;
  /** Shadow under panels and dialogs. Defaults to `'0 4px 16px rgba(0,0,0,0.15)'`. */
  overlayShadow?:      string;
  /** Shadow under context menus, which sit closer to the surface. Defaults to `'0 4px 12px rgba(0,0,0,0.15)'`. */
  overlayMenuShadow?:  string;
  /** Text on an accent-filled control, such as the filter panel's apply button. Defaults to `'#FFFFFF'`. */
  overlayAccentText?:  string;

  /** Pager bar background. Only rendered with `pagination` enabled. Defaults to `'#f8fafc'`. */
  pagerBg?:           string;
  /** Pager bar text. Defaults to `'#1e293b'`. */
  pagerText?:         string;
  /** Border between the pager bar and the grid. Defaults to `'#e2e8f0'`. */
  pagerBorder?:       string;
  /** Page-button background. Defaults to `'#ffffff'`. */
  pagerButtonBg?:     string;
  /** Page-button border. Defaults to `'#cbd5e1'`. */
  pagerButtonBorder?: string;
}

// Cell Renderers

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
}

export type CellRendererFn = (ctx: CanvasRenderingContext2D, args: CellRendererArgs) => void;

// Cell context menu extension point (see JHGridOptions.cellContextMenuExtraItems)

export interface CellContextMenuItemContext {
  row:      number;
  col:      number;
  field:    string;
  rowData:  Record<string, unknown> | null;
  /** Viewport coordinates of the invoking click (unlike the grid's internal canvas-local x/y) —
   *  for positioning a host-built DOM overlay (e.g. a comment editor) at the invoked cell. */
  clientX:  number;
  clientY:  number;
}

export interface CellContextMenuItem {
  label:     string;
  onClick:   (ctx: CellContextMenuItemContext) => void;
  disabled?: boolean;
}

// Cell decorator extension point (see JHGridOptions.cellDecorator)

export interface CellDecoratorArgs extends CellRendererArgs {
  field: string;
}

export declare const CellRenderers: {
  progressBar(opts?: { max?: number; showLabel?: boolean }): CellRendererFn;
  badge(opts?: { colorMap?: Record<string, { bg?: string; fg?: string }> }): CellRendererFn;
  checkmark(opts?: { trueColor?: string; falseColor?: string; showFalse?: boolean }): CellRendererFn;
  /**
   * Renders `value` (an image URL or `data:` URI) scaled to fill the cell, via a shared,
   * byte-budgeted LRU cache that decodes through `fetch()` + `createImageBitmap()` resized to
   * the cell's on-screen size — a large source image shown as a small thumbnail only ever costs
   * a small decoded bitmap, not a full-resolution one. Non-blocking: shows a placeholder while
   * loading and redraws itself automatically once the image resolves. `fit: 'cover'` (default)
   * crops to fill like CSS `object-fit: cover`; `'contain'` letterboxes to show the whole image.
   */
  image(opts?: { fit?: 'cover' | 'contain'; radius?: number }): CellRendererFn;
  number(opts?: { locale?: string; decimals?: number }): CellRendererFn;
  /**
   * `format` accepts a `YYYY`/`MM`/`DD`/`HH`/`mm`/`ss` pattern (locale-agnostic), or the
   * special value `'locale'` to format via `Intl.DateTimeFormat` using `locale` (or the
   * grid's {@link JHGridOptions.locale} when omitted).
   */
  date(opts?: { format?: string; locale?: string; dateStyle?: 'full' | 'long' | 'medium' | 'short'; align?: 'left' | 'center' | 'right' }): CellRendererFn;
  currency(opts?: { locale?: string; currency?: string }): CellRendererFn;
  /** 드롭다운 셀 렌더러: 현재 값 + ▾ 화살표 표시 */
  dropdown(opts?: { placeholder?: string }): CellRendererFn;
  /** 다중선택 셀 렌더러: 선택된 값 목록 + ▾ 화살표 표시 */
  multiselect(opts?: { placeholder?: string }): CellRendererFn;
  /** 체크박스 셀 렌더러: 체크/미체크 박스 표시 */
  checkbox(opts?: { checkedColor?: string; size?: number }): CellRendererFn;
  /** 버튼 셀 렌더러: 셀 전체를 하나의 클릭 가능한 버튼으로 표시 */
  button(opts?: {
    label?:    string | ((rowData: Record<string, unknown> | null, rowIndex: number) => string | null);
    disabled?: boolean | ((rowData: Record<string, unknown> | null, rowIndex: number) => boolean);
    variant?:  ButtonVariant | ((rowData: Record<string, unknown> | null, rowIndex: number) => ButtonVariant);
  }): CellRendererFn;
};

/** Registers (or overrides) a `CellRenderers` entry. */
export declare function registerCellRenderer(name: string, factory: (...args: any[]) => CellRendererFn): void;

/** Alias exported from Renderer */
export { CellRenderers as BuiltinRenderers };

// Cell Editors

export declare const CellEditors: Record<string, (...args: any[]) => unknown>;

/** Registers (or overrides) a `CellEditors` entry — the editor counterpart of `registerCellRenderer`. */
export declare function registerCellEditor(name: string, factory: (...args: any[]) => unknown): void;

// Column Definition

/** 드롭다운 옵션 항목 — 문자열 또는 { value, label } 객체 */
export type DropdownOption = string | { value: string; label?: string };

export interface ColumnDef {
  field:        string;
  label?:       string;
  align?:       'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  /**
   * Group-header path, outermost → innermost: a single label (`'개인정보'`, one level) or an
   * array (`['역량평가', '정량평가']`, N levels). Consecutive columns sharing the same label at a
   * given depth render under one merged header cell (see {@link HeaderRowDef}), without having to
   * hand-write `opts.headerRows`. Ignored when `opts.headerRows` is set explicitly (needed for
   * non-contiguous groups).
   */
  group?:       string | string[];
  width?:       number;
  /** Built-in renderer name (e.g. 'progressBar') or a custom renderer function */
  renderer?:    string | CellRendererFn;
  /** 컬럼 편집 타입. 'dropdown' / 'multiselect' / 'checkbox' / 'button' / 'date' / 'image' 지정 시 렌더러도 자동 적용 */
  type?:        'text' | 'dropdown' | 'multiselect' | 'checkbox' | 'button' | 'date' | 'image';
  /** Date format for type: 'date' columns (e.g. 'YYYY-MM-DD', 'YY/MM/DD'). Applied to both rendering and clipboard copy. Default: 'YYYY-MM-DD'. */
  format?:      string;
  /** Custom editor: a CellEditors key (e.g. 'date') or a direct editor function receiving the editor context */
  editor?:      string | ((ctx: Record<string, unknown>) => { value: string; remove: () => void } | null | undefined);
  /** Options forwarded to the named CellEditors factory when editor is a string key */
  editorOptions?: Record<string, unknown>;
  /**
   * 드롭다운 옵션 목록. type이 'dropdown'일 때 사용.
   * - 문자열 배열: ['선택1', '선택2']
   * - 객체 배열:  [{ value: 'A', label: '선택 A' }]
   * - 함수: (rowData) => DropdownOption[]  (행 데이터 기반 동적 옵션)
   */
  options?:     DropdownOption[] | ((rowData: Record<string, unknown>) => DropdownOption[]);
  editable?:    boolean;
  /** Declarative validation rules, checked on every commit to this column's cells. */
  validation?:  ColumnValidation;
  /** 버튼 설정. type이 'button'일 때 사용. */
  button?:      ButtonColumnDef;
  /**
   * 그룹헤더 행/푸터에 표시할 집계 함수. 내장 타입(`sum`/`avg`/`min`/`max`)은 `Number(row[field])`로
   * 캐스팅해 계산하며 `NaN`은 무시한다. `count`는 non-null 값 개수. 커스텀 `fn`은 그룹(또는 전체)에
   * 속한 원본 row 배열을 받아 값을 계산하고, `format`으로 표시 문자열을 지정할 수 있다.
   *
   * 행 그룹핑을 제공하는 플러그인(`setGrouping`)이 설치되어 있을 때만 의미가 있다. 플러그인 없이
   * 지정하면 값은 보관되지만 아무 곳에도 표시되지 않는다 — 집계를 읽고 그리는 쪽이 플러그인이다.
   */
  aggregate?:   'sum' | 'avg' | 'count' | 'min' | 'max' | {
    fn:      (rows: Record<string, unknown>[], field: string) => number | string;
    format?: (value: number | string) => string;
  };
  /** When true, renders a clickable checkbox in this column's last header row. Fires `onHeaderCheckboxChange` on click. */
  headerCheckbox?: boolean;
}

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'neutral';

export interface ButtonColumnDef {
  /**
   * 버튼 라벨. 고정 문자열 또는 (rowData, rowIndex) => string|null 함수.
   * 함수가 null/''을 반환하면 해당 행에는 버튼을 그리지 않는다 (조건부 숨김).
   */
  label?:    string | ((rowData: Record<string, unknown> | null, rowIndex: number) => string | null);
  /** 버튼 클릭(또는 셀 선택 후 Space/Enter/F2) 시 호출된다. editableCols 여부와 무관하게 동작한다. */
  onClick:   (rowIndex: number, rowData: Record<string, unknown> | null, field: string) => void;
  /** 고정 또는 행별 비활성화 여부. true인 동안은 onClick이 호출되지 않는다. */
  disabled?: boolean | ((rowData: Record<string, unknown> | null, rowIndex: number) => boolean);
  /** 버튼 색상. 고정값 또는 (rowData, rowIndex) => ButtonVariant 함수. 기본값 'primary'. */
  variant?:  ButtonVariant | ((rowData: Record<string, unknown> | null, rowIndex: number) => ButtonVariant);
}

export interface ColumnValidation {
  /** Value must be non-empty (after trimming) to pass. */
  required?:    boolean;
  /** Value must match this pattern (ignored when empty and not required). */
  pattern?:     RegExp | string;
  /** Numeric minimum (value is coerced with Number()). */
  min?:         number;
  /** Numeric maximum (value is coerced with Number()). */
  max?:         number;
  /** Minimum string length. */
  minLength?:   number;
  /** Maximum string length. */
  maxLength?:   number;
  /**
   * Custom check, run after all built-in rules pass. Return `true` (valid),
   * `false` (invalid — uses `message` or the default i18n message), or a
   * string (invalid — used verbatim as the error message).
   */
  validator?:   (value: string, rowData: Record<string, unknown>) => boolean | string;
  /** Overrides the default i18n message for every built-in rule above. */
  message?:     string;
}

// Header Group

export interface HeaderRowDef {
  label?:   string;
  /** Field names this group spans — updates automatically after column reorder */
  fields?:  string[];
  colspan?: number;
  rowspan?: number;
  align?:   'left' | 'center' | 'right';
}

/**
 * Computes grouped-header cell layout from `opts.headerRows` + the current column order — the
 * same layout engine the canvas header draw uses internally, exposed publicly so a custom
 * exporter/renderer can reproduce the same merged-header shape. Returns the same cell shape as
 * {@link ExcelHeaderCell} (declared further below, alongside `ExcelExportSchema`).
 */
export declare function computeHeaderCells(headerRows: HeaderRowDef[][] | undefined, columns: string[]): ExcelHeaderCell[];

// Data Source

export interface GridMeta {
  totalRows: number;
  columns:   string[];
}

export interface GridData {
  rows: Record<string, unknown>[];
}

export interface GridFilterState {
  sorts:   { field: string; dir: 'asc' | 'desc' }[];
  /**
   * Per-column filter values. A plain `string` is a substring-match text filter
   * (setFilter()); a `string[]` is a Set filter's exact-match checkbox selection
   * (setFilterValues()) — interpretation of both is entirely up to fetchData/fetchMeta.
   */
  filters: Record<string, string | string[]>;
  /** Global quick filter term (setQuickFilter()), '' when inactive. Interpretation (which
   * columns it searches, substring vs exact) is entirely up to fetchData/fetchMeta. */
  quickFilter: string;
}

// Grid State (serializable snapshot)

export interface GridState {
  columns:       string[];
  columnWidths:  Record<string, number>;
  hiddenColumns: string[];
  frozenCols:    number;
  frozenColsRight: number;
  sorts:         { field: string; dir: 'asc' | 'desc' }[];
  /** See {@link GridFilterState.filters} — string (text filter) or string[] (Set filter) per field. */
  filters:       Record<string, string | string[]>;
  /** See {@link GridFilterState.quickFilter}. */
  quickFilter:   string;
  /**
   * Row-grouping state, or `null` when the grid isn't grouped. Always present in the snapshot
   * shape (even as `null`), so a `getState()`/`setState()` round-trip never drops this key.
   * Single-field grouping keeps the legacy shape; multi-field grouping's `collapsedKeys` are
   * path arrays.
   */
  grouping:      { field: string; collapsedKeys: string[] } | { fields: string[]; collapsedKeys: string[][] } | null;
  /** Tree/hierarchical row state, or `null` when unused. Same always-present shape as {@link GridState.grouping}. */
  treeData:      { idField: string; parentField: string; collapsedKeys: string[][] } | null;
  /**
   * Active color filters, field → color (e.g. `{ COL_4: 'rgba(22,163,74,0.14)' }`), or `null`
   * when none are set. Same always-present shape as {@link GridState.grouping}.
   */
  colorFilters:  Record<string, string> | null;
  /** Selected row indices (rowSelection mode 'single'|'multi'). Always present (as `[]` when nothing is selected) — row selection is installed unconditionally, even on a base `@jhgrid/jhgrid` import. */
  selectedRows:  number[];
  /** `field -> checked` for every `headerCheckbox` column's header checkbox (see `setHeaderCheckbox`/`getHeaderCheckbox`). */
  headerCheckboxState: Record<string, boolean>;
  /**
   * Definitions of columns added via `addColumn()` that haven't been committed yet (see
   * `getNewColumns()`/`commitColumns()`) — restored via `_addColumnImpl` before column order, so a
   * `setState()` round-trip doesn't silently drop a locally-added column. Function-valued def
   * fields (a custom `renderer`/`editor`, function-form `options`, a `validation.validator`, a
   * `button.onClick`) survive an in-memory round-trip but won't survive `JSON.stringify`/`parse` —
   * same inherent limitation as any function-valued columnDefs entry.
   */
  localColumns: (Omit<ColumnDef, 'field'> & { field: string })[];
  /** Field names of server columns marked for deletion via `deleteColumn()` but not yet committed (see `getDeletedColumns()`/`commitColumns()`). */
  deletedColumns: string[];
  /**
   * Unsaved row work — the row counterpart of {@link GridState.localColumns} /
   * {@link GridState.deletedColumns}, which have always been carried here.
   *
   * Everything is named by **server index**, never by screen position: a screen position only
   * means something alongside the exact arrangement that produced it, and the point of a snapshot
   * is to outlive that. `restoring` therefore assumes the same result set — the same query, the
   * same underlying rows. Restore against changed server data and the indices name different
   * records, the same way {@link GridState.filters} assumes the fields still exist.
   *
   * `setState` treats it as a replacement, not an addition: restoring twice does not duplicate.
   * A snapshot taken before this field existed leaves the grid's current row work alone.
   */
  rowChanges: {
    /**
     * Rows from `addRow()`. `anchor` is the server index the row sits in front of (equal to the
     * row count when it was appended at the end). Each row carries its own cell edits, because
     * keyed separately they would be two lists that have to agree about ordering.
     */
    added:   { anchor: number; data: Record<string, unknown>; edits: Record<string, string> }[];
    /** Server indices removed from the screen — see {@link JHGrid.getRemovedRows}. */
    removed: number[];
    /** Server indices marked for deletion — see {@link JHGrid.getDeletedRows}. */
    marked:  number[];
    /** Unsaved cell edits on server rows, as `serverIndex -> field -> value`. */
    edits:   Record<number, Record<string, string>>;
  };
}

// i18n

export interface GridI18n {
  loading?:              string;
  loadError?:            string;
  /** Shown when a paste (`Ctrl+V`) drops some values because they fell outside the pasted range. */
  pasteTruncated?:       (n: number) => string;
  /** Shown when a copy (`Ctrl+C`) omits some rows because they hadn't loaded yet. */
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
  filterColorLabel?:     string;
  filterValuesLabel?:    string;
  filterSelectAll?:      string;
  /** Placeholder for the tag filter's search box (see {@link JHGridOptions.fetchFilterValues}). */
  filterTagPlaceholder?: string;
  /** Prefixes the tag filter's suggestion list when it was scanned from loaded rows rather than {@link JHGridOptions.fetchFilterValues}. */
  filterTagLocalScope?:  string;
  /** Shown in the tag filter's suggestion list when nothing matches the typed query. */
  filterTagNoMatch?:     string;
  /** Shown below the tag filter's minimum-character threshold (see {@link JHGridOptions.filterValueMinChars}). */
  filterTagMinChars?:    (n: number) => string;
  /** Shown when every matching value in the tag filter's suggestion list has already been picked. */
  filterTagAllSelected?: string;
  /** Shown when the tag filter's suggestion list is capped and more matches exist than are shown. */
  filterTagMore?:        (n: number) => string;
  /** Label above the tag filter's tray of picked values. */
  filterTagSelected?:    (n: number) => string;
  /** Label for the tag filter's "contains" substring-match fallback chip/option. */
  filterTagContains?:    (q: string) => string;
  /** `aria-label` for a tag filter chip's remove ("×") button. */
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
  /** Column header context menu: insert a new column to the left. */
  colInsertLeft?:        string;
  /** Column header context menu: insert a new column to the right. */
  colInsertRight?:       string;
  /** Title of the dialog opened by {@link colInsertLeft}/{@link colInsertRight}. */
  colInsertTitle?:       string;
  /** Placeholder of the new-column-name input in that dialog. */
  colInsertPlaceholder?: string;
  /** Confirm button label in that dialog. */
  colInsertConfirm?:     string;
  /** Cancel button label in that dialog. */
  colInsertCancel?:      string;
  /** Column header context menu: mark this column for deletion (see {@link JHGrid.deleteColumn}). */
  colDelete?:            string;
  /** Column header context menu: clear a pending deletion mark (see {@link JHGrid.undeleteColumn}). */
  colUndelete?:          string;
  /** Row context menu: insert a blank row at the very top of the dataset. */
  rowInsertTop?:         string;
  /** Row context menu: insert a blank row at the very bottom of the dataset. */
  rowInsertBottom?:      string;
  /** Row context menu: insert a blank row directly above this one. */
  rowInsertAbove?:       string;
  /** Row context menu: insert a blank row directly below this one. */
  rowInsertBelow?:       string;
  /** Label for the "add row" control (e.g. a toolbar button a host wires up itself). */
  rowAddEnd?:            string;
  /** Row context menu label for deleting a locally-added (unsaved) row — always removed outright. */
  rowDelete?:            string;
  /** Row context menu label for marking a server row deleted (`deleteRow(i, { permanent: false })`). */
  rowDeleteMark?:        string;
  /** Row context menu label for permanently removing a server row (`deleteRow(i, { permanent: true })`). */
  rowDeletePermanent?:   string;
  /** Row context menu: clear a deletion mark, or restore a permanently-removed row. */
  rowUndelete?:          string;
  editAriaLabel?:        (col: string, row: number) => string;
  announceCell?:         (row: number, col: string, value: string) => string;
  /** Screen-reader announcement when a column header receives keyboard focus. */
  columnHeaderAnnounce?: (col: string) => string;
  /** Screen-reader announcement when a row-number cell receives keyboard focus. */
  rowHeaderAnnounce?:    (row: number) => string;
  /** Screen-reader announcement after a row drag-reorder completes (see {@link JHGridOptions.rowReorder}). */
  rowReorderAnnounce?:   (from: number, to: number) => string;
  /** Screen-reader announcement after a sort is applied from the filter/sort panel. */
  sortAppliedAnnounce?:      (col: string, dir: 'asc' | 'desc') => string;
  /** Screen-reader announcement after a filter is applied from the filter/sort panel. */
  filterAppliedAnnounce?:    (col: string) => string;
  /** Screen-reader announcement after a single column's filter is cleared. */
  filterClearedAnnounce?:    (col: string) => string;
  /** Screen-reader announcement after {@link JHGrid.clearFilters} clears every filter and sort. */
  allFiltersClearedAnnounce?: string;
  /** Screen-reader announcement when the row-selection set changes (`n` = newly selected count, `0` = cleared). */
  rowsSelectedAnnounce?:      (n: number) => string;
  unsavedEditsWarning?:  string;
  exportCsvFilename?:    string;
  /** Default filename for an Excel-format export, kept separate from `exportCsvFilename` above since `exportCsv()` always uses that one. */
  exportExcelFilename?:  string;
  exportSheetName?:      string;
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
  pagerPageLabel?:       (page: number, pageCount: number) => string;
  aggSum?:               string;
  aggAvg?:               string;
  aggCount?:             string;
  aggMin?:               string;
  aggMax?:               string;
  groupLabel?:           (field: string, key: string, count: number) => string;
  groupFooterLabel?:     string;
}

/** Korean locale strings — pass as i18n option for Korean UI */
export declare const KO_I18N: Required<GridI18n>;

/** Japanese locale strings — pass as i18n option for Japanese UI */
export declare const JA_I18N: Required<GridI18n>;

/** Simplified Chinese locale strings — pass as i18n option for Chinese UI */
export declare const ZH_I18N: Required<GridI18n>;

// Pagination

export interface PaginationOptions {
  /** Switches from continuous virtual scrolling to classic fixed-size pages. */
  enabled:   boolean;
  /**
   * Rows per page. Fixed at construction time (not changeable at runtime).
   * Also becomes the effective `chunkSize` — `chunkSize` is ignored when set.
   * Default: 50.
   */
  pageSize?: number;
}

// Constructor Options

export interface JHGridOptions {
  container:        string | Element;
  /**
   * Exactly one data source is required: `fetchMeta`+`fetchData` (server-paged), `fetchPage`
   * (single-callback server variant), or `data` (in-memory array, see below). Typed as optional
   * here because either alternative also satisfies the grid; the constructor throws at runtime
   * if none of the three is provided.
   */
  fetchMeta?:       (state?: GridFilterState | null) => Promise<GridMeta>;
  fetchData?:       (page: number, size: number, state?: GridFilterState | null) => Promise<GridData>;
  /**
   * `fetchMeta`+`fetchData` collapsed into one call, for a backend that returns the page and the
   * total together — a `COUNT(*) OVER()` alongside the paged rows, say. Resolve
   * `{ rows, totalRows }`, plus `columns` unless `columnDefs` names them.
   *
   * `state` is the sort and filter the grid wants applied, exactly as {@link fetchData} receives
   * it: honour it server-side and return `totalRows` for the filtered result, not the table. A
   * callback that ignores the argument still works — it simply never filters or sorts, which is
   * what every `fetchPage` grid did before the argument was passed at all.
   *
   * The grid asks for chunk 0 once at boot even though it needs both the count and the rows from
   * it, so a plain `(page, size) => …` implementation is not called twice for the same page.
   *
   * Only one data source applies; supplying this alongside `fetchMeta`/`fetchData` leaves those
   * two in charge.
   */
  fetchPage?:       (page: number, size: number, state?: GridFilterState | null) => Promise<GridData & { totalRows: number; columns?: string[] }>;
  /**
   * Convenience alternative to `fetchMeta`+`fetchData` for a dataset that already fits in
   * memory (prototyping, small/medium lookup tables, tests). Columns are inferred from
   * `columnDefs` if given, else from the keys of `data[0]`. Filtering/sorting/quick-filter are
   * applied against the array directly with the same semantics a host's own `fetchMeta`/
   * `fetchData` are expected to follow (see {@link GridFilterState}) — there is no indexing, so
   * this re-scans the full array on every state change and isn't a fit for very large datasets.
   * Ignored if `fetchMeta`/`fetchData`/`fetchPage` is also provided.
   */
  data?:            Record<string, unknown>[];
  width?:           number;
  height?:          number;
  rowHeight?:       number;
  colWidth?:        number;
  headerHeight?:    number;
  /**
   * Fade duration in ms for the row-hover highlight as it appears and disappears. The highlight
   * itself always tracks the pointer instantly; only the entrance/exit eases. `0` makes it
   * instant. Forced to 0 when the user has `prefers-reduced-motion: reduce` set. Default: 110.
   */
  hoverFadeMs?:     number;
  /**
   * Travel time in ms for the selection box when it moves to a new cell or range. Snaps instead
   * of easing during a range/fill drag, when the selection appears or clears, and when a move
   * arrives before the previous one has landed (held arrow keys). `0` disables it. Forced to 0
   * under `prefers-reduced-motion: reduce`. Default: 90.
   */
  selectionMoveMs?: number;
  /**
   * Glide length in ms for mouse-wheel scrolling. Deltas smaller than one row — a precision
   * trackpad's dense stream, which is already smooth — are applied immediately regardless.
   * `0` applies every wheel delta immediately. Forced to 0 under
   * `prefers-reduced-motion: reduce`. Default: 120.
   */
  scrollEaseMs?:    number;
  /**
   * How long a displaced column takes to travel to its new slot during a column-header drag. The
   * reorder itself happens as the pointer crosses each boundary either way; this only controls
   * whether the columns it displaces slide there or appear there. A reorder arriving before the
   * previous slide has landed snaps it. `0` puts columns straight into place. Forced to 0 under
   * `prefers-reduced-motion: reduce`. Default: 220.
   */
  columnSlideMs?:   number;
  /** When true, header cell labels wrap across multiple lines instead of being clipped with ellipsis. Default: false. */
  wrapHeader?:      boolean;
  scrollbarSize?:   number;
  chunkSize?:       number;
  /** Maximum number of chunks kept in memory (LRU). Default: 50 */
  maxCachedChunks?: number;
  /**
   * Enables classic fixed-size pagination (a built-in pager bar with
   * Prev/Next/page-number controls) instead of continuous virtual scrolling.
   * Row indices everywhere in the public API (getEdits(), onCellChange, setCellValue())
   * stay global/absolute regardless of this option — pagination only changes what's
   * scrollable/visible at once.
   */
  pagination?:      PaginationOptions;
  frozenCols?:      number;
  frozenColsRight?: number;
  /**
   * Enables drag-to-reorder rows from the row-number gutter (requires `showRowNumbers: true`
   * to have somewhere to grab). Unlike column reorder, this requires materializing the entire
   * filtered/sorted dataset client-side first (row data, unlike column metadata, isn't
   * normally resident in memory under server-paged virtualization).
   * Runs one full-dataset scan via `fetchData` after every load/reload; dragging is disabled
   * until that scan completes, and while row grouping or tree data is active. Default: false.
   */
  rowReorder?:      boolean;
  editableCols?:    string[] | '*';
  /**
   * What {@link JHGrid.deleteRow} does to a **server** row when the call doesn't say.
   *
   * - `'mark'` (default) — the row stays on screen, dimmed with a strikethrough, and is reported
   *   by {@link JHGrid.getDeletedRows}. Suits a screen with an explicit save step, where the user
   *   should be able to change their mind before committing.
   * - `'permanent'` — the row comes off the screen and is reported by
   *   {@link JHGrid.getRemovedRows}. Suits a list that commits as you go.
   *
   * Either way the server is untouched; the grid only records the choice. Rows added with
   * {@link JHGrid.addRow} ignore this — they were never sent anywhere, so there is nothing to
   * mark and they always go immediately.
   *
   * `deleteRow(i, { permanent })` overrides it per call, because one screen can legitimately need
   * both — marking a saved record while discarding a draft, say.
   */
  deleteMode?:      'mark' | 'permanent';
  /**
   * Narrows which items appear in the right-click row menu (opened from the row-number gutter).
   * `false` turns the menu off entirely; an array keeps only the named items; omitted (default)
   * shows all of them, unchanged from before this option existed.
   *
   * Valid keys: `'row-insert-above'`, `'row-insert-below'`, `'row-insert-top'`,
   * `'row-insert-bottom'`, `'row-delete'`. The four insert placements are each their own key;
   * every delete-related item (mark / permanent / plain delete / undelete) is gated by the single
   * `'row-delete'` key, since which of those actually renders for a given row is row state, not
   * something a host would pick independently.
   */
  rowContextMenuItems?: false | ('row-insert-above' | 'row-insert-below' | 'row-insert-top' | 'row-insert-bottom' | 'row-delete')[];
  /**
   * Narrows which items appear in the column header's right-click menu. Same shape as
   * {@link JHGridOptions.rowContextMenuItems}: `false` disables the menu, an array keeps only the
   * named items, omitted shows all of them.
   *
   * Valid keys: `'freeze'`, `'freeze-right'`, `'visibility'`, `'insert-left'`, `'insert-right'`,
   * `'delete'`. `'freeze'`/`'freeze-right'` each cover both their freeze and unfreeze label/action
   * for that slot, and `'delete'` covers both delete and undelete, same reasoning as the row menu.
   */
  colContextMenuItems?: false | ('freeze' | 'freeze-right' | 'visibility' | 'insert-left' | 'insert-right' | 'delete')[];
  /**
   * Narrows which items appear in the plain-cell right-click menu. Same shape as
   * {@link JHGridOptions.rowContextMenuItems}: `false` disables the menu, an array keeps only the
   * named items, omitted shows all of them.
   *
   * Valid keys: `'col-insert-left'`, `'col-insert-right'`, `'col-delete'`, `'row-insert-below'`,
   * `'row-delete'`. Unrelated to {@link JHGridOptions.cellContextMenuExtraItems} below — that adds
   * items instead of filtering these, and always applies regardless of this option.
   */
  cellContextMenuItems?: false | ('col-insert-left' | 'col-insert-right' | 'col-delete' | 'row-insert-below' | 'row-delete')[];
  /**
   * Adds custom items to the plain-cell right-click menu, after whichever built-in items
   * {@link JHGridOptions.cellContextMenuItems} left in place (if any). Called fresh each time the
   * menu opens for a given cell; return `null`/`undefined`/`[]` to add nothing for that cell.
   *
   * This is the one general-purpose extension point for host- or plugin-supplied context menu
   * actions — the grid renders the label, routes the click to `onClick`, and closes the menu
   * afterwards, same as a built-in item. It has no opinion about what `onClick` does.
   */
  cellContextMenuExtraItems?: (ctx: CellContextMenuItemContext) => CellContextMenuItem[] | null | undefined;
  columnDefs?:      ColumnDef[];
  /** Multi-row header groups. Each element is one group-header row. */
  headerRows?:      HeaderRowDef[][];
  /** Show a built-in row-number column on the left. Default: true. */
  showRowNumbers?:  boolean;
  /** Width of the row-number column in pixels. Default: 50. */
  rowNumberWidth?:  number;
  responsive?:      boolean;
  rowSelection?:    'none' | 'single' | 'multi';
  /** Fields to hide on initial render */
  hiddenColumns?:   string[];
  theme?:           GridTheme;
  /**
   * BCP-47 tag (e.g. `'en'`, `'ko'`, `'ko-KR'`) selecting a built-in UI text pack
   * (see {@link KO_I18N}; unmatched tags fall back to English) and the default
   * locale `CellRenderers.number/date/currency` format with. Default: `'en-US'`.
   * `i18n` (below) is applied on top and always wins per-key.
   */
  locale?:          string;
  i18n?:            GridI18n;
  ariaLabel?:       string;

  // Callbacks
  /** oldValue is the pre-edit value: the prior edit if the cell was already dirty, otherwise the row's original data. */
  onCellChange?:    (params: { row: number; field: string; newValue: string; oldValue: string }) => void;
  /** Fired when the cell/range selection changes. null = selection cleared. */
  onSelectionChange?: (sel: { type: 'single'; row: number; col: number } | { type: 'range'; r1: number; c1: number; r2: number; c2: number } | null) => void;
  /** Fired after sorts are applied or cleared. Empty array = all sorts cleared. */
  onSort?:          (sorts: { field: string; dir: 'asc' | 'desc' }[] | null) => void;
  /** Fired after any filter is applied, reset, or cleared. */
  onFilter?:        (filters: Record<string, string | string[]>) => void;
  /**
   * Looks up candidate values for a column's header filter, given whatever the user has typed.
   * Return a bounded list; only what fits the query is useful, and the panel shows it as-is.
   *
   * The tag picker itself is **not** conditional on this — it appears on any column whose values
   * could not be enumerated locally (the ones where the checklist does not appear). What this
   * changes is where the candidates come from. Omit it and they are scanned out of the rows
   * already loaded, and the list is labelled as covering only those; supply it and it answers for
   * the whole column, label included. Worth supplying whenever the grid is paging a table far
   * larger than what is cached, since that is exactly when the local sample is thinnest.
   *
   * Tags are combined with OR and applied as a `string[]`, the same shape the value checklist
   * sends. If the typed text matches nothing the user can still fall back to a substring filter,
   * which arrives as a plain `string`. A column carries one or the other, never both.
   */
  fetchFilterValues?: (field: string, query: string) => Promise<Array<string | number | null>>;
  /**
   * Characters the tag filter waits for before looking candidates up. Below it the panel says what
   * it is waiting for and still offers the substring fallback, which needs no lookup. One
   * character against a large column is the most expensive query this control can issue and the
   * least selective answer it can get. Applies to the built-in local scan as much as to
   * {@link fetchFilterValues}. Set `1` for the pre-existing behaviour. Default: 2.
   */
  filterValueMinChars?: number;
  /** Fired after column drag-reorder completes. columns = new visible field order. */
  onColumnReorder?: (columns: string[]) => void;
  /** Fired after a column is resized (mouse-up). */
  onColumnResize?:  (field: string, width: number) => void;
  /** Fired after a row's individual height is resized by dragging a boundary in the row-number gutter (mouse-up). */
  onRowHeightResize?: (rowIndex: number, height: number) => void;
  /**
   * Fired after a row drag-reorder completes (requires `rowReorder: true`).
   * `fromIndex`/`toIndex` are absolute row indices at drop time; `rowData` is the moved row's
   * raw data. Row-indexed transient state (edits, selection, undo history) is cleared on
   * reorder the same way it is on a sort/filter change — persist `toIndex` server-side here if
   * the new order needs to survive a refresh.
   */
  onRowReorder?:    (fromIndex: number, toIndex: number, rowData: Record<string, unknown>) => void;
  /** Fired when the row-selection set changes. */
  onRowSelect?:     (selectedRows: number[]) => void;
  /** Fired after the current page changes (goToPage/nextPage/prevPage), only when it actually changed. */
  onPageChange?:    (page: number, pageCount: number) => void;
  onRender?:        () => void;
  /** Fired when a data chunk fails to load. */
  onChunkError?:    (err: Error) => void;
  /**
   * Fired whenever a cell's validity changes as a result of an edit (or undo/redo
   * of one). `message` is the validation error, or null when the cell becomes valid.
   */
  onValidationError?: (row: number, field: string, message: string | null) => void;
  /** Fired when a header checkbox (column with `headerCheckbox: true`) is clicked. */
  onHeaderCheckboxChange?: (field: string, checked: boolean) => void;
  /**
   * Optional callback returning a CSS color string for a row, or null/undefined for default.
   * Called on every render — keep it fast.
   * @example rowHighlighter: (row) => row.status === 'ERROR' ? 'rgba(239,68,68,0.12)' : null
   */
  rowHighlighter?:  (rowData: Record<string, unknown> | null, rowIndex: number) => string | null | undefined;
  /**
   * Optional callback returning a CSS color string for an individual cell's background,
   * or null/undefined for no override. Painted on top of the row background/highlight
   * (rowHighlighter, selection) and beneath cell content/renderers. Called for every
   * visible cell on every render — keep it fast. `rowData` is null for rows not yet
   * loaded from the server, so check for that before reading fields. Exceptions thrown
   * here are caught and logged; they don't interrupt rendering.
   * @example cellBackground: (row, rowIndex, field) => row && field === 'score' && row.score < 60 ? '#fee2e2' : null
   */
  cellBackground?:  (rowData: Record<string, unknown> | null, rowIndex: number, field: string, colIndex: number) => string | null | undefined;
  /**
   * Optional callback that draws on top of a cell after everything else in it (content,
   * gridlines, strikethrough, validation border) — close to the call shape of a
   * `columnDefs[i].renderer` (`(ctx, args) => void`), but invoked for every rendered cell instead
   * of replacing one column's content, and `args` includes `field` since a decorator (unlike a
   * column renderer, already scoped to one column) needs it to tell columns apart. Use it for a
   * small corner mark, icon, or badge that layers on top of whatever the cell already shows.
   * Called for every visible, loaded cell on every render — keep it fast, and do nothing (return
   * without drawing) for cells that need no mark. Exceptions thrown here are caught and logged;
   * they don't interrupt rendering.
   * @example cellDecorator: (ctx, { x, y, w, field, rowIndex }) => { if (hasFlag(rowIndex, field)) { ctx.fillStyle = 'red'; ctx.beginPath(); ctx.moveTo(x + w - 8, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 8); ctx.fill(); } }
   */
  cellDecorator?:   (ctx: CanvasRenderingContext2D, args: CellDecoratorArgs) => void;
  /**
   * Optional callback returning tooltip text to show while the pointer idles over a cell, or
   * null/undefined for none. Same call shape as `cellBackground`. Shown immediately (no hover
   * delay), and takes priority over the built-in overflow-text tooltip and over anything a plugin
   * supplies via its own `cellTooltip` — a validation error on the cell still wins over this.
   * `rowData` is null for rows not yet loaded from the server.
   * @example cellTooltip: (row, rowIndex, field) => hasNote(rowIndex, field) ? getNote(rowIndex, field) : null
   */
  cellTooltip?:     (rowData: Record<string, unknown> | null, rowIndex: number, field: string, colIndex: number) => string | null | undefined;
}

// Excel export schema

export interface ExcelHeaderCell {
  row:      number;
  col:      number;
  colspan:  number;
  rowspan:  number;
  label:    string | null;
  align:    string | null;
  isLeaf:   boolean;
}

export interface ExcelExportSchema {
  sheetName:      string;
  columns:        string[];
  columnLabels:   string[];
  headerCells:    ExcelHeaderCell[] | undefined;
  includeHeaders: boolean;
  colWidths:      number[];
  headerBg:       string;
  headerText:     string;
  headerBorder:   string;
}

// JHGrid

/**
 * A plugin object passed to {@link JHGrid.use}. Every hook is optional; core calls whichever
 * ones a plugin happens to implement and falls back to plain behavior everywhere else, which
 * is why this is an open shape rather than a fixed list of members.
 */
export interface JHGridPlugin {
  /** Called once when the plugin is first installed. */
  install?: (grid: typeof JHGrid) => void;
  [hook: string]: unknown;
}

export declare class JHGrid {
  /**
   * Installs a plugin. Installing the same object twice is a no-op. Plugin packages call this
   * on import, so an application normally never has to — import the package and its API appears
   * on the grid instance.
   */
  static use(plugin: JHGridPlugin): void;

  constructor(opts: JHGridOptions);

  // Boot
  /**
   * Resolves once the first `fetchMeta`/`fetchData` boot has settled — either way, including
   * on failure — so that `this._columns` and friends are populated and any structural API will
   * actually run instead of silently no-op'ing while a boot is still in flight.
   *
   * Await it before calling one straight after construction:
   * ```js
   * const grid = new JHGrid({ ... });
   * await grid.ready();
   * grid.hideColumn('email');
   * ```
   * Not needed inside a user-triggered handler (a button's `onclick`, say) — by then the page,
   * and therefore the initial boot, has necessarily finished.
   */
  ready(): Promise<void>;

  /**
   * Schedules a repaint without touching data, scroll, edits, filters, or sort — for when
   * something a `cellBackground`/`rowHighlighter` callback reads changed outside the grid (host
   * state a plugin keeps, say) and the next frame needs to pick it up. Much cheaper than
   * {@link JHGrid.refresh} when nothing about the data itself changed.
   */
  repaint(): void;

  // Data reload
  /** Reload all data from scratch (clears edits, filters, column widths, scroll). */
  refresh(): void;

  // Scroll
  /**
   * Scroll so that rowIndex is at the top of the viewport. When pagination is
   * enabled, switches to the page containing rowIndex first.
   */
  scrollTo(rowIndex: number): void;

  // Pagination
  /** Jumps to a 0-based page, clamped to a valid page. No-op if pagination is not enabled. */
  goToPage(page: number): void;
  /** Advances to the next page. No-op at the last page or if pagination is not enabled. */
  nextPage(): void;
  /** Goes back to the previous page. No-op at the first page or if pagination is not enabled. */
  prevPage(): void;
  /** Returns the current 0-based page index, or 0 if pagination is not enabled. */
  getCurrentPage(): number;
  /** Returns the total number of pages, or 1 if pagination is not enabled. */
  getPageCount(): number;

  // Edit management
  /** Return all unsaved edits: { [rowIndex]: { [fieldName]: value } } */
  getEdits(): Record<number, Record<string, string>>;
  /** Discard all unsaved edits and re-draw. */
  clearEdits(): void;
  /**
   * Programmatically sets a single cell's value through the same edit/validation/
   * undo/onCellChange pipeline as a manual edit (checkbox toggle, paste, fill).
   * Throws if `row`/`field`/`value` are the wrong type, or `field` names an
   * unknown column.
   */
  setCellValue(row: number, field: string, value: string): void;
  /**
   * Bulk counterpart to setCellValue() — applies every entry through the same
   * pipeline as one edit/undo step and a single redraw, instead of one redraw
   * per cell. Use this for large-scale updates (e.g. a header checkbox toggling
   * every filtered row) where looping setCellValue() would redraw once per row.
   * Throws under the same conditions as setCellValue().
   */
  setCellValues(entries: Array<{ row: number; field: string; value: string }>): void;

  // Validation
  /** Returns true if no cell currently fails its column's `validation` rules. */
  isValid(): boolean;
  /** Return all currently invalid cells: { [rowIndex]: { [fieldName]: message } } */
  getInvalidCells(): Record<number, Record<string, string>>;
  /**
   * Re-validates every currently loaded (cached) row plus locally added rows
   * against each column's `validation` rules. Like autoFitColumns()/printGrid(),
   * only rows already loaded into the client cache are checked.
   */
  validateAll(): Record<number, Record<string, string>>;

  // Undo / Redo
  /**
   * Undoes the last undoable action: a cell edit (single, paste, fill, or clear),
   * or row/column add/delete/undelete.
   * Also bound to Ctrl/Cmd+Z. No-op if there is nothing to undo.
   */
  undo(): void;
  /** Re-applies the last undone action. Also bound to Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z. No-op if there is nothing to redo. */
  redo(): void;
  /** Returns true if undo() would currently have an effect. */
  canUndo(): boolean;
  /** Returns true if redo() would currently have an effect. */
  canRedo(): boolean;

  // Row selection
  /** Return the list of currently selected row indices (sorted ascending). Requires `rowSelection: 'single' | 'multi'`. */
  getSelectedRows(): number[];
  /** Deselect all rows. */
  clearRowSelection(): void;

  // Filter / sort
  /** Remove all active filters/sort and reload data. */
  clearFilters(): void;
  /** Set a single column filter programmatically and reload. Pass null/'' to remove. */
  setFilter(field: string, value: string | null): void;
  /**
   * Set a Set-filter (exact-match checkbox selection, as opposed to setFilter()'s substring
   * match) for a single column and reload. Pass null/undefined to remove.
   */
  setFilterValues(field: string, values: string[] | null): void;
  /** Remove a single column filter (text or Set) and reload. */
  removeFilter(field: string): void;
  /**
   * Set the global quick filter (a single term searched across every column — interpretation
   * is entirely up to fetchData/fetchMeta, via state.quickFilter) and reload. Pass null/''
   * to clear. There is no built-in search box; wire this to your own input.
   */
  setQuickFilter(value: string | null): void;
  /** Current quick filter term ('' when inactive). */
  getQuickFilter(): string;
  /** Shorthand for setQuickFilter(''). */
  clearQuickFilter(): void;
  /** Replace all active sorts with a single sort key, then reload. */
  setSort(field: string, dir?: 'asc' | 'desc'): void;
  /** Remove the sort for a specific field and reload. No-op if not sorted. */
  removeSort(field: string): void;
  /** Clear all active sorts and reload. */
  clearSort(): void;

  // Row data
  /** Return the current data for a row (with unsaved edits applied), or null if not loaded. */
  getRowData(rowIndex: number): Record<string, unknown> | null;
  /**
   * Returns the row's pre-edit snapshot -- what {@link getRowData} would have returned for this
   * index before any unsaved cell edits were applied. Stays correct across any
   * {@link addRow}/{@link deleteRow} calls that happen afterward (including ones from the
   * built-in row context menu), unlike a snapshot the caller took itself at fetch time. Useful
   * for a "what changed" diff, or as a stable WHERE-clause anchor on tables with no primary key.
   */
  getOriginalRowData(rowIndex: number): Record<string, unknown> | null;
  /** True if the row at this index was added via {@link addRow} and has no server-side counterpart yet. */
  isNewRow(rowIndex: number): boolean;
  /**
   * Tells the grid that the row at `rowIndex` has just been persisted with `savedData` as its
   * confirmed server-side value. Patches the cache in place and drops any pending edit for that
   * row, so the next edit's {@link getOriginalRowData}/{@link getEdits} picks up from here --
   * without the full reset (scroll position, filters, sort, selection) {@link refresh} does.
   * Meant for a host that saves incrementally (e.g. auto-save on commit).
   *
   * No-op if {@link isNewRow} is true for this index -- a brand new row has no server slot yet to
   * patch. Use {@link acknowledgeInsert} once that row's own create request lands instead.
   */
  acknowledgeSave(rowIndex: number, savedData: Record<string, unknown>): void;
  /**
   * Tells the grid that the row at `rowIndex` (added via {@link addRow}, anywhere -- a plain
   * append, an explicit `index`, or the row context menu) has just been created on the server with
   * `savedData` as its confirmed value. Turns it into an ordinary server row in place -- so the
   * next edit on it is treated as an update, not another insert -- without {@link refresh}'s full
   * reset (scroll position, filters, sort, selection).
   *
   * Returns `true` if the promotion happened, `false` if `rowIndex` was not a local (still-unsaved)
   * row -- nothing to promote.
   */
  acknowledgeInsert(rowIndex: number, savedData: Record<string, unknown>): boolean;

  // Column auto-fit
  /**
   * Resizes one or more columns to fit their content (header label + cached data).
   * Columns with a custom renderer are skipped.
   * Pass no arguments to fit all visible columns.
   */
  autoFitColumns(...fields: string[]): void;

  // Row height
  /** Changes the default pixel height used by every row without its own override. Throws if height is not a positive finite number. */
  setRowHeight(height: number): void;
  /** Sets rowIndex's individual pixel height (Excel-style row resize — same as dragging a row-number gutter boundary). Throws if height is not a positive finite number or rowIndex is out of range. */
  setRowHeight(rowIndex: number, height: number): void;
  /** Returns rowIndex's current pixel height (its own override, or the shared default). */
  getRowHeight(rowIndex: number): number;
  /** Clears rowIndex's individual height override, if any, back to the shared default. */
  resetRowHeight(rowIndex: number): void;

  // Column visibility
  /** Hide a column. Has no effect if already hidden. */
  hideColumn(field: string): void;
  /** Show a hidden column, restoring it at its original position. */
  showColumn(field: string): void;
  /** Returns true if the column is currently visible. */
  isColumnVisible(field: string): boolean;
  /** Returns the list of currently hidden field names. */
  getHiddenColumns(): string[];

  // Column add / delete (client-side)
  /**
   * Adds a new column (client-side only). Returns false if the field already exists
   * (visible, hidden, or deleted). Pass `index` to insert at a specific visual
   * position; defaults to the end. If both immediate neighbors of the insertion
   * point belong to the same opts.headerRows group, the new column is folded into
   * that group too.
   */
  addColumn(field: string, def?: Omit<ColumnDef, 'field'>, opts?: { index?: number }): boolean;
  /**
   * Deletes a column. Local columns (added via addColumn) are removed immediately.
   * Server columns are hidden from view — call getDeletedColumns() to collect
   * their field names for server-side processing, or undeleteColumn() to restore.
   */
  deleteColumn(field: string): boolean;
  /** Removes the deletion mark from a server column, restoring it at its original position. */
  undeleteColumn(field: string): void;
  /** Returns shallow copies of the definitions of all locally added columns (via addColumn). */
  getNewColumns(): (Omit<ColumnDef, 'field'> & { field: string })[];
  /** Returns the field names of all server columns marked for deletion. */
  getDeletedColumns(): string[];
  /**
   * Call after your own save request has persisted pending column changes to the server — marks
   * them as no longer pending (getNewColumns() / getDeletedColumns() stop reporting them) without
   * touching the rendered grid. Pass a field name, an array of field names, or omit to commit every
   * pending column change at once. Fields with no pending add/delete are silently ignored.
   */
  commitColumns(fields?: string | string[]): void;

  // State serialization
  /** Serialize current column order, widths, visibility, sort and filters. */
  getState(): GridState;
  /**
   * Restore a previously serialized state. Unknown fields are ignored, so a snapshot from an
   * older version still applies as far as it goes.
   *
   * Resolves once the grid is showing that state. If the snapshot carries `sorts`, `filters` or
   * `quickFilter`, those only describe what the *server* should return, so the grid asks again and
   * the promise waits for the answer — otherwise the header would claim a filter over rows that
   * were never re-fetched. A snapshot that only moves columns around has nothing to ask for and
   * resolves immediately.
   *
   * Awaiting it matters when you read the grid afterwards; the synchronous parts (columns, widths,
   * visibility) are already applied by the time it returns, so a caller that just restores and
   * walks away can ignore it.
   */
  setState(state: Partial<GridState>): Promise<void>;

  // Print
  /** Open a print-ready popup window containing the currently loaded rows. */
  printGrid(opts?: { title?: string; includeHeaders?: boolean }): void;

  // Export
  /**
   * Download data as a CSV file.
   * By default only loaded (cached) chunks are included — pass `full: true`
   * to fetch every row matching the current filter/sort state (text filters
   * via the server, plus any active color filter) and export the complete
   * filtered dataset.
   */
  exportCsv(opts?: {
    filename?:       string;
    delimiter?:      string;
    includeHeaders?: boolean;
    bom?:            boolean;
    /** When true, fetches every row matching the current filter/sort state (including any active color filter) and exports the complete filtered dataset. Default: false. */
    full?:           boolean;
  }): Promise<void>;

  // Row add / delete (client-side)
  /**
   * Adds a new row (client-side only). By default it appends at the bottom; `{ index }` puts it
   * at that visual position instead — **anywhere**, including between server rows. Returns the
   * zero-based visual index of the new row.
   *
   * The row is anchored to the record it precedes, not to the screen position, so it stays where
   * you put it as rows above are added or removed. A sort or filter is the one thing that moves
   * it: the anchor described a place in the old ordering, which the new one replaces, so the row
   * survives but goes to the end. It is never hidden by a filter — a blank new row matches
   * almost nothing, and hiding it is indistinguishable from having lost it.
   */
  addRow(rowData?: Record<string, unknown>, opts?: { index?: number }): number;
  /**
   * Deletes a row. What that means depends on where the row came from:
   *
   * - A local row (added via `addRow`) is always removed outright, whatever `permanent` says.
   *   It was never sent anywhere, so there is nothing to tell a server about and nothing to mark.
   * - A server row is **marked** by default: dimmed with a strikethrough, still on screen, still
   *   undoable, and reported by {@link getDeletedRows}.
   * - `{ permanent: true }` takes the server row off the screen instead. Rows below it move up.
   *   It is reported by {@link getRemovedRows} and can still be brought back with
   *   {@link undeleteRow}.
   *
   * Neither server case touches the server — the grid only records what you chose. A sort or
   * filter discards both kinds, since they are recorded against a row numbering the reload
   * replaces.
   */
  deleteRow(rowIndex: number, opts?: { permanent?: boolean }): void;
  /**
   * Undoes a `deleteRow`: clears the mark, or puts back a row removed with
   * `{ permanent: true }`. A removed row has no screen position while it is gone, so name it by
   * the server index {@link getRemovedRows} reported. No-op if the row is neither.
   */
  undeleteRow(rowIndex: number): void;
  /** Returns shallow copies of all locally added rows (via addRow). */
  getNewRows(): Record<string, unknown>[];
  /**
   * Server indices of rows marked for deletion — the ones still on screen with a strikethrough.
   * Server indices rather than screen positions, so removing some other row cannot change what
   * this names.
   */
  getDeletedRows(): number[];
  /**
   * Server indices of rows removed from the screen via `deleteRow(i, { permanent: true })`.
   * Kept separate from {@link getDeletedRows} because the two mean different things to whoever
   * chose them — a mark is still being decided, a removal has been decided — but both still need
   * deleting server-side.
   */
  getRemovedRows(): number[];

  // Header checkbox
  /** Programmatically set the checked state of a header checkbox column and redraw. */
  setHeaderCheckbox(field: string, checked: boolean): void;
  /** Returns the current checked state of a header checkbox column. */
  getHeaderCheckbox(field: string): boolean;

  // Lifecycle
  /** Remove all event listeners and clear the container DOM. */
  destroy(): void;
}

// Renderer (advanced use)

export declare const DEFAULT_THEME: Required<GridTheme>;

export declare class Renderer {
  constructor(canvas: HTMLCanvasElement, opts: JHGridOptions & { theme: Required<GridTheme> });
}

// DataManager (advanced use)

export declare class DataManager {
  onChunkLoaded: (() => void) | null;
  constructor(opts: {
    fetchData: JHGridOptions['fetchData'];
    chunkSize?: number;
    /** LRU limit — evicts oldest chunk when exceeded. Default: 50 */
    maxChunks?: number;
  });
  getRow(rowIndex: number): Record<string, unknown> | null;
  prefetch(startRow: number, endRow: number): void;
  setFetch(fn: JHGridOptions['fetchData']): void;
  forEachLoaded(callback: (row: Record<string, unknown>, rowIndex: number) => void): void;
  clear(): void;
}

// Misc

/**
 * Class names applied to the grid's DOM surfaces (the canvas-painted body is styled through
 * {@link GridTheme} instead). Exposed so consumer code can target a surface without hardcoding
 * the strings — see "Styling with your own CSS" in the README for the full table and the
 * matching `--jhg-*` custom properties.
 */
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
  swatch:   string;
  pager:    string;
  pagerBtn: string;
  editor:   string;
};

export declare const VERSION: string;

export declare const SUPPORTED_BROWSERS: {
  chrome:  number;
  edge:    number;
  firefox: number;
  safari:  number;
};
