
import { JHGrid, CellRenderers, KO_I18N, JA_I18N, ZH_I18N } from '../index.js';
import { makeRows, COLUMNS, DEPT_OPTIONS, SKILL_OPTIONS, GRADE_OPTIONS } from './data.js';

const ROWS = makeRows(1000000);
const $ = (sel) => document.querySelector(sel);

// event log
const logEl = $('#event-log');
let logSeq = 0;
let logSuppressed = false; // bulk operations (header-checkbox mass toggle) flip this off around the loop
function log(kind, detail) {
  if (logSuppressed) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-n">${String(++logSeq).padStart(3, '0')}</span>` +
                   `<span class="log-kind">${kind}</span>` +
                   `<span class="log-detail"></span>`;
  line.lastChild.textContent = detail;
  logEl.prepend(line);
  while (logEl.children.length > 60) logEl.lastChild.remove();
}
$('#log-clear').addEventListener('click', () => { logEl.replaceChildren(); logSeq = 0; });

const NUMERIC_COLLATOR = new Intl.Collator(undefined, { numeric: true });

function fieldCompare(field) {
  return (a, b) => {
    const av = a[field], bv = b[field];
    const an = av === '' || av == null ? NaN : Number(av);
    const bn = bv === '' || bv == null ? NaN : Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return NUMERIC_COLLATOR.compare(String(av ?? ''), String(bv ?? ''));
  };
}

let _lastStateKey = null;
let _lastResult   = null;

function applyState(rows, state) {
  const key = JSON.stringify(state ?? {});
  if (key === _lastStateKey) return _lastResult;

  const { filters = {}, sorts = [], quickFilter = '' } = state ?? {};
  let out = rows;

  for (const [field, cond] of Object.entries(filters)) {
    if (Array.isArray(cond)) {
      if (cond.length === 0) continue; // empty array = cleared, not "match nothing"
      const want = new Set(cond);
      out = out.filter(r => want.has(String(r[field] ?? '')));
    } else if (cond) {
      const q = String(cond).toLowerCase();
      out = out.filter(r => String(r[field] ?? '').toLowerCase().includes(q));
    }
  }

  if (quickFilter) {
    const q = quickFilter.toLowerCase();
    out = out.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  }

  for (const { field, dir } of [...sorts].reverse()) {
    const sign = dir === 'desc' ? -1 : 1;
    const cmp  = fieldCompare(field);
    out = [...out].sort((a, b) => sign * cmp(a, b));
  }

  _lastStateKey = key;
  _lastResult   = out;
  return out;
}

// ── Main Grid ────────────────────────────────────────────────────────────────
const DARK_THEME = {
  headerBg: '#111827', headerText: '#e5e7eb', headerBorder: '#374151',
  rowEven: '#1f2937', rowOdd: '#111827', cellText: '#f9fafb', cellBorder: '#374151',
  selectionColor: '#60a5fa', selectionFill: 'rgba(96,165,250,0.18)',
  selRowBg: 'rgba(96,165,250,0.14)', scrollbarBg: '#111827', scrollbarThumb: '#4b5563',
  overlayBg: '#1f2937', overlayText: '#f9fafb', overlayBorder: '#374151',
  overlayHeaderBg: '#111827', overlayDivider: '#374151', overlayMutedText: '#9ca3af',
  overlayItemHoverBg: '#374151', overlayHoverBg: '#374151',
  pagerBg: '#111827', pagerText: '#e5e7eb', pagerBorder: '#374151',
  pagerButtonBg: '#374151', pagerButtonBorder: '#4b5563',
  frozenBorder: '#4b5563',
  hoverRowBg: 'rgba(255,255,255,0.055)',
};

let grid = null;
let opts = { locale: 'en', dark: false };

