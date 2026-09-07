// 전체 기능 데모 — 컬럼 타입/렌더러/에디터/옵션/콜백/공개 메서드를 실제로 동작시킨다.
// 목적은 두 가지: (1) 구현된 기능이 실제로 도는지 눈으로 확인, (2) 어떤 동작에 애니메이션이
// 있고 없는지(= 캔버스 작업이 필요한 범위) 구분해 보이기.
import { JHGrid, CellRenderers, KO_I18N, JA_I18N, ZH_I18N } from '../index.js';
import { makeRows, COLUMNS, DEPT_OPTIONS, SKILL_OPTIONS, GRADE_OPTIONS } from './data.js';

const ROWS = makeRows(1000000);
const $ = (sel) => document.querySelector(sel);

// 이벤트 로그 — 콜백이 실제로 발화하는지 보여준다.
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
      // 빈 배열은 "아무것도 안 걸림"이 아니라 "모두 해제"로 본다. 체크를 전부 푼 채 적용하면
      // 결과가 0건이 되는 편이 논리적이지만, 실수로 화면을 비워버리는 쪽이 훨씬 흔하다.
      if (cond.length === 0) continue;
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

// ── 메인 그리드 ────────────────────────────────────────────────────────────────
// 언어/테마를 바꾸려면 재생성이 필요해서(생성자 옵션) 팩토리로 감싼다.
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
  // 기본값은 검정 계열 워시라 어두운 행 위에서는 보이지 않는다 — 밝은 쪽으로 뒤집는다.
  hoverRowBg: 'rgba(255,255,255,0.055)',
};

let grid = null;
let opts = { locale: 'ko', dark: false };