function columnDefs() {
  return [
    { field: 'id',    label: 'ID',    width: 60,  align: 'right', renderer: CellRenderers.number() },
    { field: 'avatar', label: 'Photo', width: 34,  type: 'image', renderer: CellRenderers.image({ fit: 'cover', radius: 4 }) },
    { field: 'name',  label: 'Name',  width: 130, group: 'Basic Info',
      validation: { required: true, minLength: 2, message: 'Name must be at least 2 characters.' } },
    { field: 'email', label: 'Email', width: 200, group: 'Basic Info' },
    { field: 'dept',  label: 'Dept',  width: 130, group: 'Affiliation', type: 'dropdown', options: DEPT_OPTIONS},
    { field: 'skills', label: 'Skills', width: 150, group: 'Affiliation', type: 'multiselect', options: SKILL_OPTIONS },
    { field: 'active', label: 'Active', width: 96,  group: 'Affiliation', type: 'checkbox', headerCheckbox: true },
    { field: 'verified', label: 'Verified', width: 70, renderer: CellRenderers.checkmark({ showFalse: true }) },
    { field: 'progress', label: 'Progress', width: 120, renderer: CellRenderers.progressBar({ max: 100 }) },
    { field: 'grade', label: 'Grade', width: 80, renderer: CellRenderers.badge({
        colorMap: { A: { bg: '#dcfce7', fg: '#166534' }, B: { bg: '#dbeafe', fg: '#1e40af' },
                    C: { bg: '#fef9c3', fg: '#854d0e' }, D: { bg: '#fee2e2', fg: '#991b1b' } } }) },
    { field: 'salary', label: 'Salary', width: 130, align: 'right',
      renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
    { field: 'joined', label: 'Joined', width: 120, type: 'date', format: 'YYYY-MM-DD' },
    { field: 'score', label: 'Score', width: 90, align: 'right',
      validation: { min: 0, max: 100, message: 'Must be between 0 and 100.' } },
    { field: 'note',  label: 'Note', width: 150, type: 'text', renderer: CellRenderers.richtext() },
    { field: 'action', label: 'Action', width: 90, type: 'button', button: {
        label: (row) => row?.active === 'true' ? 'Deactivate' : 'Activate',
        variant: (row) => row?.active === 'true' ? 'danger' : 'success',
        disabled: (row) => row?.grade === 'D',
        onClick: (rowIndex, row) => {
          grid.setCellValue(rowIndex, 'active', row?.active === 'true' ? 'false' : 'true');
          log('button.onClick', `row ${rowIndex} -> active=${row?.active === 'true' ? 'false' : 'true'}`);
        } } },
  ];
}

function build() {
  if (grid) grid.destroy();
  const i18n = { ko: KO_I18N, ja: JA_I18N, zh: ZH_I18N, en: undefined }[opts.locale];

  grid = new JHGrid({
    container: '#grid-main',
    width: 1180, height: 420,
    rowHeight: 34, headerHeight: 32,
    editableCols: '*',
    showRowNumbers: true,
    rowNumberWidth: 46,
    rowSelection: 'multi',
    rowReorder: true,
    frozenCols: 2,            // ID/Photo (row-number column is always frozen separately)
    frozenColsRight: 1,       // Action button column
    locale: opts.locale,
    i18n,
    theme: opts.dark ? DARK_THEME : undefined,
    columnDefs: columnDefs(),
    ariaLabel: 'JHGrid Full Feature Demo',
    responsive: true,

    cellBackground: (row, r, field) =>
      field === 'score' && Number(row?.score) < 40 ? 'rgba(239,68,68,0.14)' : null,
    rowHighlighter: (row) => row?.dept === 'Engineering' ? 'rgba(59,130,246,0.07)' : null,

    fetchMeta: async (state) => ({
      totalRows: applyState(ROWS, state).length,
      columns:   COLUMNS.concat('action'),
    }),
    fetchData: async (page, size, state) => ({
      rows: applyState(ROWS, state)
        .slice(page * size, page * size + size)
        .map(r => ({ ...r, action: '' })),
    }),

    fetchFilterValues: async (field, query) => {
      await new Promise(r => setTimeout(r, 120));
      const q = query.toLowerCase();
      const seen = new Set();
      for (const row of ROWS) {
        const v = String(row[field] ?? '');
        if (v.toLowerCase().includes(q)) seen.add(v);
        if (seen.size >= 20) break;
      }
      log('fetchFilterValues', `${field} ~ "${query}" -> ${seen.size} matches`);
      return [...seen];
    },

    onCellChange:      ({ row, field, newValue }) => log('onCellChange', `[${row}] ${field} = ${newValue}`),
    onSelectionChange: (sel) => log('onSelectionChange', sel ? JSON.stringify(sel) : 'null'),
    onSort:            (sorts) => log('onSort', JSON.stringify(sorts)),
    onFilter:          (filters) => log('onFilter', JSON.stringify(filters)),
    onRowSelect:       (rows) => log('onRowSelect', `${rows.length} rows selected`),
    onColumnReorder:   (from, to) => log('onColumnReorder', `${from} -> ${to}`),
    onColumnResize:    (f, w) => log('onColumnResize', `${f} = ${Math.round(w)}px`),
    onRowHeightResize: (r, h) => log('onRowHeightResize', `row ${r} = ${Math.round(h)}px`),
    onRowReorder:      (from, to) => log('onRowReorder', `${from} -> ${to}`),
    onValidationError: (r, f, msg) => log('onValidationError', `[${r}] ${f}: ${msg}`),
    onHeaderCheckboxChange: (f, checked) => {
      log('onHeaderCheckboxChange', `${f} = ${checked}`);
      if (f !== 'active') return;
      const n = applyState(ROWS, grid.getState()).length;
      logSuppressed = true; // one bulk edit shouldn't spam a log line per row
      grid.setCellValues(Array.from({ length: n }, (_, r) => ({ row: r, field: 'active', value: String(checked) })));
      logSuppressed = false;
      log('onCellChange', `(bulk) active = ${checked} x ${n} rows`);
      status();
    },
    onRender:          () => {},   // fires every frame, not logged
    onChunkError:      (e) => log('onChunkError', String(e)),
  });

  window.grid = grid;
  status();
  grid.ready().then(status).catch(() => {});
}

function status() {
  const st = grid.getState();
  $('#status').textContent =
    `columns ${st.columns.length} | locale ${opts.locale} | theme ${opts.dark ? 'dark' : 'light'} | ` +
    `edits ${Object.keys(grid.getEdits()).length} | selected ${grid.getSelectedRows().length} rows | ` +
    `added ${grid.getNewRows().length} | deleted ${grid.getDeletedRows().length}`;
}

// ── Control Panel ─────────────────────────────────────────────────────────────
const actions = {
  undo:        () => grid.undo(),
  redo:        () => grid.redo(),
  addRow:      () => grid.addRow({ name: 'New User', dept: 'Engineering', score: '50' }),
  delRow:      () => { const s = grid.getSelectedRows(); if (!s.length) return log('info', 'No rows selected'); s.forEach(r => grid.deleteRow(r)); },
  undelRow:    () => grid.getDeletedRows().forEach(r => grid.undeleteRow(r)),
  addCol:      () => grid.addColumn(`EXTRA_${Date.now() % 1000}`, { label: 'Extra Column', width: 110 }),
  hideCol:     () => grid.isColumnVisible('email') ? grid.hideColumn('email') : grid.showColumn('email'),
  autoFit:     () => grid.autoFitColumns(),
  validate:    () => { const bad = grid.validateAll(); log('validateAll', `${Object.keys(bad).length} rows with errors`); },
  exportCsv:   () => grid.exportCsv({ filename: 'jhgrid-demo.csv' }),
  print:       () => grid.printGrid({ title: 'JHGrid Demo' }),
  saveState:   () => { sessionStorage.setItem('jhgrid-state', JSON.stringify(grid.getState())); log('getState', 'Saved'); },
  loadState:   () => { const s = sessionStorage.getItem('jhgrid-state'); if (s) { grid.setState(JSON.parse(s)); log('setState', 'Restored'); } },
  clearFilter: () => grid.clearFilters(),
  clearSort:   () => grid.clearSort(),
  rowHeight:   () => grid.setRowHeight(0, grid.getRowHeight(0) > 40 ? 34 : 64),
};
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => { actions[btn.dataset.action]?.(); status(); });
});