function columnDefs() {
  return [
    { field: 'id',    label: 'ID',    width: 60,  align: 'right', renderer: CellRenderers.number() },
    { field: 'avatar', label: '사진', width: 34,  type: 'image', renderer: CellRenderers.image({ fit: 'cover', radius: 4 }) },
    // 그룹 헤더는 columnDefs[].group으로도 만들 수 있다(headerRows를 직접 쓰지 않는 경로).
    { field: 'name',  label: '이름',  width: 130, group: '기본 정보',
      validation: { required: true, minLength: 2, message: '이름은 2자 이상이어야 합니다.' } },
    { field: 'email', label: '이메일', width: 200, group: '기본 정보' },
    { field: 'dept',  label: '부서',  width: 130, group: '소속', type: 'dropdown', options: DEPT_OPTIONS},
    { field: 'skills', label: '스킬', width: 150, group: '소속', type: 'multiselect', options: SKILL_OPTIONS },
    { field: 'active', label: '재직', width: 96,  group: '소속', type: 'checkbox', headerCheckbox: true },
    { field: 'verified', label: '인증', width: 70, renderer: CellRenderers.checkmark({ showFalse: true }) },
    { field: 'progress', label: '진행률', width: 120, renderer: CellRenderers.progressBar({ max: 100 }) },
    { field: 'grade', label: '등급', width: 80, renderer: CellRenderers.badge({
        colorMap: { A: { bg: '#dcfce7', fg: '#166534' }, B: { bg: '#dbeafe', fg: '#1e40af' },
                    C: { bg: '#fef9c3', fg: '#854d0e' }, D: { bg: '#fee2e2', fg: '#991b1b' } } }) },
    { field: 'salary', label: '연봉', width: 130, align: 'right',
      renderer: CellRenderers.currency({ locale: 'ko-KR', currency: 'KRW' }) },
    { field: 'joined', label: '입사일', width: 120, type: 'date', format: 'YYYY-MM-DD' },
    { field: 'score', label: '점수', width: 90, align: 'right',
      validation: { min: 0, max: 100, message: '0~100 사이여야 합니다.' } },
    { field: 'note',  label: '메모', width: 150, type: 'text', renderer: CellRenderers.richtext() },
    { field: 'action', label: '작업', width: 90, type: 'button', button: {
        label: (row) => row?.active === 'true' ? '비활성' : '활성',
        variant: (row) => row?.active === 'true' ? 'danger' : 'success',
        disabled: (row) => row?.grade === 'D',
        onClick: (rowIndex, row) => {
          grid.setCellValue(rowIndex, 'active', row?.active === 'true' ? 'false' : 'true');
          log('button.onClick', `row ${rowIndex} → active=${row?.active === 'true' ? 'false' : 'true'}`);
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
    // 고정 경계는 반드시 그룹 경계와 맞춰야 한다. 3으로 두면 '기본 정보'(이름+이메일)가
    // 고정/스크롤 영역에 걸쳐 그룹 헤더가 그려지지 않는다.
    frozenCols: 2,            // ID/사진 왼쪽 고정 (행번호 컬럼은 별도로 항상 고정)
    frozenColsRight: 1,       // '작업' 버튼 컬럼 오른쪽 고정
    locale: opts.locale,
    i18n,
    theme: opts.dark ? DARK_THEME : undefined,
    columnDefs: columnDefs(),
    ariaLabel: 'JHGrid 전체 기능 데모',
    responsive: true,

    // 조건부 색상 — 캔버스에서 그려진다.
    cellBackground: (row, r, field) =>
      field === 'score' && Number(row?.score) < 40 ? 'rgba(239,68,68,0.14)' : null,
    rowHighlighter: (row) => row?.dept === 'Engineering' ? 'rgba(59,130,246,0.07)' : null,

    // 상태는 fetchMeta에도 온다. 여기서 걸러진 개수를 안 돌려주면 스크롤 막대와 행 번호가
    // 필터 걸기 전 기준으로 남아, 있지도 않은 행까지 스크롤된다.
    fetchMeta: async (state) => ({
      totalRows: applyState(ROWS, state).length,
      columns:   COLUMNS.concat('action'),
    }),
    fetchData: async (page, size, state) => ({
      rows: applyState(ROWS, state)
        .slice(page * size, page * size + size)
        .map(r => ({ ...r, action: '' })),
    }),

    // 값 조회 — 이게 있어야 고유값이 많은 컬럼(이메일, 이름)의 필터가 태그 방식이 된다.
    // 진짜 서버라면 여기서 SELECT DISTINCT를 때리면 된다. 지연을 조금 넣어 왕복처럼 보이게 했다.
    fetchFilterValues: async (field, query) => {
      await new Promise(r => setTimeout(r, 120));
      const q = query.toLowerCase();
      const seen = new Set();
      for (const row of ROWS) {
        const v = String(row[field] ?? '');
        if (v.toLowerCase().includes(q)) seen.add(v);
        if (seen.size >= 20) break;
      }
      log('fetchFilterValues', `${field} ~ "${query}" → ${seen.size}건`);
      return [...seen];
    },

    // 콜백 15종 — 실제로 발화하는지 로그로 확인
    onCellChange:      ({ row, field, newValue }) => log('onCellChange', `[${row}] ${field} = ${newValue}`),
    onSelectionChange: (sel) => log('onSelectionChange', sel ? JSON.stringify(sel) : 'null'),
    onSort:            (sorts) => log('onSort', JSON.stringify(sorts)),
    onFilter:          (filters) => log('onFilter', JSON.stringify(filters)),
    onRowSelect:       (rows) => log('onRowSelect', `${rows.length}행 선택`),
    onColumnReorder:   (from, to) => log('onColumnReorder', `${from} → ${to}`),
    onColumnResize:    (f, w) => log('onColumnResize', `${f} = ${Math.round(w)}px`),
    onRowHeightResize: (r, h) => log('onRowHeightResize', `row ${r} = ${Math.round(h)}px`),
    onRowReorder:      (from, to) => log('onRowReorder', `${from} → ${to}`),
    onValidationError: (r, f, msg) => log('onValidationError', `[${r}] ${f}: ${msg}`),
    onHeaderCheckboxChange: (f, checked) => {
      log('onHeaderCheckboxChange', `${f} = ${checked}`);
      // 헤더 체크박스는 표시/이벤트만 담당한다 — 실제 열 데이터 반영은 소비자 몫이라
      // 현재 필터/정렬이 적용된 행 수만큼 setCellValue를 돌려 값을 맞춘다.
      if (f !== 'active') return;
      const n = applyState(ROWS, grid.getState()).length;
      // n onCellChange firings each appending a log line would itself be the bottleneck at
      // scale — suppress the per-cell log noise and report the batch as one line instead.
      logSuppressed = true;
      grid.setCellValues(Array.from({ length: n }, (_, r) => ({ row: r, field: 'active', value: String(checked) })));
      logSuppressed = false;
      log('onCellChange', `(일괄) active = ${checked} × ${n}행`);
      status();
    },
    onRender:          () => {},   // 매 프레임이라 로그하지 않는다
    onChunkError:      (e) => log('onChunkError', String(e)),
  });

  window.grid = grid;
  status();
  // 첫 부트가 끝나야 컬럼/행 수가 채워지므로 그때 한 번 더 갱신한다.
  grid.ready().then(status).catch(() => {});
}

function status() {
  const st = grid.getState();
  $('#status').textContent =
    `컬럼 ${st.columns.length} · 언어 ${opts.locale} · 테마 ${opts.dark ? 'dark' : 'light'} · ` +
    `편집 ${Object.keys(grid.getEdits()).length}건 · 선택 ${grid.getSelectedRows().length}행 · ` +
    `추가행 ${grid.getNewRows().length} · 삭제행 ${grid.getDeletedRows().length}`;
}

// ── 제어 패널 ─────────────────────────────────────────────────────────────────
const actions = {
  undo:        () => grid.undo(),
  redo:        () => grid.redo(),
  addRow:      () => grid.addRow({ name: '새 사용자', dept: 'Engineering', score: '50' }),
  delRow:      () => { const s = grid.getSelectedRows(); if (!s.length) return log('info', '선택된 행 없음'); s.forEach(r => grid.deleteRow(r)); },
  undelRow:    () => grid.getDeletedRows().forEach(r => grid.undeleteRow(r)),
  addCol:      () => grid.addColumn(`EXTRA_${Date.now() % 1000}`, { label: '추가컬럼', width: 110 }),
  hideCol:     () => grid.isColumnVisible('email') ? grid.hideColumn('email') : grid.showColumn('email'),
  autoFit:     () => grid.autoFitColumns(),
  validate:    () => { const bad = grid.validateAll(); log('validateAll', `${Object.keys(bad).length}행에 오류`); },
  exportCsv:   () => grid.exportCsv({ filename: 'jhgrid-demo.csv' }),
  print:       () => grid.printGrid({ title: 'JHGrid 데모' }),
  saveState:   () => { sessionStorage.setItem('jhgrid-state', JSON.stringify(grid.getState())); log('getState', '저장됨'); },
  loadState:   () => { const s = sessionStorage.getItem('jhgrid-state'); if (s) { grid.setState(JSON.parse(s)); log('setState', '복원됨'); } },
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

// CSS 변수 오버라이드 토글 — DOM 표면만 바뀌고 캔버스는 그대로인 것을 보여준다.
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

// 모션 강도 조절 — --jhg-motion-* 이 실제로 먹는지 확인용
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

// ── 페이지네이션 그리드 ───────────────────────────────────────────────────────
new JHGrid({
  container: '#grid-paged',
  width: 560, height: 260, responsive: true,
  pagination: { enabled: true, pageSize: 8 },
  showRowNumbers: true,
  rowSelection: 'single',
  editableCols: ['name'],
  columnDefs: [
    { field: 'name', label: '이름', width: 140 },
    { field: 'dept', label: '부서', width: 130 },
    { field: 'grade', label: '등급', width: 80 },
  ],
  fetchMeta: async (state) => ({
    totalRows: Math.min(40, applyState(ROWS, state).length),
    columns:   ['name', 'dept', 'grade'],
  }),
  fetchData: async (p, s, state) => ({ rows: applyState(ROWS, state).slice(p * s, p * s + s) }),
  onPageChange: (page) => log('onPageChange', `page ${page + 1}`),
});

// ── 빈 상태 그리드 ────────────────────────────────────────────────────────────
new JHGrid({
  container: '#grid-empty',
  width: 560, height: 160, responsive: true,
  columnDefs: [{ field: 'name', label: '이름' }],
  fetchMeta: async () => ({ totalRows: 0, columns: ['name'] }),
  fetchData: async () => ({ rows: [] }),
});

// ── 대용량 그리드 — opts.fetchPage + 실제 서버 API ───────────────────────────────
//
// 위 메인 그리드는 fetchMeta+fetchData 두 콜백으로 "브라우저 메모리 위 배열"을 걸러낸다.
// 이 그리드는 그 반대편 짝이다: 백엔드가 한 번의 호출로 rows와 totalRows를 같이 돌려주는
// 실제 서버(SQL COUNT(*) OVER() 같은 패턴)라면, fetchMeta+fetchData 두 개를 따로 구현할
// 필요 없이 opts.fetchPage 하나만 쓰면 된다 — JHGrid.js의 deriveFetchFromPage()가 내부적으로
// fetchMeta/fetchData 모양으로 풀어준다. server.mjs의 POST /demo/gridView, /demo/toggleColumn
// 이 그 "실제 서버" 역할이다(자세한 건 server.mjs 주석 참고).
const BIG_FIELDS_META = {
  id:     { label: 'ID',   width: 70,  align: 'right', renderer: CellRenderers.number() },
  name:   { label: '이름', width: 140 },
  email:  { label: '이메일', width: 220 },
  dept:   { label: '부서', width: 130, type: 'dropdown', options: DEPT_OPTIONS },
  active: { label: '재직', width: 90,  type: 'checkbox', headerCheckbox: true },
  grade:  { label: '등급', width: 80 },
  salary: { label: '연봉', width: 130, align: 'right',
    renderer: CellRenderers.currency({ locale: 'ko-KR', currency: 'KRW' }) },
  score:  { label: '점수', width: 90,  align: 'right' },
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

    // fetchMeta/fetchData 두 콜백 대신 이 하나만 넘긴다. 반환 모양은 { rows, totalRows }.
    // `state` is the sort/filter the grid wants applied. Forwarding it is what makes the header's
    // filter mean anything here — without it the server keeps returning the whole table and the
    // grid shows an active filter over unfiltered rows.
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
          statusEl.textContent = `총 ${data.totalRows.toLocaleString()}행 (서버: fetchPage)`;
          return { rows: data.rows ?? [], totalRows: data.totalRows };
        })
        .catch((err) => {
          console.error('대용량 그리드 조회 오류:', err);
          statusEl.textContent = '조회 실패';
          throw err;
        }),

    onHeaderCheckboxChange: (field, checked) => {
      // 로드된 행만 patch하면 이후 스크롤로 처음 불러오는 페이지는 서버가 원래 값을 돌려줘
      // "절반만 적용된" 것처럼 보인다. 그래서 서버에 override를 남기고(POST /demo/toggleColumn)
      // refresh()로 전체를 다시 불러온다 — 아직 로드 안 한 행도 처음부터 override된 값으로 온다.
      statusEl.textContent = '적용 중...';
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
          console.error('헤더 체크박스 적용 오류:', err);
          statusEl.textContent = '적용 실패';
        });
    },
  });

  window.bigGrid = bigGrid;
}

build();
initBigDataGrid();