$('#quick-filter').addEventListener('input', (e) => { grid.setQuickFilter(e.target.value); status(); });
$('#locale').addEventListener('change', (e) => { opts.locale = e.target.value; build(); });
$('#theme').addEventListener('change', (e) => { opts.dark = e.target.value === 'dark'; build(); });

// CSS variable override toggle - DOM surfaces change, canvas stays the same.
$('#css-override').addEventListener('change', (e) => {
  const id = 'consumer-css-override';
  document.getElementById(id)?.remove();
  if (!e.target.checked) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `.jhg-root, .jhg-pager {
    --jhg-overlay-bg: #1f2937; --jhg-overlay-text: #f9fafb;
    --jhg-overlay-border: #374151; --jhg-overlay-header-bg: #111827;
    --jhg-overlay-divider: #374151; --jhg-overlay-muted-text: #9ca3af;
    --jhg-overlay-item-hover-bg: #374151; --jhg-overlay-accent-text: #111827;
    --jhg-accent: #f59e0b;
    --jhg-pager-bg: #1f2937; --jhg-pager-text: #f9fafb;
    --jhg-pager-button-bg: #374151; --jhg-pager-button-border: #4b5563;
  }`;
  document.head.appendChild(s);
});

// motion toggle - confirms --jhg-motion-* actually applies
$('#motion').addEventListener('change', (e) => {
  const id = 'motion-override';
  document.getElementById(id)?.remove();
  const v = e.target.value;
  if (v === 'default') return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = v === 'off'
    ? `.jhg-root, .jhg-pager { --jhg-motion-fast: 1ms; --jhg-motion-slow: 1ms; }`
    : `.jhg-root, .jhg-pager { --jhg-motion-fast: 600ms; --jhg-motion-slow: 800ms; }`;
  document.head.appendChild(s);
});

// ── Pagination Grid ────────────────────────────────────────────────────────────
new JHGrid({
  container: '#grid-paged',
  width: 560, height: 260, responsive: true,
  pagination: { enabled: true, pageSize: 8 },
  showRowNumbers: true,
  rowSelection: 'single',
  editableCols: ['name'],
  columnDefs: [
    { field: 'name', label: 'Name', width: 140 },
    { field: 'dept', label: 'Dept', width: 130 },
    { field: 'grade', label: 'Grade', width: 80 },
  ],
  fetchMeta: async (state) => ({
    totalRows: Math.min(40, applyState(ROWS, state).length),
    columns:   ['name', 'dept', 'grade'],
  }),
  fetchData: async (p, s, state) => ({ rows: applyState(ROWS, state).slice(p * s, p * s + s) }),
  onPageChange: (page) => log('onPageChange', `page ${page + 1}`),
});

// ── Empty State Grid ───────────────────────────────────────────────────────────
new JHGrid({
  container: '#grid-empty',
  width: 560, height: 160, responsive: true,
  columnDefs: [{ field: 'name', label: 'Name' }],
  fetchMeta: async () => ({ totalRows: 0, columns: ['name'] }),
  fetchData: async () => ({ rows: [] }),
});

// ── Big Data Grid - opts.fetchPage + a real server API ────────────────────────
// The main grid above filters a browser-memory array via fetchMeta+fetchData. This one is the
// other side: a backend that returns rows and totalRows together in one call (e.g. SQL
// COUNT(*) OVER()) only needs opts.fetchPage. server.mjs's POST /demo/gridView and
// /demo/toggleColumn play that "real server" role.
const BIG_FIELDS_META = {
  id:     { label: 'ID',   width: 70,  align: 'right', renderer: CellRenderers.number() },
  name:   { label: 'Name', width: 140 },
  email:  { label: 'Email', width: 220 },
  dept:   { label: 'Dept', width: 130, type: 'dropdown', options: DEPT_OPTIONS },
  active: { label: 'Active', width: 90,  type: 'checkbox', headerCheckbox: true },
  grade:  { label: 'Grade', width: 80 },
  salary: { label: 'Salary', width: 130, align: 'right',
    renderer: CellRenderers.currency({ locale: 'en-US', currency: 'USD' }) },
  score:  { label: 'Score', width: 90,  align: 'right' },
};

function buildBigColumnDefs(editableFields) {
  editableFields.push('active');
  return Object.entries(BIG_FIELDS_META).map(([field, def]) => ({ field, ...def }));
}

function initBigDataGrid() {
  const statusEl = $('#bigdata-status');
  const editableFields = [];
  const columnDefsBig = buildBigColumnDefs(editableFields);

  const bigGrid = new JHGrid({
    container: '#grid-bigdata',
    width: 1180, height: 420, responsive: true,
    columnDefs: columnDefsBig,
    editableCols: editableFields,
    showRowNumbers: true,
    frozenCols: 2,
    rowHeight: 28, headerHeight: 30,

    // One callback instead of fetchMeta+fetchData, returning { rows, totalRows }. Forwarding
    // `state` is what makes the header filter mean anything - otherwise the server keeps
    // returning the whole table and the grid shows an active filter over unfiltered rows.
    fetchPage: (chunkIndex, chunkSize, state) =>
      fetch('/demo/gridView', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: chunkIndex, size: chunkSize, state }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then((data) => {
          statusEl.textContent = `${data.totalRows.toLocaleString()} rows total (server: fetchPage)`;
          return { rows: data.rows ?? [], totalRows: data.totalRows };
        })
        .catch((err) => {
          console.error('Big-data grid fetch error:', err);
          statusEl.textContent = 'Fetch failed';
          throw err;
        }),

    onHeaderCheckboxChange: (field, checked) => {
      // Patching only loaded rows would leave a not-yet-loaded page showing the stale server
      // value, so the override is stored server-side and refresh() reloads everything with it
      // already applied.
      statusEl.textContent = 'Applying...';
      fetch('/demo/toggleColumn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, checked }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          bigGrid.refresh();
        })
        .catch((err) => {
          console.error('Header checkbox apply error:', err);
          statusEl.textContent = 'Apply failed';
        });
    },
  });

  window.bigGrid = bigGrid;
}

build();
initBigDataGrid();
