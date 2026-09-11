var JHGrid = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // index.js
  var index_exports = {};
  __export(index_exports, {
    BuiltinRenderers: () => CellRenderers,
    CellEditors: () => CellEditors,
    CellRenderers: () => CellRenderers,
    DEFAULT_THEME: () => DEFAULT_THEME,
    DataManager: () => DataManager,
    GRID_CLASSES: () => CLS,
    JA_I18N: () => ja,
    JHGrid: () => JHGrid,
    KO_I18N: () => ko,
    Renderer: () => Renderer,
    SUPPORTED_BROWSERS: () => SUPPORTED_BROWSERS,
    VERSION: () => VERSION,
    ZH_I18N: () => zh,
    computeHeaderCells: () => computeHeaderCells,
    registerCellEditor: () => registerCellEditor,
    registerCellRenderer: () => registerCellRenderer
  });

  // core/DataManager.js
  var DataManager = class {
    #fetchData;
    #chunkSize;
    #maxChunks;
    #cache = /* @__PURE__ */ new Map();
    #fetching = /* @__PURE__ */ new Set();
    #failed = /* @__PURE__ */ new Set();
    #failedTimers = /* @__PURE__ */ new Set();
    #gen = 0;
    // Chunks asked for but not yet sent. Insertion-ordered, and re-asking moves a chunk to the
    // end, so the last entry is always the one wanted most recently.
    #queue = /* @__PURE__ */ new Map();
    #maxInFlight;
    #maxQueued;
    // True while the view is moving; see setHold().
    #hold = false;
    onChunkLoaded = null;
    // Called after a chunk finishes loading successfully.
    onChunkError = null;
    // Called with (error, chunkIdx) after a chunk exhausts its retries.
    // opts.fetchData(chunkIdx, chunkSize) must resolve { rows: [] } for the given chunk.
    //
    // `maxInFlight` is 2 because that is what the screen can actually be showing at once: a viewport
    // straddling a chunk boundary needs both halves, and nothing beyond that is on screen to need a
    // third. Requesting more does not fill the screen any sooner — it just puts the chunk the user
    // is looking at behind chunks they have already scrolled past.
    constructor({ fetchData, chunkSize = 300, maxChunks = 50, maxInFlight = 2, maxQueued = 4 }) {
      this.#fetchData = fetchData;
      this.#chunkSize = chunkSize;
      this.#maxChunks = maxChunks;
      this.#maxInFlight = Math.max(1, maxInFlight);
      this.#maxQueued = Math.max(1, maxQueued);
    }
    // Returns the row at `rowIndex` if its chunk is cached, marking the chunk as most-recently-used.
    // If not cached, triggers a background load and returns null immediately (caller should
    // re-request after onChunkLoaded).
    getRow(rowIndex) {
      const chunkIdx = Math.floor(rowIndex / this.#chunkSize);
      if (this.#cache.has(chunkIdx)) {
        const chunk = this.#cache.get(chunkIdx);
        this.#cache.delete(chunkIdx);
        this.#cache.set(chunkIdx, chunk);
        return chunk[rowIndex % this.#chunkSize] ?? null;
      }
      this.#request(chunkIdx);
      return null;
    }
    // Overwrites the cached row at `rowIndex` in place -- for a host that already knows the new
    // server-side truth (e.g. just persisted an edit) and wants getRow() to reflect it without
    // refetching. No-op if the row's chunk isn't cached: nothing stale to fix, and a later getRow()
    // will fetch the current value anyway.
    setRow(rowIndex, data) {
      const chunkIdx = Math.floor(rowIndex / this.#chunkSize);
      const chunk = this.#cache.get(chunkIdx);
      if (!chunk) return;
      chunk[rowIndex % this.#chunkSize] = data;
    }
    // Splices `data` in at absolute row index `rowIndex`, sliding every already-cached row at or
    // after it over by one slot -- across a chunk boundary if needed -- instead of asking the network
    // for that range again. A refetch is not just wasteful here: for a table with no fixed row order
    // (no primary key to sort by), the server has no way to know "the row that was visually at this
    // position" and would just hand back its own default ordering, which can land the just-inserted
    // row somewhere else entirely -- looking, from the host's side, like an unprompted resort.
    // Shifting in place keeps everything already on screen exactly where it is; the row that falls
    // off the end of the last chunk touched simply goes back to not-yet-loaded, the same as a chunk
    // nobody has scrolled to yet, and picks up its real value next time something asks for it.
    insertAt(rowIndex, data) {
      let carry = data;
      let idx = rowIndex;
      while (carry !== void 0) {
        const chunkIdx = Math.floor(idx / this.#chunkSize);
        const chunk = this.#cache.get(chunkIdx);
        if (!chunk) break;
        const offset = idx % this.#chunkSize;
        if (offset > chunk.length) break;
        const displaced = offset < chunk.length ? chunk[chunk.length - 1] : void 0;
        for (let i = chunk.length - 1; i > offset; i--) chunk[i] = chunk[i - 1];
        chunk[offset] = carry;
        carry = displaced;
        idx = (chunkIdx + 1) * this.#chunkSize;
      }
    }
    // Kicks off background loads for every chunk covering [startRow, endRow], plus one extra trailing
    // chunk. No-op for chunks already cached, loading, or blacklisted.
    prefetch(startRow, endRow) {
      const s = Math.floor(startRow / this.#chunkSize);
      const e = Math.floor(endRow / this.#chunkSize);
      for (let i = s; i <= e + 1; i++) this.#request(i);
    }
    // Loads every chunk covering [startRow, endRow] -- meant for a one-time "load all of it" call (a
    // data source that's already fully in memory, see JHGrid's opts.data boot path). Deliberately
    // bypasses #queue/#request(): that queue assumes a chunk not yet sent is stale (a fast scroll
    // has moved on) and caps itself at maxQueued, evicting the oldest ask once more come in -- fine
    // for scroll-driven prefetch(), fatal here, since anything else calling getRow() while dozens of
    // chunks are still queued (column auto-fit, aggregate footers, ...) would evict most of them
    // before #pump() ever got to them. A bounded-concurrency loop straight through #load() has no
    // such cap and needs none, since every chunk asked for here stays wanted until it arrives.
    async loadAll(startRow, endRow) {
      const s = Math.floor(startRow / this.#chunkSize);
      const e = Math.floor(endRow / this.#chunkSize);
      const chunks = [];
      for (let i = s; i <= e; i++) chunks.push(i);
      let next = 0;
      const worker = async () => {
        while (next < chunks.length) await this.#load(chunks[next++]);
      };
      await Promise.all(Array.from({ length: this.#maxInFlight }, worker));
    }
    // Asks for a chunk. Queued rather than sent, because the caller is a render pass and a fast
    // scroll produces one of these per frame — sending them all is how the chunk the scroll ends on
    // ends up behind forty chunks nobody will look at.
    //
    // Re-asking for something already queued moves it to the back, which is what makes the queue
    // track the viewport: the entries that stop being re-asked for drift to the front and get
    // dropped when the queue overflows, without anyone having to say "that one is stale now".
    #request(chunkIdx) {
      if (this.#cache.has(chunkIdx) || this.#fetching.has(chunkIdx) || this.#failed.has(chunkIdx)) return;
      this.#queue.delete(chunkIdx);
      this.#queue.set(chunkIdx, true);
      while (this.#queue.size > this.#maxQueued) {
        this.#queue.delete(this.#queue.keys().next().value);
      }
      this.#pump();
    }
    // Holds sending while the view is still moving.
    //
    // Everything asked for mid-scroll describes somewhere the user is passing through, not somewhere
    // they are looking: by the time it arrives the view has moved on, so the round trip bought
    // nothing. Limiting how many go at once was not enough — the sending simply spread out across
    // the drag instead of stopping.
    //
    // Held, the queue still records every ask and still keeps only the newest, so releasing sends
    // exactly the position the scroll ended on. The grid already knows when that is: it settles the
    // scroll 150ms after the last movement.
    setHold(hold) {
      const was = this.#hold;
      this.#hold = !!hold;
      if (!was || this.#hold) return;
      this.#queue.clear();
      this.#pump();
    }
    // Sends whatever the queue says is wanted most recently, up to the in-flight limit. Newest
    // first: on a scroll, that is the chunk closest to where the user has ended up.
    #pump() {
      if (this.#hold) return;
      while (this.#fetching.size < this.#maxInFlight && this.#queue.size > 0) {
        let newest;
        for (const k of this.#queue.keys()) newest = k;
        this.#queue.delete(newest);
        this.#load(newest);
      }
    }
    // Swaps the fetch function (e.g. new sort/filter params), invalidating all in-flight loads from
    // the previous generation and clearing the cache.
    setFetch(fn) {
      this.#fetchData = fn;
      this.#gen++;
      this.clear();
    }
    async #load(chunkIdx) {
      if (this.#cache.has(chunkIdx) || this.#fetching.has(chunkIdx) || this.#failed.has(chunkIdx)) return;
      this.#fetching.add(chunkIdx);
      const gen = this.#gen;
      try {
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (gen !== this.#gen) return;
          try {
            const { rows } = await this.#fetchData(chunkIdx, this.#chunkSize);
            if (gen !== this.#gen) return;
            if (!Array.isArray(rows)) throw new TypeError("fetchData must resolve { rows: [] }");
            this.#cache.set(chunkIdx, rows);
            this.#evict();
            this.onChunkLoaded?.();
            return;
          } catch (err) {
            lastErr = err;
            if (err instanceof TypeError) break;
            if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          }
        }
        if (gen === this.#gen) {
          console.error(`[DataManager] chunk ${chunkIdx} failed after retries:`, lastErr);
          this.onChunkError?.(lastErr, chunkIdx);
          this.#failed.add(chunkIdx);
          const tid = setTimeout(() => {
            this.#failed.delete(chunkIdx);
            this.#failedTimers.delete(tid);
          }, 5e3);
          this.#failedTimers.add(tid);
        }
      } finally {
        this.#fetching.delete(chunkIdx);
        this.#pump();
      }
    }
    // Evict least-recently-used chunks until cache is within maxChunks.
    // Map preserves insertion order; the first key is always the oldest.
    #evict() {
      while (this.#cache.size > this.#maxChunks) {
        const oldest = this.#cache.keys().next().value;
        this.#cache.delete(oldest);
      }
    }
    // Returning `false` from `callback` stops the walk. Callers that are looking for an answer
    // rather than visiting everything — "does this column have more than N distinct values" — would
    // otherwise keep scanning every cached row long after they knew, and the cache can hold a lot of
    // rows.
    forEachLoaded(callback) {
      for (const [chunkIdx, chunk] of [...this.#cache]) {
        const base = chunkIdx * this.#chunkSize;
        for (let i = 0; i < chunk.length; i++) {
          if (callback(chunk[i], base + i) === false) return;
        }
      }
    }
    // Drops all cached/pending/blacklisted chunk state and cancels pending failure timers.
    //
    // The queue goes too. After a sort or filter change those entries describe positions in a result
    // set that no longer exists, and sending them would spend the server's time on rows the grid has
    // already decided it cannot use — the in-flight ones are at least already paid for.
    clear() {
      this.#cache.clear();
      this.#fetching.clear();
      this.#queue.clear();
      this.#failed.clear();
      this.#failedTimers.forEach(clearTimeout);
      this.#failedTimers.clear();
    }
  };

  // core/HeaderGroups.js
  function normalizeGroupPath(group) {
    if (group == null) return [];
    return Array.isArray(group) ? group : [group];
  }
  function buildGroupLevel(defs, depth, maxDepth, rows) {
    if (depth === maxDepth) return;
    let i = 0;
    while (i < defs.length) {
      const def = defs[i];
      const key = def._path[depth];
      if (key === void 0) {
        rows[depth].push({ label: def.label ?? def.field, fields: [def.field], rowspan: maxDepth + 1 - depth });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < defs.length && defs[j]._path[depth] === key) j++;
      const run = defs.slice(i, j);
      rows[depth].push({ label: key, fields: run.map((d) => d.field) });
      buildGroupLevel(run, depth + 1, maxDepth, rows);
      i = j;
    }
  }
  function deriveHeaderRowsFromColumnGroups(columnDefs) {
    const defs = (columnDefs ?? []).map((d) => ({ field: d.field, label: d.label, _path: normalizeGroupPath(d.group) }));
    const maxDepth = Math.max(0, ...defs.map((d) => d._path.length));
    if (maxDepth === 0) return null;
    const rows = Array.from({ length: maxDepth }, () => []);
    buildGroupLevel(defs, 0, maxDepth, rows);
    return rows;
  }
  function columnLetter(index) {
    let label = "";
    for (let n = index + 1; n > 0; ) {
      const rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  }
  function computeHeaderCells(headerRows, columns, columnLetterHeader = false) {
    const numCols = columns.length;
    const numGroupRows = headerRows?.length ?? 0;
    const letterRows = columnLetterHeader ? 1 : 0;
    const totalRows = numGroupRows + 1 + letterRows;
    const occupied = Array.from({ length: totalRows }, () => new Array(numCols).fill(false));
    const cells = [];
    if (columnLetterHeader) {
      for (let c = 0; c < numCols; c++) {
        cells.push({
          row: 0,
          col: c,
          colspan: 1,
          rowspan: 1,
          label: columnLetter(c),
          align: "center",
          isLeaf: false,
          isColLetter: true
        });
      }
    }
    for (let r = 0; r < numGroupRows; r++) {
      const row = r + letterRows;
      let cursor = 0;
      for (const def of headerRows[r] ?? []) {
        const { label = "", fields, colspan, rowspan = 1, align = "center" } = def;
        const rs = Math.min(rowspan, totalRows - row);
        let runs;
        if (fields) {
          const positions = fields.map((f) => columns.indexOf(f)).filter((i) => i >= 0).sort((a, b) => a - b);
          runs = [];
          for (const pos of positions) {
            const last = runs[runs.length - 1];
            if (last && last.start + last.length === pos) last.length++;
            else runs.push({ start: pos, length: 1 });
          }
        } else {
          while (cursor < numCols && occupied[row][cursor]) cursor++;
          if (cursor >= numCols) continue;
          runs = [{ start: cursor, length: Math.min(colspan ?? 1, numCols - cursor) }];
          cursor += runs[0].length;
        }
        for (const { start, length } of runs) {
          const cs = length;
          for (let dr = 0; dr < rs; dr++)
            for (let dc = 0; dc < cs; dc++)
              if (row + dr < totalRows) occupied[row + dr][start + dc] = true;
          cells.push({
            row,
            col: start,
            colspan: cs,
            rowspan: rs,
            label,
            align,
            isLeaf: row + rs >= totalRows
          });
        }
      }
    }
    const leafRow = numGroupRows + letterRows;
    for (let c = 0; c < numCols; c++) {
      if (!occupied[leafRow][c])
        cells.push({
          row: leafRow,
          col: c,
          colspan: 1,
          rowspan: 1,
          label: null,
          align: null,
          isLeaf: true
        });
    }
    return cells;
  }

  // core/geometry.js
  function colScreenX(col, geo, scrollLeft) {
    const { frozenCount, frozenWidth, frozenRightCount = 0, rightX, colPositions } = geo;
    if (col < frozenCount) return colPositions[col];
    const n = colPositions.length - 1;
    if (frozenRightCount > 0 && col >= n - frozenRightCount) {
      const base = n - frozenRightCount;
      return rightX + colPositions[col] - colPositions[base];
    }
    return frozenWidth + colPositions[col] - colPositions[frozenCount] - scrollLeft;
  }

  // core/ImageCache.js
  var MAX_BYTES = 50 * 1024 * 1024;
  var MAX_CONCURRENCY = 6;
  var MIN_DECODE_PX = 24;
  var MAX_DECODE_PX = 256;
  var cache = /* @__PURE__ */ new Map();
  var queue = [];
  var inFlight = 0;
  var listeners = /* @__PURE__ */ new Set();
  function notify() {
    for (const fn of listeners) {
      try {
        fn();
      } catch (err) {
        console.error("[JHGrid] image cache load listener error:", err);
      }
    }
  }
  function estimateBytes(bitmap) {
    return bitmap.width * bitmap.height * 4;
  }
  function evictIfNeeded() {
    let total = 0;
    for (const entry of cache.values()) total += entry.bytes;
    if (total <= MAX_BYTES) return;
    for (const [url, entry] of cache) {
      if (total <= MAX_BYTES) break;
      if (entry.status === "loading") continue;
      cache.delete(url);
      total -= entry.bytes;
    }
  }
  function touch(url) {
    const entry = cache.get(url);
    if (entry) {
      cache.delete(url);
      cache.set(url, entry);
    }
    return entry;
  }
  function loadViaImgElement(url, targetW, targetH) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => createImageBitmap(img, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "medium" }).then(resolve, reject);
      img.onerror = () => reject(new Error(`[JHGrid] image cache: failed to load ${url}`));
      img.src = url;
    });
  }
  async function decode(url, w, h) {
    const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
    const targetW = Math.max(MIN_DECODE_PX, Math.min(MAX_DECODE_PX, Math.round(w * dpr)));
    const targetH = Math.max(MIN_DECODE_PX, Math.min(MAX_DECODE_PX, Math.round(h * dpr)));
    try {
      let bitmap;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        bitmap = await createImageBitmap(blob, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "medium" });
      } catch {
        bitmap = await loadViaImgElement(url, targetW, targetH);
      }
      cache.set(url, { status: "loaded", bitmap, bytes: estimateBytes(bitmap) });
      evictIfNeeded();
    } catch (err) {
      console.error("[JHGrid] image cache decode error:", err);
      cache.set(url, { status: "error", bitmap: null, bytes: 0 });
    } finally {
      inFlight--;
      notify();
      pump();
    }
  }
  function pump() {
    while (inFlight < MAX_CONCURRENCY && queue.length > 0) {
      const { url, w, h } = queue.shift();
      const entry = cache.get(url);
      if (!entry || entry.status !== "loading") continue;
      inFlight++;
      decode(url, w, h);
    }
  }
  function requestImage(url, w, h) {
    if (!url) return null;
    const existing = touch(url);
    if (existing) return existing;
    const entry = { status: "loading", bitmap: null, bytes: 0 };
    cache.set(url, entry);
    queue.push({ url, w, h });
    pump();
    return entry;
  }
  function addLoadListener(fn) {
    listeners.add(fn);
  }
  function removeLoadListener(fn) {
    listeners.delete(fn);
  }

  // Renderer.js
  var FILTER_ICON_W = 20;
  var NESTED_ROW_INDENT_PX = 18;
  var TREE_CHEVRON_W = 16;
  var DROPDOWN_ARROW_W = 20;
  var DEFAULT_THEME = {
    headerBg: "#E8E8E8",
    headerText: "#3D3D3D",
    headerBorder: "#C0C0C0",
    rowEven: "#FFFFFF",
    rowOdd: "#FFFFFF",
    cellBorder: "#D9D9D9",
    cellText: "#212121",
    loadingText: "#BFBFBF",
    // Bar drawn in place of a cell whose row has not arrived yet, and the lighter band that
    // sweeps across it. The band is drawn *over* the bars, so it reads as light passing rather
    // than as a second thing on the row.
    skeletonBar: "#E4E7EB",
    skeletonSheen: "rgba(255,255,255,0.65)",
    cellPadding: 10,
    selectionColor: "#2E75B6",
    selectionFill: "rgba(46,117,182,0.10)",
    selRowBg: "rgba(46,117,182,0.12)",
    // Pointer-hover row wash. Deliberately a neutral tint rather than the selection blue: hover and
    // selection are different signals and must stay distinguishable when they land on the same row.
    // A theme with a dark body should override this with a light value — a black wash over near-black
    // reads as nothing.
    hoverRowBg: "rgba(0,0,0,0.045)",
    scrollbarBg: "#F0F0F0",
    scrollbarThumb: "#C0C0C0",
    scrollbarRadius: 4,
    frozenBorder: "#B0B0B0",
    // Excel-style double line on a header cell next to a hidden column. Lived only as an inline
    // `?? '#94A3B8'` at the draw site, which left it out of DEFAULT_THEME — so it never showed up
    // as a themeable key, and index.d.ts documented a different value than the one that shipped.
    hiddenColIndicator: "#94A3B8",
    groupHeaderBg: "#EEF2F7",
    groupHeaderText: "#1E293B",
    footerBg: "#F2F2F2",
    footerText: "#1E293B",
    filterIconBg: "rgba(245,158,11,0.18)",
    sortIconBg: "rgba(46,117,182,0.12)",
    filterIconColor: "#C87B00",
    sortIconColor: "#2E75B6",
    headerIconColor: "rgba(0,0,0,0.28)",
    // Status indicators — themeable (and remapped by #initHighContrast in
    // JHGrid.js under forced-colors mode) rather than hardcoded, so a custom
    // high-contrast theme can still make them visible.
    dragIndicatorFill: "rgba(59,130,246,0.12)",
    dragIndicatorLine: "#3b82f6",
    // Drop shadow under the header cell being carried during a column drag — what makes it read as
    // lifted off the grid rather than painted onto it.
    dragGhostShadow: "rgba(15,23,42,0.30)",
    deletedRowFill: "rgba(239,68,68,0.10)",
    deletedRowStrike: "rgba(239,68,68,0.55)",
    invalidCellBorder: "#dc2626",
    fontSize: 13,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    // BCP-47 tag CellRenderers.number/date/currency fall back to when a column
    // doesn't pin its own `locale` — set from JHGridOptions.locale, not a visual token.
    locale: "en-US",
    // Overlay/popup chrome — column chooser, context menus, filter panels,
    // the insert-column dialog, and the pagination bar (see core/Overlays.js and
    // JHGrid.js). Kept as separate tokens (rather than reusing the canvas-render
    // ones above) since these are DOM elements with their own accepted palette.
    overlayBg: "#FFFFFF",
    overlayBorder: "#D0D0D0",
    overlayHeaderBg: "#F5F5F5",
    overlayDivider: "#E0E0E0",
    overlayText: "#212121",
    overlayMutedText: "#595959",
    overlayHintText: "#909090",
    overlayHoverBg: "#F5F5F5",
    overlayItemHoverBg: "#F0F0F0",
    overlayShadow: "0 4px 16px rgba(0,0,0,0.15)",
    overlayMenuShadow: "0 4px 12px rgba(0,0,0,0.15)",
    overlayAccentText: "#FFFFFF",
    pagerBg: "#f8fafc",
    pagerBorder: "#e2e8f0",
    pagerText: "#1e293b",
    pagerButtonBg: "#ffffff",
    pagerButtonBorder: "#cbd5e1",
    // Cell editability tints — applied per-column when editableCols is not '*'.
    // readonlyCellBg defaults to a light gray so readonly cells are visually distinct
    // without any extra configuration; editableCellBg is opt-in (undefined = no tint).
    readonlyCellBg: "#F5F5F5",
    editableCellBg: void 0,
    // CellRenderers.image() — shown while a cell's image is loading or failed to load.
    imagePlaceholderBg: "#F1F5F9",
    imageErrorBg: "#FEE2E2",
    imageErrorIcon: "#DC2626"
  };
  var CellRenderers = {
    // Renders `<b>/<i>/<u>/<s>` inline-marked text (the format `sanitizeInlineHtml()` in `Editors.js`
    // produces) as styled canvas text runs. Single line, clipped (not ellipsized) on overflow like
    // the other built-in renderers below. Auto-applied when `type: 'richtext'`; can also be used
    // directly as a renderer.
    richtext() {
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        if (value == null || value === "") return;
        const runs = parseInlineRuns(String(value));
        if (!runs.length) return;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = theme.cellText;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        let cx = x + padding;
        const cy = y + h / 2;
        for (const run of runs) {
          ctx.font = `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}${theme.fontSize}px ${theme.fontFamily}`;
          ctx.fillText(run.text, cx, cy);
          const tw = ctx.measureText(run.text).width;
          if (run.underline || run.strike) {
            ctx.strokeStyle = theme.cellText;
            ctx.lineWidth = 1;
            const ly = run.underline ? cy + theme.fontSize / 2 - 1 : cy;
            ctx.beginPath();
            ctx.moveTo(cx, ly);
            ctx.lineTo(cx + tw, ly);
            ctx.stroke();
          }
          cx += tw;
        }
        ctx.restore();
      };
    },
    // Draws a per-row indent + expand/collapse chevron from `rowData.__tree*` (set by
    // `JHGrid#setTreeData()`), then delegates the remaining cell width to `inner` (the column's own
    // renderer, if any) or a plain left-aligned text draw. A no-op pass-through to `inner`/default
    // text on any row that isn't currently a tree row (e.g. tree mode inactive), so this can be — and
    // is — applied unconditionally to `columnDefs[i].treeColumn: true`'s resolved renderer at
    // column-build time, the same way `type: 'date'`/`'richtext'` auto-wire theirs.
    tree({ indentPx = NESTED_ROW_INDENT_PX, inner } = {}) {
      const drawDefaultText = (ctx, { x, y, w, h, value, theme, padding }) => {
        ctx.fillStyle = value != null ? theme.cellText : theme.loadingText;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillText(value != null ? String(value) : "", x + padding, y + h / 2);
        ctx.restore();
      };
      return (ctx, info) => {
        const { x, y, w, h, rowData, theme } = info;
        if (!rowData?.__tree__) {
          (inner ?? drawDefaultText)(ctx, info);
          return;
        }
        const indent = (rowData.__treeLevel ?? 0) * indentPx;
        const contentX = x + indent + TREE_CHEVRON_W;
        if (rowData.__treeHasChildren) {
          ctx.fillStyle = theme.cellText;
          ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(rowData.__treeExpanded ? "\u25BE" : "\u25B8", x + indent, y + h / 2);
        }
        (inner ?? drawDefaultText)(ctx, { ...info, x: contentX, w: x + w - contentX });
      };
    },
    // Renders a horizontal progress bar for a numeric value in [0, max].
    progressBar({ max = 100, showLabel = true } = {}) {
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        const num = Number(value);
        if (isNaN(num)) return;
        const pct = Math.max(0, Math.min(1, num / max));
        const lblW = showLabel ? 36 : 0;
        const barX = x + padding;
        const barW = Math.max(0, w - padding * 2 - lblW);
        const barH = 6;
        const barY = y + (h - barH) / 2;
        const r = 3;
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(barX, barY, barW, barH, r) : ctx.rect(barX, barY, barW, barH);
        ctx.fill();
        if (pct > 0) {
          ctx.fillStyle = pct >= 0.8 ? "#16a34a" : pct >= 0.5 ? "#f59e0b" : "#ef4444";
          ctx.beginPath();
          const fw = Math.max(r * 2, barW * pct);
          ctx.roundRect ? ctx.roundRect(barX, barY, fw, barH, r) : ctx.rect(barX, barY, fw, barH);
          ctx.fill();
        }
        if (showLabel) {
          ctx.fillStyle = theme.cellText;
          ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(`${Math.round(pct * 100)}%`, x + w - padding, y + h / 2);
        }
      };
    },
    // Renders a rounded pill badge; `colorMap[value] = { bg, fg }` customizes colors per value.
    badge({ colorMap = {} } = {}) {
      return (ctx, { x, y, w, h, value, theme }) => {
        if (value == null || value === "") return;
        const text = String(value);
        const { bg = "#f1f5f9", fg = "#475569" } = colorMap[text] ?? {};
        const pad = 8;
        ctx.font = `${theme.fontSize - 1}px ${theme.fontFamily}`;
        const tw = ctx.measureText(text).width;
        const bw = Math.min(tw + pad * 2, w - 8);
        const bh = h - 10;
        const bx = x + (w - bw) / 2;
        const by = y + 5;
        const r = bh / 2;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, r) : ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + w / 2, y + h / 2);
      };
    },
    // Renders a ✓/✗ glyph for truthy/falsy values (accepts booleans, 1/0, 'Y'/'예'/'true').
    checkmark({ trueColor = "#16a34a", falseColor = "#94a3b8", showFalse = true } = {}) {
      return (ctx, { x, y, w, h, value, theme }) => {
        const yes = value === true || value === 1 || value === "Y" || value === "\uC608" || value === "true";
        if (!yes && !showFalse) return;
        ctx.fillStyle = yes ? trueColor : falseColor;
        ctx.font = `bold ${theme.fontSize + 1}px ${theme.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(yes ? "\u2713" : "\u2717", x + w / 2, y + h / 2);
      };
    },
    // Renders `value` (an image URL or data: URI) scaled to fill the cell — see
    // core/ImageCache.js's header comment for the fetch()+createImageBitmap-with-resize decode
    // strategy backing this (far cheaper than a DOM <img> for a large source shown as a small
    // thumbnail). `fit: 'cover'` (default) crops to fill the cell like CSS object-fit: cover;
    // `'contain'` letterboxes to show the whole image. `radius` rounds the corners. Draws a plain
    // placeholder tile while loading and a small X glyph on failure — both non-blocking; the cell
    // redraws itself automatically once the image resolves (see JHGrid's ImageCache
    // addLoadListener() subscription), no polling needed from calling code.
    image({ fit = "cover", radius = 0 } = {}) {
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        if (!value) return;
        const boxX = x + padding, boxY = y + padding;
        const boxW = w - padding * 2, boxH = h - padding * 2;
        if (boxW <= 0 || boxH <= 0) return;
        const entry = requestImage(String(value), boxW, boxH);
        ctx.save();
        ctx.beginPath();
        if (radius > 0 && ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        else ctx.rect(boxX, boxY, boxW, boxH);
        ctx.clip();
        if (entry?.status === "loaded" && entry.bitmap) {
          const bmp = entry.bitmap;
          const scale = fit === "contain" ? Math.min(boxW / bmp.width, boxH / bmp.height) : Math.max(boxW / bmp.width, boxH / bmp.height);
          const dw = bmp.width * scale, dh = bmp.height * scale;
          ctx.drawImage(bmp, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
        } else if (entry?.status === "error") {
          ctx.fillStyle = theme.imageErrorBg;
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.strokeStyle = theme.imageErrorIcon;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(boxX + boxW * 0.3, boxY + boxH * 0.3);
          ctx.lineTo(boxX + boxW * 0.7, boxY + boxH * 0.7);
          ctx.moveTo(boxX + boxW * 0.7, boxY + boxH * 0.3);
          ctx.lineTo(boxX + boxW * 0.3, boxY + boxH * 0.7);
          ctx.stroke();
        } else {
          ctx.fillStyle = theme.imagePlaceholderBg;
          ctx.fillRect(boxX, boxY, boxW, boxH);
        }
        ctx.restore();
      };
    },
    // 숫자 천단위 콤마 포매터 — locale 미지정 시 그리드의 JHGridOptions.locale을 따름
    // 예: CellRenderers.number() → 1234567 → "1,234,567"
    //     CellRenderers.number({ decimals: 2 }) → 1234.5 → "1,234.50"
    number({ locale, decimals = 0 } = {}) {
      let fmt, fmtLocale;
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        const effLocale = locale ?? theme.locale;
        if (fmt === void 0 || fmtLocale !== effLocale) {
          fmt = new Intl.NumberFormat(effLocale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          });
          fmtLocale = effLocale;
        }
        const num = Number(value);
        if (value == null || value === "" || isNaN(num)) return;
        const text = fmt.format(num);
        ctx.fillStyle = theme.cellText;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillText(text, x + w - padding, y + h / 2);
        ctx.restore();
      };
    },
    // 날짜 포매터 (Date 객체 또는 파싱 가능한 문자열)
    // 예: CellRenderers.date()                     → "2024-03-15"
    //     CellRenderers.date({ format: 'YYYY/MM/DD HH:mm' }) → "2024/03/15 09:30"
    //     CellRenderers.date({ format: 'locale' })  → 그리드의 locale/Intl.DateTimeFormat을 따름
    //     CellRenderers.date({ format: 'locale', dateStyle: 'long' }) → "March 15, 2024" (en-US) / "2024년 3월 15일" (ko)
    date({ format = "YYYY-MM-DD", locale, dateStyle, align = "left" } = {}) {
      let fmt, fmtLocale;
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        if (value == null || value === "") return;
        const d = value instanceof Date ? value : typeof value === "number" ? new Date(value) : new Date(String(value));
        let text = String(value);
        if (!isNaN(d.getTime())) {
          if (format === "locale") {
            const effLocale = locale ?? theme.locale;
            if (fmt === void 0 || fmtLocale !== effLocale) {
              fmt = new Intl.DateTimeFormat(effLocale, dateStyle ? { dateStyle } : void 0);
              fmtLocale = effLocale;
            }
            text = fmt.format(d);
          } else {
            const Y = String(d.getFullYear()).padStart(4, "0");
            const M = String(d.getMonth() + 1).padStart(2, "0");
            const D = String(d.getDate()).padStart(2, "0");
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const ss = String(d.getSeconds()).padStart(2, "0");
            const YY = Y.slice(-2);
            text = format.replace("YYYY", Y).replace("YY", YY).replace("MM", M).replace("DD", D).replace("HH", hh).replace("mm", mm).replace("ss", ss);
          }
        }
        const xPos = align === "right" ? x + w - padding : align === "center" ? x + w / 2 : x + padding;
        ctx.fillStyle = theme.cellText;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillText(text, xPos, y + h / 2);
        ctx.restore();
      };
    },
    // 통화 포매터 (Intl.NumberFormat currency 스타일 사용) — locale 미지정 시 그리드의 JHGridOptions.locale을 따름
    // 예: CellRenderers.currency()                   → "₩1,234,567"  (KRW 기본)
    //     CellRenderers.currency({ currency: 'USD' }) → "$1,234.57"
    currency({ locale, currency: code = "KRW" } = {}) {
      let fmt, fmtLocale;
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        const effLocale = locale ?? theme.locale;
        if (fmt === void 0 || fmtLocale !== effLocale) {
          fmt = new Intl.NumberFormat(effLocale, { style: "currency", currency: code });
          fmtLocale = effLocale;
        }
        const num = Number(value);
        if (value == null || value === "" || isNaN(num)) return;
        const text = fmt.format(num);
        ctx.fillStyle = theme.cellText;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillText(text, x + w - padding, y + h / 2);
        ctx.restore();
      };
    },
    // 드롭다운 셀 렌더러 — 현재 값 + 우측 화살표 표시
    // type: 'dropdown' 지정 시 자동 적용되며, 직접 renderer로도 사용 가능
    dropdown({ placeholder = "" } = {}) {
      const ARROW_W = DROPDOWN_ARROW_W;
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        const text = value != null && value !== "" ? String(value) : placeholder;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = value != null && value !== "" ? theme.cellText : theme.loadingText;
        ctx.textAlign = "left";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w - ARROW_W, h);
        ctx.clip();
        ctx.fillText(text, x + padding, y + h / 2);
        ctx.restore();
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(x + w - ARROW_W, y + 1, ARROW_W - 1, h - 2);
        ctx.fillStyle = theme.headerText ?? theme.cellText;
        ctx.font = `11px ${theme.fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillText("\u25BE", x + w - ARROW_W / 2, y + h / 2);
      };
    },
    // 다중선택 셀 렌더러 — 선택된 값 목록 + 우측 화살표 표시
    // type: 'multiselect' 지정 시 자동 적용되며, 직접 renderer로도 사용 가능
    multiselect({ placeholder = "" } = {}) {
      const ARROW_W = DROPDOWN_ARROW_W;
      return (ctx, { x, y, w, h, value, theme, padding }) => {
        const text = value != null && value !== "" ? String(value) : placeholder;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = value != null && value !== "" ? theme.cellText : theme.loadingText;
        ctx.textAlign = "left";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w - ARROW_W, h);
        ctx.clip();
        ctx.fillText(text, x + padding, y + h / 2);
        ctx.restore();
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(x + w - ARROW_W, y + 1, ARROW_W - 1, h - 2);
        ctx.fillStyle = theme.headerText ?? theme.cellText;
        ctx.font = `11px ${theme.fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillText("\u25BE", x + w - ARROW_W / 2, y + h / 2);
      };
    },
    // 체크박스 셀 렌더러 — 체크/미체크 시각 표시
    // type: 'checkbox' 지정 시 자동 적용되며, 직접 renderer로도 사용 가능
    checkbox({ checkedColor = "#2563eb", size = 14 } = {}) {
      return (ctx, { x, y, w, h, value }) => {
        const checked = value === true || value === 1 || value === "true" || value === "1" || value === "Y" || value === "yes";
        const bx = x + (w - size) / 2;
        const by = y + (h - size) / 2;
        const r = 3;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, size, size, r);
        else ctx.rect(bx, by, size, size);
        if (checked) {
          ctx.fillStyle = checkedColor;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.8;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(bx + 3, by + size / 2);
          ctx.lineTo(bx + size / 2 - 1, by + size - 4);
          ctx.lineTo(bx + size - 3, by + 3.5);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.strokeStyle = "#C0C0C0";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };
    },
    // 버튼 셀 렌더러 — 셀 전체를 하나의 클릭 가능한 버튼으로 표시
    // type: 'button' 지정 시 자동 적용되며, 직접 renderer로도 사용 가능
    // label/disabled/variant는 고정값 또는 (rowData, rowIndex) => value 함수 모두 지원
    // label이 null/''을 반환하면 해당 행에는 버튼을 그리지 않음 (조건부 숨김)
    button({ label = "Button", disabled = false, variant = "primary" } = {}) {
      const COLORS = {
        primary: "#2563eb",
        success: "#16a34a",
        danger: "#dc2626",
        neutral: "#64748b"
      };
      return (ctx, { x, y, w, h, theme, rowData, rowIndex }) => {
        const lbl = typeof label === "function" ? label(rowData, rowIndex) : label;
        if (lbl == null || lbl === "") return;
        const isDisabled = typeof disabled === "function" ? !!disabled(rowData, rowIndex) : !!disabled;
        const resolvedVar = typeof variant === "function" ? variant(rowData, rowIndex) : variant;
        ctx.font = `${theme.fontSize - 1}px ${theme.fontFamily}`;
        const textW = ctx.measureText(lbl).width;
        const bh = Math.min(h - 8, 24);
        const bw = Math.min(w - 8, textW + 24);
        if (bw <= 0 || bh <= 0) return;
        const bx = x + (w - bw) / 2;
        const by = y + (h - bh) / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, bh / 2);
        else ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = isDisabled ? "#cbd5e1" : COLORS[resolvedVar] ?? COLORS.primary;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl, bx + bw / 2, by + bh / 2);
      };
    }
  };
  var BUILTIN_RENDERER_NAMES = new Set(Object.keys(CellRenderers));
  function registerCellRenderer(name, factory) {
    if (BUILTIN_RENDERER_NAMES.has(name)) {
      console.warn(`[JHGrid] registerCellRenderer: "${name}" is a built-in renderer name and will be overwritten`);
    }
    CellRenderers[name] = factory;
  }
  var INLINE_TAG_RE = /<\/?(b|i|u|s)>/g;
  function parseInlineRuns(html) {
    const runs = [];
    const state = { bold: false, italic: false, underline: false, strike: false };
    const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const pushText = (raw) => {
      if (raw) runs.push({ text: unescape(raw), ...state });
    };
    INLINE_TAG_RE.lastIndex = 0;
    let last = 0, m;
    while (m = INLINE_TAG_RE.exec(html)) {
      pushText(html.slice(last, m.index));
      last = INLINE_TAG_RE.lastIndex;
      const closing = m[0][1] === "/";
      const key = { b: "bold", i: "italic", u: "underline", s: "strike" }[m[1]];
      state[key] = !closing;
    }
    pushText(html.slice(last));
    return runs;
  }
  var Renderer = class _Renderer {
    #ctx;
    #opts;
    // `opts` (dimensions, theme, rowHeight, etc.) is the same object JHGrid mutates in place.
    constructor(canvas, opts) {
      this.#ctx = canvas.getContext("2d");
      this.#opts = opts;
    }
    // Paints one full frame. Called by JHGrid on every scroll/resize/data/selection change; all
    // layout is recomputed from the passed-in state (no internal caching beyond the constructor's
    // `opts` reference).
    render({
      scrollTop,
      scrollLeft,
      totalRows,
      columns,
      columnLabels,
      columnAligns,
      columnHeaderAligns,
      getRow,
      geo,
      rowLayout,
      sel,
      editing,
      headerFocusCol,
      rowFocus,
      colDrag,
      rowDrag,
      sorts,
      filters,
      columnRenderers,
      invalidCells,
      selectedRows,
      fillPreview,
      deletedRows,
      skeletonPhase,
      rowNumberLabel,
      grouping,
      groupFooter,
      hiddenNeighbors,
      editableColumns,
      i18n,
      headerCheckboxCols,
      hoverRow = null,
      selAnim = null,
      colSlide = null,
      remoteSelections = null
    }) {
      const { headerHeight: rowH, theme } = this.#opts;
      const { headerRows } = this.#opts;
      const { width: W, height: H } = this.#opts;
      const ctx = this.#ctx;
      const {
        vpH,
        vpW,
        SB,
        vSB = SB,
        hSB = SB,
        frozenCount = 0,
        frozenWidth = 0,
        frozenRightCount = 0,
        frozenRightWidth = 0,
        rightX = 0,
        colPositions,
        headerH,
        footerH = 0,
        maxRow,
        rowNumW: focusRowNumW = 0
      } = geo;
      const labels = columnLabels ?? columns;
      const nCols = columns.length;
      const dsel = sel;
      const dAnim = selAnim?.prev ? { prev: selAnim.prev, t: selAnim.t } : null;
      ctx.fillStyle = theme.rowEven;
      ctx.fillRect(0, 0, W, H);
      const boundRow = maxRow ?? totalRows - 1;
      const startRow = Math.max(0, rowLayout.rowAt(scrollTop, boundRow));
      const bottomHit = rowLayout.rowAt(scrollTop + vpH, boundRow);
      const endRow = bottomHit < 0 ? boundRow : Math.min(boundRow, bottomHit + 1);
      const scrollColLimit = nCols - 1 - frozenRightCount;
      const frozenEndPos = colPositions[frozenCount];
      let startScrollCol = frozenCount;
      while (startScrollCol < scrollColLimit && colPositions[startScrollCol + 1] - frozenEndPos <= scrollLeft) startScrollCol++;
      let endScrollCol = startScrollCol;
      while (endScrollCol < scrollColLimit && colPositions[endScrollCol] - frozenEndPos < scrollLeft + vpW) endScrollCol++;
      endScrollCol = Math.min(scrollColLimit, endScrollCol + 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(frozenWidth, headerH, vpW, vpH);
      ctx.clip();
      this.#drawCells(
        startRow,
        endRow,
        startScrollCol,
        endScrollCol,
        scrollTop,
        scrollLeft,
        columns,
        columnAligns,
        getRow,
        rowLayout,
        headerH,
        theme,
        frozenCount,
        frozenWidth,
        frozenRightCount,
        rightX,
        colPositions,
        columnRenderers,
        invalidCells,
        selectedRows,
        deletedRows,
        editableColumns,
        hoverRow,
        skeletonPhase
      );
      ctx.restore();
      if (frozenCount > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, headerH, frozenWidth, vpH);
        ctx.clip();
        this.#drawCells(
          startRow,
          endRow,
          0,
          frozenCount - 1,
          scrollTop,
          scrollLeft,
          columns,
          columnAligns,
          getRow,
          rowLayout,
          headerH,
          theme,
          frozenCount,
          frozenWidth,
          frozenRightCount,
          rightX,
          colPositions,
          columnRenderers,
          invalidCells,
          selectedRows,
          deletedRows,
          editableColumns,
          hoverRow,
          skeletonPhase
        );
        ctx.restore();
      }
      if (frozenRightCount > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rightX, headerH, frozenRightWidth, vpH);
        ctx.clip();
        this.#drawCells(
          startRow,
          endRow,
          nCols - frozenRightCount,
          nCols - 1,
          scrollTop,
          scrollLeft,
          columns,
          columnAligns,
          getRow,
          rowLayout,
          headerH,
          theme,
          frozenCount,
          frozenWidth,
          frozenRightCount,
          rightX,
          colPositions,
          columnRenderers,
          invalidCells,
          selectedRows,
          deletedRows,
          editableColumns,
          hoverRow,
          skeletonPhase
        );
        ctx.restore();
      }
      if (dsel) {
        const lo = (s) => s.type === "single" ? s.col : s.c1;
        const hi = (s) => s.type === "single" ? s.col : s.c2;
        const prev = dAnim?.prev;
        const selC1 = prev ? Math.min(lo(dsel), lo(prev)) : lo(dsel);
        const selC2 = prev ? Math.max(hi(dsel), hi(prev)) : hi(dsel);
        if (frozenCount > 0 && selC1 < frozenCount) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, headerH, frozenWidth, vpH);
          ctx.clip();
          this.#drawSelection(
            dsel,
            editing,
            scrollTop,
            scrollLeft,
            rowLayout,
            headerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            dAnim
          );
          ctx.restore();
        }
        if (selC2 >= frozenCount && selC1 < nCols - frozenRightCount) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(frozenWidth, headerH, vpW, vpH);
          ctx.clip();
          this.#drawSelection(
            dsel,
            editing,
            scrollTop,
            scrollLeft,
            rowLayout,
            headerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            dAnim
          );
          ctx.restore();
        }
        if (frozenRightCount > 0 && selC2 >= nCols - frozenRightCount) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(rightX, headerH, frozenRightWidth, vpH);
          ctx.clip();
          this.#drawSelection(
            dsel,
            editing,
            scrollTop,
            scrollLeft,
            rowLayout,
            headerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            dAnim
          );
          ctx.restore();
        }
      }
      if (remoteSelections && remoteSelections.length) {
        for (const remote of remoteSelections) {
          const rSel = remote.sel;
          if (!rSel) continue;
          const rc1 = rSel.type === "single" ? rSel.col : rSel.c1;
          const rc2 = rSel.type === "single" ? rSel.col : rSel.c2;
          if (frozenCount > 0 && rc1 < frozenCount) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, headerH, frozenWidth, vpH);
            ctx.clip();
            this.#drawRemoteSelection(
              rSel,
              remote.color,
              remote.label,
              scrollTop,
              scrollLeft,
              rowLayout,
              headerH,
              frozenCount,
              frozenWidth,
              frozenRightCount,
              rightX,
              colPositions
            );
            ctx.restore();
          }
          if (rc2 >= frozenCount && rc1 < nCols - frozenRightCount) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(frozenWidth, headerH, vpW, vpH);
            ctx.clip();
            this.#drawRemoteSelection(
              rSel,
              remote.color,
              remote.label,
              scrollTop,
              scrollLeft,
              rowLayout,
              headerH,
              frozenCount,
              frozenWidth,
              frozenRightCount,
              rightX,
              colPositions
            );
            ctx.restore();
          }
          if (frozenRightCount > 0 && rc2 >= nCols - frozenRightCount) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(rightX, headerH, frozenRightWidth, vpH);
            ctx.clip();
            this.#drawRemoteSelection(
              rSel,
              remote.color,
              remote.label,
              scrollTop,
              scrollLeft,
              rowLayout,
              headerH,
              frozenCount,
              frozenWidth,
              frozenRightCount,
              rightX,
              colPositions
            );
            ctx.restore();
          }
        }
      }
      if (selectedRows && selectedRows.size > 0) {
        const fullW = W - vSB;
        const scrollContentW = Math.max(0, colPositions[nCols - frozenRightCount] - frozenWidth - scrollLeft);
        const rowSelW = Math.min(fullW, frozenWidth + Math.min(vpW, scrollContentW) + frozenRightWidth);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, headerH, rowSelW, vpH);
        ctx.clip();
        ctx.strokeStyle = theme.selectionColor;
        ctx.lineWidth = 2;
        for (let r = startRow; r <= endRow; r++) {
          if (!selectedRows.has(r)) continue;
          if (r > startRow && selectedRows.has(r - 1)) continue;
          let end = r;
          while (end < endRow && selectedRows.has(end + 1)) end++;
          const top = selectedRows.has(r - 1) ? headerH - 4 : rowLayout.yOf(r) - scrollTop + headerH;
          const bottom = selectedRows.has(end + 1) ? headerH + vpH + 4 : rowLayout.yOf(end) - scrollTop + headerH + rowLayout.heightOf(end);
          ctx.strokeRect(1, top + 1, rowSelW - 2, bottom - top - 2);
          r = end;
        }
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(frozenWidth, 0, vpW, headerH);
      ctx.clip();
      this.#drawHeader(
        labels,
        columnHeaderAligns ?? columnAligns,
        columns,
        sorts,
        filters,
        startScrollCol,
        endScrollCol,
        scrollLeft,
        headerH,
        rowH,
        headerRows,
        theme,
        frozenCount,
        frozenWidth,
        frozenRightCount,
        rightX,
        colPositions,
        hiddenNeighbors,
        headerCheckboxCols,
        sel
      );
      ctx.restore();
      if (frozenCount > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, frozenWidth, headerH);
        ctx.clip();
        this.#drawHeader(
          labels,
          columnHeaderAligns ?? columnAligns,
          columns,
          sorts,
          filters,
          0,
          frozenCount - 1,
          scrollLeft,
          headerH,
          rowH,
          headerRows,
          theme,
          frozenCount,
          frozenWidth,
          frozenRightCount,
          rightX,
          colPositions,
          hiddenNeighbors,
          headerCheckboxCols,
          sel
        );
        ctx.restore();
      }
      if (frozenRightCount > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rightX, 0, frozenRightWidth, headerH);
        ctx.clip();
        this.#drawHeader(
          labels,
          columnHeaderAligns ?? columnAligns,
          columns,
          sorts,
          filters,
          nCols - frozenRightCount,
          nCols - 1,
          scrollLeft,
          headerH,
          rowH,
          headerRows,
          theme,
          frozenCount,
          frozenWidth,
          frozenRightCount,
          rightX,
          colPositions,
          hiddenNeighbors,
          headerCheckboxCols,
          sel
        );
        ctx.restore();
      }
      if (frozenCount > 0) {
        ctx.strokeStyle = theme.frozenBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const sepX = Math.round(frozenWidth) + 0.5;
        ctx.moveTo(sepX, 0);
        ctx.lineTo(sepX, H - hSB);
        ctx.stroke();
      }
      if (frozenRightCount > 0) {
        ctx.strokeStyle = theme.frozenBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const rSepX = Math.round(rightX) + 0.5;
        ctx.moveTo(rSepX, 0);
        ctx.lineTo(rSepX, H - hSB);
        ctx.stroke();
      }
      if (headerFocusCol != null && headerFocusCol >= 0 && headerFocusCol < columns.length) {
        const isFrozenCol = headerFocusCol < frozenCount;
        const isFrozenRightCol = frozenRightCount > 0 && headerFocusCol >= nCols - frozenRightCount;
        const x = this.#colX(headerFocusCol, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions);
        const w = colPositions[headerFocusCol + 1] - colPositions[headerFocusCol];
        ctx.save();
        ctx.beginPath();
        if (isFrozenCol) ctx.rect(0, 0, frozenWidth, headerH);
        else if (isFrozenRightCol) ctx.rect(rightX, 0, frozenRightWidth, headerH);
        else ctx.rect(frozenWidth, 0, vpW, headerH);
        ctx.clip();
        ctx.strokeStyle = theme.selectionColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, 1, Math.max(0, w - 2), Math.max(0, headerH - 2));
        ctx.restore();
      }
      if (rowFocus != null && focusRowNumW > 0) {
        const y = rowLayout.yOf(rowFocus) - scrollTop + headerH;
        const rh = rowLayout.heightOf(rowFocus);
        if (y + rh > headerH && y < H - hSB) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, headerH, focusRowNumW, vpH);
          ctx.clip();
          ctx.strokeStyle = theme.selectionColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(1, y + 1, Math.max(0, focusRowNumW - 2), Math.max(0, rh - 2));
          ctx.restore();
        }
      }
      if (sel && !editing) {
        const HANDLE_SZ = 7;
        const selR2 = sel.type === "single" ? sel.row : sel.r2;
        const selC2 = sel.type === "single" ? sel.col : sel.c2;
        const hx = this.#colX(selC2, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions) + (colPositions[selC2 + 1] - colPositions[selC2]);
        const hy = rowLayout.yOf(selR2 + 1) - scrollTop + headerH;
        if (hx >= frozenWidth - HANDLE_SZ && hx <= W - vSB + HANDLE_SZ && hy >= headerH && hy <= H - hSB + HANDLE_SZ) {
          ctx.fillStyle = theme.selectionColor;
          ctx.fillRect(Math.round(hx) - HANDLE_SZ / 2, Math.round(hy) - HANDLE_SZ / 2, HANDLE_SZ, HANDLE_SZ);
        }
      }
      if (fillPreview) {
        const { r1: fp1, c1: fc1, r2: fp2, c2: fc2 } = fillPreview;
        const px = this.#colX(fc1, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions);
        const py = rowLayout.yOf(fp1) - scrollTop + headerH;
        const pw = this.#colX(fc2, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions) + (colPositions[fc2 + 1] - colPositions[fc2]) - px;
        const ph = rowLayout.yOf(fp2 + 1) - rowLayout.yOf(fp1);
        ctx.fillStyle = theme.selectionFill;
        ctx.fillRect(px, py, pw, ph);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = theme.selectionColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
        ctx.setLineDash([]);
      }
      const slideInRange = colSlide && colSlide.c1 >= 0 && colSlide.c2 < nCols && colSlide.dragCol >= 0 && colSlide.dragCol < nCols;
      if (slideInRange && colSlide.dx !== 0) {
        const { c1, c2, dx, dragCol } = colSlide;
        const a = Math.min(c1, dragCol);
        const b = Math.max(c2, dragCol);
        const cellX = (c) => this.#colX(c, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions);
        const x0 = Math.max(0, cellX(a));
        const x1 = Math.min(W - vSB, cellX(b) + (colPositions[b + 1] - colPositions[b]));
        const paint = (from, to, shift) => {
          ctx.save();
          ctx.translate(shift, 0);
          this.#drawCells(
            startRow,
            endRow,
            from,
            to,
            scrollTop,
            scrollLeft,
            columns,
            columnAligns,
            getRow,
            rowLayout,
            headerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            columnRenderers,
            invalidCells,
            selectedRows,
            deletedRows,
            editableColumns,
            hoverRow,
            skeletonPhase
          );
          this.#drawHeader(
            labels,
            columnHeaderAligns ?? columnAligns,
            columns,
            sorts,
            filters,
            from,
            to,
            scrollLeft,
            headerH,
            rowH,
            headerRows,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            hiddenNeighbors,
            headerCheckboxCols,
            sel
          );
          ctx.restore();
        };
        if (x1 > x0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, 0, x1 - x0, H - hSB);
          ctx.clip();
          ctx.fillStyle = theme.headerBg;
          ctx.fillRect(x0, 0, x1 - x0, headerH);
          ctx.fillStyle = theme.rowEven;
          ctx.fillRect(x0, headerH, x1 - x0, H - hSB - headerH);
          paint(c1, c2, dx);
          paint(dragCol, dragCol, 0);
          ctx.restore();
        }
      }
      if (colDrag?.active) {
        const { col, insertBefore } = colDrag;
        const dragX = this.#colX(col, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions);
        const dragW = colPositions[col + 1] - colPositions[col];
        ctx.fillStyle = theme.dragIndicatorFill;
        ctx.fillRect(dragX, 0, dragW, H - hSB);
        const n = columns.length;
        const lineX = insertBefore < n ? this.#colX(insertBefore, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions) : this.#colX(n - 1, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions) + (colPositions[n] - colPositions[n - 1]);
        ctx.strokeStyle = theme.dragIndicatorLine;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, H - hSB);
        ctx.stroke();
        if (colDrag.x !== void 0) {
          const leafH = rowH;
          const leafY = headerH - rowH;
          const gx = Math.max(0, Math.min(W - vSB - dragW, colDrag.x - colDrag.grabDX));
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.shadowColor = theme.dragGhostShadow;
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = theme.headerBg;
          ctx.fillRect(gx, leafY, dragW, leafH);
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.rect(gx, leafY, dragW, leafH);
          ctx.clip();
          ctx.globalAlpha = 0.92;
          ctx.strokeStyle = theme.dragIndicatorLine;
          ctx.lineWidth = 1;
          ctx.strokeRect(gx + 0.5, leafY + 0.5, dragW - 1, leafH - 1);
          ctx.font = `bold ${theme.headerFontSize ?? theme.fontSize}px ${theme.fontFamily}`;
          ctx.fillStyle = theme.headerText;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(
            this.#clip(String(labels[col] ?? columns[col] ?? ""), dragW - theme.cellPadding * 2),
            gx + theme.cellPadding,
            leafY + leafH / 2
          );
          ctx.restore();
        }
      }
      if (rowDrag?.active) {
        const { row, insertBefore } = rowDrag;
        const dragY = rowLayout.yOf(row) - scrollTop + headerH;
        ctx.fillStyle = theme.dragIndicatorFill;
        ctx.fillRect(0, dragY, W - vSB, rowLayout.heightOf(row));
        const lineY = rowLayout.yOf(insertBefore) - scrollTop + headerH;
        ctx.strokeStyle = theme.dragIndicatorLine;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(W - vSB, lineY);
        ctx.stroke();
      }
      if (grouping) {
        const { rowNumW: gRowNumW } = geo;
        this.#drawGroupRows(
          startRow,
          endRow,
          scrollTop,
          rowLayout,
          headerH,
          theme,
          W,
          vSB,
          gRowNumW,
          getRow,
          columns,
          columnLabels ?? columns,
          i18n
        );
      }
      const { rowNumW } = geo;
      if (rowNumW > 0) {
        this.#drawRowNumbers(
          startRow,
          endRow,
          scrollTop,
          rowLayout,
          rowNumW,
          H,
          headerH,
          hSB,
          theme,
          rowNumberLabel,
          selectedRows,
          hoverRow
        );
      }
      if (groupFooter && footerH > 0) {
        const footerY = H - hSB - footerH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(frozenWidth, footerY, vpW, footerH);
        ctx.clip();
        this.#drawFooter(
          groupFooter,
          columns,
          columnAligns,
          startScrollCol,
          endScrollCol,
          scrollLeft,
          footerY,
          footerH,
          theme,
          frozenCount,
          frozenWidth,
          frozenRightCount,
          rightX,
          colPositions,
          i18n
        );
        ctx.restore();
        if (frozenCount > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, footerY, frozenWidth, footerH);
          ctx.clip();
          this.#drawFooter(
            groupFooter,
            columns,
            columnAligns,
            0,
            frozenCount - 1,
            scrollLeft,
            footerY,
            footerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            i18n
          );
          ctx.restore();
        }
        if (frozenRightCount > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(rightX, footerY, frozenRightWidth, footerH);
          ctx.clip();
          this.#drawFooter(
            groupFooter,
            columns,
            columnAligns,
            nCols - frozenRightCount,
            nCols - 1,
            scrollLeft,
            footerY,
            footerH,
            theme,
            frozenCount,
            frozenWidth,
            frozenRightCount,
            rightX,
            colPositions,
            i18n
          );
          ctx.restore();
        }
      }
      this.#drawScrollbars(geo, theme, W, H);
    }
    // Private
    #drawRowNumbers(startRow, endRow, scrollTop, rowLayout, rowNumW, H, headerH, SB, theme, label, selectedRows, hoverRow) {
      const ctx = this.#ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, rowNumW, H - SB);
      ctx.clip();
      ctx.fillStyle = theme.headerBg;
      ctx.fillRect(0, 0, rowNumW, headerH);
      ctx.font = `bold ${theme.headerFontSize ?? theme.fontSize}px ${theme.fontFamily}`;
      ctx.fillStyle = theme.headerText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label ?? "No.", rowNumW / 2, headerH / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, headerH, rowNumW, Math.max(0, H - SB - headerH));
      ctx.clip();
      for (let r = startRow; r <= endRow; r++) {
        const py = rowLayout.yOf(r) - scrollTop + headerH;
        const rh = rowLayout.heightOf(r);
        const inRowSel = selectedRows?.has(r);
        ctx.fillStyle = theme.headerBg;
        ctx.fillRect(0, py, rowNumW, rh);
        if (inRowSel) {
          ctx.fillStyle = theme.selectionColor;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(0, py, rowNumW, rh);
          ctx.globalAlpha = 1;
        }
        if (hoverRow && hoverRow.row === r && hoverRow.alpha > 0 && theme.hoverRowBg) {
          ctx.globalAlpha = Math.min(1, hoverRow.alpha);
          ctx.fillStyle = theme.hoverRowBg;
          ctx.fillRect(0, py, rowNumW, rh);
          ctx.globalAlpha = 1;
        }
        ctx.font = inRowSel ? `bold ${theme.fontSize - 1}px ${theme.fontFamily}` : `${theme.fontSize - 1}px ${theme.fontFamily}`;
        ctx.fillStyle = inRowSel ? theme.sortIconColor ?? theme.selectionColor : theme.headerText;
        ctx.fillText(String(r + 1), rowNumW / 2, py + rh / 2);
        ctx.strokeStyle = theme.headerBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(py + rh) - 0.5);
        ctx.lineTo(rowNumW, Math.round(py + rh) - 0.5);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = theme.headerBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, headerH - 0.5);
      ctx.lineTo(rowNumW, headerH - 0.5);
      ctx.stroke();
      ctx.strokeStyle = theme.frozenBorder ?? theme.headerBorder;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rowNumW - 0.5, 0);
      ctx.lineTo(rowNumW - 0.5, H - SB);
      ctx.stroke();
      ctx.restore();
    }
    // Draws one full-width band per visible group-header row (chevron + label +
    // an aggregate summary string), overpainting whatever #drawCells drew for
    // that row (the synthetic group row has no real per-column data). Nested
    // (multi-level) groups indent their chevron+label by `row.level` — the
    // right-aligned aggregate summary stays full-width, unindented.
    #drawGroupRows(startRow, endRow, scrollTop, rowLayout, headerH, theme, W, SB, rowNumW, getRow, columns, columnLabels, i18n) {
      const ctx = this.#ctx;
      const x = rowNumW;
      const w = W - SB - rowNumW;
      if (w <= 0) return;
      const padding = theme.cellPadding;
      const groupLabelFn = i18n?.groupLabel ?? ((field, key, count) => `${field}: ${key} (${count})`);
      for (let r = startRow; r <= endRow; r++) {
        const row = getRow(r);
        if (!row?.__group__) continue;
        const y = rowLayout.yOf(r) - scrollTop + headerH;
        const rh = rowLayout.heightOf(r);
        const indent = (row.level ?? 0) * NESTED_ROW_INDENT_PX;
        ctx.fillStyle = theme.groupHeaderBg;
        ctx.fillRect(x, y, w, rh);
        ctx.strokeStyle = theme.cellBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w - 1, rh - 1);
        ctx.fillStyle = theme.groupHeaderText;
        ctx.font = `bold ${theme.fontSize}px ${theme.fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const chevron = row.collapsed ? "\u25B8" : "\u25BE";
        ctx.fillText(`${chevron}  ${groupLabelFn(row.field, row.key, row.count)}`, x + padding + indent, y + rh / 2);
        const aggEntries = Object.entries(row.aggregates ?? {});
        if (aggEntries.length) {
          ctx.font = `${theme.fontSize - 1}px ${theme.fontFamily}`;
          ctx.textAlign = "right";
          const summary = aggEntries.map(([field, val]) => `${columnLabels[columns.indexOf(field)] ?? field} ${val}`).join("    ");
          ctx.fillText(summary, x + w - padding, y + rh / 2);
        }
      }
    }
    // Fixed grand-total band under the data viewport, column-aligned like the
    // header (same frozen/scrollable split, called once per zone by render()).
    #drawFooter(groupFooter, columns, aligns, startCol, endCol, scrollLeft, footerY, footerH, theme, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions, i18n) {
      if (startCol > endCol) return;
      const ctx = this.#ctx;
      const padding = theme.cellPadding;
      const n = colPositions.length - 1;
      const xOffset = startCol < frozenCount ? 0 : frozenRightCount > 0 && startCol >= n - frozenRightCount ? rightX - colPositions[n - frozenRightCount] : frozenWidth - colPositions[frozenCount] - scrollLeft;
      ctx.fillStyle = theme.footerBg;
      ctx.fillRect(colPositions[startCol] + xOffset, footerY, colPositions[endCol + 1] - colPositions[startCol], footerH);
      ctx.font = `bold ${theme.fontSize}px ${theme.fontFamily}`;
      ctx.textBaseline = "middle";
      const midY = footerY + footerH / 2;
      if (startCol === 0) {
        ctx.fillStyle = theme.footerText;
        ctx.textAlign = "left";
        ctx.font = `bold ${theme.fontSize - 1}px ${theme.fontFamily}`;
        ctx.fillText(i18n?.groupFooterLabel ?? "Total", colPositions[startCol] + xOffset + padding, midY);
        ctx.font = `bold ${theme.fontSize}px ${theme.fontFamily}`;
      }
      for (let c = startCol; c <= endCol; c++) {
        const val = groupFooter[columns[c]];
        if (val == null) continue;
        const cx = colPositions[c] + xOffset;
        const cw = colPositions[c + 1] - colPositions[c];
        ctx.fillStyle = theme.footerText;
        const align = aligns?.[c] ?? "left";
        ctx.textAlign = align;
        const tx = align === "right" ? cx + cw - padding : align === "center" ? cx + cw / 2 : cx + padding;
        ctx.fillText(this.#clip(String(val), cw - padding * 2), tx, midY);
      }
      ctx.strokeStyle = theme.headerBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const by = Math.round(footerY) + 0.5;
      ctx.moveTo(colPositions[startCol] + xOffset, by);
      ctx.lineTo(colPositions[endCol + 1] + xOffset, by);
      ctx.stroke();
    }
    // Used only by non-hot paths (selection, drag indicator)
    #colX(c, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions) {
      return colScreenX(c, { frozenCount, frozenWidth, frozenRightCount, rightX, colPositions }, scrollLeft);
    }
    #drawHeader(labels, aligns, columns, sorts, filters, startCol, endCol, scrollLeft, totalH, rowH, headerRows, theme, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions, hiddenNeighbors, headerCheckboxCols, sel) {
      if (startCol > endCol) return;
      const ctx = this.#ctx;
      const padding = theme.cellPadding;
      const selC1 = sel ? sel.type === "single" ? sel.col : sel.c1 : null;
      const selC2 = sel ? sel.type === "single" ? sel.col : sel.c2 : null;
      const n = colPositions.length - 1;
      const isRightBand = (c) => frozenRightCount > 0 && c >= n - frozenRightCount;
      const xOffset = startCol < frozenCount ? 0 : isRightBand(startCol) ? rightX - colPositions[n - frozenRightCount] : frozenWidth - colPositions[frozenCount] - scrollLeft;
      const startX = colPositions[startCol] + xOffset;
      const spanW = colPositions[endCol + 1] - colPositions[startCol];
      ctx.fillStyle = theme.headerBg;
      ctx.fillRect(startX, 0, spanW, totalH);
      const cells = computeHeaderCells(headerRows, columns, this.#opts.columnLetterHeader);
      const visible = cells.filter(
        (cell) => cell.col + cell.colspan - 1 >= startCol && cell.col <= endCol
      );
      ctx.strokeStyle = theme.headerBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const cell of visible) {
        const cx = colPositions[cell.col] + xOffset;
        const cw = colPositions[cell.col + cell.colspan] - colPositions[cell.col];
        const cy = cell.row * rowH;
        const ch = cell.rowspan * rowH;
        const rx = Math.round(cx + cw) + 0.5;
        const by = cy + ch + 0.5;
        ctx.moveTo(rx, cy);
        ctx.lineTo(rx, cy + ch);
        ctx.moveTo(cx, by);
        ctx.lineTo(cx + cw, by);
      }
      ctx.stroke();
      const bandOf = (c) => c < frozenCount ? 0 : isRightBand(c) ? 2 : 1;
      const passBand = bandOf(startCol);
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.headerText;
      let curAlign = "";
      for (const cell of visible) {
        const cx = colPositions[cell.col] + xOffset;
        const cw = colPositions[cell.col + cell.colspan] - colPositions[cell.col];
        const cy = cell.row * rowH;
        const ch = cell.rowspan * rowH;
        const midY = cy + ch / 2;
        if (cell.isLeaf && selC1 !== null && cell.col >= selC1 && cell.col <= selC2) {
          ctx.fillStyle = theme.selectionColor;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(cx, cy, cw, ch);
          ctx.globalAlpha = 1;
          ctx.fillStyle = theme.headerText;
        }
        const field = cell.isLeaf ? columns[cell.col] : null;
        const hasFilter = cell.isLeaf && !!filters?.[field];
        const sortIdx = cell.isLeaf && sorts?.length ? sorts.findIndex((s) => s.field === field) : -1;
        const sortEntry = sortIdx >= 0 ? sorts[sortIdx] : null;
        const multiSort = sorts?.length > 1;
        const iconX = cx + cw - FILTER_ICON_W;
        if (cell.isLeaf && hasFilter) {
          ctx.fillStyle = theme.filterIconBg ?? "rgba(245,158,11,0.18)";
          ctx.fillRect(iconX + 1, cy + 3, FILTER_ICON_W - 2, ch - 6);
          ctx.fillStyle = theme.headerText;
        } else if (cell.isLeaf && sortEntry) {
          ctx.fillStyle = theme.sortIconBg ?? "rgba(46,117,182,0.12)";
          ctx.fillRect(iconX + 1, cy + 3, FILTER_ICON_W - 2, ch - 6);
          ctx.fillStyle = theme.headerText;
        }
        const isPrimaryTextPass = cell.isLeaf || bandOf(cell.col) === passBand;
        if (!isPrimaryTextPass) continue;
        let textCx = cx, textCw = cw;
        if (!cell.isLeaf) {
          const visStartCol = Math.max(cell.col, startCol);
          const visEndCol = Math.min(cell.col + cell.colspan - 1, endCol);
          textCx = colPositions[visStartCol] + xOffset;
          textCw = colPositions[visEndCol + 1] - colPositions[visStartCol];
        }
        const align = cell.isLeaf ? aligns?.[cell.col] ?? "left" : cell.align ?? "center";
        const iconRsv = cell.isLeaf ? FILTER_ICON_W + 4 : 0;
        const hasCbx = cell.isLeaf && headerCheckboxCols?.has(field);
        const cbxRsv = hasCbx ? 20 : 0;
        const textMaxW = textCw - padding * 2 - iconRsv - cbxRsv;
        const hfs = theme.headerFontSize ?? theme.fontSize;
        ctx.font = `bold ${hfs}px ${theme.fontFamily}`;
        const txAlign = hasCbx ? "left" : align;
        if (txAlign !== curAlign) {
          ctx.textAlign = txAlign;
          curAlign = txAlign;
        }
        const tx = align === "right" ? textCx + textCw - padding - iconRsv : hasCbx ? textCx + padding + cbxRsv : align === "center" ? textCx + textCw / 2 : textCx + padding;
        const lbl = cell.isLeaf ? labels[cell.col] ?? "" : cell.label ?? "";
        if (this.#opts.wrapHeader && lbl) {
          const lines = this.#wrapText(lbl, textMaxW);
          const lineH = hfs * 1.4;
          let lineY = midY - (lines.length - 1) * lineH / 2;
          for (const line of lines) {
            ctx.fillText(line, tx, lineY);
            lineY += lineH;
          }
        } else {
          ctx.fillText(this.#clip(lbl, textMaxW), tx, midY);
        }
        if (cell.isLeaf) {
          ctx.font = `bold ${hfs - 1}px ${theme.fontFamily}`;
          ctx.textAlign = "center";
          curAlign = "center";
          ctx.fillStyle = hasFilter ? theme.filterIconColor ?? "#C87B00" : sortEntry ? theme.sortIconColor ?? "#2E75B6" : theme.headerIconColor ?? "rgba(0,0,0,0.28)";
          const arrow = sortEntry ? sortEntry.dir === "asc" ? "\u2191" : "\u2193" : "\u25BE";
          const icon = sortEntry && multiSort ? `${sortIdx + 1}${arrow}` : arrow;
          ctx.fillText(icon, iconX + FILTER_ICON_W / 2, midY);
          ctx.fillStyle = theme.headerText;
        }
      }
      if (hiddenNeighbors) {
        ctx.fillStyle = theme.hiddenColIndicator ?? "#94A3B8";
        for (const cell of visible) {
          if (!cell.isLeaf) continue;
          const nb = hiddenNeighbors[cell.col];
          if (!nb?.left && !nb?.right) continue;
          const cx = colPositions[cell.col] + xOffset;
          const cw = colPositions[cell.col + cell.colspan] - colPositions[cell.col];
          const cy = cell.row * rowH;
          const ch = cell.rowspan * rowH;
          if (nb.right) ctx.fillRect(cx + cw - 1, cy, 1, ch);
          if (nb.left) ctx.fillRect(cx, cy, 1, ch);
        }
      }
    }
    #drawCells(startRow, endRow, startCol, endCol, scrollTop, scrollLeft, columns, aligns, getRow, rowLayout, headerH, theme, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions, columnRenderers, invalidCells, selectedRows, deletedRows, editableColumns, hoverRow, skeletonPhase) {
      if (startRow > endRow || startCol > endCol) return;
      const ctx = this.#ctx;
      const padding = theme.cellPadding;
      const n = colPositions.length - 1;
      const xOffset = startCol < frozenCount ? 0 : frozenRightCount > 0 && startCol >= n - frozenRightCount ? rightX - colPositions[n - frozenRightCount] : frozenWidth - colPositions[frozenCount] - scrollLeft;
      const startX = colPositions[startCol] + xOffset;
      const spanW = colPositions[endCol + 1] - colPositions[startCol];
      ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
      ctx.textBaseline = "middle";
      const ew = ctx.measureText("\u2026").width;
      for (let r = startRow; r <= endRow; r++) {
        ctx.fillStyle = r % 2 === 0 ? theme.rowEven : theme.rowOdd;
        ctx.fillRect(startX, rowLayout.yOf(r) - scrollTop + headerH, spanW, rowLayout.heightOf(r));
      }
      if (editableColumns) {
        const editableBg = theme.editableCellBg;
        const readonlyBg = theme.readonlyCellBg;
        if (editableBg || readonlyBg) {
          for (let c = startCol; c <= endCol; c++) {
            const bg = editableColumns[c] ? editableBg : readonlyBg;
            if (!bg) continue;
            const x = colPositions[c] + xOffset;
            const cw = colPositions[c + 1] - colPositions[c];
            ctx.fillStyle = bg;
            for (let r = startRow; r <= endRow; r++) {
              ctx.fillRect(x, rowLayout.yOf(r) - scrollTop + headerH, cw, rowLayout.heightOf(r));
            }
          }
        }
      }
      for (let r = startRow; r <= endRow; r++) {
        const rowY = rowLayout.yOf(r) - scrollTop + headerH;
        const rowH = rowLayout.heightOf(r);
        if (selectedRows?.has(r)) {
          ctx.fillStyle = theme.selRowBg;
          ctx.fillRect(startX, rowY, spanW, rowH);
        }
        const hl = this.#opts.rowHighlighter?.(getRow(r), r);
        if (hl) {
          ctx.fillStyle = hl;
          ctx.fillRect(startX, rowY, spanW, rowH);
        }
        if (deletedRows?.has(r)) {
          ctx.fillStyle = theme.deletedRowFill;
          ctx.fillRect(startX, rowY, spanW, rowH);
        }
      }
      const cellBackground = this.#opts.cellBackground;
      if (cellBackground) {
        for (let r = startRow; r <= endRow; r++) {
          const rowY = rowLayout.yOf(r) - scrollTop + headerH;
          const rowH = rowLayout.heightOf(r);
          const rowData = getRow(r);
          for (let c = startCol; c <= endCol; c++) {
            let bg;
            try {
              bg = cellBackground(rowData, r, columns[c], c);
            } catch (err) {
              console.error("[JHGrid] cellBackground error at row", r, "col", c, ":", err);
              continue;
            }
            if (!bg) continue;
            const x = colPositions[c] + xOffset;
            const cw = colPositions[c + 1] - colPositions[c];
            ctx.fillStyle = bg;
            ctx.fillRect(x, rowY, cw, rowH);
          }
        }
      }
      if (hoverRow && hoverRow.alpha > 0 && hoverRow.row >= startRow && hoverRow.row <= endRow && theme.hoverRowBg) {
        const hy = rowLayout.yOf(hoverRow.row) - scrollTop + headerH;
        ctx.globalAlpha = Math.min(1, hoverRow.alpha);
        ctx.fillStyle = theme.hoverRowBg;
        ctx.fillRect(startX, hy, spanW, rowLayout.heightOf(hoverRow.row));
        ctx.globalAlpha = 1;
      }
      const y0 = Math.round(rowLayout.yOf(startRow) - scrollTop + headerH);
      const y1 = Math.round(rowLayout.yOf(endRow + 1) - scrollTop + headerH);
      ctx.strokeStyle = theme.cellBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = startCol; c <= endCol + 1; c++) {
        const lx = Math.round(colPositions[c] + xOffset) + 0.5;
        ctx.moveTo(lx, y0);
        ctx.lineTo(lx, y1);
      }
      for (let r = startRow; r <= endRow + 1; r++) {
        if (selectedRows?.has(r) && selectedRows.has(r - 1)) continue;
        const ly = Math.round(rowLayout.yOf(r) - scrollTop + headerH) + 0.5;
        ctx.moveTo(startX, ly);
        ctx.lineTo(startX + spanW, ly);
      }
      ctx.stroke();
      let curAlign = "";
      let curColor = "";
      for (let r = startRow; r <= endRow; r++) {
        const rowData = getRow(r);
        const cellY = rowLayout.yOf(r) - scrollTop + headerH;
        for (let c = startCol; c <= endCol; c++) {
          const val = rowData ? rowData[columns[c]] : null;
          const x = colPositions[c] + xOffset;
          const colW = colPositions[c + 1] - colPositions[c];
          const cellH = rowLayout.heightOf(r);
          const midY = cellY + cellH / 2;
          const renderer = columnRenderers?.[c];
          if (renderer && rowData) {
            ctx.save();
            try {
              renderer(ctx, { x, y: cellY, w: colW, h: cellH, value: val, rowData, rowIndex: r, colIndex: c, theme, padding });
            } catch (err) {
              console.error("[JHGrid] Custom renderer error at row", r, "col", c, ":", err);
            }
            ctx.restore();
            continue;
          }
          if (rowData == null) {
            const maxCellW2 = colW - padding * 2;
            const barW = maxCellW2 * this.#skeletonFrac(r, c);
            if (barW > 2) {
              const barH = Math.min(9, cellH - 12);
              ctx.fillStyle = theme.skeletonBar;
              this.#roundRect(x + padding, midY - barH / 2, barW, barH, 3);
              curColor = null;
            }
            continue;
          }
          const color = val != null ? theme.cellText : theme.loadingText;
          const align = aligns?.[c] ?? "left";
          if (color !== curColor) {
            ctx.fillStyle = color;
            curColor = color;
          }
          if (align !== curAlign) {
            ctx.textAlign = align;
            curAlign = align;
          }
          const tx = align === "right" ? x + colW - padding : align === "center" ? x + colW / 2 : x + padding;
          const maxCellW = colW - padding * 2;
          const text = val != null ? String(val) : "";
          if (text.indexOf("\n") !== -1) {
            const lines = text.split("\n");
            const lineH = theme.fontSize * 1.4;
            let lineY = midY - (lines.length - 1) * lineH / 2;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, cellY, colW, cellH);
            ctx.clip();
            for (const line of lines) {
              ctx.fillText(this.#clipEW(line, maxCellW, ew), tx, lineY);
              lineY += lineH;
            }
            ctx.restore();
            continue;
          }
          const fastMaxChars = Math.floor(maxCellW / (theme.fontSize * 0.5));
          ctx.fillText(
            text.length <= fastMaxChars && !_Renderer.#hasWideChar(text) ? text : this.#clipEW(text, maxCellW, ew),
            tx,
            midY
          );
        }
      }
      if (skeletonPhase != null) {
        const bandW = spanW * 0.28;
        const bandX = startX - bandW + (spanW + bandW * 2) * skeletonPhase;
        for (let r = startRow; r <= endRow; r++) {
          if (getRow(r) != null) continue;
          const rowY = rowLayout.yOf(r) - scrollTop + headerH;
          ctx.save();
          ctx.beginPath();
          ctx.rect(startX, rowY, spanW, rowLayout.heightOf(r));
          ctx.clip();
          ctx.fillStyle = theme.skeletonSheen;
          ctx.fillRect(bandX, rowY, bandW, rowLayout.heightOf(r));
          ctx.restore();
        }
      }
      if (deletedRows) {
        ctx.strokeStyle = theme.deletedRowStrike;
        ctx.lineWidth = 1;
        for (let r = startRow; r <= endRow; r++) {
          if (!deletedRows.has(r)) continue;
          const ly = Math.round(rowLayout.yOf(r) - scrollTop + headerH + rowLayout.heightOf(r) / 2) + 0.5;
          ctx.beginPath();
          ctx.moveTo(startX, ly);
          ctx.lineTo(startX + spanW, ly);
          ctx.stroke();
        }
      }
      if (invalidCells && invalidCells.size) {
        ctx.strokeStyle = theme.invalidCellBorder;
        ctx.lineWidth = 1.5;
        for (let r = startRow; r <= endRow; r++) {
          const cellY = rowLayout.yOf(r) - scrollTop + headerH;
          for (let c = startCol; c <= endCol; c++) {
            if (!invalidCells.has(`${r}_${columns[c]}`)) continue;
            const x = colPositions[c] + xOffset;
            const colW = colPositions[c + 1] - colPositions[c];
            const cellH = rowLayout.heightOf(r);
            ctx.strokeRect(Math.round(x) + 1, Math.round(cellY) + 1, colW - 2, cellH - 2);
          }
        }
      }
      const cellDecorator = this.#opts.cellDecorator;
      if (cellDecorator) {
        for (let r = startRow; r <= endRow; r++) {
          const rowData = getRow(r);
          if (rowData == null) continue;
          const cellY = rowLayout.yOf(r) - scrollTop + headerH;
          const cellH = rowLayout.heightOf(r);
          for (let c = startCol; c <= endCol; c++) {
            const x = colPositions[c] + xOffset;
            const colW = colPositions[c + 1] - colPositions[c];
            const field = columns[c];
            ctx.save();
            try {
              cellDecorator(ctx, {
                x,
                y: cellY,
                w: colW,
                h: cellH,
                value: rowData[field],
                rowData,
                field,
                rowIndex: r,
                colIndex: c,
                theme,
                padding
              });
            } catch (err) {
              console.error("[JHGrid] cellDecorator error at row", r, "col", c, ":", err);
            }
            ctx.restore();
          }
        }
      }
    }
    // Screen-space box a selection occupies. Both ends of a move animation are resolved through
    // here on every frame rather than being captured as pixels when the move starts, so scrolling,
    // a resize, or a column reorder *during* the animation stays correct — the geometry is always
    // the live geometry and only the blend between the two ends is time-based.
    #selBox(sel, scrollTop, scrollLeft, rowLayout, headerH, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions) {
      if (!sel) return null;
      const cellX = (c) => this.#colX(c, frozenCount, frozenWidth, frozenRightCount, rightX, scrollLeft, colPositions);
      const cellY = (r) => rowLayout.yOf(r) - scrollTop + headerH;
      if (sel.type === "single") {
        return {
          x: cellX(sel.col),
          y: cellY(sel.row),
          w: colPositions[sel.col + 1] - colPositions[sel.col],
          h: rowLayout.heightOf(sel.row)
        };
      }
      const { r1, c1, r2, c2 } = sel;
      const x = cellX(c1);
      return {
        x,
        y: cellY(r1),
        w: cellX(c2) + (colPositions[c2 + 1] - colPositions[c2]) - x,
        h: rowLayout.yOf(r2 + 1) - rowLayout.yOf(r1)
      };
    }
    // `selAnim` is `{ prev, t }` while the selection is easing from `prev` to `sel`, otherwise null.
    // Only the box interpolates; the styling is the destination's throughout, so moving from a
    // single cell to a range shows the range fill for the whole move rather than popping it in at
    // the end.
    #drawSelection(sel, editing, scrollTop, scrollLeft, rowLayout, headerH, theme, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions, selAnim) {
      const ctx = this.#ctx;
      if (sel.type === "single" && editing?.row === sel.row && editing?.col === sel.col) return;
      const geoArgs = [scrollTop, scrollLeft, rowLayout, headerH, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions];
      let { x, y, w, h } = this.#selBox(sel, ...geoArgs);
      if (selAnim?.prev && selAnim.t < 1) {
        const from = this.#selBox(selAnim.prev, ...geoArgs);
        if (from) {
          const t = selAnim.t;
          x = from.x + (x - from.x) * t;
          y = from.y + (y - from.y) * t;
          w = from.w + (w - from.w) * t;
          h = from.h + (h - from.h) * t;
        }
      }
      if (sel.type === "range") {
        ctx.fillStyle = theme.selectionFill;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = theme.selectionColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    // One other participant's current selection: a colored outline in their assigned collab color,
    // plus a small name tag -- no shared theme color the way the local selection has one, since each
    // participant's is their own. The tag sits just above the box by default (like a cursor flag in
    // a live editor) and flips to just below when above it would run under the header row.
    #drawRemoteSelection(sel, color, label, scrollTop, scrollLeft, rowLayout, headerH, frozenCount, frozenWidth, frozenRightCount, rightX, colPositions) {
      const ctx = this.#ctx;
      const { x, y, w, h } = this.#selBox(
        sel,
        scrollTop,
        scrollLeft,
        rowLayout,
        headerH,
        frozenCount,
        frozenWidth,
        frozenRightCount,
        rightX,
        colPositions
      );
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      if (label) {
        ctx.font = `bold 11px ${this.#opts.theme.fontFamily}`;
        const text = this.#clip(label, 100);
        const tagW = ctx.measureText(text).width + 8;
        const tagH = 14;
        const tagY = y - tagH >= headerH ? y - tagH : y + h;
        ctx.fillStyle = color;
        ctx.fillRect(x, tagY, tagW, tagH);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + 4, tagY + tagH / 2);
      }
      ctx.restore();
    }
    #drawScrollbars({ v, h, SB, vSB = SB, hSB = SB, frozenWidth = 0, frozenRightWidth = 0, rightX = 0 }, theme, W, H) {
      if (!vSB && !hSB) return;
      const ctx = this.#ctx;
      const r = theme.scrollbarRadius;
      ctx.fillStyle = theme.scrollbarBg;
      if (vSB > 0 && hSB > 0) ctx.fillRect(W - vSB, H - hSB, vSB, hSB);
      if (hSB > 0 && frozenWidth > 0) ctx.fillRect(0, H - hSB, frozenWidth, hSB);
      if (hSB > 0 && frozenRightWidth > 0) ctx.fillRect(rightX, H - hSB, frozenRightWidth, hSB);
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = theme.scrollbarThumb;
      this.#roundRect(v.x + 2, v.thumbY + 2, v.w - 4, v.thumbH - 4, r);
      ctx.fillStyle = theme.scrollbarBg;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = theme.scrollbarThumb;
      this.#roundRect(h.thumbX + 2, h.y + 2, h.thumbW - 4, h.h - 4, r);
    }
    #roundRect(x, y, w, h, r) {
      if (w <= 0 || h <= 0) return;
      const ctx = this.#ctx;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
    }
    // How much of a cell a loading bar fills. Derived from the row and column rather than random,
    // because the grid redraws constantly and a length that changes between frames reads as flicker.
    // The spread is there so a screenful of bars looks like text of varying length instead of a
    // block of identical stripes.
    #skeletonFrac(row, col) {
      const h = (row * 73 + col * 151) % 100;
      return 0.45 + h / 100 * 0.4;
    }
    #wrapText(text, maxWidth) {
      const ctx = this.#ctx;
      const words = text.split(" ");
      const lines = [];
      let current = "";
      for (const word of words) {
        const test = current ? current + " " + word : word;
        if (ctx.measureText(test).width <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = ctx.measureText(word).width > maxWidth ? this.#clip(word, maxWidth) : word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [text];
    }
    // Hangul (syllables + jamo), CJK ideographs/punctuation, Hiragana/Katakana, full-width forms,
    // and emoji -- glyphs that render close to a full em wide, well past what the fastMaxChars
    // per-char estimate above assumes. Used to decide when a cell's text is unsafe to fillText
    // without first running it through the actual-measured #clipEW.
    static #WIDE_CHAR_RE = /[\u{1100}-\u{FFEF}\u{1F000}-\u{1FFFF}]/u;
    static #hasWideChar(text) {
      return _Renderer.#WIDE_CHAR_RE.test(text);
    }
    // Used by header (font may vary)
    #clip(text, maxWidth) {
      const ctx = this.#ctx;
      if (!text || ctx.measureText(text).width <= maxWidth) return text;
      const ew = ctx.measureText("\u2026").width;
      return this.#clipEW(text, maxWidth, ew);
    }
    // Hot-path clip with pre-measured ellipsis width
    #clipEW(text, maxWidth, ew) {
      const ctx = this.#ctx;
      if (ctx.measureText(text).width <= maxWidth) return text;
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        ctx.measureText(text.slice(0, mid)).width + ew <= maxWidth ? lo = mid : hi = mid - 1;
      }
      return lo > 0 ? text.slice(0, lo) + "\u2026" : "\u2026";
    }
  };

  // core/styles.js
  var CLS = {
    root: "jhg-root",
    loading: "jhg-loading",
    empty: "jhg-empty",
    tooltip: "jhg-tooltip",
    // Floating surfaces. `overlay` carries the shared entrance animation; the rest are hooks for
    // consumer CSS and for the more specific rules below.
    overlay: "jhg-overlay",
    panel: "jhg-panel",
    // filter / sort panel
    dialog: "jhg-dialog",
    // column chooser
    menu: "jhg-menu",
    // row + column context menus
    menuItem: "jhg-menu-item",
    // Filter tag chips. `chipContains` additionally marks the substring-mode chip, which is a
    // different kind of filter rather than one more value.
    chip: "jhg-chip",
    chipContains: "jhg-chip-contains",
    // Column-chooser tree: a group heading and its expand/collapse arrow.
    treeGroup: "jhg-tree-group",
    treeToggle: "jhg-tree-toggle",
    // Interactive bits
    btn: "jhg-btn",
    swatch: "jhg-swatch",
    pager: "jhg-pager",
    pagerBtn: "jhg-pager-btn",
    editor: "jhg-editor"
  };
  var VAR_MAP = {
    overlayBg: "--jhg-overlay-bg",
    overlayBorder: "--jhg-overlay-border",
    overlayHeaderBg: "--jhg-overlay-header-bg",
    overlayDivider: "--jhg-overlay-divider",
    overlayText: "--jhg-overlay-text",
    overlayMutedText: "--jhg-overlay-muted-text",
    overlayHintText: "--jhg-overlay-hint-text",
    overlayHoverBg: "--jhg-overlay-hover-bg",
    overlayItemHoverBg: "--jhg-overlay-item-hover-bg",
    overlayShadow: "--jhg-overlay-shadow",
    overlayMenuShadow: "--jhg-overlay-menu-shadow",
    overlayAccentText: "--jhg-overlay-accent-text",
    selectionColor: "--jhg-accent",
    pagerBg: "--jhg-pager-bg",
    pagerText: "--jhg-pager-text",
    pagerBorder: "--jhg-pager-border",
    pagerButtonBg: "--jhg-pager-button-bg",
    pagerButtonBorder: "--jhg-pager-button-border",
    fontFamily: "--jhg-font-family"
  };
  function themed(theme, key) {
    const value = theme?.[key];
    const name = VAR_MAP[key];
    return name ? `var(${name}, ${value})` : value;
  }
  var THEME_VARS = Object.freeze({ ...VAR_MAP });
  var STYLE_ID = "jhgrid-styles";
  var CSS = `
.${CLS.root} {
  --jhg-motion-fast: 140ms;
  --jhg-motion-slow: 180ms;
  --jhg-ease: cubic-bezier(0.2, 0, 0.2, 1);
  --jhg-focus-ring: var(--jhg-accent, #2E75B6);
}

@keyframes jhg-overlay-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
@keyframes jhg-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Entrance only. Every close path removes its element synchronously (and callers/tests observe
   that immediately), so an exit animation would mean deferring removal \u2014 a behavioral change,
   not a cosmetic one. Hover/focus transitions below still animate in both directions. */
.${CLS.overlay} {
  animation: jhg-overlay-in var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out) both;
  transform-origin: top center;
}

.${CLS.menuItem} {
  transition: background-color var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out);
}

/* The builders assign background/border/color inline; declaring the transition here is what makes
   those assignments animate instead of snapping. */
.${CLS.btn}, .${CLS.pagerBtn} {
  transition: background-color var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out),
              border-color     var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out),
              color            var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out),
              transform         90ms                          var(--jhg-ease, ease-out);
}
.${CLS.btn}:active:not(:disabled), .${CLS.pagerBtn}:active:not(:disabled) {
  transform: translateY(1px);
}
.${CLS.pagerBtn}:disabled {
  opacity: 0.45;
  cursor: default;
}

.${CLS.swatch} {
  transition: transform var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out),
              box-shadow var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out);
}
.${CLS.swatch}:hover { transform: scale(1.12); }

/* The chooser sets \`transform\` inline to turn the arrow; this is what makes it turn rather than
   flip. Same split as everywhere else here \u2014 the value is the builder's, the timing is ours. */
.${CLS.treeToggle} {
  transition: transform var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out),
              color      var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out);
}
.${CLS.treeGroup} {
  transition: background-color var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out);
}

/* These three are shown and hidden by flipping display, which no transition can observe \u2014 a
   transition on opacity here would be dead code, since opacity itself never changes. An animation
   works instead: a display:none element runs none, and starting to display it replays it. */
.${CLS.tooltip}, .${CLS.empty} {
  animation: jhg-fade-in var(--jhg-motion-fast, 140ms) var(--jhg-ease, ease-out) both;
}
.${CLS.loading} {
  animation: jhg-fade-in var(--jhg-motion-slow, 180ms) var(--jhg-ease, ease-out) both;
}

/* Editors mount over the cell and take focus immediately, so this stays short enough not to read
   as lag while typing. Kept to opacity only \u2014 moving a text caret around would be worse, not
   better. */
@keyframes jhg-editor-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.${CLS.editor} {
  animation: jhg-editor-in 90ms var(--jhg-ease, ease-out) both;
}

/* A visible focus target for keyboard users. :focus-visible keeps it off mouse interactions, and
   the grid wrapper is excluded because it is focused programmatically on nearly every
   interaction \u2014 a ring there would flash constantly rather than indicate anything.
   Menu items are also excluded: a context menu focuses its first item with a plain
   \`.focus()\` call as soon as it opens \u2014 including on a mouse right-click, since focus-visible
   can't tell that script-driven focus apart from a keyboard interaction \u2014 so this outline would
   flash on every open. A full-width single-row item makes the outline's top/bottom edges read as
   two stray horizontal lines rather than a ring, which is the actual bug this excludes. Menu
   items get their own focus indicator instead (same highlight as mouse hover \u2014 see each menu
   builder's \`mkItem\`). */
.${CLS.root} :focus-visible:not([role="menuitem"]),
.${CLS.pager} :focus-visible {
  outline: 2px solid var(--jhg-focus-ring, #2E75B6);
  outline-offset: 1px;
}
/* ...and the browser's own default focus outline (not our rule above) needs suppressing too,
   since excluding [role="menuitem"] from the rule above only stops *our* outline \u2014 without this
   it's replaced by the UA's native one instead of by mkItem's background highlight. */
.${CLS.menuItem}:focus {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .${CLS.root}, .${CLS.pager} {
    --jhg-motion-fast: 1ms;
    --jhg-motion-slow: 1ms;
  }
  .${CLS.overlay}, .${CLS.loading}, .${CLS.tooltip}, .${CLS.empty}, .${CLS.editor} { animation: none; }
  .${CLS.swatch}:hover { transform: none; }
  .${CLS.btn}:active:not(:disabled), .${CLS.pagerBtn}:active:not(:disabled) { transform: none; }
  /* Stated outright rather than left to the retimed variables: the chooser is a floating surface
     and may be mounted outside .${CLS.root}, where those variables never reach it. */
  .${CLS.treeToggle}, .${CLS.treeGroup} { transition: none; }
}
`;
  function injectStyleSheet(doc = typeof document !== "undefined" ? document : null) {
    if (!doc?.head || doc.getElementById(STYLE_ID)) return;
    try {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      doc.head.appendChild(style);
    } catch {
    }
  }

  // core/Editors.js
  var INPUT_BASE_STYLE = (theme, x, y, w, h) => ({
    position: "absolute",
    left: x + "px",
    top: y + "px",
    width: w + "px",
    height: h + "px",
    border: `2px solid ${themed(theme, "selectionColor")}`,
    // The 2px accent border already reads as the focus indicator, so the shared :focus-visible
    // outline would only double up here — suppressed deliberately, not by oversight.
    outline: "none",
    padding: `0 ${theme.cellPadding}px`,
    fontSize: theme.fontSize + "px",
    fontFamily: themed(theme, "fontFamily"),
    background: themed(theme, "overlayBg"),
    color: theme.cellText,
    zIndex: "10",
    boxSizing: "border-box"
  });
  function anchorToCell({ el, wrapper, x, y, offsetY = 0 }) {
    const place = () => {
      const r = wrapper.getBoundingClientRect();
      el.style.left = r.left + x + "px";
      el.style.top = r.top + y + offsetY + "px";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }
  function isOwnCellClick(e, { wrapper, x, y, colW, rowH }) {
    const r = wrapper.getBoundingClientRect();
    const left = r.left + x, top = r.top + y;
    return e.clientX >= left && e.clientX < left + colW && e.clientY >= top && e.clientY < top + rowH;
  }
  var CellEditors = {
    // Plain single-line text input — the default editor for any column without a `type`.
    //
    // Reuses JHGrid's `_kbProxy` (passed in as `ctx.kbProxy`) instead of creating a disposable
    // <input> like every other editor here. That element holds keyboard focus continuously, for as
    // long as a cell is selected at all — swapping it out for a fresh one mid-edit is exactly the
    // kind of focus change that kills an in-progress IME composition, which is the whole reason it
    // exists. `.remove()` on it is overridden (see JHGrid.js) to reset it back to hidden rather
    // than actually detach it, so the generic commit/cancel teardown below needs no special case.
    text() {
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, kbProxy, i18n, columnLabel, row, initialValue, keepInputValue } = ctx;
        const input = kbProxy;
        if (input._jhEditorBlur) input.removeEventListener("blur", input._jhEditorBlur);
        if (input._jhEditorKeydown) input.removeEventListener("keydown", input._jhEditorKeydown);
        if (!keepInputValue) input.value = initialValue;
        input.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        input.className = CLS.editor;
        input.style.cssText = "";
        Object.assign(input.style, INPUT_BASE_STYLE(theme, x, y, colW, rowH));
        if (input.parentElement !== wrapper) wrapper.appendChild(input);
        if (!keepInputValue) {
          input.focus();
          const len = input.value.length;
          input.setSelectionRange(len, len);
        }
        const onBlur = () => ctx.commit();
        const onKeydown = (e) => {
          if (e.key === "Enter" && e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            ctx.insertLineBreak();
          } else if (e.key === "Enter") {
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(1, 0);
            ctx.focusWrapper();
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
            ctx.focusWrapper();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            ctx.cancel();
            ctx.focusWrapper();
          }
        };
        input._jhEditorBlur = onBlur;
        input._jhEditorKeydown = onKeydown;
        input.addEventListener("blur", onBlur);
        input.addEventListener("keydown", onKeydown);
        return input;
      };
    },
    // Fallback `text()` reaches for automatically (see JHGrid.js's _startEdit) instead of the
    // single-line <input>/_kbProxy above whenever the value being opened already contains a line
    // break. Setting `.value` on a single-line `<input>` runs the HTML value-sanitization algorithm,
    // which strips `\r`/`\n` outright -- a cell pasted in from Excel with Alt+Enter line breaks would
    // otherwise collapse to one line the instant the editor opened, before the user typed anything.
    // Not exposed via `colDef.type` -- there's nothing to opt into, it only ever replaces the plain
    // text editor for one specific value shape.
    //
    // A disposable element (like every editor below, unlike text()'s reused _kbProxy) because IME
    // composition continuity isn't the concern here: by the time this runs, the value already has a
    // line break in it, so it wasn't mid-composition a moment ago.
    textMultiline() {
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, initialValue } = ctx;
        const el = document.createElement("textarea");
        el.value = initialValue ?? "";
        el.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        el.className = CLS.editor;
        Object.assign(el.style, INPUT_BASE_STYLE(theme, x, y, colW, rowH), {
          resize: "none",
          overflow: "auto",
          whiteSpace: "pre"
        });
        wrapper.appendChild(el);
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        const onBlur = () => ctx.commit();
        const onKeydown = (e) => {
          if (e.key === "Enter" && e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, start) + "\n" + el.value.slice(end);
            el.setSelectionRange(start + 1, start + 1);
            return;
          }
          if (e.key === "Enter") {
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(1, 0);
            ctx.focusWrapper();
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
            ctx.focusWrapper();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            ctx.cancel();
            ctx.focusWrapper();
          } else {
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !["c", "v", "x", "a"].includes(k)) e.stopPropagation();
          }
        };
        el.addEventListener("blur", onBlur);
        el.addEventListener("keydown", onKeydown);
        return el;
      };
    },
    // Native date/datetime picker. `mode: 'date' | 'datetime-local'`; `min`/`max` are ISO strings.
    // If `format` is provided (e.g. 'YY/MM/DD'), the masked text input stays the primary field, but a
    // calendar glyph next to it opens a real `<input type="date">` (hidden, transparent) so users can
    // still pick a date instead of typing digits — its value round-trips through the same YYYY/MM/DD/
    // HH/mm tokens `CellRenderers.date()` (Renderer.js) understands.
    date({ mode = "date", min, max, format } = {}) {
      if (format) {
        const sep = format.match(/[^A-Za-z0-9]/)?.[0] ?? "/";
        const groups = format.split(/[^A-Za-z0-9]+/).map((g) => g.length);
        const totalDigits = groups.reduce((s, n) => s + n, 0);
        const tokens = format.match(/YYYY|YY|MM|DD|HH|mm|ss/g) ?? [];
        const hasTime = tokens.includes("HH") || tokens.includes("mm") || tokens.includes("ss");
        const pickerType = hasTime ? "datetime-local" : "date";
        const applyFmt = (digits) => {
          let out = "", pos = 0;
          for (let i = 0; i < groups.length; i++) {
            const chunk = digits.slice(pos, pos + groups[i]);
            if (!chunk) break;
            if (out) out += sep;
            out += chunk;
            pos += groups[i];
          }
          return out;
        };
        const digitsToISO = (digits) => {
          const parts = {};
          let pos = 0;
          for (const tok of tokens) {
            const chunk = digits.slice(pos, pos + tok.length);
            pos += tok.length;
            if (chunk.length < tok.length) return null;
            if (tok === "YYYY") parts.Y = chunk;
            else if (tok === "YY") parts.Y = "20" + chunk;
            else if (tok === "MM") parts.M = chunk;
            else if (tok === "DD") parts.D = chunk;
            else if (tok === "HH") parts.H = chunk;
            else if (tok === "mm") parts.Mi = chunk;
          }
          if (!parts.Y || !parts.M || !parts.D) return null;
          return hasTime ? `${parts.Y}-${parts.M}-${parts.D}T${parts.H ?? "00"}:${parts.Mi ?? "00"}` : `${parts.Y}-${parts.M}-${parts.D}`;
        };
        const isoToFmt = (iso) => {
          const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
          if (!m) return "";
          const [, Y, M, D, H, Mi] = m;
          let digits = "";
          for (const tok of tokens) {
            if (tok === "YYYY") digits += Y;
            else if (tok === "YY") digits += Y.slice(-2);
            else if (tok === "MM") digits += M;
            else if (tok === "DD") digits += D;
            else if (tok === "HH") digits += H ?? "00";
            else if (tok === "mm") digits += Mi ?? "00";
          }
          return applyFmt(digits);
        };
        return (ctx) => {
          const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, initialValue } = ctx;
          const btnW = tokens.length && colW > 40 ? 22 : 0;
          const inputW = colW - btnW;
          const input = document.createElement("input");
          input.type = "text";
          input.value = String(initialValue ?? "");
          input.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
          Object.assign(input.style, INPUT_BASE_STYLE(theme, x, y, inputW, rowH));
          wrapper.appendChild(input);
          let picker = null, glyph = null;
          if (btnW > 0) {
            picker = document.createElement("input");
            picker.type = pickerType;
            if (min != null) picker.min = min;
            if (max != null) picker.max = max;
            picker.tabIndex = -1;
            picker.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1) + " calendar");
            Object.assign(picker.style, {
              position: "absolute",
              left: x + inputW + "px",
              top: y + "px",
              width: btnW + "px",
              height: rowH + "px",
              opacity: "0",
              border: "none",
              padding: "0",
              margin: "0",
              zIndex: "9"
            });
            wrapper.appendChild(picker);
            glyph = document.createElement("div");
            glyph.textContent = String.fromCodePoint(128197);
            glyph.setAttribute("aria-hidden", "true");
            Object.assign(glyph.style, {
              position: "absolute",
              left: x + inputW + "px",
              top: y + "px",
              width: btnW + "px",
              height: rowH + "px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.min(theme.fontSize, 14) + "px",
              pointerEvents: "none",
              zIndex: "10"
            });
            wrapper.appendChild(glyph);
            const iso = digitsToISO(input.value.replace(/\D/g, "").slice(0, totalDigits));
            if (iso != null) picker.value = iso;
            picker.addEventListener("click", () => {
              if (typeof picker.showPicker === "function") {
                try {
                  picker.showPicker();
                } catch {
                }
              }
            });
            picker.addEventListener("change", () => {
              input.value = isoToFmt(picker.value);
              ctx.commit();
              ctx.focusWrapper();
            });
            picker.addEventListener("blur", (e) => {
              if (e.relatedTarget === input) return;
              ctx.commit();
            });
          }
          input.focus();
          input.select();
          input.addEventListener("input", () => {
            const caretPos = input.selectionStart;
            const digitsBeforeCaret = input.value.slice(0, caretPos).replace(/\D/g, "").length;
            const allDigits = input.value.replace(/\D/g, "").slice(0, totalDigits);
            const newVal = applyFmt(allDigits);
            input.value = newVal;
            if (picker) {
              const iso = digitsToISO(allDigits);
              if (iso != null) picker.value = iso;
            }
            let newCaret = newVal.length, dCount = 0;
            for (let i = 0; i < newVal.length; i++) {
              if (/\d/.test(newVal[i])) {
                dCount++;
                if (dCount === digitsBeforeCaret) {
                  newCaret = i + 1;
                  break;
                }
              }
            }
            input.setSelectionRange(newCaret, newCaret);
          });
          input.addEventListener("blur", (e) => {
            if (picker && e.relatedTarget === picker) return;
            ctx.commit();
          });
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              ctx.commit();
              ctx.moveSel(1, 0);
              ctx.focusWrapper();
            } else if (e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              ctx.commit();
              ctx.moveSel(0, e.shiftKey ? -1 : 1);
              ctx.focusWrapper();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              ctx.cancel();
              ctx.focusWrapper();
            }
          });
          return {
            get value() {
              return input.value;
            },
            remove() {
              input.remove();
              if (picker) picker.remove();
              if (glyph) glyph.remove();
            }
          };
        };
      }
      const sliceLen = mode === "datetime-local" ? 16 : 10;
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, initialValue } = ctx;
        const input = document.createElement("input");
        input.type = mode === "datetime-local" ? "datetime-local" : "date";
        if (min != null) input.min = min;
        if (max != null) input.max = max;
        input.value = String(initialValue ?? "").slice(0, sliceLen);
        input.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        input.className = CLS.editor;
        Object.assign(input.style, INPUT_BASE_STYLE(theme, x, y, colW, rowH));
        wrapper.appendChild(input);
        input.focus();
        input.addEventListener("blur", () => ctx.commit());
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(1, 0);
            ctx.focusWrapper();
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            ctx.commit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
            ctx.focusWrapper();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            ctx.cancel();
            ctx.focusWrapper();
          }
        });
        return input;
      };
    },
    // Excel-style option listbox — the editor `type: 'dropdown'` columns use.
    dropdown({ options } = {}) {
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, rowData, initialValue } = ctx;
        const resolvedOptions = typeof options === "function" ? options(rowData ?? {}) : options ?? [];
        if (!resolvedOptions.length) return null;
        let currentVal = initialValue;
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
          position: "absolute",
          left: x + "px",
          top: y + "px",
          width: colW + "px",
          height: rowH + "px",
          border: `2px solid ${theme.selectionColor}`,
          boxSizing: "border-box",
          zIndex: "10",
          pointerEvents: "none"
        });
        wrapper.appendChild(overlay);
        const wrapRect = wrapper.getBoundingClientRect();
        const cellAbsX = wrapRect.left + x;
        const cellAbsY = wrapRect.top + y + rowH;
        const list = document.createElement("div");
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        Object.assign(list.style, {
          position: "fixed",
          left: cellAbsX + "px",
          top: cellAbsY + "px",
          minWidth: colW + "px",
          maxHeight: "240px",
          overflowY: "auto",
          background: theme.overlayBg,
          border: `1px solid ${theme.overlayBorder}`,
          borderRadius: "4px",
          boxShadow: theme.overlayMenuShadow,
          zIndex: "99999",
          fontSize: theme.fontSize + "px",
          fontFamily: theme.fontFamily,
          color: theme.cellText
        });
        let highlightedIdx = -1;
        const items = [];
        const setHighlight = (idx) => {
          items.forEach((el, i) => {
            el.style.background = i === idx ? theme.selectionColor : el.dataset.val === currentVal ? theme.selectionFill : theme.overlayBg;
            el.style.color = i === idx ? theme.overlayAccentText : theme.cellText;
          });
          highlightedIdx = idx;
          if (idx >= 0) items[idx].scrollIntoView({ block: "nearest" });
        };
        for (let i = 0; i < resolvedOptions.length; i++) {
          const opt = resolvedOptions[i];
          const val = typeof opt === "string" ? opt : opt.value;
          const label = typeof opt === "string" ? opt : opt.label ?? opt.value;
          const item = document.createElement("div");
          item.setAttribute("role", "option");
          item.dataset.val = val;
          item.textContent = label;
          Object.assign(item.style, {
            padding: "6px 10px",
            cursor: "pointer",
            background: val === currentVal ? theme.selectionFill : theme.overlayBg,
            whiteSpace: "nowrap"
          });
          item.addEventListener("mouseenter", () => setHighlight(i));
          item.addEventListener("mouseleave", () => setHighlight(-1));
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentVal = val;
            doCommit();
          });
          list.appendChild(item);
          items.push(item);
        }
        document.body.appendChild(list);
        const unanchorList = anchorToCell({ el: list, wrapper, x, y, offsetY: rowH });
        let active = true;
        const fakeEl = {
          get value() {
            return currentVal;
          },
          remove() {
            cleanup();
            overlay.remove();
            list.remove();
          }
        };
        const cleanup = () => {
          unanchorList();
          document.removeEventListener("mousedown", onOutside, true);
          document.removeEventListener("keydown", onKey, true);
        };
        const doCommit = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.commit();
          ctx.focusWrapper();
        };
        const doCancel = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.cancel();
          ctx.focusWrapper();
        };
        const onOutside = (e) => {
          if (list.contains(e.target)) return;
          if (isOwnCellClick(e, { wrapper, x, y, colW, rowH })) ctx.suppressReopen?.();
          doCancel();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            doCancel();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            setHighlight(Math.min(highlightedIdx + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            setHighlight(Math.max(highlightedIdx - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (highlightedIdx >= 0) currentVal = items[highlightedIdx].dataset.val;
            doCommit();
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            if (highlightedIdx >= 0) currentVal = items[highlightedIdx].dataset.val;
            doCommit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
          }
        };
        document.addEventListener("mousedown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
        return fakeEl;
      };
    },
    // 다중선택 패널 에디터 — 체크박스 목록으로 여러 항목 선택, delimiter로 구분된 문자열로 저장
    multiselect({ options = [], delimiter = "," } = {}) {
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, rowData, initialValue } = ctx;
        const resolvedOptions = typeof options === "function" ? options(rowData ?? {}) : options;
        if (!resolvedOptions.length) return null;
        const selected = new Set(
          String(initialValue ?? "").split(delimiter).map((s) => s.trim()).filter(Boolean)
        );
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
          position: "absolute",
          left: x + "px",
          top: y + "px",
          width: colW + "px",
          height: rowH + "px",
          border: `2px solid ${theme.selectionColor}`,
          boxSizing: "border-box",
          zIndex: "10",
          pointerEvents: "none"
        });
        wrapper.appendChild(overlay);
        const wrapRect = wrapper.getBoundingClientRect();
        const cellAbsX = wrapRect.left + x;
        const cellAbsY = wrapRect.top + y + rowH;
        const panel = document.createElement("div");
        panel.setAttribute("role", "listbox");
        panel.setAttribute("aria-multiselectable", "true");
        panel.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        Object.assign(panel.style, {
          position: "fixed",
          left: cellAbsX + "px",
          top: cellAbsY + "px",
          minWidth: colW + "px",
          maxHeight: "240px",
          overflowY: "auto",
          background: theme.overlayBg,
          border: `1px solid ${theme.overlayBorder}`,
          borderRadius: "4px",
          boxShadow: theme.overlayMenuShadow,
          zIndex: "99999",
          fontSize: theme.fontSize + "px",
          fontFamily: theme.fontFamily,
          color: theme.cellText
        });
        resolvedOptions.forEach((opt) => {
          const val = typeof opt === "string" ? opt : opt.value;
          const label = typeof opt === "string" ? opt : opt.label ?? opt.value;
          const isChecked = selected.has(val);
          const item = document.createElement("div");
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", String(isChecked));
          Object.assign(item.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 10px",
            cursor: "pointer",
            background: isChecked ? theme.selectionFill : theme.overlayBg,
            userSelect: "none",
            whiteSpace: "nowrap"
          });
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = isChecked;
          cb.tabIndex = -1;
          cb.style.pointerEvents = "none";
          const lbl = document.createElement("span");
          lbl.textContent = label;
          item.appendChild(cb);
          item.appendChild(lbl);
          item.addEventListener("mouseenter", () => {
            item.style.background = theme.selectionColor;
            item.style.color = theme.overlayAccentText;
          });
          item.addEventListener("mouseleave", () => {
            item.style.background = selected.has(val) ? theme.selectionFill : theme.overlayBg;
            item.style.color = theme.cellText;
          });
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cb.checked = !cb.checked;
            item.setAttribute("aria-selected", String(cb.checked));
            if (cb.checked) selected.add(val);
            else selected.delete(val);
            item.style.background = selected.has(val) ? theme.selectionFill : theme.overlayBg;
            item.style.color = theme.cellText;
          });
          panel.appendChild(item);
        });
        document.body.appendChild(panel);
        const unanchorPanel = anchorToCell({ el: panel, wrapper, x, y, offsetY: rowH });
        let active = true;
        const fakeEl = {
          get value() {
            return [...selected].join(delimiter);
          },
          remove() {
            overlay.remove();
            panel.remove();
            cleanup();
          }
        };
        const cleanup = () => {
          unanchorPanel();
          document.removeEventListener("mousedown", onOutside, true);
          document.removeEventListener("keydown", onKey, true);
        };
        const doCommit = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.commit();
          ctx.focusWrapper();
        };
        const doCancel = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.cancel();
          ctx.focusWrapper();
        };
        const onOutside = (e) => {
          if (panel.contains(e.target)) return;
          if (isOwnCellClick(e, { wrapper, x, y, colW, rowH })) ctx.suppressReopen?.();
          doCommit();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            doCancel();
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            doCommit();
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            doCommit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
          }
        };
        document.addEventListener("mousedown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
        return fakeEl;
      };
    },
    // Inline rich-text editor — bold/italic/underline/strikethrough only, single line (matches the
    // grid's fixed row-height cell model; no lists/blocks/wrapping). Commits a sanitized
    // `<b>/<i>/<u>/<s>` HTML string — see `sanitizeInlineHtml()`, which `CellRenderers.richtext()`
    // (Renderer.js) parses back into draw runs.
    richtext({ marks = ["bold", "italic", "underline", "strike"] } = {}) {
      const COMMAND = { bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough" };
      const LABEL = { bold: "B", italic: "I", underline: "U", strike: "S" };
      return (ctx) => {
        const { theme, x, y, colW, rowH, wrapper, i18n, columnLabel, row, initialValue } = ctx;
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
          position: "absolute",
          left: x + "px",
          top: y + "px",
          width: colW + "px",
          height: rowH + "px",
          border: `2px solid ${theme.selectionColor}`,
          boxSizing: "border-box",
          zIndex: "10",
          pointerEvents: "none"
        });
        wrapper.appendChild(overlay);
        const wrapRect = wrapper.getBoundingClientRect();
        const cellAbsX = wrapRect.left + x;
        const cellAbsY = wrapRect.top + y;
        const toolbar = document.createElement("div");
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", i18n.richtextToolbarLabel ?? "Formatting");
        Object.assign(toolbar.style, {
          position: "fixed",
          left: cellAbsX + "px",
          top: cellAbsY - 30 + "px",
          display: "flex",
          gap: "2px",
          padding: "2px",
          background: theme.overlayBg,
          border: `1px solid ${theme.overlayBorder}`,
          borderRadius: "4px",
          boxShadow: theme.overlayMenuShadow,
          zIndex: "99999"
        });
        const buttons = {};
        const updateToolbarState = () => {
          for (const mark of marks) {
            let active2 = false;
            try {
              active2 = document.queryCommandState(COMMAND[mark]);
            } catch {
            }
            buttons[mark].setAttribute("aria-pressed", String(active2));
            buttons[mark].style.background = active2 ? theme.selectionFill : theme.overlayBg;
          }
        };
        for (const mark of marks) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = LABEL[mark] ?? mark[0].toUpperCase();
          btn.setAttribute("aria-label", mark);
          btn.setAttribute("aria-pressed", "false");
          Object.assign(btn.style, {
            width: "24px",
            height: "24px",
            border: "none",
            background: theme.overlayBg,
            cursor: "pointer",
            fontSize: theme.fontSize + "px",
            fontFamily: theme.fontFamily,
            fontWeight: mark === "bold" ? "bold" : "normal",
            fontStyle: mark === "italic" ? "italic" : "normal",
            textDecoration: mark === "underline" ? "underline" : mark === "strike" ? "line-through" : "none"
          });
          btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            try {
              document.execCommand(COMMAND[mark], false, null);
            } catch {
            }
            updateToolbarState();
            editable.focus();
          });
          toolbar.appendChild(btn);
          buttons[mark] = btn;
        }
        document.body.appendChild(toolbar);
        const unanchorToolbar = anchorToCell({ el: toolbar, wrapper, x, y, offsetY: -30 });
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        editable.setAttribute("role", "textbox");
        editable.setAttribute("aria-multiline", "false");
        editable.setAttribute("aria-label", i18n.editAriaLabel(columnLabel, row + 1));
        editable.innerHTML = sanitizeInlineHtml(String(initialValue ?? ""));
        Object.assign(editable.style, {
          position: "absolute",
          left: x + "px",
          top: y + "px",
          width: colW + "px",
          height: rowH + "px",
          border: `2px solid ${theme.selectionColor}`,
          outline: "none",
          boxSizing: "border-box",
          padding: `0 ${theme.cellPadding}px`,
          lineHeight: rowH + "px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          fontSize: theme.fontSize + "px",
          fontFamily: theme.fontFamily,
          background: theme.overlayBg,
          color: theme.cellText,
          zIndex: "10"
        });
        wrapper.appendChild(editable);
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        let active = true;
        const fakeEl = {
          get value() {
            return sanitizeInlineHtml(editable.innerHTML);
          },
          remove() {
            cleanup();
            overlay.remove();
            toolbar.remove();
            editable.remove();
          }
        };
        const cleanup = () => {
          document.removeEventListener("mousedown", onOutside, true);
          unanchorToolbar();
          document.removeEventListener("selectionchange", updateToolbarState);
        };
        const doCommit = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.commit();
          ctx.focusWrapper();
        };
        const doCancel = () => {
          if (!active) return;
          active = false;
          cleanup();
          ctx.cancel();
          ctx.focusWrapper();
        };
        const onOutside = (e) => {
          if (!editable.contains(e.target) && !toolbar.contains(e.target)) doCommit();
        };
        editable.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            e.stopPropagation();
            doCommit();
            ctx.moveSel(1, 0);
          } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            doCommit();
            ctx.moveSel(0, e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            doCancel();
          } else {
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !["c", "v", "x", "a"].includes(k)) e.stopPropagation();
          }
        });
        editable.addEventListener("input", updateToolbarState);
        document.addEventListener("mousedown", onOutside, true);
        updateToolbarState();
        return fakeEl;
      };
    }
  };
  var BUILTIN_EDITOR_NAMES = new Set(Object.keys(CellEditors));
  function registerCellEditor(name, factory) {
    if (BUILTIN_EDITOR_NAMES.has(name)) {
      console.warn(`[JHGrid] registerCellEditor: "${name}" is a built-in editor name and will be overwritten`);
    }
    CellEditors[name] = factory;
  }
  var ALLOWED_INLINE_TAGS = /* @__PURE__ */ new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL"]);
  var INLINE_TAG_ALIAS = { STRONG: "B", EM: "I", STRIKE: "S", DEL: "S" };
  var DROPPED_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED"]);
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function sanitizeInlineHtml(html) {
    const container = document.createElement("template");
    container.innerHTML = html;
    const root = container.content;
    const out = [];
    const ELEMENT_NODE = 1, TEXT_NODE = 3;
    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === TEXT_NODE) {
          out.push(escapeHtml(child.textContent.replace(/[\r\n]+/g, " ")));
        } else if (child.nodeType === ELEMENT_NODE) {
          const tag = child.tagName;
          if (DROPPED_TAGS.has(tag)) continue;
          if (tag === "BR") {
            out.push(" ");
            continue;
          }
          if (tag === "DIV" || tag === "P") {
            walk(child);
            out.push(" ");
            continue;
          }
          const mapped = INLINE_TAG_ALIAS[tag] ?? (ALLOWED_INLINE_TAGS.has(tag) ? tag : null);
          if (mapped) {
            const lower = mapped.toLowerCase();
            out.push(`<${lower}>`);
            walk(child);
            out.push(`</${lower}>`);
          } else {
            walk(child);
          }
        }
      }
    };
    walk(root);
    return out.join("").trim();
  }

  // core/UndoManager.js
  var UndoManager = class {
    #undoStack = [];
    // oldest first
    #redoStack = [];
    #limit;
    constructor(limit = 100) {
      this.#limit = limit;
    }
    // Pushes a new command and clears the redo stack (a fresh action invalidates any redo history).
    push(cmd) {
      this.#undoStack.push(cmd);
      if (this.#undoStack.length > this.#limit) this.#undoStack.shift();
      this.#redoStack.length = 0;
    }
    undo() {
      const cmd = this.#undoStack.pop();
      if (!cmd) return;
      cmd.undo();
      this.#redoStack.push(cmd);
    }
    redo() {
      const cmd = this.#redoStack.pop();
      if (!cmd) return;
      cmd.redo();
      this.#undoStack.push(cmd);
    }
    canUndo() {
      return this.#undoStack.length > 0;
    }
    canRedo() {
      return this.#redoStack.length > 0;
    }
    // Drops all history (e.g. after a reload/sort/filter invalidates row indices referenced by pending commands).
    clear() {
      this.#undoStack.length = 0;
      this.#redoStack.length = 0;
    }
  };

  // core/ColumnValidator.js
  var ColumnValidator = class {
    #invalid = /* @__PURE__ */ new Map();
    // "row_field" -> error message
    #getColumnDef;
    // (field) => columnDef | undefined
    #getColumnLabel;
    // (field) => string
    #getI18n;
    // () => i18n messages object
    #getRowData;
    // (row) => object | null — passed as context to a custom `validator` fn
    #onError;
    // (row, field, message|null) => void
    constructor({ getColumnDef, getColumnLabel, getI18n, getRowData, onError }) {
      this.#getColumnDef = getColumnDef;
      this.#getColumnLabel = getColumnLabel;
      this.#getI18n = getI18n;
      this.#getRowData = getRowData;
      this.#onError = onError;
    }
    // Returns an error message if `value` violates the column's `validation` rules and/or its
    // implicit type consistency, or null if it passes (or the column has no rules and no
    // type-checkable `type`).
    compute(row, field, value) {
      const colDef = this.#getColumnDef(field);
      const rules = colDef?.validation;
      const i18n = this.#getI18n();
      const label = this.#getColumnLabel(field) ?? field;
      const v = value ?? "";
      if (rules?.required && v.trim() === "")
        return rules.message ?? i18n.validationRequired(label);
      if (v === "") return null;
      if (!rules) return this.#checkType(colDef, row, v, label, i18n);
      if (rules.pattern) {
        const re = rules.pattern instanceof RegExp ? rules.pattern : new RegExp(rules.pattern);
        re.lastIndex = 0;
        if (!re.test(v)) return rules.message ?? i18n.validationPattern(label);
      }
      if (rules.min != null || rules.max != null) {
        const isDate = colDef?.type === "date";
        const num = isDate ? Date.parse(v) : Number(v);
        if (rules.min != null && (isNaN(num) || num < (isDate ? Date.parse(rules.min) : rules.min)))
          return rules.message ?? i18n.validationMin(label, rules.min);
        if (rules.max != null && (isNaN(num) || num > (isDate ? Date.parse(rules.max) : rules.max)))
          return rules.message ?? i18n.validationMax(label, rules.max);
      }
      if (rules.minLength != null && v.length < rules.minLength)
        return rules.message ?? i18n.validationMinLength(label, rules.minLength);
      if (rules.maxLength != null && v.length > rules.maxLength)
        return rules.message ?? i18n.validationMaxLength(label, rules.maxLength);
      if (rules.validator) {
        let result;
        try {
          result = rules.validator(v, this.#getRowData(row) ?? {});
        } catch (err) {
          console.error("[JHGrid] validator error at row", row, "field", field, ":", err);
          return null;
        }
        if (typeof result === "string") return result;
        if (result === false) return rules.message ?? i18n.validationInvalid(label);
      }
      return this.#checkType(colDef, row, v, label, i18n);
    }
    // Flags a value that couldn't have come from the column's own editor UI: a dropdown/multiselect
    // value not among its `options`, or a date column value that isn't a valid date for its
    // `format`. Columns with no `type`, or a `type` this doesn't recognize, are never flagged here.
    #checkType(colDef, row, v, label, i18n) {
      if (!colDef) return null;
      if (colDef.type === "dropdown") {
        const opts = this.#resolveOptions(colDef, row);
        if (opts && !opts.includes(v)) return i18n.validationInvalid(label);
      } else if (colDef.type === "multiselect") {
        const opts = this.#resolveOptions(colDef, row);
        if (opts) {
          const delimiter = colDef.editorOptions?.delimiter ?? ",";
          const tokens = v.split(delimiter).map((s) => s.trim()).filter(Boolean);
          if (tokens.some((t) => !opts.includes(t))) return i18n.validationInvalid(label);
        }
      } else if (colDef.type === "date") {
        if (!this.#isValidDate(v, colDef.format)) return i18n.validationInvalid(label);
      }
      return null;
    }
    // Checks structurally against `format`'s token layout (YYYY/YY/MM/DD/HH/mm/ss) rather than
    // handing the raw string to `new Date()` — a masked `format: 'DD/MM/YYYY'` editor commits e.g.
    // "16/07/2024", which `new Date()` parses as US-style MM/DD/YYYY (month 16 → invalid) even
    // though it's a perfectly valid date in its own column format. Falls back to `new Date()` only
    // when there's no format (native date/datetime-local input, always ISO) or the format has no
    // recognized tokens.
    #isValidDate(v, format) {
      const tokens = format?.match(/YYYY|YY|MM|DD|HH|mm|ss/g);
      if (!tokens?.length) return !isNaN(new Date(v).getTime());
      const sep = format.match(/[^A-Za-z0-9]/)?.[0] ?? "/";
      const parts = v.split(sep);
      if (parts.length !== tokens.length) return false;
      let month, day;
      for (let i = 0; i < tokens.length; i++) {
        if (!/^\d+$/.test(parts[i])) return false;
        if (tokens[i] === "MM") month = Number(parts[i]);
        else if (tokens[i] === "DD") day = Number(parts[i]);
      }
      if (month != null && (month < 1 || month > 12)) return false;
      if (day != null && (day < 1 || day > 31)) return false;
      return true;
    }
    // Resolves a dropdown/multiselect column's option values (unwrapping `{value,label}` entries),
    // calling a dynamic `options` function with the row's data. Returns null (skip the check) when
    // `options` isn't a plain array/function — same "don't know, so don't flag" stance as an
    // unrecognized `type`.
    #resolveOptions(colDef, row) {
      const raw = typeof colDef.options === "function" ? colDef.options(this.#getRowData(row) ?? {}) : colDef.options;
      if (!Array.isArray(raw)) return null;
      return raw.map((o) => typeof o === "string" ? o : o.value);
    }
    // Re-validates one cell given its already-resolved string value, updates the invalid-cell set
    // accordingly, and fires the error callback.
    revalidate(row, field, value) {
      const colDef = this.#getColumnDef(field);
      if (!colDef?.validation && !this.#isCheckableType(colDef?.type)) return null;
      const key = `${row}_${field}`;
      const msg = this.compute(row, field, value);
      if (msg) this.#invalid.set(key, msg);
      else this.#invalid.delete(key);
      this.#onError?.(row, field, msg ?? null);
      return msg;
    }
    #isCheckableType(type) {
      return type === "dropdown" || type === "multiselect" || type === "date";
    }
    isValid() {
      return this.#invalid.size === 0;
    }
    // Returns all currently invalid cells as `{ [row]: { [field]: message } }`.
    getInvalidCells() {
      const result = {};
      this.#invalid.forEach((message, key) => {
        const u = key.indexOf("_");
        const row = Number(key.slice(0, u));
        const field = key.slice(u + 1);
        (result[row] ??= {})[field] = message;
      });
      return result;
    }
    // Raw "row_field" → message map — for direct handoff to Renderer, or diffing keys across a bulk re-check.
    get map() {
      return this.#invalid;
    }
    // Drops all tracked invalid-cell state without firing onError.
    clear() {
      this.#invalid.clear();
    }
  };

  // core/csv.js
  var PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function escapeCsvValue(value, delimiter = ",") {
    let s = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
    return s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function quoteTsvValue(value, delimiter = "	") {
    const s = String(value ?? "");
    return s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function parsePastedGrid(text, delimiter = "	") {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      if (inQuotes) {
        if (ch === '"') {
          if (normalized[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"' && field === "") {
        inQuotes = true;
        continue;
      }
      if (ch === delimiter) {
        row.push(field);
        field = "";
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }
      field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  // core/cellFormat.js
  function formatCellForDisplay(raw, def, locale) {
    if (raw == null || raw === "") return raw;
    if (def?.type === "date") {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (isNaN(d.getTime())) return raw;
      const format = def.format ?? "YYYY-MM-DD";
      if (format === "locale") return new Intl.DateTimeFormat(locale).format(d);
      const Y = String(d.getFullYear()).padStart(4, "0");
      const M = String(d.getMonth() + 1).padStart(2, "0");
      const D = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      const YY = Y.slice(-2);
      return format.replace("YYYY", Y).replace("YY", YY).replace("MM", M).replace("DD", D).replace("HH", hh).replace("mm", mm).replace("ss", ss);
    }
    if (def?.type === "richtext" && typeof raw === "string") {
      return raw.replace(/<\/?(b|i|u|s)>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    }
    return raw;
  }

  // core/fillSeries.js
  function computeFillValue(srcVals, offset, dir = 1) {
    if (srcVals.length === 0) return "";
    const nums = srcVals.map(Number);
    const allNum = srcVals.every((v) => v.trim() !== "" && !isNaN(Number(v)));
    const back = dir < 0;
    if (allNum) {
      if (srcVals.length === 1) return String(nums[0] + (back ? -offset : offset));
      const steps = nums.slice(1).map((n, i) => n - nums[i]);
      const step = steps[0];
      if (steps.every((s) => Math.abs(s - step) < 1e-9)) {
        const result = back ? nums[0] - step * offset : nums[nums.length - 1] + step * offset;
        return Number.isInteger(result) ? String(result) : String(parseFloat(result.toFixed(10)));
      }
    }
    const len = srcVals.length;
    const idx = back ? (len - offset % len) % len : (offset - 1) % len;
    return srcVals[idx];
  }

  // core/RemovedRows.js
  var RemovedRows = class {
    #sorted = [];
    // server indices, ascending, no duplicates
    get size() {
      return this.#sorted.length;
    }
    values() {
      return [...this.#sorted];
    }
    clear() {
      this.#sorted.length = 0;
    }
    // Index where `serverIndex` sits, or where it would be inserted. Shared by every method here so
    // there is one place that knows the array is sorted.
    #lowerBound(serverIndex) {
      let lo = 0, hi = this.#sorted.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (this.#sorted[mid] < serverIndex) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    has(serverIndex) {
      const i = this.#lowerBound(serverIndex);
      return i < this.#sorted.length && this.#sorted[i] === serverIndex;
    }
    // Returns false if it was already removed, so callers can skip the bookkeeping that goes with a
    // real removal (shifting edits, redrawing) instead of doing it twice.
    add(serverIndex) {
      const i = this.#lowerBound(serverIndex);
      if (i < this.#sorted.length && this.#sorted[i] === serverIndex) return false;
      this.#sorted.splice(i, 0, serverIndex);
      return true;
    }
    delete(serverIndex) {
      const i = this.#lowerBound(serverIndex);
      if (i >= this.#sorted.length || this.#sorted[i] !== serverIndex) return false;
      this.#sorted.splice(i, 1);
      return true;
    }
    // How many removals sit strictly before `serverIndex` — the amount that index has shifted up by.
    countBefore(serverIndex) {
      return this.#lowerBound(serverIndex);
    }
    // Visual position within the server block -> the server row actually shown there.
    //
    // Finding the `visual`-th surviving index. If k removals precede the answer then the answer is
    // `visual + k`, so the search is for the largest k whose k-th removal is still at or before it:
    // `sorted[k] - k` is how many survivors precede that removal, and it only ever increases, which
    // is what makes a binary search valid here.
    toServer(visual) {
      if (this.#sorted.length === 0) return visual;
      let lo = 0, hi = this.#sorted.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (this.#sorted[mid] - mid <= visual) lo = mid + 1;
        else hi = mid;
      }
      return visual + lo;
    }
    // The inverse. Returns -1 for a row that is no longer shown — callers translating a stored
    // server index back to a screen position need to know it has none rather than get a neighbour's.
    toVisual(serverIndex) {
      if (this.has(serverIndex)) return -1;
      return serverIndex - this.countBefore(serverIndex);
    }
    // Removals are stored against server indices, so a change to the *server* numbering (a reload
    // returning fewer rows) invalidates them wholesale, while a change to the *visual* numbering
    // does not touch them at all. Nothing here shifts on its own.
    dropFrom(serverTotal) {
      const keep = this.#lowerBound(serverTotal);
      if (keep < this.#sorted.length) this.#sorted.length = keep;
    }
    // A row inserted server-side at `anchor` (not a reload -- the numbering the array already has is
    // still meaningful, just one short from `anchor` on) pushes every real server row from there on
    // back by one. Only the tail needs touching: indices before `anchor` still name the same records,
    // and shifting only ever adds a constant to the tail, which stays sorted on its own.
    shiftFrom(anchor) {
      const i = this.#lowerBound(anchor);
      for (let k = i; k < this.#sorted.length; k++) this.#sorted[k]++;
    }
  };

  // core/RowPlan.js
  var RowPlan = class {
    removed = new RemovedRows();
    serverTotal = 0;
    // Anchors of the added rows, ascending, parallel to the host's row-data array. Ties keep
    // insertion order, so two rows added at the same spot stay in the order they were added.
    anchors = [];
    get localCount() {
      return this.anchors.length;
    }
    get serverVisible() {
      return this.serverTotal - this.removed.size;
    }
    get totalRows() {
      return this.serverVisible + this.anchors.length;
    }
    reset(serverTotal = 0) {
      this.serverTotal = serverTotal;
      this.removed.clear();
      this.anchors.length = 0;
    }
    // Surviving server rows strictly before server index `s` — how far up the screen it has moved.
    // Clamped because a detached anchor sits past the end on purpose (see detachAnchors) and still
    // has to resolve to "after everything" while it waits for the next reload to pin it down.
    #serverVisualBefore(s) {
      const c = Math.min(s, this.serverTotal);
      return c - this.removed.countBefore(c);
    }
    // Visual index of added row `i`. Strictly increasing in `i`, which is what lets the lookup
    // below binary-search it: anchors only go up, and each row contributes one more position.
    visualOfLocal(i) {
      return this.#serverVisualBefore(this.anchors[i]) + i;
    }
    // Added rows sitting at or before visual index `v`.
    #localsUpTo(v) {
      let lo = 0, hi = this.anchors.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (this.visualOfLocal(mid) <= v) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    // What is at visual row `v`: an added row, a server row, or nothing (out of range).
    sourceAt(v) {
      if (v < 0 || v >= this.totalRows) return null;
      const n = this.#localsUpTo(v);
      if (n > 0 && this.visualOfLocal(n - 1) === v) return { local: n - 1, server: -1 };
      return { local: -1, server: this.removed.toServer(v - n) };
    }
    // Visual index of server row `s`, or -1 if it has been removed. Added rows anchored to `s` sit
    // in front of it, so they count towards its position.
    visualOfServer(s) {
      if (this.removed.has(s)) return -1;
      return this.#serverVisualBefore(s) + this.#anchorsAtOrBefore(s);
    }
    #anchorsAtOrBefore(s) {
      let lo = 0, hi = this.anchors.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (this.anchors[mid] <= s) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    // Turns "put a row at visual index v" into an anchor plus the slot it takes in the local array.
    // Landing on an existing added row means going in front of it, which is the same anchor and its
    // slot; landing on a server row means anchoring to that row; past the end means after everything.
    planInsert(v) {
      const clamped = Math.max(0, Math.min(v, this.totalRows));
      if (clamped >= this.totalRows) {
        return { anchor: this.serverTotal, at: this.anchors.length };
      }
      const src = this.sourceAt(clamped);
      if (src.local >= 0) return { anchor: this.anchors[src.local], at: src.local };
      return { anchor: src.server, at: this.#anchorsAtOrBefore(src.server) };
    }
    insertLocal(v) {
      const { anchor, at } = this.planInsert(v);
      this.anchors.splice(at, 0, anchor);
      return at;
    }
    removeLocal(i) {
      this.anchors.splice(i, 1);
    }
    // A reload renumbers the server rows, so anchors recorded against the old numbering point at
    // different records. Everything that pointed past the new end is pinned to the end instead —
    // the row itself is the user's work and survives (see _reloadFiltered); only its position is
    // something the reload gets to overrule.
    clampAnchors(serverTotal) {
      this.serverTotal = serverTotal;
      for (let i = 0; i < this.anchors.length; i++) {
        if (this.anchors[i] > serverTotal) this.anchors[i] = serverTotal;
      }
    }
    // Every added row sent to the end, keeping their order. Used when a sort or filter makes the old
    // anchors meaningless but the rows themselves must stay.
    //
    // Parked past any possible end rather than at the current one: the reload may come back with
    // *more* rows than before, and an anchor pinned to the old total would then be a position in the
    // middle of the new result — a spot the user never chose. clampAnchors pins them for real once
    // the new total is known.
    detachAnchors() {
      for (let i = 0; i < this.anchors.length; i++) this.anchors[i] = Number.MAX_SAFE_INTEGER;
    }
  };

  // core/Overlays.js
  var SUGGEST_RENDER_CAP = 50;
  var DEFAULT_MIN_QUERY_CHARS = 2;
  function buildColumnGroupTree(fields, groupPathFor) {
    const roots = [];
    const groupFor = /* @__PURE__ */ new Map();
    for (const field of fields) {
      const path = groupPathFor(field) ?? [];
      let siblings = roots;
      let key = "";
      for (const label of path) {
        key += " " + label;
        let node = groupFor.get(key);
        if (!node) {
          node = { type: "group", label, children: [] };
          groupFor.set(key, node);
          siblings.push(node);
        }
        siblings = node.children;
      }
      siblings.push({ type: "field", field });
    }
    return roots;
  }
  function leafFieldsOf(node) {
    return node.type === "field" ? [node.field] : node.children.flatMap(leafFieldsOf);
  }
  function buildColumnChooserEl({
    x,
    y,
    width,
    height,
    fields,
    isHidden,
    labelFor,
    groupPathFor = () => [],
    i18n,
    theme,
    onApply,
    onCancel
  }) {
    if (fields.length === 0) return null;
    const tree = buildColumnGroupTree(fields, groupPathFor);
    const countRows = (nodes) => nodes.reduce((n, node) => n + 1 + (node.type === "group" ? countRows(node.children) : 0), 0);
    const rowCount = countRows(tree);
    const s = (...p) => p.join(";");
    const DIALOG_W = 220;
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", i18n.colChooserTitle);
    el.className = `${CLS.overlay} ${CLS.dialog}`;
    el.style.cssText = s(
      `position:absolute`,
      `left:${Math.max(0, Math.min(x, width - DIALOG_W - 4))}px`,
      `top:${Math.max(0, Math.min(y, height - 40 - rowCount * 32))}px`,
      `width:${DIALOG_W}px`,
      `background:${themed(theme, "overlayBg")}`,
      `border:1px solid ${themed(theme, "overlayBorder")}`,
      `border-radius:6px`,
      `box-shadow:${themed(theme, "overlayShadow")}`,
      `font-family:${themed(theme, "fontFamily")}`,
      `font-size:${theme.fontSize}px`,
      `color:${themed(theme, "overlayText")}`,
      `z-index:300`,
      `overflow:hidden`,
      `user-select:none`
    );
    const hdr = document.createElement("div");
    hdr.style.cssText = s(
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:9px 12px",
      `background:${themed(theme, "overlayHeaderBg")}`,
      `border-bottom:1px solid ${themed(theme, "overlayDivider")}`
    );
    const titleSpan = document.createElement("span");
    titleSpan.textContent = i18n.colChooserTitle;
    titleSpan.style.fontWeight = "600";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "\xD7";
    closeBtn.setAttribute("aria-label", i18n.colChooserCancel);
    closeBtn.style.cssText = s(
      "background:none",
      "border:none",
      `color:${themed(theme, "overlayMutedText")}`,
      "cursor:pointer",
      "font-size:17px",
      "line-height:1",
      "padding:0 2px"
    );
    closeBtn.addEventListener("click", () => onCancel());
    hdr.append(titleSpan, closeBtn);
    const list = document.createElement("div");
    list.style.cssText = "padding:0 0 6px;max-height:280px;overflow-y:auto;";
    const pending = new Map(fields.map((f) => [f, !isHidden(f)]));
    const allRow = document.createElement("label");
    allRow.style.cssText = s(
      "display:flex",
      "align-items:center",
      "gap:8px",
      "padding:6px 14px",
      "cursor:pointer",
      `border-bottom:1px solid ${themed(theme, "overlayDivider")}`,
      "margin-bottom:2px"
    );
    allRow.addEventListener("mouseover", () => {
      allRow.style.background = themed(theme, "overlayHoverBg");
    });
    allRow.addEventListener("mouseout", () => {
      allRow.style.background = "";
    });
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.style.cssText = "width:14px;height:14px;cursor:pointer;flex-shrink:0;";
    const allSpan = document.createElement("span");
    allSpan.textContent = i18n.colChooserSelectAll ?? "\uC804\uCCB4 \uC120\uD0DD";
    allSpan.style.cssText = "flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    allRow.append(allCb, allSpan);
    list.appendChild(allRow);
    const colCheckboxes = [];
    const groupCheckboxes = [];
    const syncAllCb = () => {
      const visibleCount = colCheckboxes.filter((c) => c.checked).length;
      allCb.checked = visibleCount === colCheckboxes.length;
      allCb.indeterminate = visibleCount > 0 && visibleCount < colCheckboxes.length;
    };
    const fieldCheckbox = /* @__PURE__ */ new Map();
    const syncGroupCheckboxes = () => {
      for (const { node, cb } of groupCheckboxes) {
        const leaves = leafFieldsOf(node);
        const checkedCount = leaves.filter((f) => fieldCheckbox.get(f).checked).length;
        cb.checked = checkedCount === leaves.length;
        cb.indeterminate = checkedCount > 0 && checkedCount < leaves.length;
      }
      syncAllCb();
    };
    allCb.addEventListener("change", () => {
      allCb.indeterminate = false;
      colCheckboxes.forEach((c) => {
        c.checked = allCb.checked;
        pending.set(c.dataset.field, allCb.checked);
      });
      syncGroupCheckboxes();
    });
    const INDENT_PX = 18;
    const GROUP_ROW_H = 32;
    function renderFieldRow(field, depth, container) {
      const label = labelFor(field);
      const row = document.createElement("label");
      row.style.cssText = s(
        "display:flex",
        "align-items:center",
        "gap:6px",
        "padding:6px 14px",
        "cursor:pointer",
        "border-radius:3px"
      );
      row.addEventListener("mouseover", () => {
        row.style.background = themed(theme, "overlayHoverBg");
      });
      row.addEventListener("mouseout", () => {
        row.style.background = "";
      });
      const spacer = document.createElement("span");
      spacer.style.cssText = "width:18px;height:18px;flex-shrink:0;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = pending.get(field);
      cb.dataset.field = field;
      cb.style.cssText = "width:14px;height:14px;cursor:pointer;flex-shrink:0;";
      cb.addEventListener("change", () => {
        pending.set(field, cb.checked);
        syncGroupCheckboxes();
      });
      const span = document.createElement("span");
      span.textContent = label;
      span.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      row.append(spacer, cb, span);
      container.appendChild(row);
      colCheckboxes.push(cb);
      fieldCheckbox.set(field, cb);
    }
    function renderGroupRow(node, depth, container) {
      const leaves = leafFieldsOf(node);
      const row = document.createElement("div");
      row.className = CLS.treeGroup;
      row.style.cssText = s(
        "display:flex",
        "align-items:center",
        "gap:6px",
        "padding:7px 14px 7px 10px",
        "cursor:pointer",
        `background:${themed(theme, "overlayHeaderBg")}`,
        `border-bottom:1px solid ${themed(theme, "overlayDivider")}`,
        `border-left:3px solid ${themed(theme, "selectionColor")}`,
        "position:sticky",
        `top:${depth * GROUP_ROW_H}px`,
        `z-index:${10 - depth}`
      );
      row.addEventListener("mouseover", () => {
        row.style.background = themed(theme, "overlayHoverBg");
      });
      row.addEventListener("mouseout", () => {
        row.style.background = themed(theme, "overlayHeaderBg");
      });
      const childrenEl = document.createElement("div");
      childrenEl.style.cssText = s(
        `margin-left:${INDENT_PX}px`,
        "padding-left:6px",
        `border-left:1px solid ${themed(theme, "overlayDivider")}`
      );
      let expanded = true;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = CLS.treeToggle;
      toggle.textContent = "\u25BE";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", node.label);
      toggle.style.cssText = s(
        "width:18px",
        "height:18px",
        "flex-shrink:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:none",
        "border:none",
        "padding:0",
        "cursor:pointer",
        "font-size:13px",
        "line-height:1",
        `color:${themed(theme, "overlayText")}`
      );
      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        expanded = !expanded;
        toggle.style.transform = expanded ? "" : "rotate(-90deg)";
        toggle.setAttribute("aria-expanded", String(expanded));
        childrenEl.style.display = expanded ? "" : "none";
      });
      const labelEl = document.createElement("label");
      labelEl.style.cssText = "display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;min-width:0;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.style.cssText = "width:14px;height:14px;cursor:pointer;flex-shrink:0;";
      cb.addEventListener("change", () => {
        cb.indeterminate = false;
        leaves.forEach((f) => {
          fieldCheckbox.get(f).checked = cb.checked;
          pending.set(f, cb.checked);
        });
        syncGroupCheckboxes();
      });
      const span = document.createElement("span");
      span.textContent = node.label;
      span.style.cssText = "flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      labelEl.append(cb, span);
      row.append(toggle, labelEl);
      container.appendChild(row);
      container.appendChild(childrenEl);
      groupCheckboxes.push({ node, cb });
      renderNodes(node.children, depth + 1, childrenEl);
    }
    function renderNodes(nodes, depth, container) {
      for (const node of nodes) {
        if (node.type === "group") renderGroupRow(node, depth, container);
        else renderFieldRow(node.field, depth, container);
      }
    }
    renderNodes(tree, 0, list);
    syncGroupCheckboxes();
    const foot = document.createElement("div");
    foot.style.cssText = s(
      "display:flex",
      "gap:6px",
      "padding:10px 12px",
      `border-top:1px solid ${themed(theme, "overlayDivider")}`
    );
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = i18n.colChooserApply;
    applyBtn.style.cssText = s(
      "flex:1",
      "padding:7px 0",
      `background:${themed(theme, "selectionColor")}`,
      `color:${themed(theme, "overlayAccentText")}`,
      "border:none",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:13px",
      "font-weight:600"
    );
    applyBtn.addEventListener("click", () => onApply(pending));
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = i18n.colChooserCancel;
    cancelBtn.style.cssText = s(
      "flex:1",
      "padding:7px 0",
      `background:${themed(theme, "overlayHeaderBg")}`,
      `color:${themed(theme, "overlayText")}`,
      `border:1px solid ${themed(theme, "overlayBorder")}`,
      "border-radius:4px",
      "cursor:pointer",
      "font-size:13px"
    );
    cancelBtn.addEventListener("click", () => onCancel());
    foot.append(applyBtn, cancelBtn);
    el.append(hdr, list, foot);
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") onCancel();
      e.stopPropagation();
    });
    return el;
  }
  function buildFilterPanelEl({
    colLeft,
    headerH,
    width,
    maxPanelHeight,
    label,
    curVal,
    sortPriority,
    asc,
    desc,
    filterId,
    swatchColors,
    activeColor,
    multiSortEnabled,
    i18n,
    theme,
    // wrapperHeight + openUpward: when the caller found more room above the header than below (a
    // grid scrolled to sit low on the page — see _openFilterPanel), the panel anchors its *bottom*
    // to the header's top edge and grows upward instead of down, same as a native <select> flipping
    // when it would otherwise overflow the viewport.
    wrapperHeight,
    openUpward,
    // Set filter (checkbox list of exact values) — distinctValues is null when the column has too
    // many/no loaded values yet, in which case the panel falls back to the plain text search box
    // below instead of rendering a checklist. selectedValues is the currently-applied array filter
    // (null when no Set filter is active, i.e. every value counts as checked).
    distinctValues,
    selectedValues,
    // Tag mode (see the tag section below). `suggest(query) => Promise<string[]>` is the host's
    // value lookup; without it the plain search box stays. `tagValues`/`containsValue` are whichever
    // of the two filter shapes this column currently carries.
    suggest,
    suggestScope,
    tagValues,
    containsValue,
    minQueryChars,
    onClose,
    onSort,
    onApply,
    onApplyValues,
    onColorFilter,
    onResetCol,
    onResetAll
  }) {
    const PANEL_W = 220;
    const panelX = Math.max(0, Math.min(colLeft, width - PANEL_W));
    const s = (...parts) => parts.join(";");
    const btn = (text, action, style) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.dataset.action = action;
      b.className = CLS.btn;
      b.style.cssText = style;
      return b;
    };
    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", i18n.filterDialog(label));
    el.className = `${CLS.overlay} ${CLS.panel}`;
    el.style.cssText = s(
      `position:absolute`,
      `left:${panelX}px`,
      // Anchoring the bottom edge (instead of top) lets the panel grow upward from the header
      // without knowing its own height up front — the alternative, computing `top: headerH -
      // panelHeight`, needs the rendered height before it's laid out.
      openUpward ? `bottom:${Math.max(0, wrapperHeight - headerH)}px` : `top:${headerH}px`,
      `width:${PANEL_W}px`,
      `background:${themed(theme, "overlayBg")}`,
      `border:1px solid ${themed(theme, "overlayBorder")}`,
      `border-radius:6px`,
      `box-shadow:${themed(theme, "overlayShadow")}`,
      `font-family:${themed(theme, "fontFamily")}`,
      `font-size:${theme.fontSize}px`,
      `color:${themed(theme, "overlayText")}`,
      `z-index:100`,
      `overflow:hidden`,
      `user-select:none`,
      // A column with many values can produce a long suggestion list, and the panel was growing
      // past the bottom of the grid and taking Apply with it. Capping it to the space below the
      // header and laying it out as a column means the list is the only part that gives way — the
      // buttons stay put no matter how much the middle has to show.
      `display:flex`,
      `flex-direction:column`,
      ...maxPanelHeight ? [`max-height:${Math.max(120, maxPanelHeight)}px`] : []
    );
    const headerRow = document.createElement("div");
    headerRow.style.cssText = s("display:flex", "align-items:center", "justify-content:space-between", "padding:9px 12px", `background:${themed(theme, "overlayHeaderBg")}`, `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
    const titleSpan = document.createElement("span");
    titleSpan.textContent = label;
    titleSpan.style.fontWeight = "600";
    const closeBtn = btn("\xD7", "close", s("background:none", "border:none", `color:${themed(theme, "overlayMutedText")}`, "cursor:pointer", "font-size:17px", "line-height:1", "padding:0 2px"));
    closeBtn.setAttribute("aria-label", i18n.filterClose);
    headerRow.append(titleSpan, closeBtn);
    const sortSection = document.createElement("div");
    sortSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
    const sortRow = document.createElement("div");
    sortRow.style.cssText = s("display:flex", "gap:6px");
    const sortBtnBase = s("flex:1", "padding:6px 0", "border-radius:4px", "cursor:pointer", "font-size:12px");
    const ascBtn = btn(i18n.sortAsc, "asc", s(sortBtnBase, `background:${asc ? themed(theme, "selectionColor") : themed(theme, "overlayHeaderBg")}`, `color:${asc ? themed(theme, "overlayAccentText") : themed(theme, "overlayText")}`, `border:1px solid ${asc ? themed(theme, "selectionColor") : themed(theme, "overlayBorder")}`));
    ascBtn.setAttribute("aria-pressed", String(asc));
    const descBtn = btn(i18n.sortDesc, "desc", s(sortBtnBase, `background:${desc ? themed(theme, "selectionColor") : themed(theme, "overlayHeaderBg")}`, `color:${desc ? themed(theme, "overlayAccentText") : themed(theme, "overlayText")}`, `border:1px solid ${desc ? themed(theme, "selectionColor") : themed(theme, "overlayBorder")}`));
    descBtn.setAttribute("aria-pressed", String(desc));
    sortRow.append(ascBtn, descBtn);
    if (sortPriority > 0) {
      const badge = document.createElement("span");
      badge.textContent = `#${sortPriority}`;
      badge.title = "Sort priority";
      badge.style.cssText = s(
        "align-self:center",
        "font-size:11px",
        "font-weight:700",
        `color:${themed(theme, "selectionColor")}`,
        "min-width:20px",
        "text-align:center"
      );
      sortRow.appendChild(badge);
    }
    sortSection.appendChild(sortRow);
    if (multiSortEnabled) {
      const sortHint = document.createElement("div");
      sortHint.textContent = i18n.sortShiftHint ?? "Shift+click: add to multi-sort";
      sortHint.style.cssText = s("font-size:10px", `color:${themed(theme, "overlayHintText")}`, "margin-top:5px");
      sortSection.appendChild(sortHint);
    }
    let colorSection = null;
    if (swatchColors?.length) {
      colorSection = document.createElement("div");
      colorSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
      const colorLabel = document.createElement("div");
      colorLabel.textContent = i18n.filterColorLabel ?? "Filter by color";
      colorLabel.style.cssText = s("font-size:11px", `color:${themed(theme, "overlayMutedText")}`, "margin-bottom:6px");
      const swatchRow = document.createElement("div");
      swatchRow.style.cssText = s("display:flex", "flex-wrap:wrap", "gap:6px");
      swatchColors.forEach((color) => {
        const active = activeColor === color;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.dataset.action = "color-filter";
        chip.dataset.value = color;
        chip.title = color;
        chip.setAttribute("aria-pressed", String(active));
        chip.className = CLS.swatch;
        chip.style.cssText = s(
          "width:22px",
          "height:22px",
          "border-radius:50%",
          "cursor:pointer",
          "padding:0",
          "border:none",
          `background:${color}`,
          `box-shadow:${active ? `0 0 0 2px ${themed(theme, "overlayBg")}, 0 0 0 4px ${themed(theme, "selectionColor")}` : "0 0 0 1px rgba(0,0,0,0.15)"}`
        );
        swatchRow.appendChild(chip);
      });
      colorSection.append(colorLabel, swatchRow);
    }
    const searchSection = document.createElement("div");
    searchSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
    const searchLabel = document.createElement("label");
    searchLabel.textContent = i18n.filterLabel;
    searchLabel.htmlFor = filterId;
    searchLabel.style.cssText = s("font-size:11px", `color:${themed(theme, "overlayMutedText")}`, "display:block", "margin-bottom:6px");
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = filterId;
    searchInput.value = curVal;
    searchInput.placeholder = i18n.filterPlaceholder;
    searchInput.className = CLS.editor;
    searchInput.style.cssText = s("width:100%", "padding:6px 8px", `background:${themed(theme, "overlayBg")}`, `border:1px solid ${themed(theme, "overlayBorder")}`, "border-radius:4px", `color:${themed(theme, "overlayText")}`, `font-size:${theme.fontSize}px`, "box-sizing:border-box");
    searchSection.append(searchLabel, searchInput);
    let tagSection = null;
    let readTags = null;
    if (!Array.isArray(distinctValues) && typeof suggest === "function") {
      let renderSuggestions = function() {
        suggestBox.replaceChildren();
        if (belowMinChars) {
          suggestBox.appendChild(makeNote(i18n.filterTagMinChars(minChars), false));
          containsRow.replaceChildren(
            mkOption(
              i18n.filterTagContains(lastQuery),
              i18n.filterTagContains(lastQuery),
              () => setContains(lastQuery),
              true
            )
          );
          suggestWrap.style.display = "flex";
          tagInput.setAttribute("aria-expanded", "true");
          active = -1;
          return;
        }
        const taken = new Set(state.tags);
        const left = lastValues.filter((v) => !taken.has(v));
        if (suggestScope === "local" && left.length > 0) {
          const scope = makeNote(i18n.filterTagLocalScope, true);
          scope.style.borderBottom = `1px solid ${themed(theme, "overlayDivider")}`;
          suggestBox.appendChild(scope);
        }
        const shown = left.slice(0, SUGGEST_RENDER_CAP);
        for (const v of shown) {
          const text = v === "" ? i18n.emptyCell : v;
          suggestBox.appendChild(mkOption(text, text, () => addTag(v), false));
        }
        if (left.length > shown.length) {
          const more = makeNote(i18n.filterTagMore(left.length - shown.length), true);
          more.style.borderTop = `1px solid ${themed(theme, "overlayDivider")}`;
          suggestBox.appendChild(more);
        }
        if (left.length === 0) {
          suggestBox.appendChild(
            makeNote(lastValues.length ? i18n.filterTagAllSelected : i18n.filterTagNoMatch, false)
          );
        }
        containsRow.replaceChildren(
          mkOption(
            i18n.filterTagContains(lastQuery),
            i18n.filterTagContains(lastQuery),
            () => setContains(lastQuery),
            true
          )
        );
        suggestWrap.style.display = "flex";
        tagInput.setAttribute("aria-expanded", "true");
        active = -1;
      };
      const state = {
        tags: Array.isArray(tagValues) ? [...tagValues] : [],
        contains: typeof containsValue === "string" && containsValue ? containsValue : null
      };
      tagSection = document.createElement("div");
      tagSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
      const tagLabel = document.createElement("div");
      tagLabel.textContent = i18n.filterLabel;
      tagLabel.style.cssText = s("font-size:11px", `color:${themed(theme, "overlayMutedText")}`, "margin-bottom:6px");
      const chipArea = document.createElement("div");
      chipArea.style.cssText = s(
        "display:none",
        "flex-direction:column",
        "flex:0 1 auto",
        "min-height:0",
        "margin-top:8px"
      );
      const chipLabel = document.createElement("div");
      chipLabel.style.cssText = s("font-size:11px", `color:${themed(theme, "overlayMutedText")}`, "margin-bottom:4px");
      const chipBox = document.createElement("div");
      chipBox.style.cssText = s(
        "display:flex",
        "flex-wrap:wrap",
        "gap:4px",
        "flex:1 1 auto",
        "min-height:30px",
        "max-height:64px",
        "overflow-y:auto",
        "padding:6px",
        "border-radius:4px",
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        `background:${themed(theme, "overlayHeaderBg")}`
      );
      chipArea.append(chipLabel, chipBox);
      const tagInput = document.createElement("input");
      tagInput.type = "text";
      tagInput.id = filterId;
      tagInput.placeholder = i18n.filterTagPlaceholder;
      tagInput.className = CLS.editor;
      tagInput.setAttribute("role", "combobox");
      tagInput.setAttribute("aria-expanded", "false");
      tagInput.setAttribute("aria-autocomplete", "list");
      tagInput.style.cssText = s("width:100%", "padding:6px 8px", `background:${themed(theme, "overlayBg")}`, `border:1px solid ${themed(theme, "overlayBorder")}`, "border-radius:4px", `color:${themed(theme, "overlayText")}`, `font-size:${theme.fontSize}px`, "box-sizing:border-box");
      const suggestWrap = document.createElement("div");
      suggestWrap.style.cssText = s(
        "display:none",
        "flex-direction:column",
        "flex:0 0 auto",
        "margin-top:4px",
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        "border-radius:4px",
        "overflow:hidden"
      );
      const suggestBox = document.createElement("div");
      suggestBox.setAttribute("role", "listbox");
      suggestBox.style.cssText = s("flex:0 0 auto", "max-height:132px", "overflow-y:auto");
      const containsRow = document.createElement("div");
      containsRow.style.cssText = s(
        "flex:0 0 auto",
        `border-top:1px solid ${themed(theme, "overlayDivider")}`,
        `background:${themed(theme, "overlayHeaderBg")}`
      );
      suggestWrap.append(suggestBox, containsRow);
      const renderChips = () => {
        chipBox.replaceChildren();
        const mkChip = (text, title, onRemove, isContains) => {
          const chip = document.createElement("span");
          chip.className = CLS.chip + (isContains ? ` ${CLS.chipContains}` : "");
          chip.style.cssText = s(
            "display:inline-flex",
            "align-items:center",
            "gap:4px",
            "max-width:100%",
            "padding:2px 4px 2px 7px",
            "border-radius:10px",
            "font-size:11px",
            "box-sizing:border-box",
            isContains ? `background:${themed(theme, "overlayHeaderBg")};border:1px dashed ${themed(theme, "overlayBorder")};color:${themed(theme, "overlayMutedText")}` : `background:${themed(theme, "sortIconBg")};border:1px solid ${themed(theme, "overlayBorder")};color:${themed(theme, "overlayText")}`
          );
          const txt = document.createElement("span");
          txt.textContent = text;
          chip.title = title;
          txt.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          const x = document.createElement("button");
          x.type = "button";
          x.className = CLS.btn;
          x.textContent = "\xD7";
          x.setAttribute("aria-label", i18n.filterTagRemove(title));
          x.style.cssText = s(
            "border:none",
            "background:none",
            "cursor:pointer",
            "padding:0 2px",
            "line-height:1",
            "font-size:13px",
            `color:${themed(theme, "overlayMutedText")}`
          );
          x.addEventListener("click", () => {
            onRemove();
            renderChips();
            tagInput.focus();
          });
          chip.append(txt, x);
          chipBox.appendChild(chip);
        };
        if (state.contains !== null) {
          mkChip(
            i18n.filterTagContains(state.contains),
            i18n.filterTagContains(state.contains),
            () => {
              state.contains = null;
            },
            true
          );
        } else {
          state.tags.forEach((v, i) => {
            const shown = v === "" ? i18n.emptyCell : v;
            mkChip(shown, shown, () => {
              state.tags.splice(i, 1);
            });
          });
        }
        const count = chipBox.childElementCount;
        chipArea.style.display = count ? "flex" : "none";
        chipLabel.textContent = i18n.filterTagSelected(count);
      };
      const closeSuggest = () => {
        suggestWrap.style.display = "none";
        suggestBox.replaceChildren();
        containsRow.replaceChildren();
        tagInput.setAttribute("aria-expanded", "false");
      };
      const addTag = (value) => {
        state.contains = null;
        if (!state.tags.includes(value)) state.tags.push(value);
        tagInput.value = "";
        closeSuggest();
        renderChips();
        tagInput.focus();
      };
      const setContains = (text) => {
        state.tags = [];
        state.contains = text;
        tagInput.value = "";
        closeSuggest();
        renderChips();
        tagInput.focus();
      };
      const mkOption = (text, title, onPick, muted) => {
        const opt = document.createElement("div");
        opt.setAttribute("role", "option");
        opt.className = CLS.menuItem;
        opt.title = title;
        opt.textContent = text;
        opt.style.cssText = s(
          "padding:5px 8px",
          "font-size:12px",
          "cursor:pointer",
          "overflow:hidden",
          "text-overflow:ellipsis",
          "white-space:nowrap",
          muted ? `color:${themed(theme, "overlayMutedText")}` : `color:${themed(theme, "overlayText")}`
        );
        opt.addEventListener("mouseenter", () => {
          opt.style.background = themed(theme, "overlayItemHoverBg");
        });
        opt.addEventListener("mouseleave", () => {
          opt.style.background = "none";
        });
        opt.addEventListener("click", onPick);
        return opt;
      };
      let lastQuery = "";
      let lastValues = [];
      let active = -1;
      let belowMinChars = false;
      const askedChars = Math.floor(Number(minQueryChars));
      const minChars = Number.isFinite(askedChars) && askedChars > 0 ? askedChars : DEFAULT_MIN_QUERY_CHARS;
      const makeNote = (text, italic) => {
        const el2 = document.createElement("div");
        el2.textContent = text;
        el2.style.cssText = s(
          "padding:5px 8px",
          `font-size:${italic ? 11 : 12}px`,
          italic ? "font-style:italic" : "",
          `color:${themed(theme, "overlayMutedText")}`
        );
        return el2;
      };
      let seq = 0;
      let debounce = 0;
      const runSuggest = async (query) => {
        const mine = ++seq;
        let values = [];
        try {
          values = await suggest(query) ?? [];
        } catch {
          values = [];
        }
        if (mine !== seq || tagInput.value.trim() !== query) return;
        lastQuery = query;
        lastValues = values;
        belowMinChars = false;
        renderSuggestions();
      };
      tagInput.addEventListener("input", () => {
        clearTimeout(debounce);
        const query = tagInput.value.trim();
        if (!query) {
          seq++;
          closeSuggest();
          return;
        }
        if (query.length < minChars) {
          seq++;
          lastQuery = query;
          lastValues = [];
          belowMinChars = true;
          renderSuggestions();
          return;
        }
        debounce = setTimeout(() => runSuggest(query), 180);
      });
      const options = () => [...suggestWrap.querySelectorAll('[role="option"]')];
      const highlight = (i) => {
        const opts = options();
        opts.forEach((o, n) => {
          o.style.background = n === i ? themed(theme, "overlayItemHoverBg") : "none";
        });
        active = i;
        opts[i]?.scrollIntoView({ block: "nearest" });
      };
      tagInput.addEventListener("keydown", (e) => {
        const open = suggestWrap.style.display !== "none";
        if (e.key === "ArrowDown" && open) {
          e.preventDefault();
          highlight(Math.min(active + 1, options().length - 1));
        } else if (e.key === "ArrowUp" && open) {
          e.preventDefault();
          highlight(Math.max(active - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (open) options()[active >= 0 ? active : 0]?.click();
          else applyBtn.click();
        } else if (e.key === "Escape") {
          if (open) {
            closeSuggest();
            active = -1;
          } else onClose();
        }
        e.stopPropagation();
      });
      tagInput.addEventListener("input", () => {
        active = -1;
      });
      tagSection.append(tagLabel, tagInput, suggestWrap, chipArea);
      renderChips();
      el.addEventListener("jhg-dispose", () => {
        clearTimeout(debounce);
        seq++;
      });
      readTags = () => state.contains !== null ? { contains: state.contains } : { values: [...state.tags] };
    }
    let valuesSection = null;
    const valueCheckboxes = [];
    if (Array.isArray(distinctValues) && distinctValues.length > 0) {
      valuesSection = document.createElement("div");
      valuesSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
      const valuesLabel = document.createElement("div");
      valuesLabel.textContent = i18n.filterValuesLabel;
      valuesLabel.style.cssText = s("font-size:11px", `color:${themed(theme, "overlayMutedText")}`, "margin-bottom:6px");
      const selectedSet = Array.isArray(selectedValues) ? new Set(selectedValues) : null;
      const mkRow = (value, text, checked) => {
        const row = document.createElement("label");
        row.style.cssText = s("display:flex", "align-items:center", "gap:6px", "font-size:12px", "cursor:pointer", "padding:2px 0");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = checked;
        cb.dataset.value = value;
        const txt = document.createElement("span");
        txt.textContent = text;
        txt.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        row.append(cb, txt);
        return { row, cb };
      };
      const valuesSearch = document.createElement("input");
      valuesSearch.type = "text";
      valuesSearch.placeholder = i18n.filterTagPlaceholder;
      valuesSearch.setAttribute("aria-label", i18n.filterTagPlaceholder);
      valuesSearch.className = CLS.editor;
      valuesSearch.style.cssText = s("width:100%", "padding:6px 8px", `background:${themed(theme, "overlayBg")}`, `border:1px solid ${themed(theme, "overlayBorder")}`, "border-radius:4px", `color:${themed(theme, "overlayText")}`, `font-size:${theme.fontSize}px`, "box-sizing:border-box", "margin-bottom:6px");
      const listBox = document.createElement("div");
      listBox.style.cssText = s("max-height:140px", "overflow-y:auto", "display:flex", "flex-direction:column");
      const valueRows = [];
      distinctValues.forEach((value) => {
        const checked = selectedSet === null ? true : selectedSet.has(value);
        const text = value === "" ? i18n.emptyCell : value;
        const { row, cb } = mkRow(value, text, checked);
        valueCheckboxes.push(cb);
        valueRows.push({ row, cb, text });
        listBox.appendChild(row);
      });
      const noMatch = document.createElement("div");
      noMatch.textContent = i18n.filterTagNoMatch;
      noMatch.style.cssText = s("padding:5px 8px", "font-size:12px", `color:${themed(theme, "overlayMutedText")}`, "display:none");
      listBox.appendChild(noMatch);
      const { row: allRow, cb: allCb } = mkRow("", i18n.filterSelectAll, valueCheckboxes.every((cb) => cb.checked));
      delete allCb.dataset.value;
      allCb.dataset.selectAll = "true";
      allRow.style.cssText += `;font-weight:600;border-bottom:1px solid ${themed(theme, "overlayDivider")};padding-bottom:6px;margin-bottom:4px;`;
      const visibleCbs = () => valueRows.filter((r) => r.row.style.display !== "none").map((r) => r.cb);
      const syncSelectAll = () => {
        const vis = visibleCbs();
        allCb.checked = vis.length > 0 && vis.every((cb) => cb.checked);
      };
      allCb.addEventListener("change", () => {
        visibleCbs().forEach((cb) => {
          cb.checked = allCb.checked;
        });
      });
      valueCheckboxes.forEach((cb) => cb.addEventListener("change", syncSelectAll));
      valuesSearch.addEventListener("input", () => {
        const q = valuesSearch.value.trim().toLowerCase();
        let anyVisible = false;
        for (const r of valueRows) {
          const match = !q || r.text.toLowerCase().includes(q);
          r.row.style.display = match ? "flex" : "none";
          anyVisible = anyVisible || match;
        }
        noMatch.style.display = anyVisible ? "none" : "block";
        syncSelectAll();
      });
      valuesSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyBtn.click();
        } else if (e.key === "Escape") {
          onClose();
        }
        e.stopPropagation();
      });
      valuesSection.append(valuesLabel, valuesSearch, allRow, listBox);
    }
    const actionSection = document.createElement("div");
    actionSection.style.cssText = s("padding:10px 12px", `border-bottom:1px solid ${themed(theme, "overlayDivider")}`);
    const actionRow = document.createElement("div");
    actionRow.style.cssText = s("display:flex", "gap:6px");
    const applyBtn = btn(i18n.filterApply, "apply", s("flex:1", "padding:7px 0", `background:${themed(theme, "selectionColor")}`, `color:${themed(theme, "overlayAccentText")}`, "border:none", "border-radius:4px", "cursor:pointer", "font-size:13px", "font-weight:600"));
    const resetColBtn = btn(i18n.filterReset, "reset-col", s("flex:1", "padding:7px 0", `background:${themed(theme, "overlayHeaderBg")}`, `color:${themed(theme, "overlayText")}`, `border:1px solid ${themed(theme, "overlayBorder")}`, "border-radius:4px", "cursor:pointer", "font-size:13px"));
    actionRow.append(applyBtn, resetColBtn);
    actionSection.appendChild(actionRow);
    const resetAllSection = document.createElement("div");
    resetAllSection.style.cssText = s("padding:8px 12px", "text-align:center");
    const resetAllBtn = btn(i18n.filterResetAll, "reset-all", s("background:none", "border:none", `color:${themed(theme, "overlayMutedText")}`, "cursor:pointer", "font-size:12px", "text-decoration:underline"));
    resetAllSection.appendChild(resetAllBtn);
    const bodySection = valuesSection ?? tagSection ?? searchSection;
    el.append(
      headerRow,
      sortSection,
      ...colorSection ? [colorSection] : [],
      bodySection,
      actionSection,
      resetAllSection
    );
    for (const child of el.children) child.style.flex = "0 0 auto";
    bodySection.style.flex = "1 1 auto";
    bodySection.style.minHeight = "0";
    if (bodySection === tagSection) {
      bodySection.style.display = "flex";
      bodySection.style.flexDirection = "column";
      bodySection.style.overflowY = "auto";
    }
    if (bodySection === valuesSection) bodySection.style.overflowY = "auto";
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusable = [...el.querySelectorAll("button:not([disabled]), input")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }, true);
    el.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset?.action;
      if (!action) return;
      if (action === "close") {
        onClose();
      } else if (action === "asc" || action === "desc") {
        onSort(action, e.shiftKey);
      } else if (action === "apply") {
        if (valuesSection) {
          onApplyValues(valueCheckboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.value));
        } else if (readTags) {
          const out = readTags();
          if (out.contains !== void 0) onApply(out.contains);
          else if (out.values.length) onApplyValues(out.values);
          else onApply("");
        } else {
          onApply(searchInput.value.trim());
        }
      } else if (action === "color-filter") {
        const value = e.target.closest('[data-action="color-filter"]')?.dataset?.value;
        if (value == null) return;
        onColorFilter(value);
      } else if (action === "reset-col") {
        onResetCol();
      } else if (action === "reset-all") {
        onResetAll();
      }
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyBtn.click();
      } else if (e.key === "Escape") {
        onClose();
      }
      e.stopPropagation();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") onClose();
    });
    return el;
  }
  function buildColumnContextMenuEl({
    x,
    y,
    width,
    isFrozen,
    isFrozenRight,
    isDeleted,
    i18n,
    theme,
    allowedItems = {},
    onFreeze,
    onFreezeRight,
    onVisibility,
    onInsertLeft,
    onInsertRight,
    onDelete,
    onUndelete,
    onEscape
  }) {
    const {
      freeze: showFreeze = true,
      freezeRight: showFreezeRight = true,
      visibility: showVisibility = true,
      insertLeft: showInsertLeft = true,
      insertRight: showInsertRight = true,
      delete: showDelete = true
    } = allowedItems;
    if (!showFreeze && !showFreezeRight && !showVisibility && !showInsertLeft && !showInsertRight && !showDelete) return null;
    const MENU_W = 170;
    const s = (...parts) => parts.join(";");
    const itemStyle = s(`padding:8px 14px`, `cursor:pointer`);
    const el = document.createElement("div");
    el.setAttribute("role", "menu");
    el.className = `${CLS.overlay} ${CLS.menu}`;
    el.style.cssText = s(
      `position:absolute`,
      `left:${Math.min(x, width - MENU_W - 2)}px`,
      `top:${y}px`,
      `width:${MENU_W}px`,
      `background:${themed(theme, "overlayBg")}`,
      `border:1px solid ${themed(theme, "overlayBorder")}`,
      `border-radius:6px`,
      `box-shadow:${themed(theme, "overlayMenuShadow")}`,
      `font-family:${themed(theme, "fontFamily")}`,
      `font-size:${theme.fontSize}px`,
      `color:${themed(theme, "overlayText")}`,
      `z-index:200`,
      `overflow:hidden`,
      `user-select:none`,
      `padding:4px 0`
    );
    const mkItem = (text, action) => {
      const it = document.createElement("div");
      it.setAttribute("role", "menuitem");
      it.setAttribute("tabindex", "0");
      it.textContent = text;
      it.dataset.action = action;
      it.className = CLS.menuItem;
      it.style.cssText = itemStyle;
      it.addEventListener("mouseover", () => {
        it.style.background = themed(theme, "overlayItemHoverBg");
      });
      it.addEventListener("mouseout", () => {
        it.style.background = "";
      });
      it.addEventListener("focus", () => {
        it.style.background = themed(theme, "overlayItemHoverBg");
      });
      it.addEventListener("blur", () => {
        it.style.background = "";
      });
      return it;
    };
    const sep = () => {
      const d = document.createElement("div");
      d.style.cssText = `height:1px;background:${themed(theme, "overlayDivider")};margin:4px 0;`;
      return d;
    };
    const freezeGroup = [];
    if (showFreeze) freezeGroup.push(mkItem(isFrozen ? i18n.colUnfreeze : i18n.colFreeze, isFrozen ? "unfreeze" : "freeze"));
    if (showFreezeRight) freezeGroup.push(mkItem(isFrozenRight ? i18n.colUnfreezeRight : i18n.colFreezeRight, isFrozenRight ? "unfreeze-right" : "freeze-right"));
    const visGroup = showVisibility ? [mkItem(i18n.colVisibility, "col-visibility")] : [];
    const insertGroup = [];
    if (showInsertLeft) insertGroup.push(mkItem(i18n.colInsertLeft, "col-insert-left"));
    if (showInsertRight) insertGroup.push(mkItem(i18n.colInsertRight, "col-insert-right"));
    const deleteGroup = showDelete ? [mkItem(isDeleted ? i18n.colUndelete : i18n.colDelete, isDeleted ? "col-undelete" : "col-delete")] : [];
    const groups = [freezeGroup, visGroup, insertGroup, deleteGroup].filter((g) => g.length > 0);
    const menuItems = groups.flatMap((g, i) => i === 0 ? g : [sep(), ...g]);
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset?.action;
      if (!action) return;
      if (action === "freeze" || action === "unfreeze") {
        onFreeze();
      } else if (action === "freeze-right" || action === "unfreeze-right") {
        onFreezeRight();
      } else if (action === "col-visibility") {
        onVisibility();
        return;
      } else if (action === "col-insert-left") {
        onInsertLeft();
        return;
      } else if (action === "col-insert-right") {
        onInsertRight();
        return;
      } else if (action === "col-delete") {
        onDelete();
      } else if (action === "col-undelete") {
        onUndelete();
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        onEscape();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        document.activeElement?.click?.();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...el.querySelectorAll('[role="menuitem"]')];
        const idx = items.indexOf(document.activeElement);
        const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
      e.stopPropagation();
    });
    el.append(...menuItems);
    return el;
  }

  // core/Export.js
  function collectSortedRows(forEachLoaded, localRows, visualOfServer, visualOfLocal) {
    const rowMap = /* @__PURE__ */ new Map();
    forEachLoaded((rowData, serverIndex) => {
      const v = visualOfServer(serverIndex);
      if (v >= 0) rowMap.set(v, rowData);
    });
    localRows.forEach((rowData, i) => rowMap.set(visualOfLocal(i), rowData));
    return [...rowMap.entries()].sort(([a], [b]) => a - b);
  }
  function buildPrintHtml({ cols, labels, rows, title, includeHeaders, i18n, lang }) {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const headerHtml = includeHeaders ? `<thead><tr>${labels.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead>` : "";
    const bodyHtml = rows.map((row) => `<tr>${cols.map((f) => `<td>${esc(row[f])}</td>`).join("")}</tr>`).join("");
    return `<!DOCTYPE html><html lang="${esc(lang)}"><head>
<meta charset="utf-8">
<title>${esc(title || "Grid Print")}</title>
<style>
  body{font-family:sans-serif;font-size:11px;margin:12px}
  h2{font-size:14px;margin:0 0 8px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #bbb;padding:3px 6px;text-align:left;white-space:nowrap}
  th{background:#e8e8e8;font-weight:600}
  tr:nth-child(even){background:#f7f7f7}
  @media print{body{margin:0}button{display:none}}
</style>
</head><body>
${title ? `<h2>${esc(title)}</h2>` : ""}
<button onclick="window.print()" style="margin-bottom:8px;padding:4px 12px;cursor:pointer">\u{1F5A8} ${esc(i18n.printButton)}</button>
<table>${headerHtml}<tbody>${bodyHtml}</tbody></table>
</body></html>`;
  }

  // core/RowLayout.js
  var RowLayout = class {
    #default;
    #overrides = /* @__PURE__ */ new Map();
    // row index -> height
    #sortedRows = [];
    // overrides' keys, ascending — rebuilt lazily on read after a mutation
    #cumDelta = [0];
    // cumDelta[i] = sum of (height - default) for sortedRows[0..i)
    #dirty = false;
    constructor(defaultHeight) {
      this.#default = defaultHeight;
    }
    get defaultHeight() {
      return this.#default;
    }
    set defaultHeight(h) {
      if (h === this.#default) return;
      this.#default = h;
      this.#dirty = true;
    }
    #rebuild() {
      this.#sortedRows = [...this.#overrides.keys()].sort((a, b) => a - b);
      this.#cumDelta = new Array(this.#sortedRows.length + 1);
      this.#cumDelta[0] = 0;
      for (let i = 0; i < this.#sortedRows.length; i++) {
        const h = this.#overrides.get(this.#sortedRows[i]);
        this.#cumDelta[i + 1] = this.#cumDelta[i] + (h - this.#default);
      }
      this.#dirty = false;
    }
    #ensure() {
      if (this.#dirty) this.#rebuild();
    }
    // Number of overrides strictly before `row` (i.e. index into #sortedRows/#cumDelta).
    #countBefore(row) {
      let lo = 0, hi = this.#sortedRows.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (this.#sortedRows[mid] < row) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    heightOf(row) {
      return this.#overrides.get(row) ?? this.#default;
    }
    hasOverride(row) {
      return this.#overrides.has(row);
    }
    // Sets row's individual height. Setting it back to the current default clears the override
    // (keeps the sparse map from accumulating no-op entries as rows drift back to default via drag).
    setHeight(row, height) {
      const h = Math.max(1, Math.round(height));
      if (h === this.#default) {
        if (this.#overrides.delete(row)) this.#dirty = true;
        return;
      }
      if (this.#overrides.get(row) !== h) {
        this.#overrides.set(row, h);
        this.#dirty = true;
      }
    }
    // Used by JHGrid's structural-undo snapshot/restore (row/column add/delete and individual
    // row-height resize all share that one coarse before/after mechanism —
    // see JHGrid#_snapshotStructural/_restoreStructural).
    snapshotOverrides() {
      return new Map(this.#overrides);
    }
    restoreOverrides(overrides) {
      this.#overrides = new Map(overrides);
      this.#dirty = true;
    }
    clear() {
      if (this.#overrides.size) {
        this.#overrides.clear();
        this.#dirty = true;
      }
    }
    // Cumulative Y offset of `row`'s top edge — sum of heights of every row before it.
    yOf(row) {
      if (row <= 0) return 0;
      this.#ensure();
      return row * this.#default + this.#cumDelta[this.#countBefore(row)];
    }
    // Inverse of yOf(): the row index R such that yOf(R) <= y < yOf(R) + heightOf(R), searching
    // only rows [0, maxRowInclusive]. Returns -1 for y < 0 or y at/beyond the last row's bottom
    // edge (mirrors the old `row < 0 || row >= totalRows` bounds check every caller already did
    // around the uniform-height `Math.floor(y / rowHeight)` this replaces).
    // yOf is monotonic non-decreasing in the row index, so binary-searching the row axis directly
    // (rather than inverting the piecewise formula) is both simpler and just as fast — O(log
    // maxRow) row-index steps, each an O(log overrideCount) yOf() call.
    rowAt(y, maxRowInclusive) {
      if (y < 0 || maxRowInclusive < 0) return -1;
      if (this.yOf(maxRowInclusive) + this.heightOf(maxRowInclusive) <= y) return -1;
      let lo = 0, hi = maxRowInclusive;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        if (this.yOf(mid) <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    }
    // Row-index shift on local row insertion (mirrors RowSelection's shiftRows) — keeps an
    // override attached to the same logical row rather than the same row index once everything
    // after the insertion point shifts down by one. `shift` is the same closure JHGrid#addRow
    // already builds for edits/selection: `r => r >= insertIdx ? r + 1 : r`.
    shiftRows(shift) {
      if (this.#overrides.size === 0) return;
      const next = /* @__PURE__ */ new Map();
      for (const [row, h] of this.#overrides) next.set(shift(row), h);
      this.#overrides = next;
      this.#dirty = true;
    }
    // Removes rowIndex's own override (if any) and shifts every override after it down by one —
    // the row-height counterpart of the edits-shifting block in JHGrid#deleteRow.
    deleteRow(rowIndex) {
      if (this.#overrides.size === 0) return;
      const next = /* @__PURE__ */ new Map();
      for (const [row, h] of this.#overrides) {
        if (row === rowIndex) continue;
        next.set(row > rowIndex ? row - 1 : row, h);
      }
      this.#overrides = next;
      this.#dirty = true;
    }
  };

  // core/LocalDataSource.js
  var NUMERIC_COLLATOR = new Intl.Collator(void 0, { numeric: true });
  function toNumericOrNaN(v) {
    if (v == null || typeof v === "string" && v.trim() === "") return NaN;
    return Number(v);
  }
  function fieldCompare(field) {
    return (a, b) => {
      const av = a[field], bv = b[field];
      const an = toNumericOrNaN(av);
      const bn = toNumericOrNaN(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return NUMERIC_COLLATOR.compare(String(av ?? ""), String(bv ?? ""));
    };
  }
  function deriveFetchFromArray(data, columnDefs) {
    if (!Array.isArray(data)) throw new Error("[JHGrid] opts.data must be an array");
    const columns = columnDefs?.length ? columnDefs.map((d) => d.field) : Object.keys(data[0] ?? {});
    if (!columns.length) {
      throw new Error("[JHGrid] opts.data: could not resolve columns from an empty array \u2014 pass opts.columnDefs");
    }
    function applyState(state) {
      const { filters = {}, sorts = [], quickFilter = "" } = state ?? {};
      let out = data;
      for (const [field, cond] of Object.entries(filters)) {
        if (Array.isArray(cond)) {
          if (cond.length === 0) continue;
          const want = new Set(cond.map(String));
          out = out.filter((r) => want.has(String(r[field] ?? "")));
        } else if (cond) {
          const q = String(cond).toLowerCase();
          out = out.filter((r) => String(r[field] ?? "").toLowerCase().includes(q));
        }
      }
      if (quickFilter) {
        const q = quickFilter.toLowerCase();
        out = out.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
      }
      for (const { field, dir } of [...sorts].reverse()) {
        const sign = dir === "desc" ? -1 : 1;
        const cmp = fieldCompare(field);
        out = [...out].sort((a, b) => sign * cmp(a, b));
      }
      return out;
    }
    return {
      fetchMeta(state) {
        const rows = applyState(state);
        return Promise.resolve({ totalRows: rows.length, columns });
      },
      fetchData(page, size, state) {
        const rows = applyState(state);
        return Promise.resolve({ rows: rows.slice(page * size, page * size + size) });
      }
    };
  }

  // core/RowSelection.js
  var STATE = /* @__PURE__ */ new WeakMap();
  function stateFor(grid) {
    let s = STATE.get(grid);
    if (!s) {
      s = { selectedRows: /* @__PURE__ */ new Set(), lastSelRow: null };
      STATE.set(grid, s);
    }
    return s;
  }
  function modeFor(grid) {
    return grid._opts.rowSelection ?? "none";
  }
  var RowSelectionPlugin = {
    // Generic hooks JHGrid.js dispatches to every installed plugin without knowing this one's
    // name — see JHGrid.js's JHGrid.use()/_clearPlugins() for the calling side of each.
    resetScope: ["rowIndexState", "full"],
    clear(grid) {
      this.rowSelection.clear(grid);
    },
    // Generic structural-undo lifecycle hooks (see JHGrid._snapshotStructural()/
    // _restoreStructural(), which call these on every installed plugin).
    snapshotStructural(grid, snap) {
      const s = stateFor(grid);
      snap.selectedRows = new Set(s.selectedRows);
      snap.lastSelRow = s.lastSelRow;
    },
    restoreStructural(grid, snap) {
      const s = stateFor(grid);
      s.selectedRows = new Set(snap.selectedRows ?? []);
      s.lastSelRow = snap.lastSelRow ?? null;
    },
    // getState()/setState() (see JHGrid.js) — same generic hook pair other installed plugins use
    // for their own state keys (grouping/treeData/colorFilters). Restored silently (no onRowSelect callback),
    // matching how setState() already restores filters/sorts without firing onFilter/onSort.
    exportState(grid, out) {
      out.selectedRows = [...stateFor(grid).selectedRows];
    },
    importState(grid, state) {
      if (!Array.isArray(state.selectedRows)) return;
      const s = stateFor(grid);
      s.selectedRows = new Set(state.selectedRows);
      s.lastSelRow = state.selectedRows.at(-1) ?? null;
      grid._draw();
    },
    install(JHGridClass) {
      Object.assign(JHGridClass.prototype, {
        // Returns the sorted array of selected row indices (rowSelection mode must be 'single' or 'multi').
        getSelectedRows() {
          return [...stateFor(this).selectedRows];
        },
        // Clears all row selections and redraws.
        clearRowSelection() {
          const s = stateFor(this);
          s.selectedRows.clear();
          s.lastSelRow = null;
          this._draw();
        }
      });
    },
    rowSelection: {
      modeFor,
      has(grid, rowIndex) {
        return stateFor(grid).selectedRows.has(rowIndex);
      },
      // Render params (see JHGrid._draw()'s render() call).
      getRenderSet(grid) {
        const s = stateFor(grid);
        return s.selectedRows.size > 0 ? s.selectedRows : null;
      },
      getSorted(grid) {
        return [...stateFor(grid).selectedRows].sort((a, b) => a - b);
      },
      clear(grid) {
        const s = stateFor(grid);
        s.selectedRows.clear();
        s.lastSelRow = null;
      },
      // Row-index shift on local row insertion (see JHGrid#addRow) — keeps selection attached to
      // the same logical rows rather than the same row indices once everything after the
      // insertion point shifts down by one. `drop` (a removal) names a row whose own selection
      // goes away with it instead of being remapped — `shift(drop) === drop` for the standard
      // "everything after the removed row moves up one" shift function, so leaving it unfiltered
      // would silently reattach the selection to whatever row slides up into that now-vacant slot.
      shiftRows(grid, shift, drop = -1) {
        const s = stateFor(grid);
        if (s.selectedRows.size > 0) {
          const next = /* @__PURE__ */ new Set();
          for (const r of s.selectedRows) if (r !== drop) next.add(shift(r));
          s.selectedRows = next;
        }
        if (s.lastSelRow != null) s.lastSelRow = s.lastSelRow === drop ? null : shift(s.lastSelRow);
      },
      // The actual selection algorithm behind JHGrid#_updateRowSel (row-number click, Enter/Space
      // on a focused row). Single mode toggles a lone row; multi mode supports shift-range and
      // ctrl-toggle on top of a plain replace-click.
      update(grid, rowIndex, ctrl, shift) {
        const mode = modeFor(grid);
        if (mode === "none") return;
        const s = stateFor(grid);
        if (mode === "single") {
          if (s.selectedRows.has(rowIndex)) s.selectedRows.clear();
          else {
            s.selectedRows.clear();
            s.selectedRows.add(rowIndex);
          }
          s.lastSelRow = rowIndex;
        } else {
          if (shift && s.lastSelRow !== null) {
            const from = Math.min(s.lastSelRow, rowIndex);
            const to = Math.max(s.lastSelRow, rowIndex);
            if (!ctrl) s.selectedRows.clear();
            for (let r = from; r <= to; r++) s.selectedRows.add(r);
          } else if (ctrl) {
            if (s.selectedRows.has(rowIndex)) s.selectedRows.delete(rowIndex);
            else s.selectedRows.add(rowIndex);
            s.lastSelRow = rowIndex;
          } else {
            s.selectedRows.clear();
            s.selectedRows.add(rowIndex);
            s.lastSelRow = rowIndex;
          }
        }
        grid._opts.onRowSelect?.([...s.selectedRows].sort((a, b) => a - b));
        grid._announce(grid._i18n.rowsSelectedAnnounce(s.selectedRows.size));
      },
      // When showRowNumbers is on, row selection is driven exclusively by the row-number column,
      // so a plain click on a data cell must still drop any stale row highlight left over from a
      // previous row-header click (ctrl/shift clicks preserve it).
      clearOnCellClick(grid, e) {
        if (!grid._opts.showRowNumbers) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        const s = stateFor(grid);
        if (s.selectedRows.size === 0) return;
        s.selectedRows.clear();
        s.lastSelRow = null;
        grid._opts.onRowSelect?.([]);
      }
    }
  };

  // core/anim.js
  var hasRaf = typeof requestAnimationFrame === "function";
  var defaultNow = typeof performance !== "undefined" && typeof performance.now === "function" ? () => performance.now() : () => Date.now();
  var easeOut = (t) => t * (2 - t);
  var Tween = class {
    #value;
    #from;
    #to;
    #startedAt = 0;
    #duration = 0;
    #frame = 0;
    #onFrame;
    #request;
    #cancel;
    #now;
    // `onFrame` is called once per animation frame while a transition is running — hand it whatever
    // schedules a repaint. It is deliberately not called for `set()`, which is a jump: the caller is
    // already repainting for whatever reason made it jump.
    constructor({ value = 0, onFrame = null, requestFrame, cancelFrame, now } = {}) {
      this.#value = value;
      this.#from = value;
      this.#to = value;
      this.#onFrame = onFrame;
      this.#now = now ?? defaultNow;
      this.#request = requestFrame !== void 0 ? requestFrame : hasRaf ? (fn) => requestAnimationFrame(fn) : null;
      this.#cancel = cancelFrame !== void 0 ? cancelFrame : hasRaf ? (id) => cancelAnimationFrame(id) : null;
    }
    // The value right now. Reading is what advances it (see note 1 above), so this is safe to call
    // any number of times per frame and from outside the frame loop.
    get value() {
      if (this.#duration === 0) return this.#to;
      const t = (this.#now() - this.#startedAt) / this.#duration;
      if (t >= 1) {
        this.#duration = 0;
        this.#value = this.#to;
        return this.#to;
      }
      return this.#from + (this.#to - this.#from) * easeOut(Math.max(0, t));
    }
    // True while a transition is still in flight. Reads the clock, so it settles on its own.
    get animating() {
      return this.#duration !== 0 && this.#now() - this.#startedAt < this.#duration;
    }
    // Jump. Cancels any transition in flight.
    set(value) {
      this.#stopFrames();
      this.#duration = 0;
      this.#value = this.#from = this.#to = value;
    }
    // Animate to `target` over `ms`. Restarting mid-transition eases from wherever the value
    // currently sits rather than from the previous origin, so a reversal (hover on -> off -> on)
    // never jumps. A zero/negative duration — or an environment with no rAF — lands immediately,
    // which is also how `prefers-reduced-motion` is honoured: callers pass 0.
    to(target, ms) {
      if (target === this.#to) return;
      if (!(ms > 0) || !this.#request) {
        this.set(target);
        return;
      }
      this.#from = this.value;
      this.#to = target;
      this.#startedAt = this.#now();
      this.#duration = ms;
      this.#startFrames();
    }
    // Releases the frame loop. Call from the owner's teardown — a pending frame holding `onFrame`
    // would otherwise paint into a destroyed grid.
    stop() {
      this.#stopFrames();
      this.#duration = 0;
      this.#value = this.#from = this.#to = this.value;
    }
    #startFrames() {
      if (this.#frame || !this.#request) return;
      const tick = () => {
        this.#frame = 0;
        const running = this.animating;
        this.#onFrame?.();
        if (running) this.#startFrames();
      };
      this.#frame = this.#request(tick);
    }
    #stopFrames() {
      if (this.#frame && this.#cancel) this.#cancel(this.#frame);
      this.#frame = 0;
    }
  };
  function prefersReducedMotion(win = typeof window !== "undefined" ? window : null) {
    try {
      return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
  }

  // core/locales/ko.js
  var ko = {
    loading: "Loading\u2026",
    loadError: "\u26A0 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
    pasteTruncated: (n) => `${n}\uAC1C \uAC12\uC774 \uBC94\uC704\uB97C \uBC97\uC5B4\uB098 \uBD99\uC5EC\uB123\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4`,
    copyIncomplete: (n) => `${n}\uAC1C \uD589\uC774 \uC544\uC9C1 \uBD88\uB7EC\uC624\uC9C0 \uC54A\uC544 \uBCF5\uC0AC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4`,
    noData: "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    emptyCell: "\uBE48 \uC140",
    ariaGrid: "\uB370\uC774\uD130 \uADF8\uB9AC\uB4DC",
    sortAsc: "\u2191 \uC624\uB984\uCC28\uC21C",
    sortDesc: "\u2193 \uB0B4\uB9BC\uCC28\uC21C",
    sortShiftHint: "Shift+\uD074\uB9AD: \uB2E4\uC911 \uC815\uB82C \uCD94\uAC00",
    rowNumberLabel: "\uBC88\uD638",
    filterLabel: "\uAC80\uC0C9",
    filterPlaceholder: "\uAC80\uC0C9\uC5B4 \uC785\uB825\u2026",
    filterApply: "\uC801\uC6A9",
    filterReset: "\uCD08\uAE30\uD654",
    filterResetAll: "\uBAA8\uB4E0 \uD544\uD130 \uCD08\uAE30\uD654",
    filterClose: "\uB2EB\uAE30",
    filterDialog: (col) => `${col} \uD544\uD130`,
    filterColorLabel: "\uC0C9\uC0C1\uC73C\uB85C \uD544\uD130",
    filterValuesLabel: "\uAC12\uC73C\uB85C \uD544\uD130",
    filterSelectAll: "(\uC804\uCCB4 \uC120\uD0DD)",
    filterTagPlaceholder: "\uAC12 \uAC80\uC0C9\u2026",
    filterTagLocalScope: "\uB85C\uB4DC\uB41C \uBC94\uC704\uC5D0\uC11C",
    filterTagNoMatch: "\uC77C\uCE58\uD558\uB294 \uAC12 \uC5C6\uC74C",
    filterTagMinChars: (n) => `${n}\uAE00\uC790 \uC774\uC0C1 \uC785\uB825\uD558\uC138\uC694`,
    filterTagAllSelected: "\uC77C\uCE58\uD558\uB294 \uAC12\uC744 \uBAA8\uB450 \uC120\uD0DD\uD568",
    filterTagMore: (n) => `\uC678 ${n}\uAC1C \u2014 \uAC80\uC0C9\uC5B4\uB97C \uC881\uD600\uBCF4\uC138\uC694`,
    filterTagSelected: (n) => `\uC120\uD0DD\uD55C \uAC12 (${n})`,
    filterTagContains: (q) => `"${q}" \uD3EC\uD568`,
    filterTagRemove: (v) => `${v} \uC81C\uAC70`,
    colFreeze: "\uC5F4 \uACE0\uC815",
    colUnfreeze: "\uC5F4 \uACE0\uC815 \uD574\uC81C",
    colFreezeRight: "\uC624\uB978\uCABD \uC5F4 \uACE0\uC815",
    colUnfreezeRight: "\uC624\uB978\uCABD \uC5F4 \uACE0\uC815 \uD574\uC81C",
    colVisibility: "\uC5F4 \uD45C\uC2DC/\uC228\uAE30\uAE30\u2026",
    colChooserTitle: "\uC5F4 \uD45C\uC2DC/\uC228\uAE30\uAE30",
    colChooserApply: "\uC801\uC6A9",
    colChooserCancel: "\uCDE8\uC18C",
    colChooserSelectAll: "\uC804\uCCB4 \uC120\uD0DD",
    colInsertLeft: "\uC67C\uCABD\uC5D0 \uC5F4 \uC0BD\uC785",
    colInsertRight: "\uC624\uB978\uCABD\uC5D0 \uC5F4 \uC0BD\uC785",
    colInsertTitle: "\uC5F4 \uCD94\uAC00",
    colInsertPlaceholder: "\uC5F4 \uC774\uB984 \uC785\uB825",
    colInsertConfirm: "\uCD94\uAC00",
    colInsertCancel: "\uCDE8\uC18C",
    colDelete: "\uC774 \uC5F4 \uC0AD\uC81C",
    colUndelete: "\uC0AD\uC81C \uCDE8\uC18C",
    rowInsertTop: "\uB9E8 \uC704\uC5D0 \uD589 \uC0BD\uC785",
    rowInsertBottom: "\uB9E8 \uC544\uB798\uC5D0 \uD589 \uC0BD\uC785",
    rowInsertAbove: "\uC704\uC5D0 \uD589 \uC0BD\uC785",
    rowInsertBelow: "\uC544\uB798\uC5D0 \uD589 \uC0BD\uC785",
    rowAddEnd: "\uD589 \uCD94\uAC00",
    rowDelete: "\uC774 \uD589 \uC0AD\uC81C",
    rowDeleteMark: "\uC774 \uD589 \uC0AD\uC81C \uD45C\uC2DC",
    rowDeletePermanent: "\uC774 \uD589 \uC644\uC804 \uC0AD\uC81C",
    rowUndelete: "\uC0AD\uC81C \uCDE8\uC18C",
    editAriaLabel: (col, row) => `${col} \uD3B8\uC9D1, ${row}\uD589`,
    announceCell: (row, col, value) => `${row}\uD589 ${col}: ${value}`,
    columnHeaderAnnounce: (col) => `${col} \uC5F4 \uBA38\uB9AC\uAE00. Enter: \uC815\uB82C/\uD544\uD130 \uBA54\uB274. \uBA54\uB274 \uD0A4: \uC5F4 \uC635\uC158.`,
    rowHeaderAnnounce: (row) => `${row}\uD589. \uBA54\uB274 \uD0A4: \uD589 \uC635\uC158.`,
    rowReorderAnnounce: (from, to) => `${from}\uD589\uC744 ${to}\uD589 \uC704\uCE58\uB85C \uC774\uB3D9\uD588\uC2B5\uB2C8\uB2E4.`,
    sortAppliedAnnounce: (col, dir) => `${col} ${dir === "asc" ? "\uC624\uB984\uCC28\uC21C" : "\uB0B4\uB9BC\uCC28\uC21C"} \uC815\uB82C \uC801\uC6A9\uB428.`,
    filterAppliedAnnounce: (col) => `${col}\uC5D0 \uD544\uD130\uAC00 \uC801\uC6A9\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
    filterClearedAnnounce: (col) => `${col} \uD544\uD130\uAC00 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
    allFiltersClearedAnnounce: "\uBAA8\uB4E0 \uD544\uD130\uC640 \uC815\uB82C\uC774 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    rowsSelectedAnnounce: (n) => n === 0 ? "\uC120\uD0DD\uC774 \uD574\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : `${n}\uAC1C \uD589\uC774 \uC120\uD0DD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
    unsavedEditsWarning: "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uD3B8\uC9D1\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC774 \uBCC0\uACBD\uC744 \uC801\uC6A9\uD558\uBA74 \uD3B8\uC9D1\uC774 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uACC4\uC18D\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
    exportCsvFilename: "export.csv",
    exportExcelFilename: "export.xlsx",
    exportSheetName: "Sheet1",
    printButton: "\uC778\uC1C4",
    validationRequired: (col) => `${col}\uC740(\uB294) \uD544\uC218 \uC785\uB825 \uD56D\uBAA9\uC785\uB2C8\uB2E4.`,
    validationPattern: (col) => `${col} \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`,
    validationMin: (col, min) => `${col}\uC740(\uB294) ${min} \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`,
    validationMax: (col, max) => `${col}\uC740(\uB294) ${max} \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
    validationMinLength: (col, len) => `${col}\uC740(\uB294) \uCD5C\uC18C ${len}\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`,
    validationMaxLength: (col, len) => `${col}\uC740(\uB294) \uCD5C\uB300 ${len}\uC790\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
    validationInvalid: (col) => `${col} \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`,
    pagerFirst: "\uCCAB \uD398\uC774\uC9C0",
    pagerPrev: "\uC774\uC804 \uD398\uC774\uC9C0",
    pagerNext: "\uB2E4\uC74C \uD398\uC774\uC9C0",
    pagerLast: "\uB9C8\uC9C0\uB9C9 \uD398\uC774\uC9C0",
    pagerPageLabel: (page, pageCount) => `${page} / ${pageCount} \uD398\uC774\uC9C0`,
    aggSum: "\uD569\uACC4:",
    aggAvg: "\uD3C9\uADE0:",
    aggCount: "\uAC1C\uC218:",
    aggMin: "\uCD5C\uC18C:",
    aggMax: "\uCD5C\uB300:",
    groupLabel: (field, key, count) => `${field}: ${key} (${count})`,
    groupFooterLabel: "\uD569\uACC4"
  };

  // core/locales/ja.js
  var ja = {
    loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026",
    loadError: "\u26A0 \u30C7\u30FC\u30BF\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002",
    pasteTruncated: (n) => `${n}\u4EF6\u304C\u7BC4\u56F2\u5916\u306E\u305F\u3081\u8CBC\u308A\u4ED8\u3051\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F`,
    copyIncomplete: (n) => `${n}\u884C\u304C\u672A\u8AAD\u307F\u8FBC\u307F\u306E\u305F\u3081\u30B3\u30D4\u30FC\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F`,
    noData: "\u8868\u793A\u3059\u308B\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
    emptyCell: "\u7A7A\u30BB\u30EB",
    ariaGrid: "\u30C7\u30FC\u30BF\u30B0\u30EA\u30C3\u30C9",
    sortAsc: "\u2191 \u6607\u9806",
    sortDesc: "\u2193 \u964D\u9806",
    sortShiftHint: "Shift+\u30AF\u30EA\u30C3\u30AF: \u8907\u6570\u30BD\u30FC\u30C8\u306B\u8FFD\u52A0",
    rowNumberLabel: "No.",
    filterLabel: "\u691C\u7D22",
    filterPlaceholder: "\u691C\u7D22\u8A9E\u3092\u5165\u529B\u2026",
    filterApply: "\u9069\u7528",
    filterReset: "\u30EA\u30BB\u30C3\u30C8",
    filterResetAll: "\u3059\u3079\u3066\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u3092\u30EA\u30BB\u30C3\u30C8",
    filterClose: "\u9589\u3058\u308B",
    filterDialog: (col) => `${col} \u30D5\u30A3\u30EB\u30BF\u30FC`,
    filterColorLabel: "\u8272\u3067\u30D5\u30A3\u30EB\u30BF\u30FC",
    filterValuesLabel: "\u5024\u3067\u30D5\u30A3\u30EB\u30BF\u30FC",
    filterSelectAll: "(\u3059\u3079\u3066\u9078\u629E)",
    filterTagPlaceholder: "\u5024\u3092\u691C\u7D22\u2026",
    filterTagLocalScope: "\u8AAD\u307F\u8FBC\u307F\u6E08\u307F\u306E\u7BC4\u56F2\u304B\u3089",
    filterTagNoMatch: "\u4E00\u81F4\u3059\u308B\u5024\u304C\u3042\u308A\u307E\u305B\u3093",
    filterTagMinChars: (n) => `${n}\u6587\u5B57\u4EE5\u4E0A\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044`,
    filterTagAllSelected: "\u4E00\u81F4\u3059\u308B\u5024\u3092\u3059\u3079\u3066\u9078\u629E\u6E08\u307F",
    filterTagMore: (n) => `\u4ED6 ${n}\u4EF6 \u2014 \u691C\u7D22\u8A9E\u3092\u7D5E\u3063\u3066\u304F\u3060\u3055\u3044`,
    filterTagSelected: (n) => `\u9078\u629E\u3057\u305F\u5024 (${n})`,
    filterTagContains: (q) => `"${q}" \u3092\u542B\u3080`,
    filterTagRemove: (v) => `${v} \u3092\u524A\u9664`,
    colFreeze: "\u5217\u3092\u56FA\u5B9A",
    colUnfreeze: "\u5217\u306E\u56FA\u5B9A\u3092\u89E3\u9664",
    colFreezeRight: "\u53F3\u5074\u306E\u5217\u3092\u56FA\u5B9A",
    colUnfreezeRight: "\u53F3\u5074\u306E\u5217\u306E\u56FA\u5B9A\u3092\u89E3\u9664",
    colVisibility: "\u5217\u306E\u8868\u793A/\u975E\u8868\u793A\u2026",
    colChooserTitle: "\u5217\u306E\u8868\u793A/\u975E\u8868\u793A",
    colChooserApply: "\u9069\u7528",
    colChooserCancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    colChooserSelectAll: "\u3059\u3079\u3066\u9078\u629E",
    colInsertLeft: "\u5DE6\u306B\u5217\u3092\u633F\u5165",
    colInsertRight: "\u53F3\u306B\u5217\u3092\u633F\u5165",
    colInsertTitle: "\u5217\u3092\u8FFD\u52A0",
    colInsertPlaceholder: "\u5217\u540D\u3092\u5165\u529B",
    colInsertConfirm: "\u8FFD\u52A0",
    colInsertCancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    colDelete: "\u3053\u306E\u5217\u3092\u524A\u9664",
    colUndelete: "\u524A\u9664\u3092\u5143\u306B\u623B\u3059",
    rowInsertTop: "\u5148\u982D\u306B\u884C\u3092\u633F\u5165",
    rowInsertBottom: "\u672B\u5C3E\u306B\u884C\u3092\u633F\u5165",
    rowInsertAbove: "\u4E0A\u306B\u884C\u3092\u633F\u5165",
    rowInsertBelow: "\u4E0B\u306B\u884C\u3092\u633F\u5165",
    rowAddEnd: "\u884C\u3092\u8FFD\u52A0",
    rowDelete: "\u3053\u306E\u884C\u3092\u524A\u9664",
    rowDeleteMark: "\u3053\u306E\u884C\u306B\u524A\u9664\u30DE\u30FC\u30AF",
    rowDeletePermanent: "\u3053\u306E\u884C\u3092\u5B8C\u5168\u306B\u524A\u9664",
    rowUndelete: "\u524A\u9664\u3092\u5143\u306B\u623B\u3059",
    editAriaLabel: (col, row) => `${col} \u3092\u7DE8\u96C6, ${row} \u884C\u76EE`,
    announceCell: (row, col, value) => `${row} \u884C\u76EE ${col}: ${value}`,
    columnHeaderAnnounce: (col) => `${col} \u5217\u30D8\u30C3\u30C0\u30FC\u3002Enter: \u30BD\u30FC\u30C8/\u30D5\u30A3\u30EB\u30BF\u30FC\u30E1\u30CB\u30E5\u30FC\u3002\u30E1\u30CB\u30E5\u30FC\u30AD\u30FC: \u5217\u30AA\u30D7\u30B7\u30E7\u30F3\u3002`,
    rowHeaderAnnounce: (row) => `${row} \u884C\u76EE\u3002\u30E1\u30CB\u30E5\u30FC\u30AD\u30FC: \u884C\u30AA\u30D7\u30B7\u30E7\u30F3\u3002`,
    rowReorderAnnounce: (from, to) => `${from} \u884C\u76EE\u3092 ${to} \u884C\u76EE\u306B\u79FB\u52D5\u3057\u307E\u3057\u305F\u3002`,
    sortAppliedAnnounce: (col, dir) => `${col} \u3092${dir === "asc" ? "\u6607\u9806" : "\u964D\u9806"}\u306B\u4E26\u3079\u66FF\u3048\u307E\u3057\u305F\u3002`,
    filterAppliedAnnounce: (col) => `${col} \u306B\u30D5\u30A3\u30EB\u30BF\u30FC\u304C\u9069\u7528\u3055\u308C\u307E\u3057\u305F\u3002`,
    filterClearedAnnounce: (col) => `${col} \u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u304C\u89E3\u9664\u3055\u308C\u307E\u3057\u305F\u3002`,
    allFiltersClearedAnnounce: "\u3059\u3079\u3066\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u3068\u30BD\u30FC\u30C8\u304C\u89E3\u9664\u3055\u308C\u307E\u3057\u305F\u3002",
    rowsSelectedAnnounce: (n) => n === 0 ? "\u9078\u629E\u304C\u89E3\u9664\u3055\u308C\u307E\u3057\u305F\u3002" : `${n} \u884C\u304C\u9078\u629E\u3055\u308C\u307E\u3057\u305F\u3002`,
    unsavedEditsWarning: "\u4FDD\u5B58\u3055\u308C\u3066\u3044\u306A\u3044\u7DE8\u96C6\u5185\u5BB9\u304C\u3042\u308A\u307E\u3059\u3002\u3053\u306E\u5909\u66F4\u3092\u9069\u7528\u3059\u308B\u3068\u7834\u68C4\u3055\u308C\u307E\u3059\u3002\u7D9A\u884C\u3057\u307E\u3059\u304B?",
    exportCsvFilename: "export.csv",
    exportExcelFilename: "export.xlsx",
    exportSheetName: "Sheet1",
    printButton: "\u5370\u5237",
    validationRequired: (col) => `${col} \u306F\u5FC5\u9808\u9805\u76EE\u3067\u3059\u3002`,
    validationPattern: (col) => `${col} \u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002`,
    validationMin: (col, min) => `${col} \u306F ${min} \u4EE5\u4E0A\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002`,
    validationMax: (col, max) => `${col} \u306F ${max} \u4EE5\u4E0B\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002`,
    validationMinLength: (col, len) => `${col} \u306F ${len} \u6587\u5B57\u4EE5\u4E0A\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,
    validationMaxLength: (col, len) => `${col} \u306F ${len} \u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,
    validationInvalid: (col) => `${col} \u306E\u5024\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002`,
    pagerFirst: "\u6700\u521D\u306E\u30DA\u30FC\u30B8",
    pagerPrev: "\u524D\u306E\u30DA\u30FC\u30B8",
    pagerNext: "\u6B21\u306E\u30DA\u30FC\u30B8",
    pagerLast: "\u6700\u5F8C\u306E\u30DA\u30FC\u30B8",
    pagerPageLabel: (page, pageCount) => `${pageCount} \u30DA\u30FC\u30B8\u4E2D ${page} \u30DA\u30FC\u30B8\u76EE`,
    aggSum: "\u5408\u8A08:",
    aggAvg: "\u5E73\u5747:",
    aggCount: "\u4EF6\u6570:",
    aggMin: "\u6700\u5C0F:",
    aggMax: "\u6700\u5927:",
    groupLabel: (field, key, count) => `${field}: ${key} (${count})`,
    groupFooterLabel: "\u5408\u8A08"
  };

  // core/locales/zh.js
  var zh = {
    loading: "\u52A0\u8F7D\u4E2D\u2026",
    loadError: "\u26A0 \u6570\u636E\u52A0\u8F7D\u5931\u8D25\u3002",
    pasteTruncated: (n) => `${n} \u4E2A\u503C\u8D85\u51FA\u8303\u56F4\uFF0C\u672A\u88AB\u7C98\u8D34`,
    copyIncomplete: (n) => `${n} \u884C\u5C1A\u672A\u52A0\u8F7D\uFF0C\u672A\u88AB\u590D\u5236`,
    noData: "\u6682\u65E0\u6570\u636E\u3002",
    emptyCell: "\u7A7A\u5355\u5143\u683C",
    ariaGrid: "\u6570\u636E\u8868\u683C",
    sortAsc: "\u2191 \u5347\u5E8F",
    sortDesc: "\u2193 \u964D\u5E8F",
    sortShiftHint: "Shift+\u70B9\u51FB\uFF1A\u6DFB\u52A0\u591A\u91CD\u6392\u5E8F",
    rowNumberLabel: "\u5E8F\u53F7",
    filterLabel: "\u641C\u7D22",
    filterPlaceholder: "\u8BF7\u8F93\u5165\u641C\u7D22\u5185\u5BB9\u2026",
    filterApply: "\u5E94\u7528",
    filterReset: "\u91CD\u7F6E",
    filterResetAll: "\u91CD\u7F6E\u6240\u6709\u7B5B\u9009",
    filterClose: "\u5173\u95ED",
    filterDialog: (col) => `${col} \u7B5B\u9009`,
    filterColorLabel: "\u6309\u989C\u8272\u7B5B\u9009",
    filterValuesLabel: "\u6309\u503C\u7B5B\u9009",
    filterSelectAll: "(\u5168\u9009)",
    filterTagPlaceholder: "\u641C\u7D22\u503C\u2026",
    filterTagLocalScope: "\u4EC5\u6765\u81EA\u5DF2\u52A0\u8F7D\u7684\u884C",
    filterTagNoMatch: "\u6CA1\u6709\u5339\u914D\u7684\u503C",
    filterTagMinChars: (n) => `\u8BF7\u8F93\u5165\u81F3\u5C11 ${n} \u4E2A\u5B57\u7B26`,
    filterTagAllSelected: "\u5339\u914D\u7684\u503C\u5DF2\u5168\u90E8\u9009\u62E9",
    filterTagMore: (n) => `\u53E6\u6709 ${n} \u4E2A \u2014 \u8BF7\u7F29\u5C0F\u641C\u7D22\u8303\u56F4`,
    filterTagSelected: (n) => `\u5DF2\u9009\u503C (${n})`,
    filterTagContains: (q) => `\u5305\u542B "${q}"`,
    filterTagRemove: (v) => `\u79FB\u9664 ${v}`,
    colFreeze: "\u51BB\u7ED3\u5217",
    colUnfreeze: "\u53D6\u6D88\u51BB\u7ED3\u5217",
    colFreezeRight: "\u51BB\u7ED3\u53F3\u4FA7\u5217",
    colUnfreezeRight: "\u53D6\u6D88\u51BB\u7ED3\u53F3\u4FA7\u5217",
    colVisibility: "\u5217\u7684\u663E\u793A/\u9690\u85CF\u2026",
    colChooserTitle: "\u5217\u7684\u663E\u793A/\u9690\u85CF",
    colChooserApply: "\u5E94\u7528",
    colChooserCancel: "\u53D6\u6D88",
    colChooserSelectAll: "\u5168\u9009",
    colInsertLeft: "\u5728\u5DE6\u4FA7\u63D2\u5165\u5217",
    colInsertRight: "\u5728\u53F3\u4FA7\u63D2\u5165\u5217",
    colInsertTitle: "\u6DFB\u52A0\u5217",
    colInsertPlaceholder: "\u8BF7\u8F93\u5165\u5217\u540D",
    colInsertConfirm: "\u6DFB\u52A0",
    colInsertCancel: "\u53D6\u6D88",
    colDelete: "\u5220\u9664\u6B64\u5217",
    colUndelete: "\u64A4\u9500\u5220\u9664",
    rowInsertTop: "\u5728\u9876\u90E8\u63D2\u5165\u884C",
    rowInsertBottom: "\u5728\u5E95\u90E8\u63D2\u5165\u884C",
    rowInsertAbove: "\u5728\u4E0A\u65B9\u63D2\u5165\u884C",
    rowInsertBelow: "\u5728\u4E0B\u65B9\u63D2\u5165\u884C",
    rowAddEnd: "\u6DFB\u52A0\u884C",
    rowDelete: "\u5220\u9664\u6B64\u884C",
    rowDeleteMark: "\u6807\u8BB0\u6B64\u884C\u4E3A\u5220\u9664",
    rowDeletePermanent: "\u5F7B\u5E95\u5220\u9664\u6B64\u884C",
    rowUndelete: "\u64A4\u9500\u5220\u9664",
    editAriaLabel: (col, row) => `\u7F16\u8F91 ${col}\uFF0C\u7B2C ${row} \u884C`,
    announceCell: (row, col, value) => `\u7B2C ${row} \u884C ${col}\uFF1A${value}`,
    columnHeaderAnnounce: (col) => `${col} \u5217\u6807\u9898\u3002Enter\uFF1A\u6392\u5E8F/\u7B5B\u9009\u83DC\u5355\u3002\u83DC\u5355\u952E\uFF1A\u5217\u9009\u9879\u3002`,
    rowHeaderAnnounce: (row) => `\u7B2C ${row} \u884C\u3002\u83DC\u5355\u952E\uFF1A\u884C\u9009\u9879\u3002`,
    rowReorderAnnounce: (from, to) => `\u5DF2\u5C06\u7B2C ${from} \u884C\u79FB\u52A8\u5230\u7B2C ${to} \u884C\u3002`,
    sortAppliedAnnounce: (col, dir) => `${col} \u5DF2\u6309${dir === "asc" ? "\u5347\u5E8F" : "\u964D\u5E8F"}\u6392\u5E8F\u3002`,
    filterAppliedAnnounce: (col) => `\u5DF2\u5BF9 ${col} \u5E94\u7528\u7B5B\u9009\u3002`,
    filterClearedAnnounce: (col) => `\u5DF2\u6E05\u9664 ${col} \u7684\u7B5B\u9009\u3002`,
    allFiltersClearedAnnounce: "\u5DF2\u6E05\u9664\u6240\u6709\u7B5B\u9009\u548C\u6392\u5E8F\u3002",
    rowsSelectedAnnounce: (n) => n === 0 ? "\u5DF2\u53D6\u6D88\u9009\u62E9\u3002" : `\u5DF2\u9009\u62E9 ${n} \u884C\u3002`,
    unsavedEditsWarning: "\u60A8\u6709\u5C1A\u672A\u4FDD\u5B58\u7684\u7F16\u8F91\u5185\u5BB9\uFF0C\u6B64\u66F4\u6539\u5C06\u4E22\u5F03\u8FD9\u4E9B\u5185\u5BB9\u3002\u662F\u5426\u7EE7\u7EED\uFF1F",
    exportCsvFilename: "export.csv",
    exportExcelFilename: "export.xlsx",
    exportSheetName: "Sheet1",
    printButton: "\u6253\u5370",
    validationRequired: (col) => `${col} \u4E3A\u5FC5\u586B\u9879\u3002`,
    validationPattern: (col) => `${col} \u683C\u5F0F\u4E0D\u6B63\u786E\u3002`,
    validationMin: (col, min) => `${col} \u4E0D\u80FD\u5C0F\u4E8E ${min}\u3002`,
    validationMax: (col, max) => `${col} \u4E0D\u80FD\u5927\u4E8E ${max}\u3002`,
    validationMinLength: (col, len) => `${col} \u81F3\u5C11\u9700\u8981 ${len} \u4E2A\u5B57\u7B26\u3002`,
    validationMaxLength: (col, len) => `${col} \u6700\u591A\u5141\u8BB8 ${len} \u4E2A\u5B57\u7B26\u3002`,
    validationInvalid: (col) => `${col} \u7684\u503C\u65E0\u6548\u3002`,
    pagerFirst: "\u9996\u9875",
    pagerPrev: "\u4E0A\u4E00\u9875",
    pagerNext: "\u4E0B\u4E00\u9875",
    pagerLast: "\u672B\u9875",
    pagerPageLabel: (page, pageCount) => `\u7B2C ${page} / ${pageCount} \u9875`,
    aggSum: "\u603B\u8BA1\uFF1A",
    aggAvg: "\u5E73\u5747\u503C\uFF1A",
    aggCount: "\u8BA1\u6570\uFF1A",
    aggMin: "\u6700\u5C0F\u503C\uFF1A",
    aggMax: "\u6700\u5927\u503C\uFF1A",
    groupLabel: (field, key, count) => `${field}\uFF1A${key}\uFF08${count}\uFF09`,
    groupFooterLabel: "\u5408\u8BA1"
  };

  // core/locales/en.js
  var en = {
    loading: "Loading\u2026",
    loadError: "\u26A0 Failed to load data.",
    pasteTruncated: (n) => `${n} value(s) did not fit and were not pasted`,
    copyIncomplete: (n) => `${n} row(s) hadn't loaded yet and were not copied`,
    noData: "No data to display.",
    emptyCell: "Empty cell",
    ariaGrid: "Data grid",
    sortAsc: "\u2191 Ascending",
    sortDesc: "\u2193 Descending",
    sortShiftHint: "Shift+click: add to multi-sort",
    rowNumberLabel: "No.",
    filterLabel: "Search",
    filterPlaceholder: "Enter search term\u2026",
    filterApply: "Apply",
    filterReset: "Reset",
    filterResetAll: "Reset all filters",
    filterClose: "Close",
    filterDialog: (col) => `${col} Filter`,
    filterColorLabel: "Filter by color",
    filterValuesLabel: "Filter by value",
    filterSelectAll: "(Select all)",
    filterTagPlaceholder: "Search values\u2026",
    filterTagLocalScope: "From loaded rows only",
    filterTagNoMatch: "No matching values",
    filterTagMinChars: (n) => `Type at least ${n} characters`,
    filterTagAllSelected: "All matches already selected",
    filterTagMore: (n) => `+${n} more \u2014 narrow the search`,
    filterTagSelected: (n) => `Selected (${n})`,
    filterTagContains: (q) => `Contains "${q}"`,
    filterTagRemove: (v) => `Remove ${v}`,
    colFreeze: "Freeze column",
    colUnfreeze: "Unfreeze column",
    colFreezeRight: "Freeze columns to the right",
    colUnfreezeRight: "Unfreeze columns to the right",
    colVisibility: "Column visibility\u2026",
    colChooserTitle: "Column Visibility",
    colChooserApply: "Apply",
    colChooserCancel: "Cancel",
    colChooserSelectAll: "Select all",
    colInsertLeft: "Insert column left",
    colInsertRight: "Insert column right",
    colInsertTitle: "Add column",
    colInsertPlaceholder: "Column name",
    colInsertConfirm: "Add",
    colInsertCancel: "Cancel",
    colDelete: "Delete column",
    colUndelete: "Undo delete",
    rowInsertTop: "Insert row at top",
    rowInsertBottom: "Insert row at bottom",
    rowInsertAbove: "Insert row above",
    rowInsertBelow: "Insert row below",
    rowAddEnd: "Add row",
    rowDelete: "Delete row",
    rowDeleteMark: "Mark row for deletion",
    rowDeletePermanent: "Delete row permanently",
    rowUndelete: "Undo delete",
    editAriaLabel: (col, row) => `Edit ${col}, row ${row}`,
    announceCell: (row, col, value) => `Row ${row}, ${col}: ${value}`,
    columnHeaderAnnounce: (col) => `${col} column header. Enter: sort/filter menu. Context menu key: column options.`,
    rowHeaderAnnounce: (row) => `Row ${row}. Context menu key: row options.`,
    rowReorderAnnounce: (from, to) => `Moved row ${from} to position ${to}.`,
    sortAppliedAnnounce: (col, dir) => `${col} sorted ${dir === "asc" ? "ascending" : "descending"}.`,
    filterAppliedAnnounce: (col) => `Filter applied to ${col}.`,
    filterClearedAnnounce: (col) => `Filter cleared for ${col}.`,
    allFiltersClearedAnnounce: "All filters and sorts cleared.",
    rowsSelectedAnnounce: (n) => n === 0 ? "Selection cleared." : n === 1 ? "1 row selected." : `${n} rows selected.`,
    unsavedEditsWarning: "You have unsaved edits. This change will discard them. Continue?",
    exportCsvFilename: "export.csv",
    exportExcelFilename: "export.xlsx",
    exportSheetName: "Sheet1",
    printButton: "Print",
    validationRequired: (col) => `${col} is required.`,
    validationPattern: (col) => `${col} format is invalid.`,
    validationMin: (col, min) => `${col} must be at least ${min}.`,
    validationMax: (col, max) => `${col} must be at most ${max}.`,
    validationMinLength: (col, len) => `${col} must be at least ${len} characters.`,
    validationMaxLength: (col, len) => `${col} must be at most ${len} characters.`,
    validationInvalid: (col) => `${col} is invalid.`,
    pagerFirst: "First page",
    pagerPrev: "Previous page",
    pagerNext: "Next page",
    pagerLast: "Last page",
    pagerPageLabel: (page, pageCount) => `Page ${page} of ${pageCount}`,
    aggSum: "Sum:",
    aggAvg: "Avg:",
    aggCount: "Count:",
    aggMin: "Min:",
    aggMax: "Max:",
    groupLabel: (field, key, count) => `${field}: ${key} (${count})`,
    groupFooterLabel: "Total"
  };

  // core/locales/index.js
  var TEXT_PACKS = { en, ko, ja, zh };
  var primarySubtag = (locale) => String(locale ?? "").toLowerCase().split("-")[0];
  function resolveTextPack(locale) {
    return TEXT_PACKS[primarySubtag(locale)] ?? en;
  }
  function resolveIntlTag(locale) {
    return locale || "en-US";
  }

  // JHGrid.js
  var ARROWS = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
  var RESIZE_HIT_W = 5;
  var RESIZE_HIT_W_TOUCH = 8;
  var CANVAS_TOUCH_CSS = "touch-action:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;";
  var MIN_COL_W = 30;
  var MIN_ROW_H = 16;
  var LONG_PRESS_MS = 500;
  var WHEEL_LINE_W = 40;
  var DEFAULT_SCROLL_EASE_MS = 120;
  var DEFAULT_COL_SLIDE_MS = 220;
  var DEFAULT_HOVER_FADE_MS = 110;
  var DEFAULT_SEL_MOVE_MS = 90;
  var SKELETON_SWEEP_MS = 1200;
  var SR_ONLY = "position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
  var KB_PROXY_IDLE_CSS = "position:absolute;opacity:0;pointer-events:none;border:0;margin:0;padding:0;background:transparent;outline:none;";
  var DEFAULTS = {
    width: 1200,
    height: 700,
    rowHeight: 28,
    colWidth: 130,
    headerHeight: 30,
    // Excel-style A/B/C/... row above the normal header row(s), each cell one column wide and
    // non-interactive (no sort/filter/checkbox) -- see core/HeaderGroups.js#computeHeaderCells.
    columnLetterHeader: false,
    scrollbarSize: 12,
    chunkSize: 300,
    maxCachedChunks: 50,
    editableCols: [],
    // What deleteRow() does to a server row when the caller doesn't say. 'mark' keeps it on screen
    // with a strikethrough for the user to reconsider; 'permanent' takes it off. Which one suits a
    // screen is the host's call — a form with an explicit save step wants the mark, a list that
    // commits as you go wants it gone — so it belongs in the config rather than at every call site.
    deleteMode: "mark",
    frozenCols: 0,
    frozenColsRight: 0,
    rowReorder: false,
    responsive: false,
    rowSelection: "none",
    showRowNumbers: true
  };
  function deriveFetchFromPage(fetchPage, chunkSize, columnDefs) {
    let bootCache = null;
    let bootState = null;
    return {
      fetchMeta: function(state) {
        const promise = Promise.resolve(fetchPage(0, chunkSize, state));
        bootCache = promise;
        bootState = state;
        return promise.then(function(data) {
          const columns = data.columns ?? columnDefs?.map(function(d) {
            return d.field;
          });
          if (!columns) throw new Error("[JHGrid] opts.fetchPage: resolve { columns } or pass opts.columnDefs");
          return { totalRows: data.totalRows, columns };
        });
      },
      fetchData: function(chunkIndex, size, state) {
        const reusable = chunkIndex === 0 && size === chunkSize && bootCache && bootState === state;
        const promise = reusable ? bootCache : Promise.resolve(fetchPage(chunkIndex, size, state));
        bootCache = null;
        bootState = null;
        return promise.then(function(data) {
          return { rows: data.rows };
        });
      }
    };
  }
  var JHGrid = class _JHGrid {
    // Plugins installed via JHGrid.use() (see core/RowSelection.js). Each plugin is
    // a plain object that may implement any of a fixed set of generic, feature-agnostic hook names
    // (onMount, clear, renderParams, exportState, ...) — core calls every installed plugin through
    // these same hooks regardless of what the plugin does or where it lives, so this file never
    // needs to name, import, or otherwise know about any specific plugin's feature. Falls back to
    // plain default behavior wherever nothing is installed.
    static _plugins = [];
    static use(plugin) {
      if (_JHGrid._plugins.includes(plugin)) return;
      _JHGrid._plugins.push(plugin);
      plugin.install?.(_JHGrid);
    }
    // Generic keyed lookup for plugins that need to call into *another* plugin directly (e.g. one
    // feature refusing to combine with another) — used only from within plugin modules themselves,
    // never from this file, which is why the key is a runtime string rather than a named method here.
    static _plugin(key) {
      return _JHGrid._plugins.find((p) => p[key])?.[key] ?? null;
    }
    // Broadcasts `clear(grid)` to every installed plugin tagged with `scope` (see each plugin's own
    // `resetScope` array) — the different reset call sites below (a reload, a full refresh, an
    // explicit filter clear, ...) each need a different subset of installed plugins reset, but none
    // of them need to know *which* plugins those are.
    _clearPlugins(scope) {
      for (const p of _JHGrid._plugins) if (p.resetScope?.includes(scope)) p.clear?.(this);
    }
    _opts;
    _canvas;
    _container;
    _wrapper;
    _loadingEl;
    _liveRegion;
    _a11yHead;
    _a11yBody;
    _a11yActiveRow;
    _a11yActiveCell;
    _dm;
    _renderer;
    // Scroll state
    _scrollTop = 0;
    _scrollLeft = 0;
    _ticking = false;
    _drag = null;
    // Data state
    _totalRows = 0;
    _columns = [];
    _columnLabels = [];
    _columnAligns = [];
    _columnHeaderAligns = [];
    _colDefMap = /* @__PURE__ */ new Map();
    _edits = /* @__PURE__ */ new Map();
    _editedRows = /* @__PURE__ */ new Set();
    // Validation
    _validator;
    // Undo / Redo
    _undoMgr = new UndoManager(100);
    _editTxn = null;
    // Map<key, {had, value}> — open batch of cell edits
    // Selection state
    _sel = null;
    _selAnchor = null;
    _selDragging = false;
    _selDragStart = null;
    // Edge auto-scroll while dragging a range selection past the visible viewport (see
    // _extendDragSelection/_dragAutoScrollTick). _dragScrollDir is which way to scroll next tick;
    // _dragScrollPos is the last raw mouse position, re-hit-tested on every tick since the cell
    // under it changes as the scroll moves.
    _dragScrollDir = { dx: 0, dy: 0 };
    _dragScrollPos = null;
    _dragScrollTimer = null;
    // Set by _buildCopyText() to the number of selected rows that hadn't loaded yet; read by the
    // Ctrl+C / native copy handlers right after calling it.
    _lastCopyMissingRows = 0;
    // True when opts.data (a plain in-memory array) supplied fetchMeta/fetchData -- the whole
    // dataset is already sitting in memory, so _boot() prefetches every chunk instead of just the
    // first one (see there). A host-supplied fetchMeta/fetchData/fetchPage keeps the normal
    // scroll-driven lazy loading, since the grid has no way to know those are similarly free.
    _isLocalData = false;
    // object URLs minted by pasting a clipboard image into a `type: 'image'` cell (see
    // _pasteImageBlob) -- unlike a host-supplied image URL these are owned by this grid instance
    // and nothing else will ever revoke them, so they're tracked here and released on destroy()
    // rather than leaking for the life of the page.
    _pastedImageUrls = /* @__PURE__ */ new Set();
    // Keyboard-only focus zones (column header / row number)
    // Neither overlaps _sel: entering one is a distinct mode reached from a data
    // cell via Ctrl+ArrowUp (header) or ArrowLeft at column 0 (row number), and
    // exited back to a data cell. They exist so sort/filter/column actions and
    // row actions — normally right-click-only — have a keyboard path (see
    // _handleHeaderFocusKey/_handleRowFocusKey).
    _headerFocusCol = null;
    _rowFocus = null;
    // Column drag / resize / context menu state
    _colDrag = null;
    _colResize = null;
    _colContextMenu = null;
    _rowContextMenu = null;
    _cellContextMenu = null;
    _columnWidths = [];
    _columnRenderers = [];
    _headerCheckboxState = /* @__PURE__ */ new Map();
    // Edit state
    _editing = null;
    _editableCols = null;
    // Filter / sort state
    _filters = /* @__PURE__ */ new Map();
    // Set-filter fields (checkbox list) currently checked for every value the panel could enumerate
    // — functionally unfiltered, since nothing gets excluded. Sent to the host as-is regardless (see
    // onApplyValues; the host's fetchData still decides how to interpret it), but the header filter
    // icon uses this to avoid showing the column as actively filtered when nothing actually is.
    _trivialSetFilters = /* @__PURE__ */ new Set();
    // Fields whose distinct values were once found to be beyond the enumeration cap. Remembered so
    // the filter panel keeps offering a search rather than flipping to a checklist once a filter has
    // narrowed the loaded rows enough to make the column look small (see _openFilterPanel).
    _searchModeCols = /* @__PURE__ */ new Set();
    _sorts = [];
    // [{ field, dir }] — ordered list of active sorts
    _filterPanel = null;
    // Global quick filter (setQuickFilter/getQuickFilter/clearQuickFilter) — a single opaque
    // search term applied across every column, folded into _filterState() alongside the
    // per-column _filters map. Unlike per-column filters, JHGrid has no UI chrome of its own for
    // this (no toolbar), so it's driven entirely by the host page's own search input.
    _quickFilter = "";
    // Row drag-to-reorder (opts.rowReorder) — see _materializeRowOrder()/_reorderRow().
    // _rowOrderData is the live in-memory row array (materialized via _scanAllRows()/
    // _applyDisplayFetch()) that drag-drop splices directly; null until materialization finishes
    // (or when rowReorder is off / another installed plugin owns the display array instead).
    _rowDrag = null;
    _rowOrderData = null;
    // Bumped every boot/reload — lets a materialization scan that was already in flight when a
    // *newer* sort/filter/refresh landed recognize it's stale and discard its result instead of
    // clobbering the current view (see _materializeRowOrder()).
    _rowOrderGen = 0;
    _rowOrderScanPending = false;
    // Row-height resize (drag a boundary in the row-number gutter, mirroring _colResize) — sets
    // an individual override on _rowLayout (core/RowLayout.js) for the one row being dragged,
    // Excel-style, rather than the single global opts.rowHeight column resize's width mirrors.
    _rowResize = null;
    _uid = Math.random().toString(36).slice(2, 9);
    _destroyed = false;
    _booting = false;
    // The in-flight _boot(), so a second caller waits for it instead of racing past it.
    _bootPromise = null;
    // Resolved once (settled either way) at the end of the grid's first _boot() call — see
    // ready(). _readyResolve is nulled out afterward so later reboots (refresh()/_reloadFiltered())
    // don't attempt to resolve an already-settled promise again.
    _readyResolve;
    _readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve;
    });
    _announceRaf = 0;
    _schedRaf = 0;
    _scrolling = false;
    _scrollEndTimer = null;
    // Set while loading rows are on screen so their sweep keeps advancing; see _skeletonPhase().
    _skeletonRaf = 0;
    _hcMq = null;
    _hcMqHandler = null;
    _dprMq = null;
    _dprMqHandler = null;
    // i18n / UI state
    _i18n = {};
    _emptyEl = null;
    // Responsive resize
    _resizeObserver = null;
    // Row selection is structured as an always-installed plugin like the others above — its
    // state lives in its own WeakMap, not here. The selection mode itself is read directly from
    // _opts.rowSelection on demand.
    _ev = {};
    // Touch state
    _touch = null;
    // { startX, startY, scrollTopStart, scrollLeftStart, moved } | { twoFinger, midX, midY, scrollTopStart, scrollLeftStart }
    _lastTap = { time: 0, row: -1, col: -1 };
    // Deferred row-number tap (no reorder armed) — resolved on touchend unless a long-press or
    // real move got there first. See ev.touchstart's row-number gutter branch.
    _rowTap = null;
    // { row, startY, ctrlKey, shiftKey }
    _longPressTimer = null;
    // Column visibility
    _columnOriginalOrder = [];
    // field order from first fetchMeta (used to restore show position)
    _hiddenColumns = /* @__PURE__ */ new Map();
    // field → { label, align, headerAlign, width, renderer }
    _columnWidthMap = /* @__PURE__ */ new Map();
    // field → width (persists through hide/show/reorder)
    _colChooser = null;
    // active column chooser dialog
    _newColDialog = null;
    // active "insert column" name-prompt dialog
    // Fill handle
    _fillDrag = null;
    // { sel } during drag
    _fillPreview = null;
    // { r1, c1, r2, c2 } range shown while dragging
    // Local row add / delete
    _localRows = [];
    // rows appended via addRow()
    // Set by _reloadFiltered, consumed by _boot: the added rows' edits/validation/heights, held
    // across the gap where _serverTotal is stale and their final indices aren't known yet.
    _pendingLocalState = null;
    _deletedRows = /* @__PURE__ */ new Set();
    // server-row indices marked for deletion
    _serverTotal = 0;
    // totalRows as reported by last fetchMeta
    // Where each visible row comes from: server rows minus the ones deleted outright, with added
    // rows interleaved at the position they were inserted. Held against server indices so it
    // survives the visual renumbering it causes. See core/RowPlan.js.
    _rowPlan = new RowPlan();
    // Local column add / delete
    _localColumns = /* @__PURE__ */ new Map();
    // field → def, added via addColumn() (absent from server meta.columns)
    _deletedColumns = /* @__PURE__ */ new Set();
    // server fields marked for deletion via deleteColumn()
    _newColSeq = 1;
    // used to generate unique field names for context-menu "insert column"
    // Cell value tooltip
    _cellTooltip = null;
    // DOM element
    _tooltipTimer = null;
    // Error banner (chunk load failure)
    _errorBannerEl = null;
    _errorBannerTimer = null;
    // Pagination
    _pagination = null;
    // { enabled: true, pageSize } when opts.pagination.enabled, else null
    _page = 0;
    // current 0-based page index (only meaningful when _pagination is set)
    _pagerBar = null;
    // { el, firstBtn, prevBtn, numbers, nextBtn, lastBtn, label }
    constructor(opts) {
      if (typeof window === "undefined") {
        throw new Error("[JHGrid] JHGrid requires a browser environment. For SSR frameworks (Next.js, Nuxt, SvelteKit), import and instantiate only on the client side (e.g. inside useEffect / onMounted).");
      }
      if (!opts?.container) throw new Error("[JHGrid] opts.container is required");
      this._opts = {
        ...DEFAULTS,
        ...opts,
        theme: { ...DEFAULT_THEME, locale: resolveIntlTag(opts.locale), ...opts.theme ?? {} }
      };
      if (opts.responsive) {
        const ignored = ["width", "height"].filter((k) => opts[k] != null);
        if (ignored.length) {
          console.warn(`[JHGrid] opts.${ignored.join(" and opts.")} ${ignored.length > 1 ? "are" : "is"} ignored while opts.responsive is true \u2014 the container element's CSS size determines the grid size instead. Set width/height (or max-width) via CSS on the container element, not via opts.${ignored[0]}.`);
        }
      }
      if (!this._opts.headerRows?.length) {
        const derived = deriveHeaderRowsFromColumnGroups(opts.columnDefs);
        if (derived) this._opts.headerRows = derived;
      }
      this._i18n = { ...resolveTextPack(opts.locale), ...opts.i18n ?? {} };
      if (opts.pagination?.enabled) {
        const pageSize = typeof opts.pagination.pageSize === "number" && opts.pagination.pageSize > 0 ? Math.floor(opts.pagination.pageSize) : 50;
        this._pagination = { enabled: true, pageSize };
        this._opts.chunkSize = pageSize;
      }
      if (opts.fetchPage && !opts.fetchMeta && !opts.fetchData) {
        const derived = deriveFetchFromPage(opts.fetchPage, this._opts.chunkSize, opts.columnDefs);
        this._opts.fetchMeta = derived.fetchMeta;
        this._opts.fetchData = derived.fetchData;
      }
      if (opts.data && !opts.fetchMeta && !opts.fetchData && !opts.fetchPage) {
        const derived = deriveFetchFromArray(opts.data, opts.columnDefs);
        this._opts.fetchMeta = derived.fetchMeta;
        this._opts.fetchData = derived.fetchData;
        this._isLocalData = true;
      }
      if (!this._opts.fetchMeta) throw new Error("[JHGrid] opts.fetchMeta is required (or provide opts.data / opts.fetchPage instead)");
      if (!this._opts.fetchData) throw new Error("[JHGrid] opts.fetchData is required (or provide opts.data / opts.fetchPage instead)");
      this._rowLayout = new RowLayout(this._opts.rowHeight);
      this._editableCols = opts.editableCols === "*" ? null : new Set(opts.editableCols ?? []);
      (opts.columnDefs ?? []).forEach(({ field, label, align, headerAlign, width, renderer, editor, editorOptions, editable, type, format, options, validation, button, aggregate, treeColumn, group, headerCheckbox }) => this._colDefMap.set(field, { label, align, headerAlign, width, renderer, editor, editorOptions, editable, type, format, options, validation, button, aggregate, treeColumn, group, headerCheckbox }));
      if (opts.hiddenColumns?.length) opts.hiddenColumns.forEach((f) => this._hiddenColumns.set(f, null));
      this._validator = new ColumnValidator({
        getColumnDef: (field) => this._colDefMap.get(field),
        getColumnLabel: (field) => this._columnLabels[this._columns.indexOf(field)] ?? field,
        getI18n: () => this._i18n,
        getRowData: (row) => this._getRow(row),
        onError: (row, field, message) => this._opts.onValidationError?.(row, field, message)
      });
      this._mount();
      this._dm = new DataManager({
        fetchData: (page, size) => this._opts.fetchData(page, size, null),
        chunkSize: this._opts.chunkSize,
        maxChunks: this._opts.maxCachedChunks
      });
      this._dm.onChunkLoaded = () => {
        if (!this._scrolling) this._schedDraw();
      };
      this._dm.onChunkError = (err) => {
        this._opts.onChunkError?.(err);
        this._showErrorBanner(this._i18n.loadError);
      };
      this._imageLoadListener = () => {
        if (!this._scrolling) this._schedDraw();
      };
      addLoadListener(this._imageLoadListener);
      this._renderer = new Renderer(this._canvas, this._opts);
      this._remoteSelections = [];
      this._hoverRow = null;
      this._hoverTarget = 0;
      this._hoverFade = new Tween({ onFrame: () => this._schedDraw() });
      const reducedMotion = prefersReducedMotion();
      this._reducedMotion = reducedMotion;
      this._hoverFadeMs = reducedMotion ? 0 : this._opts.hoverFadeMs ?? DEFAULT_HOVER_FADE_MS;
      this._selKey = null;
      this._selLast = null;
      this._selPrev = null;
      this._selMove = new Tween({ value: 1, onFrame: () => this._schedDraw() });
      this._selMoveMs = reducedMotion ? 0 : this._opts.selectionMoveMs ?? DEFAULT_SEL_MOVE_MS;
      this._scrollFrom = { y: 0, x: 0 };
      this._scrollAim = { y: 0, x: 0 };
      this._scrollWrote = { y: 0, x: 0 };
      this._scrollEase = new Tween({ value: 1, onFrame: () => this._onScrollFrame() });
      this._scrollEaseMs = reducedMotion ? 0 : this._opts.scrollEaseMs ?? DEFAULT_SCROLL_EASE_MS;
      this._colSlide = null;
      this._colSlideTween = new Tween({ value: 1, onFrame: () => this._schedDraw() });
      this._colSlideMs = reducedMotion ? 0 : this._opts.columnSlideMs ?? DEFAULT_COL_SLIDE_MS;
      this._bind();
      this._initResizeObserver();
      this._initHighContrast();
      this._watchDpr();
      this._boot();
    }
    // DOM Setup
    _mount() {
      const { container, width, height } = this._opts;
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) throw new Error(`[JHGrid] container "${container}" not found`);
      this._container = el;
      injectStyleSheet(el.ownerDocument ?? document);
      this._wrapper = document.createElement("div");
      this._wrapper.className = CLS.root;
      Object.assign(this._wrapper.style, {
        position: "relative",
        overflow: "hidden",
        width: width + "px",
        height: height + "px",
        outline: "none"
      });
      this._wrapper.setAttribute("role", "grid");
      this._wrapper.setAttribute("aria-label", this._opts.ariaLabel ?? this._i18n.ariaGrid);
      this._wrapper.setAttribute("aria-rowcount", "0");
      this._wrapper.setAttribute("aria-colcount", "0");
      this._wrapper.setAttribute("aria-busy", "true");
      const rowSelMode = _JHGrid._plugin("rowSelection")?.modeFor(this) ?? "none";
      if (rowSelMode !== "none") this._wrapper.setAttribute("aria-multiselectable", String(rowSelMode === "multi"));
      this._wrapper.tabIndex = -1;
      el.appendChild(this._wrapper);
      this._kbProxy = document.createElement("input");
      this._kbProxy.type = "text";
      this._kbProxy.setAttribute("aria-label", this._opts.ariaLabel ?? this._i18n.ariaGrid);
      this._kbProxy.tabIndex = 0;
      this._kbProxy.style.cssText = KB_PROXY_IDLE_CSS;
      this._kbProxy.remove = () => this._resetKbProxy();
      this._wrapper.appendChild(this._kbProxy);
      const dpr = window.devicePixelRatio || 1;
      this._canvas = document.createElement("canvas");
      this._canvas.width = Math.round(width * dpr);
      this._canvas.height = Math.round(height * dpr);
      this._canvas.style.cssText = `display:block;width:${width}px;height:${height}px;outline:none;${CANVAS_TOUCH_CSS}`;
      this._canvas.setAttribute("aria-hidden", "true");
      this._canvas.tabIndex = -1;
      this._canvas.getContext("2d").scale(dpr, dpr);
      this._wrapper.appendChild(this._canvas);
      this._loadingEl = Object.assign(document.createElement("div"), { textContent: this._i18n.loading });
      this._loadingEl.className = CLS.loading;
      Object.assign(this._loadingEl.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.9)",
        fontSize: "14px",
        color: themed(this._opts.theme, "overlayMutedText"),
        fontFamily: themed(this._opts.theme, "fontFamily")
      });
      this._wrapper.appendChild(this._loadingEl);
      this._liveRegion = document.createElement("div");
      this._liveRegion.setAttribute("aria-live", "polite");
      this._liveRegion.setAttribute("aria-atomic", "true");
      this._liveRegion.style.cssText = SR_ONLY;
      this._wrapper.appendChild(this._liveRegion);
      this._a11yHead = document.createElement("div");
      this._a11yHead.setAttribute("role", "rowgroup");
      this._a11yHead.style.cssText = SR_ONLY;
      this._wrapper.appendChild(this._a11yHead);
      this._a11yBody = document.createElement("div");
      this._a11yBody.setAttribute("role", "rowgroup");
      this._a11yBody.style.cssText = SR_ONLY;
      this._a11yActiveRow = document.createElement("div");
      this._a11yActiveRow.setAttribute("role", "row");
      this._a11yActiveRow.setAttribute("aria-rowindex", "2");
      this._a11yActiveCell = document.createElement("div");
      this._a11yActiveCell.setAttribute("role", "gridcell");
      this._a11yActiveCell.setAttribute("aria-colindex", "1");
      this._a11yActiveCell.setAttribute("aria-selected", "false");
      this._a11yActiveCell.id = `jhgrid-${this._uid}-cell`;
      this._a11yActiveRow.appendChild(this._a11yActiveCell);
      this._a11yBody.appendChild(this._a11yActiveRow);
      this._wrapper.appendChild(this._a11yBody);
      for (const p of _JHGrid._plugins) p.onMount?.(this);
      this._emptyEl = document.createElement("div");
      this._emptyEl.className = CLS.empty;
      Object.assign(this._emptyEl.style, {
        position: "absolute",
        inset: "0",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        pointerEvents: "none",
        color: themed(this._opts.theme, "overlayHintText"),
        fontFamily: themed(this._opts.theme, "fontFamily")
      });
      this._emptyEl.textContent = this._i18n.noData;
      this._wrapper.appendChild(this._emptyEl);
      this._cellTooltip = document.createElement("div");
      this._cellTooltip.className = CLS.tooltip;
      this._cellTooltip.style.cssText = [
        "position:absolute",
        "background:#212121",
        "color:#FFFFFF",
        "border-radius:4px",
        "padding:5px 9px",
        "font-size:12px",
        "pointer-events:none",
        "z-index:160",
        "max-width:320px",
        "white-space:pre-wrap",
        "word-break:break-all",
        "display:none",
        "box-shadow:0 4px 12px rgba(0,0,0,0.22)",
        `font-family:${themed(this._opts.theme, "fontFamily")}`
      ].join(";");
      this._wrapper.appendChild(this._cellTooltip);
      if (this._pagination) this._buildPagerBar();
    }
    _buildPagerBar() {
      const theme = this._opts.theme;
      const s = (...p) => p.join(";");
      const bar = document.createElement("nav");
      bar.setAttribute("aria-label", "Pagination");
      bar.className = CLS.pager;
      bar.style.cssText = s(
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "gap:4px",
        "padding:8px 12px",
        `border-top:1px solid ${themed(theme, "pagerBorder")}`,
        `background:${themed(theme, "pagerBg")}`,
        `font-size:${theme.fontSize}px`,
        `color:${themed(theme, "pagerText")}`,
        `font-family:${themed(theme, "fontFamily")}`,
        `width:${this._opts.width}px`,
        "box-sizing:border-box",
        "user-select:none"
      );
      const mkBtn = (text, ariaLabel, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.setAttribute("aria-label", ariaLabel);
        b.className = CLS.pagerBtn;
        b.style.cssText = s(
          "padding:4px 10px",
          `border:1px solid ${themed(theme, "pagerButtonBorder")}`,
          "border-radius:4px",
          `background:${themed(theme, "pagerButtonBg")}`,
          "cursor:pointer",
          `font-size:${theme.fontSize}px`,
          `color:${themed(theme, "pagerText")}`,
          "min-width:28px"
        );
        b.addEventListener("click", onClick);
        return b;
      };
      const firstBtn = mkBtn("\xAB", this._i18n.pagerFirst, () => this.goToPage(0));
      const prevBtn = mkBtn("\u2039", this._i18n.pagerPrev, () => this.prevPage());
      const numbers = document.createElement("span");
      numbers.style.cssText = "display:flex;align-items:center;gap:4px;margin:0 4px;";
      const nextBtn = mkBtn("\u203A", this._i18n.pagerNext, () => this.nextPage());
      const lastBtn = mkBtn("\xBB", this._i18n.pagerLast, () => this.goToPage(this._pageCount() - 1));
      bar.append(firstBtn, prevBtn, numbers, nextBtn, lastBtn);
      this._container.appendChild(bar);
      this._pagerBar = { el: bar, firstBtn, prevBtn, numbers, nextBtn, lastBtn };
      this._updatePagerBar();
    }
    // Windowed set of page numbers to show around the current page (current ± 2,
    // widened toward the far edge when near the start/end so up to 5 show when possible).
    _pagerPageWindow() {
      const pageCount = this._pageCount();
      const cur = this._page;
      let start = Math.max(0, cur - 2);
      let end = Math.min(pageCount - 1, cur + 2);
      const want = Math.min(4, pageCount - 1);
      while (end - start < want) {
        if (start > 0) start--;
        else if (end < pageCount - 1) end++;
        else break;
      }
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    _updatePagerBar() {
      if (!this._pagerBar) return;
      const { firstBtn, prevBtn, numbers, nextBtn, lastBtn } = this._pagerBar;
      const pageCount = this._pageCount();
      const page = this._page;
      const theme = this._opts.theme;
      const s = (...p) => p.join(";");
      firstBtn.disabled = prevBtn.disabled = page <= 0;
      lastBtn.disabled = nextBtn.disabled = page >= pageCount - 1;
      this._pagerBar.el.setAttribute("aria-label", this._i18n.pagerPageLabel(page + 1, pageCount));
      numbers.replaceChildren();
      this._pagerPageWindow().forEach((p) => {
        const active = p === page;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = String(p + 1);
        btn.className = CLS.pagerBtn;
        btn.style.cssText = s(
          "padding:4px 9px",
          "border-radius:4px",
          "cursor:pointer",
          `font-size:${theme.fontSize}px`,
          `border:1px solid ${active ? themed(theme, "selectionColor") : themed(theme, "pagerButtonBorder")}`,
          `background:${active ? themed(theme, "selectionColor") : themed(theme, "pagerButtonBg")}`,
          `color:${active ? themed(theme, "overlayAccentText") : themed(theme, "pagerText")}`,
          `font-weight:${active ? "600" : "400"}`
        );
        if (active) btn.setAttribute("aria-current", "page");
        btn.addEventListener("click", () => this.goToPage(p));
        numbers.appendChild(btn);
      });
    }
    // Error banner
    _showErrorBanner(msg, durationMs = 4e3) {
      if (!this._errorBannerEl) {
        this._errorBannerEl = document.createElement("div");
        this._errorBannerEl.setAttribute("role", "alert");
        this._errorBannerEl.setAttribute("aria-live", "assertive");
        this._errorBannerEl.setAttribute("aria-atomic", "true");
        Object.assign(this._errorBannerEl.style, {
          position: "absolute",
          top: "4px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#fee2e2",
          color: "#991b1b",
          border: "1px solid #fca5a5",
          borderRadius: "4px",
          padding: "6px 14px",
          fontSize: "12px",
          fontFamily: DEFAULT_THEME.fontFamily,
          zIndex: "10",
          whiteSpace: "nowrap",
          pointerEvents: "none"
        });
        this._wrapper.appendChild(this._errorBannerEl);
      }
      this._errorBannerEl.textContent = msg;
      this._errorBannerEl.style.display = "block";
      clearTimeout(this._errorBannerTimer);
      this._errorBannerTimer = setTimeout(() => {
        if (this._errorBannerEl) this._errorBannerEl.style.display = "none";
      }, durationMs);
    }
    // ResizeObserver
    _initResizeObserver() {
      if (!this._opts.responsive || !window.ResizeObserver) return;
      const rect = this._container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._setSize(Math.floor(rect.width), Math.floor(rect.height));
      }
      this._resizeObserver = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) this._setSize(Math.floor(width), Math.floor(height));
      });
      this._resizeObserver.observe(this._container);
    }
    _setSize(width, height) {
      if (this._destroyed) return;
      const pagerH = this._pagerBar ? this._pagerBar.el.offsetHeight : 0;
      const gridHeight = Math.max(0, height - pagerH);
      this._opts.width = width;
      this._opts.height = gridHeight;
      this._wrapper.style.width = width + "px";
      this._wrapper.style.height = gridHeight + "px";
      this._canvas.style.cssText = `display:block;width:${width}px;height:${gridHeight}px;outline:none;${CANVAS_TOUCH_CSS}`;
      const dpr = window.devicePixelRatio || 1;
      this._canvas.width = Math.round(width * dpr);
      this._canvas.height = Math.round(gridHeight * dpr);
      this._canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this._pagerBar) this._pagerBar.el.style.width = width + "px";
      this._clamp(this._geo());
      this._draw();
    }
    // Accessibility Helpers
    _announce(text) {
      cancelAnimationFrame(this._announceRaf);
      this._liveRegion.textContent = "";
      this._announceRaf = requestAnimationFrame(() => {
        this._liveRegion.textContent = text;
      });
    }
    _updateA11yHeader() {
      this._a11yHead.replaceChildren();
      this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
      this._wrapper.setAttribute("aria-colcount", String(this._columns.length));
      const row = document.createElement("div");
      row.setAttribute("role", "row");
      row.setAttribute("aria-rowindex", "1");
      this._columnLabels.forEach((label, i) => {
        const th = document.createElement("div");
        th.setAttribute("role", "columnheader");
        th.setAttribute("aria-colindex", String(i + 1));
        th.id = `jhgrid-${this._uid}-header-${i}`;
        const field = this._columns[i];
        const sortEntry = this._sorts.find((s) => s.field === field);
        if (sortEntry) {
          th.setAttribute("aria-sort", sortEntry.dir === "asc" ? "ascending" : "descending");
        }
        th.textContent = label;
        row.appendChild(th);
      });
      this._a11yHead.appendChild(row);
      if (this._headerFocusCol !== null) {
        this._a11yActiveCell.setAttribute("aria-selected", "false");
        this._wrapper.setAttribute("aria-activedescendant", `jhgrid-${this._uid}-header-${this._headerFocusCol}`);
      }
    }
    _updateA11yCell() {
      if (this._headerFocusCol !== null || this._rowFocus !== null) return;
      if (!this._sel) {
        this._wrapper.removeAttribute("aria-activedescendant");
        this._a11yActiveRow.setAttribute("aria-selected", "false");
        this._a11yActiveCell.setAttribute("aria-selected", "false");
        this._a11yActiveCell.removeAttribute("aria-invalid");
        this._a11yActiveCell.textContent = "";
        return;
      }
      const row = this._sel.type === "single" ? this._sel.row : this._sel.r1;
      const col = this._sel.type === "single" ? this._sel.col : this._sel.c1;
      const field = this._columns[col];
      const label = this._columnLabels[col] ?? field ?? "";
      const value = this._cellVal(row, col);
      const errorMsg = this._validator.map.get(`${row}_${field}`);
      this._a11yActiveRow.setAttribute("aria-rowindex", String(row + 2));
      this._a11yActiveRow.setAttribute("aria-selected", String(!!_JHGrid._plugin("rowSelection")?.has(this, row)));
      this._a11yActiveCell.setAttribute("aria-colindex", String(col + 1));
      this._a11yActiveCell.setAttribute("aria-selected", "true");
      if (errorMsg) {
        this._a11yActiveCell.setAttribute("aria-invalid", "true");
        this._a11yActiveCell.setAttribute("aria-label", `${label}: ${value || this._i18n.emptyCell}. ${errorMsg}`);
      } else {
        this._a11yActiveCell.removeAttribute("aria-invalid");
        this._a11yActiveCell.setAttribute("aria-label", `${label}: ${value || this._i18n.emptyCell}`);
      }
      this._a11yActiveCell.textContent = value;
      this._wrapper.setAttribute("aria-activedescendant", `jhgrid-${this._uid}-cell`);
    }
    // Keyboard focus zones: column header
    // Entered from a data cell with Ctrl+ArrowUp; gives keyboard access to
    // sort/filter (Enter → filter panel, which already hosts sort controls)
    // and column actions (ContextMenu/Shift+F10 → freeze/visibility/insert/
    // delete), all of which were previously mouse/right-click only.
    _enterHeaderFocus(col) {
      this._headerFocusCol = col;
      this._updateA11yHeader();
      const row = this._sel?.type === "single" ? this._sel.row : this._sel?.r1 ?? 0;
      this._ensureVisible(row, col);
      this._announce(this._i18n.columnHeaderAnnounce(this._columnLabels[col] ?? this._columns[col]));
      this._draw();
    }
    _exitHeaderFocus() {
      const col = this._headerFocusCol;
      this._headerFocusCol = null;
      this._updateA11yHeader();
      const row = this._sel?.type === "single" ? this._sel.row : this._sel?.r1 ?? 0;
      this._setSel({ type: "single", row, col });
      this._selAnchor = null;
      this._updateA11yCell();
      this._announce(this._i18n.announceCell(row + 1, this._columnLabels[col] ?? this._columns[col], this._cellVal(row, col) || this._i18n.emptyCell));
      this._draw();
    }
    _handleHeaderFocusKey(e) {
      const col = this._headerFocusCol;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (col > 0) this._enterHeaderFocus(col - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (col < this._columns.length - 1) this._enterHeaderFocus(col + 1);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "Escape") {
        e.preventDefault();
        this._exitHeaderFocus();
        return;
      }
      if (e.key === "Enter" || e.key === "F2" || e.key === " ") {
        e.preventDefault();
        this._openFilterPanel(col);
        return;
      }
      if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
        e.preventDefault();
        const geo = this._geo();
        this._openColContextMenu(col, this._colLeft(col, geo), geo.headerH);
      }
    }
    // Keyboard focus zone: row number
    // Entered from the first data column with ArrowLeft (only when
    // showRowNumbers is on, mirroring the mouse-only gating of the row-number
    // column itself). Gives keyboard access to row insert/delete (ContextMenu/
    // Shift+F10) and row selection (Enter/Space), previously right-click- or
    // mouse-only.
    _enterRowFocus(row) {
      this._rowFocus = row;
      this._ensureVisible(row, 0);
      this._announce(this._i18n.rowHeaderAnnounce(row + 1));
      this._draw();
    }
    _exitRowFocus() {
      const row = this._rowFocus;
      this._rowFocus = null;
      this._setSel({ type: "single", row, col: 0 });
      this._selAnchor = null;
      this._updateA11yCell();
      this._announce(this._i18n.announceCell(row + 1, this._columnLabels[0] ?? this._columns[0], this._cellVal(row, 0) || this._i18n.emptyCell));
      this._draw();
    }
    _handleRowFocusKey(e) {
      const row = this._rowFocus;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (row > 0) this._enterRowFocus(row - 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (row < this._totalRows - 1) this._enterRowFocus(row + 1);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Escape") {
        e.preventDefault();
        this._exitRowFocus();
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && (_JHGrid._plugin("rowSelection")?.modeFor(this) ?? "none") !== "none") {
        e.preventDefault();
        this._updateRowSel(row, e.ctrlKey || e.metaKey, e.shiftKey);
        this._draw();
        return;
      }
      if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
        e.preventDefault();
        const geo = this._geo();
        this._closeFilterPanel();
        this._closeColContextMenu();
        this._closeCellContextMenu();
        this._openRowContextMenu(row, 0, this._rowLayout.yOf(row) - this._scrollTop + geo.headerH);
      }
    }
    // Selects the first cell so keyboard focus is visible immediately (WCAG
    // 2.4.7) — used both when Tab first lands on the grid and when an arrow
    // key is pressed with nothing selected yet.
    _focusDefaultCell() {
      this._setSel({ type: "single", row: 0, col: 0 });
      this._selAnchor = null;
      this._ensureVisible(0, 0);
      this._updateA11yCell();
      this._announce(this._i18n.announceCell(1, this._columnLabels[0] ?? this._columns[0], this._cellVal(0, 0) || this._i18n.emptyCell));
      this._draw();
    }
    // Re-registers each time DPR changes so we always track the current value.
    _watchDpr() {
      if (!window.matchMedia) return;
      this._dprMq?.removeEventListener("change", this._dprMqHandler);
      const dpr = window.devicePixelRatio || 1;
      this._dprMq = window.matchMedia(`(resolution: ${dpr}dppx)`);
      this._dprMqHandler = () => {
        this._resizeCanvas();
        this._watchDpr();
      };
      this._dprMq.addEventListener("change", this._dprMqHandler);
    }
    _resizeCanvas() {
      this._setSize(this._opts.width, this._opts.height);
    }
    _initHighContrast() {
      if (!window.matchMedia) return;
      this._hcMq = window.matchMedia("(forced-colors: active)");
      const original = { ...this._opts.theme };
      this._hcMqHandler = (e) => {
        if (e.matches) {
          Object.assign(this._opts.theme, {
            headerBg: "ButtonFace",
            headerText: "ButtonText",
            headerBorder: "ButtonBorder",
            rowEven: "Canvas",
            rowOdd: "Canvas",
            cellBorder: "ButtonBorder",
            cellText: "CanvasText",
            loadingText: "GrayText",
            selectionColor: "Highlight",
            selectionFill: "rgba(0,0,0,0)",
            scrollbarBg: "Canvas",
            scrollbarThumb: "ButtonText",
            frozenBorder: "ButtonBorder",
            dragIndicatorFill: "ButtonFace",
            dragIndicatorLine: "Highlight",
            deletedRowFill: "ButtonFace",
            deletedRowStrike: "GrayText",
            invalidCellBorder: "Mark"
          });
        } else {
          Object.assign(this._opts.theme, original);
        }
        this._draw();
      };
      this._hcMq.addEventListener("change", this._hcMqHandler);
      this._hcMqHandler(this._hcMq);
    }
    // Pagination
    // Absolute row window of the row(s) currently allowed to be scrolled into
    // view: the whole dataset normally, or just the current page's band when
    // pagination is enabled. Every other pagination behavior (scroll clamping,
    // arrow-key bounds, thumb geometry) derives from this, so it degrades to
    // today's behavior for free when pagination is off.
    _pageBounds() {
      if (!this._pagination) return { start: 0, rows: this._totalRows };
      const start = this._page * this._pagination.pageSize;
      const rows = Math.max(0, Math.min(this._pagination.pageSize, this._totalRows - start));
      return { start, rows };
    }
    _pageCount() {
      if (!this._pagination) return 1;
      return Math.max(1, Math.ceil(this._totalRows / this._pagination.pageSize));
    }
    // Shared page-switch logic used by goToPage()/nextPage()/prevPage() and by
    // scrollTo() when it needs to jump across a page boundary. Clamps `n` to a
    // valid page, snaps the scroll position to that page's start, and clears
    // selection (a fresh page is a fresh view, same as after a filter/sort).
    _switchToPage(n) {
      if (!this._pagination || this._destroyed) return;
      const pageCount = this._pageCount();
      const clamped = Math.max(0, Math.min(pageCount - 1, Math.trunc(n)));
      const changed = clamped !== this._page;
      if (this._editing) this._commitEdit();
      this._page = clamped;
      this._sel = null;
      this._selAnchor = null;
      this._scrollTop = this._rowLayout.yOf(clamped * this._pagination.pageSize);
      this._clamp(this._geo());
      this._updateA11yHeader();
      this._updateA11yCell();
      this._updatePagerBar();
      if (changed) {
        this._opts.onPageChange?.(this._page, pageCount);
        this._announce(this._i18n.pagerPageLabel(this._page + 1, pageCount));
      }
      this._draw();
    }
    // Scrollbar Geometry
    get _headerH() {
      return this._opts.headerHeight * ((this._opts.headerRows?.length ?? 0) + 1 + (this._opts.columnLetterHeader ? 1 : 0));
    }
    _geo() {
      const { colWidth: defaultColW, scrollbarSize: SB, width: W, height: H } = this._opts;
      const headerH = this._headerH;
      let frozenCount = Math.max(0, Math.min(this._opts.frozenCols ?? 0, this._columns.length));
      const n = this._columns.length;
      const rowNumW = this._opts.showRowNumbers ? this._opts.rowNumberWidth ?? 50 : 0;
      const colPositions = new Array(n + 1);
      colPositions[0] = rowNumW;
      for (let i = 0; i < n; i++) {
        colPositions[i + 1] = colPositions[i] + (this._columnWidths[i] ?? defaultColW);
      }
      let frozenWidth = colPositions[frozenCount];
      const minMiddleW = Math.min(defaultColW, W);
      while (frozenCount > 0 && frozenWidth > W - minMiddleW) {
        frozenCount--;
        frozenWidth = colPositions[frozenCount];
      }
      let frozenRightCount = Math.max(0, Math.min(this._opts.frozenColsRight ?? 0, n - frozenCount));
      let frozenRightWidth = colPositions[n] - colPositions[n - frozenRightCount];
      while (frozenRightCount > 0 && frozenWidth + frozenRightWidth > W - minMiddleW) {
        frozenRightCount--;
        frozenRightWidth = colPositions[n] - colPositions[n - frozenRightCount];
      }
      const contentW = colPositions[n - frozenRightCount] - frozenWidth;
      const footerH = _JHGrid._plugins.reduce((h, p) => h + (p.footerBandHeight?.(this) ?? 0), 0);
      const vpH0 = H - headerH - footerH;
      const vpW0 = Math.max(0, W - frozenWidth - frozenRightWidth);
      const { start: pageStart, rows: pageRows } = this._pageBounds();
      const pageStartY = this._rowLayout.yOf(pageStart);
      const contentH = this._rowLayout.yOf(pageStart + pageRows) - pageStartY;
      let needsV = contentH > vpH0;
      let needsH = contentW > vpW0;
      if (needsV && !needsH) needsH = contentW > Math.max(0, vpW0 - SB);
      if (needsH && !needsV) needsV = contentH > vpH0 - SB;
      const vSB = needsV ? SB : 0;
      const hSB = needsH ? SB : 0;
      const vpH = vpH0 - hSB;
      const vpW = Math.max(0, vpW0 - vSB);
      const rightX = W - vSB - frozenRightWidth;
      const minScrollY = pageStartY;
      const maxScrollY = minScrollY + Math.max(0, contentH - vpH);
      const maxScrollX = Math.max(0, contentW - vpW);
      const vTrackH = vpH;
      const vThumbH = contentH > 0 ? Math.max(24, vTrackH * (vpH / contentH)) : vTrackH;
      const vSpan = maxScrollY - minScrollY;
      const vThumbY = headerH + (vSpan > 0 ? (this._scrollTop - minScrollY) / vSpan * (vTrackH - vThumbH) : 0);
      const hTrackW = vpW;
      const hThumbW = contentW > 0 ? Math.max(24, hTrackW * (vpW / contentW)) : hTrackW;
      const hThumbX = frozenWidth + (maxScrollX > 0 ? this._scrollLeft / maxScrollX * (hTrackW - hThumbW) : 0);
      return {
        SB,
        vSB,
        hSB,
        vpH,
        vpW,
        frozenCount,
        frozenWidth,
        frozenRightCount,
        frozenRightWidth,
        rightX,
        minScrollY,
        maxScrollY,
        maxScrollX,
        colPositions,
        headerH,
        footerH,
        rowNumW,
        maxRow: pageStart + pageRows - 1,
        // last selectable/renderable absolute row (page-bounded when paginated)
        v: { x: W - vSB, y: headerH, w: needsV ? SB : 0, h: needsV ? vTrackH : 0, thumbY: vThumbY, thumbH: vThumbH },
        h: { x: frozenWidth, y: H - hSB, w: needsH ? hTrackW : 0, h: needsH ? SB : 0, thumbX: hThumbX, thumbW: hThumbW }
      };
    }
    // Hit Testing
    _colAtX(screenX, geo) {
      const { frozenCount, frozenWidth, frozenRightCount, rightX, colPositions, rowNumW } = geo;
      const n = this._columns.length;
      if (n === 0) return null;
      if (screenX < rowNumW) return null;
      if (screenX < frozenWidth) {
        for (let c = 0; c < frozenCount; c++) {
          if (screenX < colPositions[c + 1]) return c;
        }
        return null;
      }
      if (frozenRightCount > 0 && screenX >= rightX) {
        const base = n - frozenRightCount;
        const relX = screenX - rightX + colPositions[base];
        for (let c = base; c < n; c++) {
          if (relX < colPositions[c + 1]) return c;
        }
        return null;
      }
      const midEnd = n - frozenRightCount;
      const absX = screenX - frozenWidth + this._scrollLeft + colPositions[frozenCount];
      for (let c = frozenCount; c < midEnd; c++) {
        if (absX < colPositions[c + 1]) return c;
      }
      return null;
    }
    _hitCell(x, y, geo = this._geo()) {
      const { width: W, height: H } = this._opts;
      const { headerH, hSB, vSB } = geo;
      if (y < headerH || y > H - hSB || x < 0 || x > W - vSB) return null;
      const row = this._rowLayout.rowAt(y - headerH + this._scrollTop, this._totalRows - 1);
      if (row < 0) return null;
      const col = this._colAtX(x, geo);
      if (col === null) return null;
      return { row, col };
    }
    // Same as _hitCell, but a mouse position outside the data area resolves to the nearest edge
    // cell instead of null -- used while dragging a range selection, where the pointer routinely
    // ends up past the canvas's own bounds (mousemove is bound on window, not the canvas, exactly
    // so a drag can be tracked once it leaves the grid).
    _hitCellClamped(x, y, geo = this._geo()) {
      const { width: W, height: H } = this._opts;
      const { headerH, hSB, vSB, rowNumW } = geo;
      if (this._totalRows === 0 || this._columns.length === 0) return null;
      const cy = Math.max(headerH, Math.min(H - hSB - 1, y));
      const cx = Math.max(rowNumW, Math.min(W - vSB - 1, x));
      const row = this._rowLayout.rowAt(cy - headerH + this._scrollTop, this._totalRows - 1);
      if (row < 0) return null;
      const col = this._colAtX(cx, geo);
      if (col === null) return null;
      return { row, col };
    }
    _hitHeader(x, geo = this._geo()) {
      const { width: W } = this._opts;
      if (x < 0 || x > W - geo.vSB || x < geo.rowNumW) return null;
      return this._colAtX(x, geo);
    }
    // Row-number gutter hit test: returns the row index at screen (x, y), or null.
    _hitRowNumber(x, y, geo = this._geo()) {
      const { height: H } = this._opts;
      if (geo.rowNumW === 0 || x < 0 || x >= geo.rowNumW || y < geo.headerH || y >= H - geo.hSB) return null;
      const row = this._rowLayout.rowAt(y - geo.headerH + this._scrollTop, this._totalRows - 1);
      return row < 0 ? null : row;
    }
    // Row-height resize hit test (row-number gutter only, mirrors the column-resize edge check
    // in ev.mousedown/mousemove): returns the row whose bottom edge y sits within RESIZE_HIT_W
    // of, or null. Checks both the hovered row's bottom edge and (falling back, like the column
    // check does with col > 0) the previous row's bottom edge when y lands right at a row's top
    // edge — both branches identify the same boundary line, resolving to "the row above it".
    _hitRowBoundary(y, geo = this._geo(), hitW = RESIZE_HIT_W) {
      const { height: H } = this._opts;
      if (y < geo.headerH || y >= H - geo.hSB) return null;
      const relY = y - geo.headerH + this._scrollTop;
      const row = this._rowLayout.rowAt(relY, this._totalRows - 1);
      if (row < 0) return null;
      const bottomY = this._rowLayout.yOf(row + 1) - this._scrollTop + geo.headerH;
      if (Math.abs(y - bottomY) <= hitW) return row;
      if (row > 0) {
        const topY = this._rowLayout.yOf(row) - this._scrollTop + geo.headerH;
        if (Math.abs(y - topY) <= hitW) return row - 1;
      }
      return null;
    }
    // Vertical/horizontal scrollbar hit test, shared by mousedown and touchstart: grabbing the
    // thumb arms this._drag (consumed by _updateScrollbarDrag on the matching move handler),
    // tapping the bare track jump-scrolls straight to that position, same as a native scrollbar.
    // Returns whether (x, y) was inside either scrollbar's hit area at all, so the caller knows to
    // stop dispatching (preventDefault + return) instead of falling through to header/cell/pan
    // handling — without this, a touch on the drawn scrollbar was indistinguishable from a touch
    // anywhere else on the canvas and just started a generic content-drag pan.
    _hitScrollbar(x, y, geo) {
      const { v, h } = geo;
      if (x >= v.x) {
        if (y >= v.thumbY && y <= v.thumbY + v.thumbH) {
          this._drag = { axis: "v", startMouse: y, startScroll: this._scrollTop };
        } else if (y >= v.y && y <= v.y + v.h) {
          const ratio = Math.max(0, Math.min(1, (y - v.y - v.thumbH / 2) / (v.h - v.thumbH)));
          this._scrollTop = geo.minScrollY + ratio * (geo.maxScrollY - geo.minScrollY);
          this._clamp(geo);
          this._draw();
        }
        return true;
      }
      if (y >= h.y) {
        if (x >= h.thumbX && x <= h.thumbX + h.thumbW) {
          this._drag = { axis: "h", startMouse: x, startScroll: this._scrollLeft };
        } else if (x >= h.x && x <= h.x + h.w) {
          const ratio = Math.max(0, Math.min(1, (x - h.x - h.thumbW / 2) / (h.w - h.thumbW)));
          this._scrollLeft = ratio * geo.maxScrollX;
          this._clamp(geo);
          this._draw();
        }
        return true;
      }
      return false;
    }
    // Applies an in-progress scrollbar thumb drag (this._drag, armed by _hitScrollbar) given the
    // pointer/touch's current raw canvas coordinates. Shared by mousemove and touchmove so the two
    // input paths can't drift apart.
    _updateScrollbarDrag(x, y) {
      const geo = this._geo();
      const { v, h } = geo;
      if (this._drag.axis === "v") {
        const ratio = (y - this._drag.startMouse) / (v.h - v.thumbH);
        this._scrollTop = this._drag.startScroll + ratio * (geo.maxScrollY - geo.minScrollY);
      } else {
        const ratio = (x - this._drag.startMouse) / (h.w - h.thumbW);
        this._scrollLeft = this._drag.startScroll + ratio * geo.maxScrollX;
      }
      this._clamp(geo);
      this._scrolling = true;
      this._dm.setHold(true);
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = setTimeout(() => {
        this._scrolling = false;
        this._dm.setHold(false);
        this._schedDraw();
      }, 150);
      this._schedDraw();
    }
    _hitFillHandle(x, y, geo = this._geo(), hitW = RESIZE_HIT_W) {
      if (!this._sel) return false;
      const { headerH, colPositions } = geo;
      const selR2 = this._sel.type === "single" ? this._sel.row : this._sel.r2;
      const selC2 = this._sel.type === "single" ? this._sel.col : this._sel.c2;
      const handleX = this._colLeft(selC2, geo) + (colPositions[selC2 + 1] - colPositions[selC2]);
      const handleY = this._rowLayout.yOf(selR2 + 1) - this._scrollTop + headerH;
      return Math.abs(x - handleX) <= hitW && Math.abs(y - handleY) <= hitW;
    }
    _colLeft(col, geo) {
      return colScreenX(col, geo, this._scrollLeft);
    }
    // Column Auto-fit
    _autoFitCol(col) {
      const ctx = this._canvas.getContext("2d");
      const { theme } = this._opts;
      const padding = theme.cellPadding;
      const field = this._columns[col];
      const label = this._columnLabels[col] ?? field;
      ctx.font = `bold ${theme.fontSize}px ${theme.fontFamily}`;
      const _cbxRsv = this._colDefMap.get(field)?.headerCheckbox ? 20 : 0;
      let maxW = ctx.measureText(label).width + padding * 2 + FILTER_ICON_W + 4 + _cbxRsv;
      const colDef = this._colDefMap.get(field);
      const _colType = colDef?.type;
      const _rendererW = _colType === "dropdown" || _colType === "multiselect" ? DROPDOWN_ARROW_W : 0;
      const locale = theme.locale;
      ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
      this._dm.forEachLoaded((row) => {
        const val = row?.[field];
        if (val == null) return;
        const display = formatCellForDisplay(val, colDef, locale);
        const w = ctx.measureText(String(display)).width + padding * 2 + _rendererW;
        if (w > maxW) maxW = w;
      });
      this._edits.forEach((val, key) => {
        const u = key.indexOf("_");
        if (u === -1 || key.slice(u + 1) !== field) return;
        const display = formatCellForDisplay(val, colDef, locale);
        const w = ctx.measureText(String(display)).width + padding * 2 + _rendererW;
        if (w > maxW) maxW = w;
      });
      const fitted = Math.max(MIN_COL_W, Math.ceil(maxW));
      this._columnWidths[col] = fitted;
      this._columnWidthMap.set(field, fitted);
    }
    // Columns to auto-fit together when a header-boundary double-click lands on/inside a multi-
    // column selection -- mirrors Excel and the row-boundary equivalent (_selectedRowsForAutoFit):
    // double-clicking any boundary touching the selection fits every selected column's width, not
    // just the one column whose edge got clicked. Column selection has no separate plugin state the
    // way row-header checkbox selection does (see RowSelectionPlugin) -- a selected column *is* a
    // `_sel` range spanning every row (see _updateColSel), and a full Ctrl+A select-all range works
    // the same way -- so reading `_sel` directly is enough. Returns null when there's no multi-
    // column selection to widen to.
    _selectedColsForAutoFit() {
      if (this._sel && this._sel.type === "range") {
        const cols = /* @__PURE__ */ new Set();
        for (let c = this._sel.c1; c <= this._sel.c2; c++) cols.add(c);
        return cols;
      }
      return null;
    }
    // Column Reorder
    _calcInsertBefore(x, geo = this._geo()) {
      const { width: W } = this._opts;
      const { colPositions } = geo;
      const n = this._columns.length;
      if (x <= 0) return 0;
      if (x >= W - geo.vSB) return n;
      const col = this._colAtX(x, geo) ?? 0;
      const leftEdge = this._colLeft(col, geo);
      const colW = colPositions[col + 1] - colPositions[col];
      return x > leftEdge + colW / 2 ? col + 1 : col;
    }
    // `silent` suppresses the onColumnReorder callback, for the intermediate steps of a live drag —
    // a consumer wants to hear where the column landed, not every slot it passed through. The drop
    // fires it once with the final order.
    // Sends the columns a reorder just displaced back to where they were, so they travel to their
    // new slots instead of appearing in them. `beforeX` is `colPositions` from before the move.
    //
    // The displaced columns are always one contiguous run, and they all shift by the same amount —
    // the width of the column that was dragged past them — so a single range and a single offset
    // describe the whole thing.
    //
    // A reorder arriving while the previous slide is still running snaps it. Crossing boundaries
    // faster than the slide can finish means the pointer is moving quickly, and there the exact
    // arrangement matters more than the motion — the same trade the selection box makes.
    _startColSlide(from, at, beforeX) {
      if (this._colSlideMs === 0) {
        this._colSlide = null;
        return;
      }
      const [c1, c2, oldC1] = at > from ? [from, at - 1, from + 1] : [at + 1, from, at];
      const afterX = this._geo().colPositions;
      const dx = beforeX[oldC1] - afterX[c1];
      if (!dx) {
        this._colSlide = null;
        return;
      }
      this._colSlide = { c1, c2, dx, dragCol: at };
      this._colSlideTween.set(0);
      this._colSlideTween.to(1, this._colSlideMs);
    }
    // Returns the index the column ends up at, so a live drag can keep following it without
    // recomputing the same offset-by-one and risking the two drifting apart.
    _reorderCol(from, insertBefore, { silent = false } = {}) {
      if (insertBefore === from || insertBefore === from + 1) return from;
      this._commitEdit();
      const at = insertBefore > from ? insertBefore - 1 : insertBefore;
      const reorder = (arr) => {
        const copy = [...arr];
        copy.splice(at, 0, copy.splice(from, 1)[0]);
        return copy;
      };
      const n = this._columns.length;
      this._columns = reorder(this._columns);
      this._columnLabels = reorder(this._columnLabels);
      this._columnAligns = reorder(this._columnAligns);
      this._columnHeaderAligns = reorder(this._columnHeaderAligns);
      this._columnWidths = reorder(this._columnWidths);
      this._columnRenderers = reorder(this._columnRenderers);
      const indexMap = /* @__PURE__ */ new Map();
      for (let i = 0; i < n; i++) {
        if (i === from) indexMap.set(i, at);
        else if (insertBefore > from && i > from && i <= at) indexMap.set(i, i - 1);
        else if (insertBefore < from && i >= at && i < from) indexMap.set(i, i + 1);
        else indexMap.set(i, i);
      }
      if (this._sel) {
        const rc = (c) => indexMap.get(c) ?? c;
        if (this._sel.type === "single") {
          this._sel = { ...this._sel, col: rc(this._sel.col) };
        } else {
          const { r1, c1, r2, c2 } = this._sel;
          this._sel = { type: "range", ...this._normRange(r1, rc(c1), r2, rc(c2)) };
        }
      }
      this._updateA11yHeader();
      this._updateA11yCell();
      if (!silent) this._opts.onColumnReorder?.([...this._columns]);
      return at;
    }
    // Row Drag Reorder (opts.rowReorder)
    //
    // Column reorder above is cheap because columns are metadata already resident in memory —
    // row data isn't, under normal server-paged virtualization (DataManager only ever holds a
    // handful of cached chunks). So drag-to-reorder needs the full filtered/sorted row set
    // materialized client-side first, using _scanAllRows()/_applyDisplayFetch(). This is a real
    // cost (one full scan, kept in memory) that only kicks in when a consumer opts in via
    // opts.rowReorder — matching ag-Grid's own row-dragging feature, which likewise requires the
    // client-side row model rather than working against a server-side one.
    // True once materialization has finished and no other installed plugin is claiming the
    // display array instead (row reorder doesn't attempt to reorder within/across an alternate
    // row view — out of scope for this feature).
    _rowReorderReady() {
      return !!this._opts.rowReorder && Array.isArray(this._rowOrderData) && !_JHGrid._plugins.some((p) => p.altRowSource?.(this));
    }
    // Lazy: kicked off (fire-and-forget) the first time a drag is attempted while opts.rowReorder
    // is on (see the row-number-gutter mousedown handler), not eagerly on every boot/reload. A full
    // scan means one fetchData round trip per server page — fine to eat once, on demand, for a
    // consumer who's actually dragging a row; paying it after *every* sort/filter click regardless
    // of whether row-reorder is ever used doesn't scale (a 1,000,000-row grid needs thousands of
    // page fetches just to materialize, turning an ordinary sort click into a multi-minute stall).
    async _materializeRowOrder() {
      if (this._rowOrderScanPending) return;
      this._rowOrderScanPending = true;
      const gen = this._rowOrderGen;
      try {
        const rows = await this._scanAllRows();
        if (this._destroyed || rows === null) return;
        if (gen !== this._rowOrderGen) return;
        if (!this._opts.rowReorder || _JHGrid._plugins.some((p) => p.altRowSource?.(this))) return;
        this._rowOrderData = rows;
        this._applyDisplayFetch(rows);
        this._draw();
      } finally {
        this._rowOrderScanPending = false;
      }
    }
    // Absolute row index (into the materialized array) the dragged row would land at if dropped
    // at screen y — mirrors _calcInsertBefore's column-axis math: locate the row under y via the
    // row layout, then round to whichever side of it (before/after) y is closer to.
    _calcRowInsertBefore(y, geo = this._geo()) {
      const relY = y - geo.headerH + this._scrollTop;
      const maxRow = this._rowPlan.serverVisible - 1;
      if (maxRow < 0 || relY <= 0) return 0;
      const row = this._rowLayout.rowAt(relY, maxRow);
      if (row < 0) return this._rowPlan.serverVisible;
      const rowTop = this._rowLayout.yOf(row);
      const rowH = this._rowLayout.heightOf(row);
      return relY - rowTop < rowH / 2 ? row : row + 1;
    }
    // Splices the materialized row array in place, then reuses _rebuildDisplayFetch to discard
    // row-indexed transient state (edits, selection, undo history) — reordering shifts
    // every row between `from` and the drop point, the same way a sort change does.
    _reorderRow(from, insertBefore) {
      if (!this._rowOrderData || insertBefore === from || insertBefore === from + 1) return;
      const at = insertBefore > from ? insertBefore - 1 : insertBefore;
      let moved;
      const proceeded = this._rebuildDisplayFetch(() => {
        [moved] = this._rowOrderData.splice(from, 1);
        this._rowOrderData.splice(at, 0, moved);
        return this._rowOrderData;
      });
      if (!proceeded) return;
      this._opts.onRowReorder?.(from, at, moved);
      this._announce(this._i18n.rowReorderAnnounce(from + 1, at + 1));
    }
    // Filter / Sort
    _filterState() {
      return {
        sorts: [...this._sorts],
        filters: Object.fromEntries(this._filters),
        // '' when inactive — always present so fetchData/fetchMeta implementations can rely on
        // the key existing rather than checking for undefined.
        quickFilter: this._quickFilter
      };
    }
    // Row-index-keyed state belonging to rows added via addRow(), re-keyed to each row's position
    // *within the local block* so it can survive a reload that changes how many server rows precede
    // it. Server-row entries are deliberately left out: after a sort or filter the same index refers
    // to a different record, so carrying them over would apply them to the wrong data.
    _snapshotLocalRowState() {
      if (this._localRows.length === 0) return null;
      const byCell = (map) => {
        const out = [];
        map.forEach((v, k) => {
          const u = k.indexOf("_");
          const i = this._localIndexAt(Number(k.slice(0, u)));
          if (i >= 0) out.push([i, k.slice(u + 1), v]);
        });
        return out;
      };
      const heights = [];
      this._rowLayout.snapshotOverrides().forEach((h, r) => {
        const i = this._localIndexAt(r);
        if (i >= 0) heights.push([i, h]);
      });
      return { edits: byCell(this._edits), invalid: byCell(this._validator.map), heights };
    }
    // Re-attaches what _snapshotLocalRowState kept, once the plan reflects the new result set.
    _restoreLocalRowState() {
      const carried = this._pendingLocalState;
      this._pendingLocalState = null;
      if (!carried) return;
      const visual = (i) => this._rowPlan.visualOfLocal(i);
      for (const [i, field, v] of carried.edits) {
        this._edits.set(`${visual(i)}_${field}`, v);
        this._editedRows.add(visual(i));
      }
      for (const [i, field, v] of carried.invalid) {
        this._validator.map.set(`${visual(i)}_${field}`, v);
      }
      if (carried.heights.length > 0) {
        const overrides = this._rowLayout.snapshotOverrides();
        for (const [i, h] of carried.heights) overrides.set(visual(i), h);
        this._rowLayout.restoreOverrides(overrides);
      }
    }
    // Refetches under the current sort/filter state. Resolves once the new data is in, so callers
    // that have work to do afterwards can wait for it; `null` means the user declined and nothing
    // happened.
    //
    // `confirmUnsaved: false` and `carryRows: false` are for setState(), which is replacing this
    // work wholesale from a snapshot — asking to approve the loss of edits it is about to overwrite
    // would be a prompt about nothing, and carrying rows across only to discard them a moment later
    // is the same waste in a different place.
    _reloadFiltered({ confirmUnsaved = true, carryRows = true } = {}) {
      if (confirmUnsaved) {
        let serverEdits = 0;
        this._edits.forEach((_, key) => {
          if (this._localIndexAt(Number(key.slice(0, key.indexOf("_")))) < 0) serverEdits++;
        });
        if (serverEdits > 0 && !window.confirm(this._i18n.unsavedEditsWarning)) return null;
      }
      this._pendingLocalState = carryRows ? this._snapshotLocalRowState() : null;
      if (!carryRows) {
        this._localRows.length = 0;
        this._rowPlan.anchors.length = 0;
      }
      const state = this._filterState();
      this._cancelEdit();
      this._closeRowContextMenu();
      this._closeCellContextMenu();
      for (const p of _JHGrid._plugins) p.hideTooltip?.(this);
      this._cellTooltip.style.display = "none";
      this._clearPlugins("rowIndexState");
      this._clearPlugins("altView");
      this._edits.clear();
      this._editedRows.clear();
      this._validator.clear();
      this._rowLayout.clear();
      this._sel = null;
      this._fillDrag = null;
      this._fillPreview = null;
      this._deletedRows.clear();
      this._rowPlan.removed.clear();
      this._rowPlan.detachAnchors();
      this._undoMgr.clear();
      this._editTxn = null;
      this._scrollTop = 0;
      this._page = 0;
      this._emptyEl.style.display = "none";
      this._loadingEl.style.display = "flex";
      this._wrapper.setAttribute("aria-busy", "true");
      this._updateA11yCell();
      this._opts.onSort?.(this._sorts.length > 0 ? [...this._sorts] : null);
      this._opts.onFilter?.(Object.fromEntries(this._filters));
      const tookOver = _JHGrid._plugins.some((p) => p.bootOverride?.(this, state));
      if (tookOver) {
        this._pendingLocalState = null;
        return Promise.resolve();
      }
      this._dm.setFetch((page, size) => this._opts.fetchData(page, size, state));
      return this._boot(state);
    }
    // Where the sweep sits across the loading bars, 0..1, or null to leave them flat.
    //
    // Read from the clock rather than counted per draw, so the band moves at the same speed however
    // often the grid happens to repaint. Null under reduced motion — the bars still say "not here
    // yet", they just stop moving.
    //
    // It also schedules the next frame, because nothing else would: with the scroll settled and no
    // data arriving, the grid has no reason to redraw and the sweep would freeze mid-row. The
    // request stops as soon as a draw finds no loading rows left, so a filled screen costs nothing.
    _skeletonPhase() {
      if (this._reducedMotion) return null;
      const geo = this._geo();
      const first = Math.max(0, this._rowLayout.rowAt(this._scrollTop, this._totalRows - 1));
      const last = Math.min(
        this._totalRows - 1,
        this._rowLayout.rowAt(this._scrollTop + geo.vpH, this._totalRows - 1)
      );
      let loading = false;
      for (let r = first; r <= last; r++) {
        if (this._rowSource(r) == null) {
          loading = true;
          break;
        }
      }
      if (!loading) {
        if (this._skeletonRaf) {
          cancelAnimationFrame(this._skeletonRaf);
          this._skeletonRaf = 0;
        }
        return null;
      }
      if (!this._skeletonRaf) {
        this._skeletonRaf = requestAnimationFrame(() => {
          this._skeletonRaf = 0;
          this._draw();
        });
      }
      return performance.now() % SKELETON_SWEEP_MS / SKELETON_SWEEP_MS;
    }
    // Picks a worker-pool size for a full-table scan. Defaults to navigator.hardwareConcurrency
    // clamped to [2, 8] so low-core machines don't get flooded with concurrent requests while
    // still parallelizing meaningfully. Shared by _scanAllRows; plugins that run their own
    // full-table scan keep their own copy since they live outside this file.
    _colorScanConcurrency() {
      const explicit = this._opts.colorFilterConcurrency;
      if (explicit > 0) return explicit;
      const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency || 4;
      return Math.max(2, Math.min(8, cores));
    }
    // Walks every row currently matching the grid's full active filter state —
    // server-side text filters/sorts via paged fetchData, plus anything an installed plugin
    // filters on client-side (opaque to the server) — invoking `onRows` with each batch of row
    // objects in order. Shared by exportCsv({ full: true }) and exportExcel({ full: true }) so a
    // "full" export reproduces exactly the on-screen filtered set, not just the server's
    // text/sort-filtered superset.
    // `onRows(pageRows, baseIndex)` — `baseIndex` is the absolute row index of `pageRows[0]` (so
    // `baseIndex + i` matches the `_edits`/`getEdits()` row-index numbering) on this default path.
    // A plugin's `forEachFilteredRowOverride` (e.g. the color-filter scan, which delivers one
    // pre-matched batch with no positional meaning left) omits it — callers must treat a missing
    // `baseIndex` as "unsaved edits can't be overlaid onto this batch".
    async _forEachFilteredRow(state, onRows) {
      for (const p of _JHGrid._plugins) {
        if (await p.forEachFilteredRowOverride?.(this, state, onRows)) return;
      }
      const size = this._opts.chunkSize;
      let page = 0;
      while (true) {
        const { rows: pageRows } = await this._opts.fetchData(page, size, state);
        if (!pageRows?.length) break;
        onRows(pageRows, page * size);
        if (pageRows.length < size) break;
        page++;
      }
    }
    // Full-dataset scan (shared by any plugin whose feature needs "every row, once" before
    // building its own in-memory structure on top of it, plus opts.rowReorder)
    // Walks every server page for the current sort/filter state via a bounded-concurrency worker
    // pool, returning every row flattened into one array in page order. Returns null if destroyed
    // mid-scan.
    async _scanAllRows() {
      const state = this._filterState();
      this._loadingEl.textContent = this._i18n.loading;
      const meta = await this._opts.fetchMeta(state);
      if (this._destroyed) return null;
      const total = meta.totalRows;
      const pageSize = Math.max(1, this._opts.colorFilterPageSize || this._opts.chunkSize);
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const buckets = new Array(pageCount);
      let nextPage = 0;
      let completedPages = 0;
      const worker = async () => {
        while (true) {
          if (this._destroyed) return;
          const page = nextPage++;
          if (page >= pageCount) return;
          const { rows } = await this._opts.fetchData(page, pageSize, state);
          if (this._destroyed) return;
          buckets[page] = rows ?? [];
          completedPages++;
          this._loadingEl.textContent = `${this._i18n.loading} ${Math.round(completedPages / pageCount * 100)}%`;
        }
      };
      await Promise.all(Array.from({ length: Math.min(this._colorScanConcurrency(), pageCount) }, worker));
      if (this._destroyed) return null;
      const allRows = [];
      for (const bucket of buckets) {
        if (!bucket) continue;
        for (const row of bucket) allRows.push(row);
      }
      return allRows;
    }
    // Swaps DataManager's fetch to slice an in-memory display array. Virtualization, scroll math,
    // and chunk prefetch are unaffected: DataManager doesn't care whether a "chunk" comes from the
    // network or an array slice. Used by any plugin that flattens its own in-memory structure into
    // a plain row array and hands it here.
    _applyDisplayFetch(display) {
      this._dm.setFetch((p, s) => Promise.resolve({ rows: display.slice(p * s, (p + 1) * s) }));
      this._serverTotal = display.length;
      this._rowPlan.clampAnchors(display.length);
      this._totalRows = display.length + this._localRows.length;
      this._dm.prefetch(0, Math.min(this._opts.chunkSize - 1, this._totalRows - 1));
    }
    // True for synthetic group-header rows contributed by a row-grouping plugin (marked
    // `__group__` on the row data itself) — false for every real data row, always, when no such
    // plugin is installed.
    _isGroupRow(rowIndex) {
      return !!this._dm.getRow(rowIndex)?.__group__;
    }
    // True when (x, cell) lands on a tree row's expand/collapse chevron — unlike _isGroupRow,
    // this is a within-row x-range check (a tree row is real, clickable/editable data outside the
    // chevron), scoped to whichever column has `columnDefs[i].treeColumn: true` and only when that
    // row actually has children to expand. Uses the same NESTED_ROW_INDENT_PX/TREE_CHEVRON_W
    // constants CellRenderers.tree() draws with (Renderer.js) at its *default* indentPx, so the
    // hit-box matches what's on screen as long as the column doesn't override indentPx directly
    // (only reachable via `renderer: CellRenderers.tree({ indentPx: ... })`, not `treeColumn: true`).
    _hitTreeChevron(x, cell, geo) {
      const rowData = this._dm.getRow(cell.row);
      if (!rowData?.__treeHasChildren) return false;
      const field = this._columns[cell.col];
      if (!this._colDefMap.get(field)?.treeColumn) return false;
      const colLeft = this._colLeft(cell.col, geo);
      const indent = (rowData.__treeLevel ?? 0) * NESTED_ROW_INDENT_PX;
      return x >= colLeft + indent && x <= colLeft + indent + TREE_CHEVRON_W;
    }
    // Shared by _reorderRow: recomputes the current display array (via `buildDisplay`) and
    // re-applies it. Row-index-keyed state is discarded because reordering shifts every row
    // after the drop point — the same invalidation _reloadFiltered() already performs for
    // sort/filter changes.
    // Returns true if the rebuild proceeded, false if the user cancelled the unsaved-edits confirm
    // below (in which case buildDisplay is never invoked, so callers that mutate state lazily
    // inside it — e.g. _reorderRow's splice — leave that state untouched).
    _rebuildDisplayFetch(buildDisplay) {
      if (this._edits.size > 0) {
        if (!window.confirm(this._i18n.unsavedEditsWarning)) return false;
      }
      this._commitEdit();
      this._setSel(null);
      this._edits.clear();
      this._editedRows.clear();
      this._validator.clear();
      this._clearPlugins("rowIndexState");
      this._rowLayout.clear();
      this._undoMgr.clear();
      const display = buildDisplay();
      this._applyDisplayFetch(display);
      this._clamp(this._geo());
      this._updateA11yHeader();
      this._draw();
      return true;
    }
    // Tag-mode suggestions for a column too varied to enumerate, taken from the rows already in
    // memory. This is what makes the tag filter the default rather than something a host has to
    // opt into with `fetchFilterValues`: the checklist is gone precisely on high-cardinality
    // columns, and those are the ones where picking exact values helps most.
    //
    // Unlike _discoverFilterValues this cannot overflow a distinct-value cap, because the query
    // does the narrowing — only matches are collected, and collection stops at `cap` of them.
    //
    // What it cannot do is see rows that were never fetched. On a million-row grid the caller is
    // looking at a few hundred, so the answer is a sample, not the column's domain — the panel
    // labels the list as such (i18n.filterTagLocalScope) and always keeps the "contains" fallback,
    // which filters server-side and so is not limited to what happens to be cached.
    _suggestFilterValuesLocal(field, query, cap = 50) {
      const q = String(query ?? "").toLowerCase();
      const seen = /* @__PURE__ */ new Set();
      const hit = (val) => {
        const sv = val == null ? "" : String(val);
        if (sv === "" || seen.has(sv)) return true;
        if (!sv.toLowerCase().includes(q)) return true;
        seen.add(sv);
        return seen.size < cap;
      };
      this._dm.forEachLoaded((row) => hit(row?.[field]));
      if (seen.size < cap) {
        for (const row of this._localRows) if (hit(row?.[field]) === false) break;
      }
      return [...seen].sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
    }
    // Distinct values for `field`, discovered from currently loaded/cached rows (same
    // already-in-memory scope as _autoFitCol's measurement pass — no network round trip) plus any
    // local rows added via addRow(). Powers the Set filter's checkbox list. Returns null (and the
    // panel falls back to a plain substring-match text filter) once more than `cap` distinct
    // values are seen — a checkbox list stops being useful well before that, and this keeps the
    // scan bounded regardless of column cardinality.
    _discoverFilterValues(field, cap = 200) {
      if (this._searchModeCols.has(field)) return null;
      const seen = /* @__PURE__ */ new Set();
      let overflow = false;
      const add = (val) => {
        const s = val == null ? "" : String(val);
        if (!seen.has(s)) {
          seen.add(s);
          if (seen.size > cap) {
            overflow = true;
            return false;
          }
        }
        return true;
      };
      this._dm.forEachLoaded((row) => add(row?.[field]));
      if (!overflow) {
        for (const row of this._localRows) if (add(row?.[field]) === false) break;
      }
      if (overflow) return null;
      return [...seen].sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
    }
    _openFilterPanel(col) {
      this._closeFilterPanel();
      const geo = this._geo();
      const field = this._columns[col];
      const label = this._columnLabels[col] ?? field;
      const curFilterVal = this._filters.get(field);
      const curVal = typeof curFilterVal === "string" ? curFilterVal : "";
      let distinctValues = this._discoverFilterValues(field);
      if (distinctValues === null) this._searchModeCols.add(field);
      else if (this._searchModeCols.has(field)) distinctValues = null;
      const selectedValues = Array.isArray(curFilterVal) ? curFilterVal : null;
      const colSortEntry = this._sorts.find((s) => s.field === field);
      const colSortPriority = colSortEntry ? this._sorts.indexOf(colSortEntry) + 1 : 0;
      let panelOptions = {};
      for (const p of _JHGrid._plugins) Object.assign(panelOptions, p.filterPanelOptions?.(this, field, col));
      const { swatchColors = [], activeColor } = panelOptions;
      const allowExtraSorts = _JHGrid._plugins.some((p) => p.extraSortSlots);
      const closeAndFocus = () => {
        this._closeFilterPanel();
        this._kbProxy.focus();
      };
      this._wrapper.style.overflow = "visible";
      const wrapperTop = this._wrapper.getBoundingClientRect().top;
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = viewportH - wrapperTop - geo.headerH - 8;
      const spaceAbove = wrapperTop - 8;
      const PANEL_MIN_USABLE = 260;
      const openUpward = spaceBelow < PANEL_MIN_USABLE && spaceAbove > spaceBelow;
      const maxPanelHeight = openUpward ? spaceAbove : spaceBelow;
      const el = buildFilterPanelEl({
        colLeft: this._colLeft(col, geo),
        headerH: geo.headerH,
        wrapperHeight: this._opts.height,
        openUpward,
        width: this._opts.width,
        maxPanelHeight,
        label,
        curVal,
        sortPriority: colSortPriority,
        asc: colSortEntry?.dir === "asc",
        desc: colSortEntry?.dir === "desc",
        filterId: `jhgrid-${this._uid}-filter`,
        multiSortEnabled: allowExtraSorts,
        swatchColors,
        activeColor,
        distinctValues,
        selectedValues,
        // Tag mode, on columns the local scan could not enumerate. Bound to this column and
        // normalised to strings here so the panel never has to know about the host's shapes.
        //
        // Always present. `fetchFilterValues` asks the server and so sees the whole column; without
        // it the loaded rows answer instead. That used to fall through to a plain search box, which
        // made the tag filter something a host had to build before it could use — the panel would
        // silently offer less on exactly the columns it was written for. A sampled list is worth
        // more than no list, provided it says it is sampled: `suggestScope` tells the panel which
        // of the two it got, and only the local one gets labelled.
        suggest: this._opts.fetchFilterValues ? async (query) => {
          const out = await this._opts.fetchFilterValues(field, query);
          return Array.isArray(out) ? out.map((v) => v == null ? "" : String(v)) : [];
        } : (query) => this._suggestFilterValuesLocal(field, query),
        suggestScope: this._opts.fetchFilterValues ? "remote" : "local",
        tagValues: selectedValues,
        containsValue: curVal,
        minQueryChars: this._opts.filterValueMinChars,
        i18n: this._i18n,
        theme: this._opts.theme,
        onClose: closeAndFocus,
        onSort: (dir, addToMultiSort) => {
          const existing = this._sorts.findIndex((s) => s.field === field);
          if (addToMultiSort && allowExtraSorts) {
            if (existing >= 0) this._sorts[existing] = { field, dir };
            else this._sorts.push({ field, dir });
          } else {
            this._sorts = [{ field, dir }];
          }
          this._reloadFiltered();
          closeAndFocus();
          this._announce(this._i18n.sortAppliedAnnounce(label, dir));
        },
        onApply: (val) => {
          this._trivialSetFilters.delete(field);
          if (val) this._filters.set(field, val);
          else this._filters.delete(field);
          this._reloadFiltered();
          closeAndFocus();
          this._announce(val ? this._i18n.filterAppliedAnnounce(label) : this._i18n.filterClearedAnnounce(label));
        },
        // Set filter (checkbox list) apply — `values` is the checked subset of distinctValues.
        // Sent through as-is, even if it's every value or none: the host's fetchData decides how
        // to interpret an "all checked" (functionally unfiltered) or empty (matches nothing) list.
        // Checking every value the panel could enumerate is recorded as trivial (see
        // _trivialSetFilters) purely so the header icon doesn't light up for a filter that excludes
        // nothing — the value list itself is still sent to the host unchanged.
        onApplyValues: (values) => {
          this._filters.set(field, values);
          if (distinctValues && values.length === distinctValues.length) this._trivialSetFilters.add(field);
          else this._trivialSetFilters.delete(field);
          this._reloadFiltered();
          closeAndFocus();
          this._announce(this._i18n.filterAppliedAnnounce(label));
        },
        onColorFilter: (value) => {
          const cleared = _JHGrid._plugins.find((p) => p.toggleFilterValue)?.toggleFilterValue(this, field, value);
          this._reloadFiltered();
          closeAndFocus();
          this._announce(cleared ? this._i18n.filterClearedAnnounce(label) : this._i18n.filterAppliedAnnounce(label));
        },
        onResetCol: () => {
          this._filters.delete(field);
          this._trivialSetFilters.delete(field);
          _JHGrid._plugins.find((p) => p.clearFilterField)?.clearFilterField(this, field);
          this._sorts = this._sorts.filter((s) => s.field !== field);
          this._reloadFiltered();
          closeAndFocus();
          this._announce(this._i18n.filterClearedAnnounce(label));
        },
        onResetAll: () => {
          this._filters.clear();
          this._trivialSetFilters.clear();
          this._clearPlugins("filterState");
          this._sorts = [];
          this._reloadFiltered();
          closeAndFocus();
          this._announce(this._i18n.allFiltersClearedAnnounce);
        }
      });
      this._wrapper.appendChild(el);
      this._filterPanel = { col, el };
      (el.querySelector('input[type="text"]') ?? el.querySelector("input")).focus();
    }
    _closeFilterPanel() {
      if (!this._filterPanel) return;
      this._filterPanel.el.dispatchEvent(new Event("jhg-dispose"));
      this._filterPanel.el.remove();
      this._filterPanel = null;
      this._wrapper.style.overflow = "hidden";
    }
    // opts.colContextMenuItems narrows which of this menu's items ever appear: `false` turns the
    // menu off entirely, an array keeps only the named ones, omitted keeps today's behavior of
    // showing all of them. Valid keys: 'freeze', 'freeze-right', 'visibility', 'insert-left',
    // 'insert-right', 'delete'. 'freeze' covers both the freeze and unfreeze label/action for that
    // slot (state-dependent, like the row menu's delete item), and likewise for 'delete'/'undelete'
    // under 'delete'.
    _colMenuItemAllowed(key) {
      const allowed = this._opts.colContextMenuItems;
      return !Array.isArray(allowed) || allowed.includes(key);
    }
    _openColContextMenu(col, x, y) {
      if (this._opts.colContextMenuItems === false) return;
      this._closeColContextMenu();
      const geo = this._geo();
      const n = this._columns.length;
      const isFrozen = col < geo.frozenCount;
      const isFrozenRight = col >= n - geo.frozenRightCount;
      const field = this._columns[col];
      const isDeleted = this._deletedColumns.has(field);
      const el = buildColumnContextMenuEl({
        x,
        y,
        width: this._opts.width,
        isFrozen,
        isFrozenRight,
        isDeleted,
        i18n: this._i18n,
        theme: this._opts.theme,
        allowedItems: {
          freeze: this._colMenuItemAllowed("freeze"),
          freezeRight: this._colMenuItemAllowed("freeze-right"),
          visibility: this._colMenuItemAllowed("visibility"),
          insertLeft: this._colMenuItemAllowed("insert-left"),
          insertRight: this._colMenuItemAllowed("insert-right"),
          delete: this._colMenuItemAllowed("delete")
        },
        onFreeze: () => {
          this._closeColContextMenu();
          this._opts.frozenCols = isFrozen ? 0 : col + 1;
          this._scrollLeft = 0;
          this._clamp(this._geo());
          this._draw();
          this._kbProxy.focus();
        },
        onFreezeRight: () => {
          this._closeColContextMenu();
          this._opts.frozenColsRight = isFrozenRight ? 0 : n - col;
          this._scrollLeft = 0;
          this._clamp(this._geo());
          this._draw();
          this._kbProxy.focus();
        },
        onVisibility: () => {
          this._closeColContextMenu();
          this._openColChooser(x, y);
        },
        onInsertLeft: () => {
          this._closeColContextMenu();
          this._openNewColumnDialog(col, x, y);
        },
        onInsertRight: () => {
          this._closeColContextMenu();
          this._openNewColumnDialog(col + 1, x, y);
        },
        onDelete: () => {
          this._closeColContextMenu();
          this.deleteColumn(field);
          this._kbProxy.focus();
        },
        onUndelete: () => {
          this._closeColContextMenu();
          this.undeleteColumn(field);
          this._kbProxy.focus();
        },
        onEscape: () => {
          this._closeColContextMenu();
          this._kbProxy.focus();
        }
      });
      if (!el) return;
      this._wrapper.appendChild(el);
      this._colContextMenu = { col, el };
      el.querySelector('[role="menuitem"]').focus();
    }
    _closeColContextMenu() {
      if (!this._colContextMenu) return;
      this._colContextMenu.el.remove();
      this._colContextMenu = null;
    }
    // "Insert column" name-prompt dialog
    _openNewColumnDialog(insertIndex, x, y) {
      this._closeNewColumnDialog();
      const { width: W, height: H, theme } = this._opts;
      const s = (...p) => p.join(";");
      const DIALOG_W = 220;
      const DIALOG_H = 122;
      const dialogX = Math.max(0, Math.min(x, W - DIALOG_W - 4));
      const dialogY = Math.max(0, Math.min(y, H - DIALOG_H - 4));
      const el = document.createElement("div");
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", this._i18n.colInsertTitle);
      el.className = `${CLS.overlay} ${CLS.dialog}`;
      el.style.cssText = s(
        `position:absolute`,
        `left:${dialogX}px`,
        `top:${dialogY}px`,
        `width:${DIALOG_W}px`,
        `background:${themed(theme, "overlayBg")}`,
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        `border-radius:6px`,
        `box-shadow:${themed(theme, "overlayShadow")}`,
        `font-family:${themed(theme, "fontFamily")}`,
        `font-size:${theme.fontSize}px`,
        `color:${themed(theme, "overlayText")}`,
        `z-index:300`,
        `overflow:hidden`,
        `user-select:none`
      );
      const hdr = document.createElement("div");
      hdr.style.cssText = s(
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "padding:8px 12px",
        `background:${themed(theme, "overlayHeaderBg")}`,
        `border-bottom:1px solid ${themed(theme, "overlayDivider")}`
      );
      const title = document.createElement("span");
      title.textContent = this._i18n.colInsertTitle;
      title.style.cssText = `font-weight:600;font-size:12px;color:${themed(theme, "overlayMutedText")};`;
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "\xD7";
      closeBtn.setAttribute("aria-label", this._i18n.colInsertCancel);
      closeBtn.style.cssText = s(
        "background:none",
        "border:none",
        `color:${themed(theme, "overlayMutedText")}`,
        "cursor:pointer",
        "font-size:17px",
        "line-height:1",
        "padding:0 2px"
      );
      closeBtn.addEventListener("click", () => {
        this._closeNewColumnDialog();
        this._kbProxy.focus();
      });
      hdr.append(title, closeBtn);
      const body = document.createElement("div");
      body.style.cssText = "padding:10px 12px 0;";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = this._i18n.colInsertPlaceholder;
      input.className = CLS.editor;
      input.style.cssText = s(
        "width:100%",
        `background:${themed(theme, "overlayBg")}`,
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        "border-radius:4px",
        `color:${themed(theme, "overlayText")}`,
        `font-size:${theme.fontSize}px`,
        "padding:6px 8px",
        "box-sizing:border-box",
        `font-family:${themed(theme, "fontFamily")}`
      );
      body.appendChild(input);
      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;gap:6px;padding:10px 12px;";
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.textContent = this._i18n.colInsertConfirm;
      confirmBtn.className = CLS.btn;
      confirmBtn.style.cssText = s(
        "flex:1",
        "padding:6px 0",
        `background:${themed(theme, "selectionColor")}`,
        `color:${themed(theme, "overlayAccentText")}`,
        "border:none",
        "border-radius:4px",
        "cursor:pointer",
        "font-size:13px",
        "font-weight:600"
      );
      const confirm = () => {
        const trimmed = input.value.trim();
        if (!trimmed) {
          input.focus();
          return;
        }
        const field = `NEW_COL_${this._newColSeq++}`;
        this.addColumn(field, { label: trimmed }, { index: insertIndex });
        this._closeNewColumnDialog();
        this._kbProxy.focus();
      };
      confirmBtn.addEventListener("click", confirm);
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = this._i18n.colInsertCancel;
      cancelBtn.className = CLS.btn;
      cancelBtn.style.cssText = s(
        "flex:1",
        "padding:6px 0",
        `background:${themed(theme, "overlayHeaderBg")}`,
        `color:${themed(theme, "overlayText")}`,
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        "border-radius:4px",
        "cursor:pointer",
        "font-size:13px"
      );
      cancelBtn.addEventListener("click", () => {
        this._closeNewColumnDialog();
        this._kbProxy.focus();
      });
      foot.append(confirmBtn, cancelBtn);
      el.append(hdr, body, foot);
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirm();
        } else if (e.key === "Escape") {
          this._closeNewColumnDialog();
          this._kbProxy.focus();
        }
        e.stopPropagation();
      });
      this._wrapper.appendChild(el);
      this._newColDialog = { el };
      input.focus();
    }
    _closeNewColumnDialog() {
      if (!this._newColDialog) return;
      this._newColDialog.el.remove();
      this._newColDialog = null;
    }
    // Row context menu
    // opts.rowContextMenuItems narrows which of this menu's items ever appear: `false` turns the
    // menu off entirely, an array keeps only the named ones, omitted keeps today's behavior of
    // showing all of them. Valid keys: 'row-insert-above', 'row-insert-below', 'row-insert-top',
    // 'row-insert-bottom', 'row-delete'. The four insert placements are each their own key; every
    // delete-related item (mark/permanent/plain-delete/undelete) is gated by one key, 'row-delete'
    // -- which of those actually renders is row state, not something a host would filter on
    // independently.
    _rowMenuItemAllowed(key) {
      const allowed = this._opts.rowContextMenuItems;
      return !Array.isArray(allowed) || allowed.includes(key);
    }
    _openRowContextMenu(row, x, y) {
      if (this._opts.rowContextMenuItems === false) return;
      this._closeRowContextMenu();
      const isLocal = this._localIndexAt(row) >= 0;
      const isDeleted = this._deletedRows.has(row);
      const theme = this._opts.theme;
      const MENU_W = 170;
      const s = (...parts) => parts.join(";");
      const itemStyle = s(`padding:8px 14px`, `cursor:pointer`);
      const mkItem = (text, action) => {
        const it = document.createElement("div");
        it.setAttribute("role", "menuitem");
        it.setAttribute("tabindex", "0");
        it.textContent = text;
        it.dataset.action = action;
        it.className = CLS.menuItem;
        it.style.cssText = itemStyle;
        it.addEventListener("mouseover", () => {
          it.style.background = themed(theme, "overlayItemHoverBg");
        });
        it.addEventListener("mouseout", () => {
          it.style.background = "";
        });
        it.addEventListener("focus", () => {
          it.style.background = themed(theme, "overlayItemHoverBg");
        });
        it.addEventListener("blur", () => {
          it.style.background = "";
        });
        return it;
      };
      const sep = () => {
        const d = document.createElement("div");
        d.style.cssText = `height:1px;background:${themed(theme, "overlayDivider")};margin:4px 0;`;
        return d;
      };
      const insertItems = [];
      if (this._rowMenuItemAllowed("row-insert-above")) insertItems.push(mkItem(this._i18n.rowInsertAbove, "row-insert-above"));
      if (this._rowMenuItemAllowed("row-insert-below")) insertItems.push(mkItem(this._i18n.rowInsertBelow, "row-insert-below"));
      if (this._rowMenuItemAllowed("row-insert-top")) insertItems.push(mkItem(this._i18n.rowInsertTop, "row-insert-top"));
      if (this._rowMenuItemAllowed("row-insert-bottom")) insertItems.push(mkItem(this._i18n.rowInsertBottom, "row-insert-bottom"));
      const deleteItems = [];
      if (this._rowMenuItemAllowed("row-delete")) {
        if (isDeleted) {
          deleteItems.push(mkItem(this._i18n.rowUndelete, "row-undelete"));
        } else if (isLocal) {
          deleteItems.push(mkItem(this._i18n.rowDelete, "row-delete"));
        } else {
          deleteItems.push(mkItem(this._i18n.rowDeleteMark, "row-delete-mark"));
          deleteItems.push(mkItem(this._i18n.rowDeletePermanent, "row-delete-permanent"));
        }
      }
      if (insertItems.length === 0 && deleteItems.length === 0) return;
      const items = insertItems.length > 0 && deleteItems.length > 0 ? [...insertItems, sep(), ...deleteItems] : [...insertItems, ...deleteItems];
      const ITEM_H = 36;
      const SEP_H = 9;
      const menuH = (items.length - (insertItems.length > 0 && deleteItems.length > 0 ? 1 : 0)) * ITEM_H + (insertItems.length > 0 && deleteItems.length > 0 ? SEP_H : 0) + 8;
      const top = y + menuH <= this._opts.height ? y : Math.max(0, y - menuH);
      const el = document.createElement("div");
      el.setAttribute("role", "menu");
      el.className = `${CLS.overlay} ${CLS.menu}`;
      el.style.cssText = s(
        `position:absolute`,
        `left:${x}px`,
        `top:${top}px`,
        `width:${MENU_W}px`,
        `background:${themed(theme, "overlayBg")}`,
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        `border-radius:6px`,
        `box-shadow:${themed(theme, "overlayMenuShadow")}`,
        `font-family:${themed(theme, "fontFamily")}`,
        `font-size:${theme.fontSize}px`,
        `color:${themed(theme, "overlayText")}`,
        `z-index:200`,
        `overflow:hidden`,
        `user-select:none`,
        `padding:4px 0`
      );
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      el.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (!action) return;
        this._closeRowContextMenu();
        if (action === "row-insert-above") this.addRow({}, { index: row });
        else if (action === "row-insert-below") this.addRow({}, { index: row + 1 });
        else if (action === "row-insert-top") this.addRow({}, { index: 0 });
        else if (action === "row-insert-bottom") this.addRow({});
        else if (action === "row-delete-mark") this.deleteRow(row, { permanent: false });
        else if (action === "row-delete-permanent") this.deleteRow(row, { permanent: true });
        else if (action === "row-delete") this.deleteRow(row);
        else if (action === "row-undelete") this.undeleteRow(row);
        this._kbProxy.focus();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this._closeRowContextMenu();
          this._kbProxy.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          document.activeElement?.click?.();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const menuItems = [...el.querySelectorAll('[role="menuitem"]')];
          const idx = menuItems.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (idx + 1) % menuItems.length : (idx - 1 + menuItems.length) % menuItems.length;
          menuItems[next]?.focus();
        }
        e.stopPropagation();
      });
      el.append(...items);
      this._wrapper.appendChild(el);
      this._rowContextMenu = { row, el };
      items[0].focus();
    }
    _closeRowContextMenu() {
      if (!this._rowContextMenu) return;
      this._rowContextMenu.el.remove();
      this._rowContextMenu = null;
    }
    // opts.cellContextMenuItems narrows which of this menu's items ever appear: `false` turns the
    // menu off entirely, an array keeps only the named ones, omitted keeps every item. Valid keys:
    // 'col-insert-left', 'col-insert-right', 'col-delete', 'row-insert-below', 'row-delete'. A host
    // with its own row add/delete protocol (e.g. one where row changes need a server round-trip
    // rather than applying locally) can drop the row-* keys here without losing the column
    // operations, which stay safe to apply directly since addColumn()/deleteColumn() are ordinary
    // local calls.
    //
    // opts.cellContextMenuExtraItems (see _openCellContextMenu below) is the separate, general
    // extension point for adding items to this same menu rather than just filtering the built-in
    // ones -- unrelated to this filter, and unaffected by it.
    _cellMenuItemAllowed(key) {
      const allowed = this._opts.cellContextMenuItems;
      return !Array.isArray(allowed) || allowed.includes(key);
    }
    // Plain-cell right-click menu: the column-insert/delete and row-insert actions a cell has no
    // other chrome to reach through -- there's no per-cell header to right-click for the column
    // ones, and no row-number gutter click reachable without first landing on one (a user whose
    // mouse is already on the data can do all four from right where it is instead of having to
    // aim for the header or gutter first).
    _openCellContextMenu(row, col, x, y) {
      if (this._opts.cellContextMenuItems === false) return;
      this._closeCellContextMenu();
      const field = this._columns[col];
      const theme = this._opts.theme;
      const MENU_W = 170;
      const s = (...parts) => parts.join(";");
      const itemStyle = s(`padding:8px 14px`, `cursor:pointer`);
      const mkItem = (text, action) => {
        const it = document.createElement("div");
        it.setAttribute("role", "menuitem");
        it.setAttribute("tabindex", "0");
        it.textContent = text;
        it.dataset.action = action;
        it.className = CLS.menuItem;
        it.style.cssText = itemStyle;
        it.addEventListener("mouseover", () => {
          it.style.background = themed(theme, "overlayItemHoverBg");
        });
        it.addEventListener("mouseout", () => {
          it.style.background = "";
        });
        it.addEventListener("focus", () => {
          it.style.background = themed(theme, "overlayItemHoverBg");
        });
        it.addEventListener("blur", () => {
          it.style.background = "";
        });
        return it;
      };
      const sep = () => {
        const d = document.createElement("div");
        d.style.cssText = `height:1px;background:${themed(theme, "overlayDivider")};margin:4px 0;`;
        return d;
      };
      const insertGroup = [];
      if (this._cellMenuItemAllowed("col-insert-left")) insertGroup.push(mkItem(this._i18n.colInsertLeft, "col-insert-left"));
      if (this._cellMenuItemAllowed("col-insert-right")) insertGroup.push(mkItem(this._i18n.colInsertRight, "col-insert-right"));
      const deleteGroup = this._cellMenuItemAllowed("col-delete") ? [mkItem(this._i18n.colDelete, "col-delete")] : [];
      const rowGroup = [];
      if (this._cellMenuItemAllowed("row-insert-below")) rowGroup.push(mkItem(this._i18n.rowInsertBelow, "row-insert-below"));
      if (this._cellMenuItemAllowed("row-delete")) rowGroup.push(mkItem(this._i18n.rowDelete, "row-delete"));
      const rowData = this.getRowData(row);
      const canvasRect = this._canvas.getBoundingClientRect();
      const clientX = canvasRect.left + x;
      const clientY = canvasRect.top + y;
      const extraItems = typeof this._opts.cellContextMenuExtraItems === "function" ? this._opts.cellContextMenuExtraItems({ row, col, field, rowData, clientX, clientY }) || [] : [];
      const extraGroup = extraItems.map((item, i) => {
        const el2 = mkItem(item.label, `extra:${i}`);
        if (item.disabled) {
          el2.setAttribute("aria-disabled", "true");
          el2.style.opacity = "0.5";
          el2.style.pointerEvents = "none";
        }
        return el2;
      });
      const groups = [insertGroup, deleteGroup, rowGroup, extraGroup].filter((g) => g.length > 0);
      if (groups.length === 0) return;
      const items = groups.flatMap((g, i) => i === 0 ? g : [sep(), ...g]);
      const ITEM_H = 36;
      const SEP_H = 9;
      const menuItemCount = groups.reduce((n, g) => n + g.length, 0);
      const sepCount = groups.length - 1;
      const menuH = menuItemCount * ITEM_H + sepCount * SEP_H + 8;
      const top = y + menuH <= this._opts.height ? y : Math.max(0, y - menuH);
      const left = Math.min(x, this._opts.width - MENU_W - 2);
      const el = document.createElement("div");
      el.setAttribute("role", "menu");
      el.className = `${CLS.overlay} ${CLS.menu}`;
      el.style.cssText = s(
        `position:absolute`,
        `left:${left}px`,
        `top:${top}px`,
        `width:${MENU_W}px`,
        `background:${themed(theme, "overlayBg")}`,
        `border:1px solid ${themed(theme, "overlayBorder")}`,
        `border-radius:6px`,
        `box-shadow:${themed(theme, "overlayMenuShadow")}`,
        `font-family:${themed(theme, "fontFamily")}`,
        `font-size:${theme.fontSize}px`,
        `color:${themed(theme, "overlayText")}`,
        `z-index:200`,
        `overflow:hidden`,
        `user-select:none`,
        `padding:4px 0`
      );
      el.addEventListener("mousedown", (e) => e.stopPropagation());
      el.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset?.action;
        if (!action) return;
        if (action === "col-insert-left") {
          this._closeCellContextMenu();
          this._openNewColumnDialog(col, x, y);
          return;
        }
        if (action === "col-insert-right") {
          this._closeCellContextMenu();
          this._openNewColumnDialog(col + 1, x, y);
          return;
        }
        if (action.startsWith("extra:")) {
          this._closeCellContextMenu();
          extraItems[Number(action.slice(6))]?.onClick?.({ row, col, field, rowData, clientX, clientY });
          this._kbProxy.focus();
          return;
        }
        this._closeCellContextMenu();
        if (action === "col-delete") this.deleteColumn(field);
        else if (action === "row-insert-below") this.addRow({}, { index: row + 1 });
        else if (action === "row-delete") this.deleteRow(row);
        this._kbProxy.focus();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this._closeCellContextMenu();
          this._kbProxy.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          document.activeElement?.click?.();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const menuItems = [...el.querySelectorAll('[role="menuitem"]')];
          const idx = menuItems.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (idx + 1) % menuItems.length : (idx - 1 + menuItems.length) % menuItems.length;
          menuItems[next]?.focus();
        }
        e.stopPropagation();
      });
      el.append(...items);
      this._wrapper.appendChild(el);
      this._cellContextMenu = { row, col, el };
      el.querySelector('[role="menuitem"]').focus();
    }
    _closeCellContextMenu() {
      if (!this._cellContextMenu) return;
      this._cellContextMenu.el.remove();
      this._cellContextMenu = null;
    }
    // Column Chooser (visibility dialog)
    _openColChooser(x, y) {
      this._closeColChooser();
      const el = buildColumnChooserEl({
        x,
        y,
        width: this._opts.width,
        height: this._opts.height,
        fields: this._columnOriginalOrder,
        isHidden: (f) => this._hiddenColumns.has(f),
        labelFor: (f) => this._colDefMap.get(f)?.label ?? f,
        groupPathFor: (f) => normalizeGroupPath(this._colDefMap.get(f)?.group),
        i18n: this._i18n,
        theme: this._opts.theme,
        onApply: (pending) => {
          this._withStructuralUndo(() => {
            this._columnOriginalOrder.forEach((f) => {
              const wantVisible = pending.get(f);
              const isVisible = !this._hiddenColumns.has(f);
              if (wantVisible && !isVisible) {
                this._deletedColumns.delete(f);
                this._showColumnInternal(f);
              } else if (!wantVisible && isVisible) this._hideColumnInternal(f);
            });
            this._clamp(this._geo());
            this._updateA11yHeader();
            this._draw();
          });
          this._closeColChooser();
          this._kbProxy.focus();
        },
        onCancel: () => {
          this._closeColChooser();
          this._kbProxy.focus();
        }
      });
      if (!el) return;
      this._wrapper.appendChild(el);
      this._colChooser = { el };
      el.querySelector("button").focus();
    }
    _closeColChooser() {
      if (!this._colChooser) return;
      this._colChooser.el.remove();
      this._colChooser = null;
    }
    // Adjusts (or clears) the active selection after the column at `idx` is spliced out.
    _remapSelForColRemoval(idx) {
      if (!this._sel) return;
      const shift = (c) => c > idx ? c - 1 : c === idx ? -1 : c;
      if (this._sel.type === "single") {
        const nc = shift(this._sel.col);
        this._sel = nc < 0 ? null : { ...this._sel, col: nc };
      } else {
        const nc1 = shift(this._sel.c1);
        const nc2 = shift(this._sel.c2);
        if (nc1 < 0 || nc2 < 0) this._sel = null;
        else if (nc1 === nc2) this._sel = { type: "single", row: this._sel.r1, col: nc1 };
        else this._sel = { type: "range", ...this._normRange(this._sel.r1, nc1, this._sel.r2, nc2) };
      }
    }
    // Removes all recorded edits for `field` (keys are `${row}_${field}`).
    _purgeFieldEdits(field) {
      [...this._edits.keys()].forEach((key) => {
        const u = key.indexOf("_");
        if (key.slice(u + 1) === field) this._edits.delete(key);
      });
      for (const p of _JHGrid._plugins) p.purgeField?.(this, field);
    }
    // Internal hide without triggering full rebuild (batched by chooser apply)
    _hideColumnInternal(field) {
      const idx = this._columns.indexOf(field);
      if (idx === -1) return;
      this._hiddenColumns.set(field, {
        label: this._columnLabels[idx],
        align: this._columnAligns[idx],
        headerAlign: this._columnHeaderAligns[idx],
        width: this._columnWidths[idx],
        renderer: this._columnRenderers[idx]
      });
      const keep = (_, i) => i !== idx;
      this._columns = this._columns.filter(keep);
      this._columnLabels = this._columnLabels.filter(keep);
      this._columnAligns = this._columnAligns.filter(keep);
      this._columnHeaderAligns = this._columnHeaderAligns.filter(keep);
      this._columnWidths = this._columnWidths.filter(keep);
      this._columnRenderers = this._columnRenderers.filter(keep);
      this._remapSelForColRemoval(idx);
    }
    // Internal show without triggering full rebuild
    _showColumnInternal(field) {
      const info = this._hiddenColumns.get(field);
      if (!info) return;
      this._hiddenColumns.delete(field);
      const origIdx = this._columnOriginalOrder.indexOf(field);
      let insertIdx = this._columns.length;
      for (let i = origIdx + 1; i < this._columnOriginalOrder.length; i++) {
        const ni = this._columns.indexOf(this._columnOriginalOrder[i]);
        if (ni !== -1) {
          insertIdx = ni;
          break;
        }
      }
      const splice = (arr, val) => {
        const c = [...arr];
        c.splice(insertIdx, 0, val);
        return c;
      };
      this._columns = splice(this._columns, field);
      this._columnLabels = splice(this._columnLabels, info.label);
      this._columnAligns = splice(this._columnAligns, info.align);
      this._columnHeaderAligns = splice(this._columnHeaderAligns, info.headerAlign);
      this._columnWidths = splice(this._columnWidths, info.width);
      this._columnRenderers = splice(this._columnRenderers, info.renderer);
    }
    // Data Helpers
    _normRange(r1, c1, r2, c2) {
      return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
    }
    // Drag-select auto-scroll: dragging a range selection past the edge of the visible viewport
    // used to just stop -- _hitCell returns null once the pointer is outside the data area, so the
    // selection froze at whatever cell was last under it and the viewport never scrolled to reveal
    // more. DRAG_SCROLL_EDGE is how close to (or past) the edge triggers it; DRAG_SCROLL_STEP is how
    // far each tick moves.
    // Which way (if any) a drag should be auto-scrolling given the pointer's raw position --
    // unlike _hitCellClamped this looks at the *actual* x/y, including well outside the canvas.
    _dragEdgeDir(x, y, geo = this._geo()) {
      const { width: W, height: H } = this._opts;
      const EDGE = 24;
      let dx = 0, dy = 0;
      if (x < geo.frozenWidth + EDGE) dx = -1;
      else if (x > geo.rightX - EDGE) dx = 1;
      if (y < geo.headerH + EDGE) dy = -1;
      else if (y > H - geo.hSB - EDGE) dy = 1;
      return { dx, dy };
    }
    // Extends the in-progress range selection to the cell at (x, y), clamping into the data area so
    // a pointer past the edge still resolves to the nearest edge cell instead of leaving the
    // selection stuck. Shared by the mousemove handler and the auto-scroll timer tick below.
    _extendDragSelection(x, y, geo = this._geo()) {
      const cell = this._hitCellClamped(x, y, geo);
      if (!cell) return;
      const norm = this._normRange(this._selDragStart.row, this._selDragStart.col, cell.row, cell.col);
      const isSingle = norm.r1 === norm.r2 && norm.c1 === norm.c2;
      this._sel = isSingle ? { type: "single", row: norm.r1, col: norm.c1 } : { type: "range", ...norm };
      this._schedDraw();
    }
    _startDragAutoScroll() {
      if (this._dragScrollTimer) return;
      this._dragScrollTimer = setInterval(() => this._dragAutoScrollTick(), 50);
    }
    _stopDragAutoScroll() {
      if (this._dragScrollTimer) {
        clearInterval(this._dragScrollTimer);
        this._dragScrollTimer = null;
      }
      this._dragScrollDir = { dx: 0, dy: 0 };
    }
    _dragAutoScrollTick() {
      const { dx, dy } = this._dragScrollDir;
      if (!dx && !dy || !this._selDragging && !this._fillDrag || !this._dragScrollPos) {
        this._stopDragAutoScroll();
        return;
      }
      const DRAG_SCROLL_STEP = 40;
      const geo = this._geo();
      if (dx) this._scrollLeft += dx * DRAG_SCROLL_STEP;
      if (dy) this._scrollTop += dy * DRAG_SCROLL_STEP;
      this._clamp(geo);
      if (this._selDragging) this._extendDragSelection(this._dragScrollPos.x, this._dragScrollPos.y, this._geo());
      else this._extendFillDrag(this._dragScrollPos.x, this._dragScrollPos.y, this._geo());
    }
    _isEditable(colIndex) {
      if (colIndex < 0 || colIndex >= this._columns.length) return false;
      const field = this._columns[colIndex];
      const colEditable = this._colDefMap.get(field)?.editable;
      if (colEditable !== void 0) return colEditable;
      return this._editableCols === null || this._editableCols.has(field);
    }
    // Index into _localRows for a visual row that is an added row, or -1 if it is a server row.
    _localIndexAt(row) {
      return this._rowPlan.sourceAt(row)?.local ?? -1;
    }
    // The one place that turns a visual row index into the record behind it. Three call sites used
    // to carry a copy of this expression, which is exactly how a translation gets applied in two
    // of them and forgotten in the third.
    _rowSource(row) {
      const src = this._rowPlan.sourceAt(row);
      if (!src) return null;
      return src.local >= 0 ? this._localRows[src.local] ?? null : this._dm.getRow(src.server);
    }
    _cellVal(row, col) {
      const field = this._columns[col];
      const key = `${row}_${field}`;
      if (this._edits.has(key)) return this._edits.get(key);
      const data = this._rowSource(row);
      if (!data) return "";
      const v = data[field];
      return v != null ? String(v) : "";
    }
    _getRow(r) {
      const base = this._rowSource(r);
      if (!this._editedRows.has(r)) return base;
      const merged = base ? { ...base } : {};
      this._columns.forEach((field) => {
        const key = `${r}_${field}`;
        if (this._edits.has(key)) merged[field] = this._edits.get(key);
      });
      return merged;
    }
    // Cell Editing
    // True for a column whose editor is the plain, no-frills `CellEditors.text` -- the only one
    // that reuses the always-focused keyboard proxy (see _kbProxy). Dropdown/date/checkbox/custom
    // editors keep creating their own disposable element, exactly as before.
    _isPlainTextEditor(col) {
      const colDef = this._colDefMap.get(this._columns[col]);
      return !colDef?.editor && (colDef?.type ?? "text") === "text";
    }
    // Dispatches to a `CellEditors` factory (or a custom `colDef.editor` function) — mirrors
    // the `columnRenderers`/`CellRenderers` dispatch below (_reload / addColumn / deleteColumn),
    // just on the edit side. `checkbox`/`button` stay special-cased: they're one-shot actions
    // triggered from mousedown/keydown directly, not a text-editing session.
    //
    // `keepInputValue` is for the one caller that already has the right value sitting in
    // _kbProxy — the keyboard proxy's own `input` listener, promoting a composition/keystroke
    // already in flight into a visible editor. Setting `.value` there would stomp whatever the
    // IME is still composing.
    _startEdit(row, col, initialValue = void 0, { keepInputValue = false } = {}) {
      if (!this._isEditable(col)) return;
      if (this._editing) this._commitEdit();
      const field = this._columns[col];
      const colDef = this._colDefMap.get(field);
      const colType = colDef?.type ?? "text";
      if (colType === "checkbox") {
        return;
      }
      if (colType === "button") {
        return;
      }
      const ctx = this._buildEditorCtx(row, col, initialValue);
      ctx.keepInputValue = keepInputValue;
      const editorDef = colDef?.editor;
      let el;
      if (typeof editorDef === "function") {
        el = editorDef(ctx);
      } else {
        const key = editorDef ?? colType;
        const needsMultiline = key === "text" && !keepInputValue && String(ctx.initialValue ?? "").includes("\n");
        const factory = needsMultiline ? CellEditors.textMultiline : CellEditors[key] ?? CellEditors.text;
        const colOpts = key === "dropdown" || key === "multiselect" ? { options: colDef?.options ?? [], ...colDef?.editorOptions ?? {} } : key === "date" ? { format: colDef?.format, ...colDef?.editorOptions ?? {} } : colDef?.editorOptions ?? {};
        el = factory(colOpts)(ctx);
      }
      if (!el) return;
      this._editing = { row, col, el };
    }
    // Shared by _startEdit and _startDropdownEdit (the latter is also entered directly from a
    // single click/tap on an already-selected dropdown/multiselect cell — see _bind()'s
    // mousedown/touch handlers) — builds the geometry/callback context every `CellEditors` factory receives.
    _buildEditorCtx(row, col, initialValue) {
      const { theme } = this._opts;
      const geo = this._geo();
      const { colPositions, headerH } = geo;
      const colW = colPositions[col + 1] - colPositions[col];
      const rowH = this._rowLayout.yOf(row + 1) - this._rowLayout.yOf(row);
      const x = this._colLeft(col, geo);
      const y = this._rowLayout.yOf(row) - this._scrollTop + headerH;
      return {
        row,
        col,
        field: this._columns[col],
        rowData: this._getRow(row),
        x,
        y,
        colW,
        rowH,
        wrapper: this._wrapper,
        kbProxy: this._kbProxy,
        theme,
        i18n: this._i18n,
        columnLabel: this._columnLabels[col] ?? this._columns[col],
        initialValue: initialValue !== void 0 ? initialValue : this._cellVal(row, col),
        commit: () => this._commitEdit(),
        cancel: () => this._cancelEdit(),
        insertLineBreak: () => this._insertLineBreakInEdit(),
        moveSel: (dr, dc) => this._moveSel(dr, dc),
        focusWrapper: () => this._kbProxy.focus(),
        // Called by dropdown/multiselect's outside-click handler when the "outside" click
        // actually landed back on the cell being edited — marks that this._sel's upcoming
        // "already-selected, single click → reopen" branch (see _bind()'s mousedown handler)
        // should skip reopening, so a click on an open popup's own cell closes it (toggle)
        // instead of instantly reopening it.
        suppressReopen: () => {
          this._suppressReopenCell = { row, col };
        }
      };
    }
    _toggleCheckbox(row, col) {
      const field = this._columns[col];
      const cur = this._cellVal(row, col);
      const isChecked = cur === "true" || cur === "1" || cur === "Y" || cur === "yes";
      const newVal = isChecked ? "false" : "true";
      this._editTxnBegin();
      this._setEdit(row, field, newVal);
      this._editTxnCommit();
      this._updateA11yCell();
      this._draw();
    }
    // 버튼 셀 클릭/활성화(Space·Enter·F2) 처리. disabled(rowData, row)가 true를
    // 반환하면 onClick을 호출하지 않는다. 데이터 편집이 아니므로 editableCols와
    // 무관하게 동작하고 undo/redo 히스토리에도 관여하지 않는다.
    _fireButtonClick(row, col) {
      const field = this._columns[col];
      const def = this._colDefMap.get(field)?.button;
      if (!def?.onClick) return;
      const rowData = this._getRow(row);
      const isDisabled = typeof def.disabled === "function" ? !!def.disabled(rowData, row) : !!def.disabled;
      if (isDisabled) return;
      try {
        def.onClick(row, rowData, field);
      } catch (err) {
        console.error("[JHGrid] button onClick error at row", row, "field", field, ":", err);
      }
    }
    // True for a single-cell selection sitting on a `type: 'button'` column —
    // used to suppress the blue selection border/fill-handle (see _draw()),
    // since a button is an action target, not a "selected" data cell.
    _isButtonCell(sel) {
      if (!sel || sel.type !== "single") return false;
      return this._colDefMap.get(this._columns[sel.col])?.type === "button";
    }
    // Entered directly (bypassing _startEdit) from a single click/tap on an already-selected
    // dropdown/multiselect cell — see _bind()'s mousedown/touch handlers. _startEdit's own
    // dispatch reaches the same `CellEditors` factories via `colType === 'dropdown'/'multiselect'`.
    _startDropdownEdit(row, col, colDef) {
      const factory = CellEditors[colDef?.type] ?? CellEditors.dropdown;
      const colOpts = { options: colDef?.options ?? [], ...colDef?.editorOptions ?? {} };
      const ctx = this._buildEditorCtx(row, col);
      const el = factory(colOpts)(ctx);
      if (!el) return;
      this._editing = { row, col, el };
    }
    // What _kbProxy's overridden .remove() actually does -- puts it back to its resting state
    // (hidden, empty, no editor-session listeners) instead of tearing it out of the DOM, since it
    // needs to stay put and keep holding keyboard focus for the next cell selection.
    _resetKbProxy() {
      const input = this._kbProxy;
      if (input._jhEditorBlur) {
        input.removeEventListener("blur", input._jhEditorBlur);
        input._jhEditorBlur = null;
      }
      if (input._jhEditorKeydown) {
        input.removeEventListener("keydown", input._jhEditorKeydown);
        input._jhEditorKeydown = null;
      }
      input.value = "";
      input.setAttribute("aria-label", this._opts.ariaLabel ?? this._i18n.ariaGrid);
      input.className = "";
      input.style.cssText = KB_PROXY_IDLE_CSS;
      this._syncKbProxyPosition();
    }
    // Keeps _kbProxy's position/size tracking the selected cell even while merely invisible (not
    // actively editing) -- not cosmetic. See KB_PROXY_IDLE_CSS: some IME engines need the focused
    // element to have a real, current bounding rect to place a composition against, and simply
    // don't compose at all otherwise. Called every _draw(), which already runs on every selection
    // change, so this never lags behind by more than a frame.
    _syncKbProxyPosition() {
      if (this._editing) return;
      if (!this._sel || this._sel.type !== "single") return;
      const { row, col } = this._sel;
      const geo = this._geo();
      const colW = geo.colPositions[col + 1] - geo.colPositions[col];
      const rowH = this._rowLayout.yOf(row + 1) - this._rowLayout.yOf(row);
      const x = this._colLeft(col, geo);
      const y = this._rowLayout.yOf(row) - this._scrollTop + geo.headerH;
      Object.assign(this._kbProxy.style, {
        left: x + "px",
        top: y + "px",
        width: colW + "px",
        height: rowH + "px"
      });
    }
    _commitEdit() {
      if (!this._editing) return;
      const { row, col, el } = this._editing;
      const value = el.value;
      const field = this._columns[col];
      this._editTxnBegin();
      this._setEdit(row, field, value);
      this._editTxnCommit();
      this._editing = null;
      el.remove();
      this._updateA11yCell();
      const errorMsg = this._validator.map.get(`${row}_${field}`);
      if (errorMsg) this._announce(errorMsg);
      this._draw();
    }
    _cancelEdit() {
      if (!this._editing) return;
      const el = this._editing.el;
      this._editing = null;
      el.remove();
      this._draw();
    }
    // Alt+Enter (see CellEditors.text's keydown handler): the same "line break inside the cell,
    // don't commit" convention Excel uses. A single-line <input> can't hold a \n at all -- typing
    // one is what CellEditors.textMultiline exists for -- so this splices it in at the caret and
    // restarts editing there, carrying over whatever was already typed instead of losing it.
    // (CellEditors.textMultiline never calls this itself: its own <textarea> already accepts Alt+Enter
    // natively, no swap needed.)
    _insertLineBreakInEdit() {
      if (!this._editing) return;
      const { row, col, el } = this._editing;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const value = el.value.slice(0, start) + "\n" + el.value.slice(end);
      this._editing = null;
      el.remove();
      this._startEdit(row, col, value);
      this._editing?.el.setSelectionRange(start + 1, start + 1);
    }
    _setSel(newSel) {
      this._sel = newSel;
      this._opts.onSelectionChange?.(newSel);
    }
    _moveSel(dr, dc) {
      const cur = this._sel;
      if (!cur) return;
      const row = (cur.type === "single" ? cur.row : cur.r1) + dr;
      const col = (cur.type === "single" ? cur.col : cur.c1) + dc;
      const { start: pageStart, rows: pageRows } = this._pageBounds();
      const nr = Math.max(pageStart, Math.min(pageStart + pageRows - 1, row));
      const nc = Math.max(0, Math.min(this._columns.length - 1, col));
      this._setSel({ type: "single", row: nr, col: nc });
      this._ensureVisible(nr, nc);
      this._updateA11yCell();
      this._announce(this._i18n.announceCell(nr + 1, this._columnLabels[nc] ?? this._columns[nc], this._cellVal(nr, nc) || this._i18n.emptyCell));
      this._draw();
    }
    // The actual selection algorithm lives in core/RowSelection.js's `update`/`clearOnCellClick`
    // hooks. These two stay as thin wrappers (rather than rewriting every _bind() call site into
    // a hook call directly) since they're invoked from ~10 places throughout the click/keyboard
    // dispatch below.
    _updateRowSel(rowIndex, ctrl, shift) {
      _JHGrid._plugin("rowSelection")?.update(this, rowIndex, ctrl, shift);
    }
    _clearRowSelOnCellClick(e) {
      _JHGrid._plugin("rowSelection")?.clearOnCellClick(this, e);
    }
    // Column-header click → select the entire column (every loaded row), Excel-style. Shift-click
    // extends from the last-clicked header column to this one, covering every column in between --
    // still one rectangular range, same as the rest of `_sel`, so copy/paste/fill keep working
    // unchanged. There is no ctrl-click "add a second, non-contiguous column" here: `_sel` only ever
    // holds one rectangle, and giving header clicks a multi-rectangle model that the rest of
    // selection doesn't have would make the two disagree about what's selected.
    _updateColSel(col, shiftKey) {
      if (this._totalRows === 0) return;
      const lastRow = this._totalRows - 1;
      const anchorCol = shiftKey && this._selAnchor ? this._selAnchor.col : col;
      if (!shiftKey || !this._selAnchor) this._selAnchor = { row: 0, col };
      _JHGrid._plugin("rowSelection")?.clear(this);
      const norm = this._normRange(0, anchorCol, lastRow, col);
      this._setSel(norm.r1 === norm.r2 && norm.c1 === norm.c2 ? { type: "single", row: norm.r1, col: norm.c1 } : { type: "range", ...norm });
      this._ensureColVisible(col);
      this._updateA11yCell();
    }
    // Horizontal half of _ensureVisible, standalone -- see _updateColSel for why the vertical half
    // (which would drag the viewport down to whatever row is passed in) doesn't apply here.
    _ensureColVisible(col) {
      const geo = this._geo();
      const { frozenCount, frozenRightCount, colPositions } = geo;
      const n = this._columns.length;
      if (col >= frozenCount && col < n - frozenRightCount) {
        const absLeft = colPositions[col] - colPositions[frozenCount];
        const colW = colPositions[col + 1] - colPositions[col];
        if (absLeft < this._scrollLeft) this._scrollLeft = absLeft;
        if (absLeft + colW > this._scrollLeft + geo.vpW) this._scrollLeft = absLeft + colW - geo.vpW;
      }
      this._clamp(geo);
    }
    _extendSel(dr, dc) {
      if (!this._sel) return;
      if (!this._selAnchor) {
        this._selAnchor = this._sel.type === "single" ? { row: this._sel.row, col: this._sel.col } : { row: this._sel.r1, col: this._sel.c1 };
      }
      const anchor = this._selAnchor;
      let ar, ac;
      if (this._sel.type === "single") {
        ar = this._sel.row;
        ac = this._sel.col;
      } else {
        ar = anchor.row === this._sel.r1 ? this._sel.r2 : this._sel.r1;
        ac = anchor.col === this._sel.c1 ? this._sel.c2 : this._sel.c1;
      }
      ar = Math.max(0, Math.min(this._totalRows - 1, ar + dr));
      ac = Math.max(0, Math.min(this._columns.length - 1, ac + dc));
      const norm = this._normRange(anchor.row, anchor.col, ar, ac);
      this._setSel(norm.r1 === norm.r2 && norm.c1 === norm.c2 ? { type: "single", row: norm.r1, col: norm.c1 } : { type: "range", ...norm });
      this._ensureVisible(ar, ac);
      this._updateA11yCell();
      this._draw();
    }
    _clearSelection() {
      if (!this._sel) return;
      const pairs = this._sel.type === "single" ? [[this._sel.row, this._sel.col]] : Array.from(
        { length: this._sel.r2 - this._sel.r1 + 1 },
        (_, ri) => Array.from(
          { length: this._sel.c2 - this._sel.c1 + 1 },
          (_2, ci) => [this._sel.r1 + ri, this._sel.c1 + ci]
        )
      ).flat();
      this._editTxnBegin();
      pairs.forEach(([r, c]) => {
        if (!this._isEditable(c)) return;
        const field = this._columns[c];
        this._setEdit(r, field, "");
      });
      this._editTxnCommit();
      this._draw();
    }
    // The bounding box Excel's own Ctrl+A ("current region") stops at, rather than sweeping in
    // whatever fully-blank padding rows/columns the grid happens to carry (e.g. change-grid.js pads
    // a fresh sheet with blank rows to fill the visible height; a row or column an author left empty
    // is the same shape of case). Excel's current region isn't "trim the blank edges of the whole
    // sheet" -- it grows outward from the active cell and stops the moment it would cross a row or
    // column that's entirely blank, so a blank row or column sitting in the *middle* of the data is a
    // hard boundary: whatever is past it is excluded even though it holds real data, unless the
    // active cell is already on that side of it. `anchorRow`/`anchorCol` is that active cell.
    //
    // Only trims past a row/column once it's *confirmed* blank -- `_getRow()` returning null means
    // that row hasn't loaded yet (a server-paginated grid's unfetched tail), and guessing it's empty
    // would silently exclude real data the grid just hasn't seen. Unknown is left in rather than
    // assumed blank, on both axes.
    _usedRange(anchorRow = 0, anchorCol = 0) {
      const totalRows = this._totalRows;
      const nCols = this._columns.length;
      if (totalRows === 0 || nCols === 0) return { r1: 0, r2: totalRows - 1, c1: 0, c2: nCols - 1 };
      const isEmpty = (v) => v == null || v === "";
      let tailR2 = totalRows - 1;
      while (tailR2 > 0) {
        const row = this._getRow(tailR2);
        if (row == null || !this._columns.every((f) => isEmpty(row[f]))) break;
        tailR2--;
      }
      const hasData = new Array(nCols).fill(false);
      let loadedCount = 0;
      let nearestBlankAbove = -1;
      let nearestBlankBelow = Infinity;
      const visit = (visualRow) => {
        if (visualRow == null || visualRow < 0 || visualRow > tailR2) return;
        const row = this._getRow(visualRow);
        if (row == null) return;
        loadedCount++;
        let rowBlank = true;
        for (let c = 0; c < nCols; c++) {
          if (isEmpty(row[this._columns[c]])) continue;
          rowBlank = false;
          if (!hasData[c]) hasData[c] = true;
        }
        if (rowBlank && visualRow !== anchorRow) {
          if (visualRow < anchorRow && visualRow > nearestBlankAbove) nearestBlankAbove = visualRow;
          if (visualRow > anchorRow && visualRow < nearestBlankBelow) nearestBlankBelow = visualRow;
        }
      };
      this._dm.forEachLoaded((_row, serverIndex) => visit(this._rowPlan.visualOfServer(serverIndex)));
      this._localRows.forEach((_row, i) => visit(this._rowPlan.visualOfLocal(i)));
      let r1 = 0, r2 = tailR2, c1 = 0, c2 = nCols - 1;
      if (loadedCount > 0) {
        if (nearestBlankBelow < Infinity) r2 = Math.min(r2, nearestBlankBelow - 1);
        if (nearestBlankAbove > -1) r1 = nearestBlankAbove + 1;
        c1 = c2 = anchorCol;
        if (nCols > 1) {
          while (c2 + 1 < nCols && hasData[c2 + 1]) c2++;
          while (c1 - 1 >= 0 && hasData[c1 - 1]) c1--;
        }
      }
      return { r1, r2, c1, c2 };
    }
    _ensureVisible(row, col) {
      const geo = this._geo();
      const { frozenCount, frozenRightCount, colPositions } = geo;
      const n = this._columns.length;
      const top = this._rowLayout.yOf(row);
      const rowH = this._rowLayout.heightOf(row);
      if (top < this._scrollTop) this._scrollTop = top;
      if (top + rowH > this._scrollTop + geo.vpH) this._scrollTop = top + rowH - geo.vpH;
      if (col >= frozenCount && col < n - frozenRightCount) {
        const absLeft = colPositions[col] - colPositions[frozenCount];
        const colW = colPositions[col + 1] - colPositions[col];
        if (absLeft < this._scrollLeft) this._scrollLeft = absLeft;
        if (absLeft + colW > this._scrollLeft + geo.vpW) this._scrollLeft = absLeft + colW - geo.vpW;
      }
      this._clamp(geo);
    }
    // Undo / Redo
    _pushUndoCmd(cmd) {
      this._undoMgr.push(cmd);
    }
    // Coarse whole-state snapshot used by structural mutations (row/column
    // add/delete) — these already shift _edits/_sel/etc. in
    // intricate ways, so restoring a full before/after snapshot is far less
    // error-prone than hand-writing an inverse for each shift. Installed plugins that own their
    // own structural state (row selection, today) contribute to the snapshot via an optional
    // `snapshotStructural`/`restoreStructural` hook pair, rather than this method needing to know
    // about each one directly.
    _snapshotStructural() {
      const snap = {
        totalRows: this._totalRows,
        serverTotal: this._serverTotal,
        localRows: this._localRows.map((r) => ({ ...r })),
        deletedRows: new Set(this._deletedRows),
        removedServer: this._rowPlan.removed.values(),
        localAnchors: [...this._rowPlan.anchors],
        edits: new Map(this._edits),
        editedRows: new Set(this._editedRows),
        sel: this._sel ? { ...this._sel } : null,
        selAnchor: this._selAnchor ? { ...this._selAnchor } : null,
        columns: [...this._columns],
        columnLabels: [...this._columnLabels],
        columnAligns: [...this._columnAligns],
        columnHeaderAligns: [...this._columnHeaderAligns],
        columnWidths: [...this._columnWidths],
        columnRenderers: [...this._columnRenderers],
        rowHeight: this._opts.rowHeight,
        rowHeightOverrides: this._rowLayout.snapshotOverrides(),
        localColumns: new Map(this._localColumns),
        deletedColumns: new Set(this._deletedColumns),
        colDefMap: new Map(this._colDefMap),
        columnWidthMap: new Map(this._columnWidthMap),
        columnOriginalOrder: [...this._columnOriginalOrder],
        hiddenColumns: new Map(this._hiddenColumns)
      };
      for (const p of _JHGrid._plugins) p.snapshotStructural?.(this, snap);
      return snap;
    }
    _restoreStructural(snap) {
      this._totalRows = snap.totalRows;
      this._serverTotal = snap.serverTotal;
      this._localRows = snap.localRows.map((r) => ({ ...r }));
      this._deletedRows = new Set(snap.deletedRows);
      this._rowPlan.removed.clear();
      this._rowPlan.detachAnchors();
      for (const s of snap.removedServer) this._rowPlan.removed.add(s);
      this._rowPlan.anchors = [...snap.localAnchors];
      this._rowPlan.serverTotal = snap.serverTotal;
      this._edits = new Map(snap.edits);
      this._editedRows = new Set(snap.editedRows);
      this._sel = snap.sel ? { ...snap.sel } : null;
      this._selAnchor = snap.selAnchor ? { ...snap.selAnchor } : null;
      this._columns = [...snap.columns];
      this._columnLabels = [...snap.columnLabels];
      this._columnAligns = [...snap.columnAligns];
      this._columnHeaderAligns = [...snap.columnHeaderAligns];
      this._columnWidths = [...snap.columnWidths];
      this._columnRenderers = [...snap.columnRenderers];
      this._opts.rowHeight = snap.rowHeight;
      this._rowLayout.defaultHeight = snap.rowHeight;
      this._rowLayout.restoreOverrides(snap.rowHeightOverrides);
      this._localColumns = new Map(snap.localColumns);
      this._deletedColumns = new Set(snap.deletedColumns);
      this._colDefMap = new Map(snap.colDefMap);
      this._columnWidthMap = new Map(snap.columnWidthMap);
      this._columnOriginalOrder = [...snap.columnOriginalOrder];
      this._hiddenColumns = new Map(snap.hiddenColumns);
      for (const p of _JHGrid._plugins) p.restoreStructural?.(this, snap);
      this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
      this._wrapper.setAttribute("aria-colcount", String(this._columns.length));
      this._emptyEl.style.display = this._totalRows === 0 ? "flex" : "none";
      this._clamp(this._geo());
      this._updateA11yHeader();
      this._updateA11yCell();
      this._opts.onSelectionChange?.(this._sel);
      this._opts.onRowSelect?.(_JHGrid._plugin("rowSelection")?.getSorted(this) ?? []);
      this._revalidateAllFromEdits();
      this._draw();
    }
    // Wraps a structural mutation (fn) with a before/after snapshot so it becomes
    // a single undo step. Use for row/column add/delete/undelete.
    _withStructuralUndo(fn) {
      const before = this._snapshotStructural();
      const ret = fn();
      this._revalidateAllFromEdits();
      this._draw();
      const after = this._snapshotStructural();
      this._pushUndoCmd({
        undo: () => this._restoreStructural(before),
        redo: () => this._restoreStructural(after)
      });
      return ret;
    }
    // Validation
    // Same resolution order as _cellVal(row, col), but keyed by field name so
    // callers that only have a field (not a column index) don't need a lookup.
    _resolveCellStringValue(row, field) {
      const key = `${row}_${field}`;
      if (this._edits.has(key)) return this._edits.get(key);
      const data = this._rowSource(row);
      if (!data) return "";
      const v = data[field];
      return v != null ? String(v) : "";
    }
    // Re-runs validation for one cell and updates the validator's invalid-cell set.
    _revalidateKey(key) {
      const u = key.indexOf("_");
      const row = Number(key.slice(0, u));
      const field = key.slice(u + 1);
      this._validator.revalidate(row, field, this._resolveCellStringValue(row, field));
    }
    // Rebuilds invalid-cell state from scratch based on the current _edits map —
    // used after any operation that bulk-replaces _edits (structural undo/redo,
    // addRow/deleteRow index shifting) rather than going through _setEdit.
    _revalidateAllFromEdits() {
      const prevInvalid = new Set(this._validator.map.keys());
      this._validator.clear();
      this._edits.forEach((_, key) => this._revalidateKey(key));
      prevInvalid.forEach((key) => {
        if (this._validator.map.has(key)) return;
        const u = key.indexOf("_");
        this._opts.onValidationError?.(Number(key.slice(0, u)), key.slice(u + 1), null);
      });
    }
    // Returns true if no currently tracked cell (edited or, after validateAll(), loaded) fails its
    // column's validation rules.
    isValid() {
      return this._validator.isValid();
    }
    // Returns all currently invalid cells as `{ [rowIndex]: { [field]: message } }`.
    getInvalidCells() {
      return this._validator.getInvalidCells();
    }
    // Re-validates every currently loaded (cached) row plus all locally added rows against each
    // column's `validation` rules, and redraws invalid-cell indicators. Like
    // autoFitColumns()/printGrid(), only rows already loaded into the client cache are checked — rows
    // never scrolled into view aren't fetched just to validate them.
    validateAll() {
      if (this._destroyed) return this.getInvalidCells();
      this._validator.clear();
      const validatedFields = this._columns.filter((f) => this._colDefMap.get(f)?.validation);
      if (validatedFields.length > 0) {
        this._dm.forEachLoaded((_, rowIndex) => {
          validatedFields.forEach((field) => this._revalidateKey(`${rowIndex}_${field}`));
        });
        this._localRows.forEach((_, i) => {
          const r = this._rowPlan.visualOfLocal(i);
          validatedFields.forEach((field) => this._revalidateKey(`${r}_${field}`));
        });
      }
      this._draw();
      return this.getInvalidCells();
    }
    // Cell-edit batching
    // Multiple _setEdit() calls between _editTxnBegin()/_editTxnCommit() collapse
    // into a single undo step (e.g. one paste over a range = one Ctrl+Z).
    _editTxnBegin() {
      this._editTxn = /* @__PURE__ */ new Map();
    }
    _setEdit(row, field, val) {
      const key = `${row}_${field}`;
      let oldValue;
      if (this._edits.has(key)) {
        oldValue = this._edits.get(key);
      } else {
        const v = this._rowSource(row)?.[field];
        oldValue = v != null ? String(v) : "";
      }
      if (this._editTxn && !this._editTxn.has(key)) {
        this._editTxn.set(key, this._edits.has(key) ? { had: true, value: this._edits.get(key) } : { had: false, value: void 0 });
      }
      this._edits.set(key, val);
      this._editedRows.add(row);
      this._opts.onCellChange?.({ row, field, newValue: val, oldValue });
      this._revalidateKey(key);
      this._growRowForMultilineValue(row, val);
    }
    // Excel grows a row's height the moment a cell picks up a line break -- typed (Alt+Enter) or
    // pasted -- regardless of wrap-text setting, because otherwise the value would render fine (see
    // Renderer's per-line draw for a "\n"-bearing cell) but have most of it clipped by a row still
    // sized for one line. Only grows, never shrinks: shrinking back on every edit would fight a user
    // who'd manually made the row taller for a reason unrelated to this one cell's current value.
    _growRowForMultilineValue(row, val) {
      if (typeof val !== "string" || val.indexOf("\n") === -1) return;
      const { fontSize, cellPadding } = this._opts.theme;
      const needed = Math.ceil(val.split("\n").length * fontSize * 1.4 + cellPadding * 2);
      if (needed > this._rowLayout.heightOf(row)) this._rowLayout.setHeight(row, needed);
    }
    // Row-height auto-fit (double-clicking a row-number-gutter boundary — see ev.dblclick). Unlike
    // _growRowForMultilineValue (which only ever grows, in response to a single edit), this is an
    // explicit "fit to current content" action, so it can also shrink a row a user had previously
    // dragged taller than it needs to be. A single-line row fits back to the sheet's own default
    // row height rather than a from-scratch fontSize*1.4 estimate — the two aren't necessarily the
    // same number (a host can set opts.rowHeight independently of opts.theme.fontSize), and
    // defaultHeight is the height every other untouched single-line row already renders at, so
    // that's the "no wasted space, nothing clipped" fit for one line. Only once content actually
    // spans more than one line (same "\n"-count basis _growRowForMultilineValue uses) does the fit
    // need to grow past that, using the exact same per-line formula so a row's height agrees
    // whether it got there by typing/pasting a line break or by this explicit auto-fit action.
    _autoFitRow(row) {
      const { fontSize, cellPadding } = this._opts.theme;
      const rowData = this._getRow(row);
      let maxLines = 1;
      if (rowData) {
        this._columns.forEach((field) => {
          const val = rowData[field];
          if (val == null) return;
          const lines = String(val).split("\n").length;
          if (lines > maxLines) maxLines = lines;
        });
      }
      const fitted = maxLines <= 1 ? this._rowLayout.defaultHeight : Math.max(MIN_ROW_H, Math.ceil(maxLines * fontSize * 1.4 + cellPadding * 2));
      this._rowLayout.setHeight(row, fitted);
    }
    // Rows to auto-fit together when a row-boundary double-click lands on/inside a multi-row
    // selection -- mirrors Excel: double-clicking any boundary touching the selection fits every
    // selected row's height, not just the one row whose edge got clicked. Row-header checkbox
    // selection (the rowSelection plugin) wins when present since "these rows are checked" is the
    // more explicit signal; otherwise falls back to the ordinary cell-range selection, which is
    // what Ctrl+A (select-all) produces. Returns null when there's no multi-row selection to widen to.
    _selectedRowsForAutoFit() {
      const rowSel = _JHGrid._plugin("rowSelection")?.getSorted(this);
      if (rowSel && rowSel.length > 1) return new Set(rowSel);
      if (this._sel && this._sel.type === "range") {
        const rows = /* @__PURE__ */ new Set();
        for (let r = this._sel.r1; r <= this._sel.r2; r++) rows.add(r);
        return rows;
      }
      return null;
    }
    _restoreEditSnap(key, snap) {
      if (snap.had) this._edits.set(key, snap.value);
      else this._edits.delete(key);
      const u = key.indexOf("_");
      this._editedRows.add(Number(key.slice(0, u)));
      this._revalidateKey(key);
    }
    _editTxnCommit() {
      const before = this._editTxn;
      this._editTxn = null;
      if (!before || before.size === 0) return;
      const after = /* @__PURE__ */ new Map();
      before.forEach((_, key) => {
        after.set(key, this._edits.has(key) ? { had: true, value: this._edits.get(key) } : { had: false, value: void 0 });
      });
      this._pushUndoCmd({
        undo: () => {
          before.forEach((snap, key) => this._restoreEditSnap(key, snap));
          this._draw();
        },
        redo: () => {
          after.forEach((snap, key) => this._restoreEditSnap(key, snap));
          this._draw();
        }
      });
    }
    // Undoes the last undoable action (cell edit, row/column add/delete). No-op if nothing to undo.
    undo() {
      this._undoMgr.undo();
    }
    // Re-applies the last undone action. No-op if nothing to redo.
    redo() {
      this._undoMgr.redo();
    }
    canUndo() {
      return this._undoMgr.canUndo();
    }
    canRedo() {
      return this._undoMgr.canRedo();
    }
    // Clipboard
    // this._lastCopyMissingRows: rows in the selection whose chunk hasn't loaded read as blank
    // below (_cellVal → _rowSource → DataManager#getRow, a pure cache lookup that never fetches) --
    // silently, unless a caller checks this count and says so. Set here so both the Ctrl+C and
    // native-copy call sites can warn without re-walking the selection themselves.
    // Row-header selection (RowSelection plugin) clears `_sel` on click (see
    // _finalizeStructuralGesture's rowDrag branch) so the cell-range box doesn't linger alongside
    // the row highlight -- but that left Ctrl+C with nothing to read: a row selected by its header,
    // Excel-style, still has to copy as that row's full width. Falls back to the selected-rows set
    // whenever there's no cell-range selection to copy instead.
    _selectedRowsSorted() {
      return _JHGrid._plugin("rowSelection")?.getSorted(this) ?? [];
    }
    _buildCopyText() {
      const rowSel = this._sel ? null : this._selectedRowsSorted();
      if (!this._sel && (!rowSel || rowSel.length === 0)) return "";
      this._lastCopyMissingRows = 0;
      const fmt = (row, col) => {
        const raw = this._cellVal(row, col);
        const def = this._colDefMap.get(this._columns[col]);
        return quoteTsvValue(formatCellForDisplay(raw, def, this._opts.theme.locale));
      };
      if (rowSel) {
        return rowSel.map((row) => {
          if (this._rowSource(row) == null) this._lastCopyMissingRows++;
          return this._columns.map((_, c) => fmt(row, c)).join("	");
        }).join("\n");
      }
      if (this._sel.type === "single") {
        if (this._rowSource(this._sel.row) == null) this._lastCopyMissingRows = 1;
        return fmt(this._sel.row, this._sel.col);
      }
      const { r1, c1, r2, c2 } = this._sel;
      return Array.from({ length: r2 - r1 + 1 }, (_, ri) => {
        const row = r1 + ri;
        if (this._rowSource(row) == null) this._lastCopyMissingRows++;
        return Array.from({ length: c2 - c1 + 1 }, (_2, ci) => fmt(row, c1 + ci)).join("	");
      }).join("\n");
    }
    // Clipboard image paste (Ctrl+V with a screenshot/copied image on the clipboard, rather than
    // cell text) into a `type: 'image'` cell -- see ev.paste and the keydown Ctrl+V handler, the two
    // places clipboard content actually reaches the grid. No other grid clipboard interchange
    // format (Excel's own included) carries images as cell *values* -- Excel itself drops a pasted
    // image as a floating shape, not a cell -- so this only ever targets a column already declared
    // `type: 'image'`; anywhere else the paste falls through to the normal text path and does
    // nothing (there is no text on an image-only clipboard). Returns whether it handled the paste,
    // so callers know whether to still try the text path.
    _pasteImageBlob(blob) {
      if (!this._sel) return false;
      const row = this._sel.type === "single" ? this._sel.row : this._sel.r1;
      const col = this._sel.type === "single" ? this._sel.col : this._sel.c1;
      const field = this._columns[col];
      if (this._colDefMap.get(field)?.type !== "image" || !this._isEditable(col)) return false;
      const prev = this._cellVal(row, col);
      if (this._pastedImageUrls.has(prev)) {
        URL.revokeObjectURL(prev);
        this._pastedImageUrls.delete(prev);
      }
      const url = URL.createObjectURL(blob);
      this._pastedImageUrls.add(url);
      this._editTxnBegin();
      this._setEdit(row, field, url);
      this._editTxnCommit();
      this._draw();
      return true;
    }
    // Ctrl+V via the async Clipboard API (see ev.keydown) -- tries navigator.clipboard.read() first
    // since that's the only way to see an image on the clipboard at all; readText() only ever
    // returns a string and would see nothing there was no text/plain entry to give it. Falls back
    // to the text path whenever read() is unavailable (Safari, non-secure context), finds no image,
    // or the image doesn't land on an image-typed cell.
    async _pasteFromClipboardAsync() {
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (!imgType) continue;
            const blob = await item.getType(imgType);
            if (this._pasteImageBlob(blob)) return;
          }
        } catch {
        }
      }
      if (!navigator.clipboard?.readText) return;
      const text = await navigator.clipboard.readText().catch(() => "");
      if (text) this._applyPaste(text);
    }
    _applyPaste(text) {
      if (!this._sel || !text) return;
      const cells = parsePastedGrid(text.trimEnd());
      const pasteRows = cells.length;
      const pasteCols = Math.max(...cells.map((r) => r.length));
      const startRow = this._sel.type === "single" ? this._sel.row : this._sel.r1;
      const startCol = this._sel.type === "single" ? this._sel.col : this._sel.c1;
      let dropped = 0;
      const writeCell = (r, c, val) => {
        if (r >= this._totalRows || c >= this._columns.length) {
          dropped++;
          return;
        }
        if (!this._isEditable(c)) {
          dropped++;
          return;
        }
        if (this._isGroupRow(r)) return;
        const field = this._columns[c];
        this._setEdit(r, field, val);
      };
      this._editTxnBegin();
      if (pasteRows === 1 && pasteCols === 1 && this._sel.type === "range") {
        const val = cells[0][0];
        for (let r = this._sel.r1; r <= this._sel.r2; r++)
          for (let c = this._sel.c1; c <= this._sel.c2; c++)
            writeCell(r, c, val);
      } else {
        cells.forEach(
          (row, ri) => row.forEach((val, ci) => writeCell(startRow + ri, startCol + ci, val))
        );
      }
      this._editTxnCommit();
      this._draw();
      if (dropped > 0) {
        this._showErrorBanner(this._i18n.pasteTruncated(dropped));
        this._announce(this._i18n.pasteTruncated(dropped));
      }
    }
    // Fill Handle Logic
    _applyFill(srcSel, preview) {
      const srcR1 = srcSel.type === "single" ? srcSel.row : srcSel.r1;
      const srcR2 = srcSel.type === "single" ? srcSel.row : srcSel.r2;
      const srcC1 = srcSel.type === "single" ? srcSel.col : srcSel.c1;
      const srcC2 = srcSel.type === "single" ? srcSel.col : srcSel.c2;
      const { r1: tR1, c1: tC1, r2: tR2, c2: tC2 } = preview;
      const vertical = tR1 > srcR2 || tR2 < srcR1;
      const dir = (vertical ? tR1 > srcR2 : tC1 > srcC2) ? 1 : -1;
      const anchor = vertical ? dir > 0 ? tR1 : tR2 : dir > 0 ? tC1 : tC2;
      const step = (i) => Math.abs(i - anchor) + 1;
      this._editTxnBegin();
      if (vertical) {
        for (let c = srcC1; c <= srcC2; c++) {
          if (!this._isEditable(c)) continue;
          const srcVals = [];
          for (let r = srcR1; r <= srcR2; r++) srcVals.push(this._cellVal(r, c));
          const field = this._columns[c];
          for (let r = anchor; dir > 0 ? r <= tR2 : r >= tR1; r += dir) {
            if (r >= this._totalRows || r < 0) break;
            if (this._isGroupRow(r)) continue;
            this._setEdit(r, field, computeFillValue(srcVals, step(r), dir));
          }
        }
      } else {
        for (let r = srcR1; r <= srcR2; r++) {
          if (this._isGroupRow(r)) continue;
          const srcVals = [];
          for (let c = srcC1; c <= srcC2; c++) srcVals.push(this._cellVal(r, c));
          for (let c = anchor; dir > 0 ? c <= tC2 : c >= tC1; c += dir) {
            if (!this._isEditable(c)) continue;
            const field = this._columns[c];
            this._setEdit(r, field, computeFillValue(srcVals, step(c), dir));
          }
        }
      }
      this._editTxnCommit();
      this._draw();
    }
    // Events
    _xy(e) {
      const r = this._canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    _clamp(geo) {
      this._scrollTop = Math.max(geo.minScrollY, Math.min(geo.maxScrollY, this._scrollTop));
      this._scrollLeft = Math.max(0, Math.min(geo.maxScrollX, this._scrollLeft));
    }
    // A WheelEvent's deltas are only pixels when `deltaMode` says so. Firefox normally reports whole
    // lines (DOM_DELTA_LINE, deltaY of about 3 per notch) and a few configurations report pages, so
    // adding `deltaY` straight to the scroll offset moves three *pixels* per notch there instead of
    // three rows — the grid reads as barely scrolling at all.
    //
    // Vertically a line is a row, which is the unit a table should scroll in anyway; `rowHeight` is
    // the base height, so a notch covers the same distance regardless of any per-row overrides. A
    // page is the visible body height.
    _wheelPixels(e, geo) {
      if (e.deltaMode === 1) {
        return { dx: e.deltaX * WHEEL_LINE_W, dy: e.deltaY * this._opts.rowHeight };
      }
      if (e.deltaMode === 2) {
        return { dx: e.deltaX * geo.vpW, dy: e.deltaY * geo.vpH };
      }
      return { dx: e.deltaX, dy: e.deltaY };
    }
    // Glides the viewport toward where this wheel gesture is heading, and reports whether it took
    // the scroll over. Returns false — leaving the caller to apply the delta directly — for input
    // that is already smooth, which is the important half of this:
    //
    // A mouse wheel emits large, quantised jumps (a notch is several rows at once), and those are
    // what look like teleporting. A precision trackpad emits a dense stream of few-pixel deltas that
    // are smooth to begin with; easing those would add a lag the hardware had already solved. The
    // split is by step size rather than by trying to identify the device: anything smaller than a
    // row is already fine-grained enough to apply as-is, whatever produced it.
    _easeWheel(dx, dy, geo) {
      if (this._scrollEaseMs === 0) return false;
      if (Math.abs(dy) < this._opts.rowHeight && Math.abs(dx) < this._opts.rowHeight) return false;
      const gliding = this._scrollEase.animating;
      const aimY = (gliding ? this._scrollAim.y : this._scrollTop) + dy;
      const aimX = (gliding ? this._scrollAim.x : this._scrollLeft) + dx;
      this._scrollAim = {
        y: Math.max(geo.minScrollY, Math.min(geo.maxScrollY, aimY)),
        x: Math.max(0, Math.min(geo.maxScrollX, aimX))
      };
      this._scrollFrom = { y: this._scrollTop, x: this._scrollLeft };
      this._scrollWrote = { y: this._scrollTop, x: this._scrollLeft };
      this._scrollEase.set(0);
      this._scrollEase.to(1, this._scrollEaseMs);
      return true;
    }
    // Every other scroll path — scrollbar drag, keyboard, touch, scrollToRow, pagination — writes
    // `_scrollTop`/`_scrollLeft` directly and knows nothing about the glide. Rather than making all
    // of them call something, the glide checks on each frame whether the offsets are still the ones
    // it last wrote; if not, someone else is driving and it gets out of the way.
    _onScrollFrame() {
      if (this._scrollTop !== this._scrollWrote.y || this._scrollLeft !== this._scrollWrote.x) {
        this._scrollEase.stop();
        return;
      }
      const t = this._scrollEase.value;
      this._scrollTop = this._scrollFrom.y + (this._scrollAim.y - this._scrollFrom.y) * t;
      this._scrollLeft = this._scrollFrom.x + (this._scrollAim.x - this._scrollFrom.x) * t;
      this._clamp(this._geo());
      this._scrollWrote = { y: this._scrollTop, x: this._scrollLeft };
      this._schedDraw();
    }
    _cancelScrollEase() {
      this._scrollEase.stop();
    }
    _schedDraw() {
      if (!this._ticking) {
        this._ticking = true;
        this._schedRaf = requestAnimationFrame(() => {
          this._ticking = false;
          this._draw();
        });
      }
    }
    // True while any floating DOM overlay (context menu, filter panel, column chooser, or new-column
    // dialog) sits on top of the canvas. The canvas
    // itself has no idea an overlay is covering part of it — hit-testing still resolves whatever
    // grid cell is at the raw pointer coordinates — so callers that would otherwise react to the
    // pointer being "over" a cell (the hover-row highlight; document mousedown-outside-closes) need
    // this to tell "over the canvas" apart from "over an overlay that happens to sit above it".
    _anyOverlayOpen() {
      return !!(this._filterPanel || this._colContextMenu || this._rowContextMenu || this._cellContextMenu || this._colChooser || this._newColDialog);
    }
    // Moves the pointer-hover highlight. `row` is null when nothing should be highlighted — the
    // pointer left the grid body, or a gesture (drag/resize) took over.
    //
    // On null the row index is left where it is rather than cleared: the wash still has to be
    // painted somewhere while it dissolves. Alpha 0 is what actually stops it from rendering, and
    // the stale index costs nothing since the next hover overwrites it.
    // Repaints only when the highlight actually moves or starts/stops fading. Pointer moves land far
    // faster than frames do and most of them stay inside the same row, so redrawing on every one
    // would put a full canvas repaint on idle mouse movement for no visible difference.
    _setHoverRow(row) {
      if (!this._opts.theme.hoverRowBg) return;
      const target = row === null ? 0 : 1;
      const moved = row !== null && row !== this._hoverRow;
      if (!moved && target === this._hoverTarget) return;
      if (moved) this._hoverRow = row;
      this._hoverTarget = target;
      this._hoverFade.to(target, this._hoverFadeMs);
      this._schedDraw();
    }
    // Dispatches a context-menu open at (x, y) — the same header/row-number/cell hit-testing
    // `ev.contextmenu` does, factored out so a touch long-press can trigger the identical menu a
    // right-click would. Returns whether something actually opened (so the caller knows whether to
    // suppress the native menu / a resulting tap).
    _openContextMenuAt(x, y, geo) {
      const { headerH } = geo;
      if (y >= 0 && y < headerH) {
        const col = this._hitHeader(x, geo);
        if (col === null) return false;
        this._closeFilterPanel();
        this._closeRowContextMenu();
        this._closeCellContextMenu();
        this._openColContextMenu(col, x, y);
        return true;
      }
      if (geo.rowNumW > 0 && x < geo.rowNumW) {
        const row = this._hitRowNumber(x, y, geo);
        if (row === null) return false;
        this._closeFilterPanel();
        this._closeColContextMenu();
        this._closeCellContextMenu();
        this._openRowContextMenu(row, x, y);
        return true;
      }
      const cell = this._hitCell(x, y, geo);
      if (cell) {
        this._closeFilterPanel();
        this._closeColContextMenu();
        this._closeRowContextMenu();
        this._openCellContextMenu(cell.row, cell.col, x, y);
        return true;
      }
      return false;
    }
    // Advances whichever structural gesture (column resize/reorder, row-height resize/reorder,
    // fill-handle drag) is currently armed, given the pointer's current (x, y). Shared by
    // `mousemove` and `touchmove` so the two input paths can't drift apart. Returns whether a
    // gesture actually consumed the move — callers skip their own hover/scroll handling when true.
    _updateStructuralGesture(x, y) {
      if (this._colResize) {
        const newW = Math.max(MIN_COL_W, this._colResize.startWidth + x - this._colResize.startX);
        this._columnWidths[this._colResize.col] = newW;
        this._canvas.style.cursor = "col-resize";
        this._clamp(this._geo());
        this._schedDraw();
        return true;
      }
      if (this._rowResize) {
        const newH = Math.max(MIN_ROW_H, this._rowResize.startHeight + y - this._rowResize.startY);
        this._rowLayout.setHeight(this._rowResize.row, newH);
        this._canvas.style.cursor = "row-resize";
        this._clamp(this._geo());
        this._schedDraw();
        return true;
      }
      if (this._colDrag) {
        if (!this._colDrag.active && Math.abs(x - this._colDrag.startX) > 5) {
          this._colDrag.active = true;
        }
        if (this._colDrag.active) {
          this._colDrag.x = x;
          const target = this._calcInsertBefore(x);
          this._colDrag.insertBefore = target;
          const cur = this._colDrag.col;
          if (target !== cur && target !== cur + 1) {
            this._colDrag.undoBefore ??= this._snapshotStructural();
            const beforeX = this._geo().colPositions;
            this._colDrag.col = this._reorderCol(cur, target, { silent: true });
            this._startColSlide(cur, this._colDrag.col, beforeX);
          }
          this._canvas.style.cursor = "grabbing";
          this._schedDraw();
        }
        return true;
      }
      if (this._rowDrag) {
        if (!this._rowDrag.active && Math.abs(y - this._rowDrag.startY) > 5) {
          this._rowDrag.active = true;
        }
        if (this._rowDrag.active) {
          this._rowDrag.insertBefore = this._calcRowInsertBefore(y);
          this._canvas.style.cursor = "grabbing";
          this._schedDraw();
        }
        return true;
      }
      if (this._fillDrag) {
        this._dragScrollPos = { x, y };
        this._dragScrollDir = this._dragEdgeDir(x, y);
        if (this._dragScrollDir.dx || this._dragScrollDir.dy) this._startDragAutoScroll();
        else this._stopDragAutoScroll();
        this._extendFillDrag(x, y);
        this._canvas.style.cursor = "crosshair";
        this._schedDraw();
        return true;
      }
      return false;
    }
    // Recomputes _fillPreview for the fill-handle drag at (x, y), clamping into the data area
    // (like _extendDragSelection) so a pointer past the edge still extends the preview to the
    // nearest edge cell instead of losing it. Shared by _updateStructuralGesture's mousemove path
    // and the auto-scroll timer tick.
    _extendFillDrag(x, y, geo = this._geo()) {
      const cell = this._hitCellClamped(x, y, geo);
      if (!cell) {
        this._fillPreview = null;
        return;
      }
      const src = this._fillDrag.sel;
      const srcR1 = src.type === "single" ? src.row : src.r1;
      const srcR2 = src.type === "single" ? src.row : src.r2;
      const srcC1 = src.type === "single" ? src.col : src.c1;
      const srcC2 = src.type === "single" ? src.col : src.c2;
      if (cell.row > srcR2) {
        this._fillPreview = { r1: srcR2 + 1, c1: srcC1, r2: cell.row, c2: srcC2 };
      } else if (cell.row < srcR1) {
        this._fillPreview = { r1: cell.row, c1: srcC1, r2: srcR1 - 1, c2: srcC2 };
      } else if (cell.col > srcC2) {
        this._fillPreview = { r1: srcR1, c1: srcC2 + 1, r2: srcR2, c2: cell.col };
      } else if (cell.col < srcC1) {
        this._fillPreview = { r1: srcR1, c1: cell.col, r2: srcR2, c2: srcC1 - 1 };
      } else {
        this._fillPreview = null;
      }
    }
    // Commits (or discards, for a click too small to count as a drag) whichever structural gesture
    // is armed, mirroring `_updateStructuralGesture`'s scope. Shared by `mouseup` and `touchend`.
    // Returns whether a gesture was in fact live — callers skip their own click/tap fallback then,
    // since the gesture's own finalize logic already decided what the release means (e.g. an
    // inactive row drag still resolves to a plain row-selection click).
    _finalizeStructuralGesture() {
      if (this._colResize) {
        const { col, startWidth, undoBefore } = this._colResize;
        const width = this._columnWidths[col];
        this._colResize = null;
        if (width !== startWidth) {
          const field = this._columns[col];
          this._columnWidthMap.set(field, width);
          this._canvas.style.cursor = "";
          const undoAfter = this._snapshotStructural();
          this._pushUndoCmd({
            undo: () => this._restoreStructural(undoBefore),
            redo: () => this._restoreStructural(undoAfter)
          });
          this._opts.onColumnResize?.(field, width);
          this._draw();
        }
        return true;
      }
      if (this._rowResize) {
        const { row, startHeight, undoBefore } = this._rowResize;
        const height = this._rowLayout.heightOf(row);
        this._rowResize = null;
        if (height !== startHeight) {
          this._canvas.style.cursor = "";
          const undoAfter = this._snapshotStructural();
          this._pushUndoCmd({
            undo: () => this._restoreStructural(undoBefore),
            redo: () => this._restoreStructural(undoAfter)
          });
          this._opts.onRowHeightResize?.(row, height);
          this._draw();
        }
        return true;
      }
      if (this._colDrag) {
        const { active, startCol, col, undoBefore, shiftKey } = this._colDrag;
        this._colDrag = null;
        if (active && col !== startCol && undoBefore) {
          this._revalidateAllFromEdits();
          const undoAfter = this._snapshotStructural();
          this._pushUndoCmd({
            undo: () => this._restoreStructural(undoBefore),
            redo: () => this._restoreStructural(undoAfter)
          });
          this._opts.onColumnReorder?.([...this._columns]);
        } else if (!active) {
          this._updateColSel(startCol, shiftKey);
          this._kbProxy.focus();
        }
        this._canvas.style.cursor = "";
        this._draw();
        return true;
      }
      if (this._rowDrag) {
        const { row, insertBefore, active, ctrlKey, shiftKey } = this._rowDrag;
        this._rowDrag = null;
        this._canvas.style.cursor = "";
        if (active) {
          this._reorderRow(row, insertBefore);
        } else {
          if ((_JHGrid._plugin("rowSelection")?.modeFor(this) ?? "none") !== "none") this._sel = null;
          this._updateRowSel(row, ctrlKey, shiftKey);
          this._draw();
          this._kbProxy.focus();
        }
        return true;
      }
      if (this._fillDrag) {
        this._stopDragAutoScroll();
        if (this._fillPreview) {
          const src = this._fillDrag.sel;
          const srcR1 = src.type === "single" ? src.row : src.r1;
          const srcR2 = src.type === "single" ? src.row : src.r2;
          const srcC1 = src.type === "single" ? src.col : src.c1;
          const srcC2 = src.type === "single" ? src.col : src.c2;
          const { r1, c1, r2, c2 } = this._fillPreview;
          this._applyFill(src, this._fillPreview);
          this._sel = {
            type: "range",
            r1: Math.min(srcR1, r1),
            c1: Math.min(srcC1, c1),
            r2: Math.max(srcR2, r2),
            c2: Math.max(srcC2, c2)
          };
          this._opts.onSelectionChange?.(this._sel);
        }
        this._fillDrag = null;
        this._fillPreview = null;
        this._canvas.style.cursor = "";
        this._draw();
        return true;
      }
      return false;
    }
    // Arms the long-press timer used by `touchstart` for chrome that has an armed-but-inactive
    // gesture state (header drag-to-reorder, row drag-to-reorder) or no gesture state at all (a
    // plain cell tap) — anywhere a mouse user would reach for a right-click instead. Movement past
    // the drag threshold or a lift before the timer fires cancels it (see touchmove/touchend).
    _armLongPress(x, y) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        this._longPressTimer = null;
        this._colDrag = null;
        this._rowDrag = null;
        this._rowTap = null;
        this._touch = null;
        navigator.vibrate?.(10);
        this._openContextMenuAt(x, y, this._geo());
      }, LONG_PRESS_MS);
    }
    _cancelLongPress() {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    _bind() {
      const ev = this._ev;
      ev.wheel = (e) => {
        const geo = this._geo();
        const { dx, dy } = this._wheelPixels(e, geo);
        const gliding = this._scrollEase.animating;
        const curY = gliding ? this._scrollAim.y : this._scrollTop;
        const curX = gliding ? this._scrollAim.x : this._scrollLeft;
        const atTop = curY <= geo.minScrollY;
        const atBottom = curY >= geo.maxScrollY;
        const atLeft = curX <= 0;
        const atRight = curX >= geo.maxScrollX;
        const canScrollY = dy !== 0 && !(dy > 0 && atBottom || dy < 0 && atTop);
        const canScrollX = dx !== 0 && !(dx > 0 && atRight || dx < 0 && atLeft);
        if (!canScrollY && !canScrollX) return;
        e.preventDefault();
        if (this._editing) this._commitEdit();
        if (!this._easeWheel(dx, dy, geo)) {
          this._cancelScrollEase();
          this._scrollTop += dy;
          this._scrollLeft += dx;
          this._clamp(geo);
        }
        this._scrolling = true;
        this._dm.setHold(true);
        clearTimeout(this._scrollEndTimer);
        this._scrollEndTimer = setTimeout(() => {
          this._scrolling = false;
          this._dm.setHold(false);
          this._schedDraw();
        }, 150);
        this._schedDraw();
      };
      ev.contextmenu = (e) => {
        const { x, y } = this._xy(e);
        const geo = this._geo();
        if (this._openContextMenuAt(x, y, geo)) e.preventDefault();
      };
      ev.mousedown = (e) => {
        const { x, y } = this._xy(e);
        const geo = this._geo();
        const suppressReopenCell = this._suppressReopenCell;
        this._suppressReopenCell = null;
        if (this._editing) this._commitEdit();
        this._closeColContextMenu();
        this._closeRowContextMenu();
        this._closeCellContextMenu();
        const prevPanelCol = this._filterPanel?.col ?? -1;
        this._closeFilterPanel();
        if (e.button === 2 && this._sel) {
          const rc = this._hitCell(x, y, geo);
          if (rc) {
            const withinSel = this._sel.type === "single" ? this._sel.row === rc.row && this._sel.col === rc.col : rc.row >= this._sel.r1 && rc.row <= this._sel.r2 && rc.col >= this._sel.c1 && rc.col <= this._sel.c2;
            if (withinSel) return;
          }
        }
        if (this._hitScrollbar(x, y, geo)) {
          e.preventDefault();
          return;
        }
        const { headerH } = geo;
        if (y >= 0 && y < headerH) {
          const col = this._hitHeader(x, geo);
          if (col !== null) {
            const colW = geo.colPositions[col + 1] - geo.colPositions[col];
            const colRight = this._colLeft(col, geo) + colW;
            const filterIconX = colRight - FILTER_ICON_W;
            if (Math.abs(x - colRight) <= RESIZE_HIT_W) {
              this._colResize = { col, startX: x, startWidth: colW, undoBefore: this._snapshotStructural() };
              e.preventDefault();
              return;
            }
            const colLeft = this._colLeft(col, geo);
            if (col > 0 && Math.abs(x - colLeft) <= RESIZE_HIT_W) {
              const prevColW = geo.colPositions[col] - geo.colPositions[col - 1];
              this._colResize = { col: col - 1, startX: x, startWidth: prevColW, undoBefore: this._snapshotStructural() };
              e.preventDefault();
              return;
            }
            const _hcbField = this._columns[col];
            if (this._colDefMap.get(_hcbField)?.headerCheckbox) {
              const _hcbPad = this._opts.theme?.cellPadding ?? 4;
              const _hcbCx = this._colLeft(col, geo) + _hcbPad + 6;
              const _hcbCell = computeHeaderCells(this._opts.headerRows, this._columns, this._opts.columnLetterHeader).find((c) => c.isLeaf && c.col === col);
              const _hcbCy = _hcbCell ? _hcbCell.row * this._opts.headerHeight + _hcbCell.rowspan * this._opts.headerHeight / 2 : headerH - this._opts.headerHeight / 2;
              if (Math.abs(x - _hcbCx) <= 9 && Math.abs(y - _hcbCy) <= 9) {
                const _hcbChecked = !(this._headerCheckboxState.get(_hcbField) ?? false);
                this._headerCheckboxState.set(_hcbField, _hcbChecked);
                this._draw();
                this._opts.onHeaderCheckboxChange?.(_hcbField, _hcbChecked);
                e.preventDefault();
                return;
              }
            }
            if (x >= filterIconX && y >= headerH - this._opts.headerHeight) {
              if (col !== prevPanelCol) this._openFilterPanel(col);
              e.preventDefault();
              return;
            }
            this._colDrag = {
              col,
              startX: x,
              insertBefore: col,
              active: false,
              x,
              grabDX: x - this._colLeft(col, this._geo()),
              // `undoBefore` is filled in lazily, right before the first slot actually changes.
              // Snapshotting here instead would copy the whole edit map on every header mousedown —
              // including the plain clicks that only sort and never become a drag at all.
              startCol: col,
              undoBefore: null,
              shiftKey: e.shiftKey
            };
            e.preventDefault();
            return;
          }
        }
        const boundaryRow = geo.rowNumW > 0 && x < geo.rowNumW && y >= geo.headerH ? this._hitRowBoundary(y, geo) : null;
        if (boundaryRow !== null) {
          this._rowResize = { row: boundaryRow, startY: y, startHeight: this._rowLayout.heightOf(boundaryRow), undoBefore: this._snapshotStructural() };
          e.preventDefault();
          return;
        }
        if (geo.rowNumW > 0 && x < geo.rowNumW && y >= geo.headerH) {
          const row = this._hitRowNumber(x, y, geo);
          if (row !== null) {
            e.preventDefault();
            if (this._rowReorderReady() && this._localIndexAt(row) < 0 && !this._isGroupRow(row)) {
              this._rowDrag = { row, startY: y, insertBefore: row, active: false, ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey };
              return;
            }
            if (this._opts.rowReorder && this._rowOrderData === null && !_JHGrid._plugins.some((p) => p.altRowSource?.(this))) {
              this._materializeRowOrder();
            }
            if ((_JHGrid._plugin("rowSelection")?.modeFor(this) ?? "none") !== "none") this._sel = null;
            this._updateRowSel(row, e.ctrlKey || e.metaKey, e.shiftKey);
            this._draw();
            this._kbProxy.focus();
          }
          return;
        }
        if (this._sel && this._hitFillHandle(x, y, geo)) {
          this._fillDrag = { sel: this._sel };
          this._fillPreview = null;
          e.preventDefault();
          return;
        }
        const rawCell = this._hitCell(x, y, geo);
        const cell = rawCell;
        if (cell) e.preventDefault();
        if (cell && this._hitTreeChevron(x, cell, geo)) {
          this._commitEdit();
          this.toggleTreeNode(this._dm.getRow(cell.row).__treePath);
          this._kbProxy.focus();
          return;
        }
        if (cell && this._isGroupRow(cell.row)) {
          this._commitEdit();
          this.toggleGroup(this._dm.getRow(cell.row).path);
          this._kbProxy.focus();
          return;
        }
        if (cell) {
          this._commitEdit();
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const clickField = this._columns[cell.col];
            if (this._colDefMap.get(clickField)?.type === "button") {
              this._sel = { type: "single", row: cell.row, col: cell.col };
              this._selAnchor = null;
              this._selDragging = true;
              this._selDragStart = cell;
              if (!this._opts.showRowNumbers) this._updateRowSel(cell.row, false, false);
              else this._clearRowSelOnCellClick(e);
              this._kbProxy.focus();
              this._updateA11yCell();
              this._fireButtonClick(cell.row, cell.col);
              this._draw();
              return;
            }
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && this._isEditable(cell.col)) {
            const selField = this._columns[cell.col];
            if (this._colDefMap.get(selField)?.type === "checkbox") {
              this._sel = { type: "single", row: cell.row, col: cell.col };
              this._selAnchor = null;
              this._selDragging = true;
              this._selDragStart = cell;
              if (!this._opts.showRowNumbers) this._updateRowSel(cell.row, false, false);
              else this._clearRowSelOnCellClick(e);
              this._kbProxy.focus();
              this._updateA11yCell();
              this._announce(this._i18n.announceCell(cell.row + 1, this._columnLabels[cell.col] ?? this._columns[cell.col], this._cellVal(cell.row, cell.col) || this._i18n.emptyCell));
              this._toggleCheckbox(cell.row, cell.col);
              return;
            }
          }
          const alreadySel = !e.shiftKey && !e.ctrlKey && !e.metaKey && this._sel?.type === "single" && this._sel.row === cell.row && this._sel.col === cell.col;
          if (e.shiftKey && this._sel) {
            if (!this._selAnchor) {
              this._selAnchor = this._sel.type === "single" ? { row: this._sel.row, col: this._sel.col } : { row: this._sel.r1, col: this._sel.c1 };
            }
            const anchor = this._selAnchor;
            const norm = this._normRange(anchor.row, anchor.col, cell.row, cell.col);
            this._sel = norm.r1 === norm.r2 && norm.c1 === norm.c2 ? { type: "single", row: norm.r1, col: norm.c1 } : { type: "range", ...norm };
          } else {
            this._sel = { type: "single", row: cell.row, col: cell.col };
            this._selAnchor = null;
          }
          this._selDragging = true;
          this._selDragStart = cell;
          if (!this._opts.showRowNumbers) this._updateRowSel(cell.row, e.ctrlKey || e.metaKey, e.shiftKey);
          else this._clearRowSelOnCellClick(e);
          this._kbProxy.focus();
          this._updateA11yCell();
          this._announce(this._i18n.announceCell(cell.row + 1, this._columnLabels[cell.col] ?? this._columns[cell.col], this._cellVal(cell.row, cell.col) || this._i18n.emptyCell));
          const suppressReopen = suppressReopenCell && suppressReopenCell.row === cell.row && suppressReopenCell.col === cell.col;
          if (alreadySel && !suppressReopen && this._isEditable(cell.col)) {
            const ddField = this._columns[cell.col];
            const ddDef = this._colDefMap.get(ddField);
            if (ddDef?.type === "dropdown" || ddDef?.type === "multiselect") {
              this._draw();
              this._startDropdownEdit(cell.row, cell.col, ddDef);
              return;
            }
          }
          this._draw();
        }
      };
      ev.mousemove = (e) => {
        const { x, y } = this._xy(e);
        const gesture = this._colResize || this._rowResize || this._colDrag || this._rowDrag || this._fillDrag || this._drag || this._selDragging;
        if (gesture || this._anyOverlayOpen()) {
          this._setHoverRow(null);
        } else {
          const hGeo = this._geo();
          this._setHoverRow(this._hitCell(x, y, hGeo)?.row ?? this._hitRowNumber(x, y, hGeo));
        }
        if (this._updateStructuralGesture(x, y)) return;
        const headerH = this._headerH;
        if (y >= 0 && y < headerH) {
          const geo = this._geo();
          const col = this._hitHeader(x, geo);
          if (col !== null) {
            const colW = geo.colPositions[col + 1] - geo.colPositions[col];
            const colRight = this._colLeft(col, geo) + colW;
            const colLeft = this._colLeft(col, geo);
            if (Math.abs(x - colRight) <= RESIZE_HIT_W || col > 0 && Math.abs(x - colLeft) <= RESIZE_HIT_W) {
              this._canvas.style.cursor = "col-resize";
            } else {
              const isLeafRow = y >= headerH - this._opts.headerHeight;
              this._canvas.style.cursor = x >= colRight - FILTER_ICON_W && isLeafRow ? "pointer" : "grab";
            }
          } else if (!this._drag && !this._selDragging) {
            this._canvas.style.cursor = "";
          }
        } else if (!this._drag && !this._selDragging) {
          const geo = this._geo();
          if (geo.rowNumW > 0 && x >= 0 && x < geo.rowNumW && this._hitRowBoundary(y, geo) !== null) {
            this._canvas.style.cursor = "row-resize";
          } else if (this._sel && this._hitFillHandle(x, y)) {
            this._canvas.style.cursor = "crosshair";
          } else {
            const hoverCell = this._hitCell(x, y);
            const hoverField = hoverCell ? this._columns[hoverCell.col] : null;
            this._canvas.style.cursor = hoverField && this._colDefMap.get(hoverField)?.type === "button" ? "pointer" : "";
          }
        }
        if (this._drag) {
          this._updateScrollbarDrag(x, y);
          return;
        }
        if (this._selDragging) {
          this._dragScrollPos = { x, y };
          this._dragScrollDir = this._dragEdgeDir(x, y);
          if (this._dragScrollDir.dx || this._dragScrollDir.dy) this._startDragAutoScroll();
          else this._stopDragAutoScroll();
          this._extendDragSelection(x, y);
        }
        if (!this._drag && !this._selDragging && !this._colDrag && !this._colResize && !this._rowDrag) {
          const geo = this._geo();
          const cell = this._hitCell(x, y, geo);
          const invalidMsg = cell && !this._validator.isValid() ? this._validator.map.get(`${cell.row}_${this._columns[cell.col]}`) : null;
          let hostTooltip = null;
          if (!invalidMsg && cell && this._opts.cellTooltip) {
            try {
              hostTooltip = this._opts.cellTooltip(this.getRowData(cell.row), cell.row, this._columns[cell.col], cell.col) || null;
            } catch (err) {
              console.error("[JHGrid] cellTooltip error at row", cell.row, "col", cell.col, ":", err);
            }
          }
          let pluginTooltip = null;
          if (!invalidMsg && !hostTooltip && cell) {
            for (const p of _JHGrid._plugins) {
              const t = p.cellTooltip?.(this, cell.row, this._columns[cell.col]);
              if (t) {
                pluginTooltip = t;
                break;
              }
            }
          }
          if (pluginTooltip) {
            for (const p of _JHGrid._plugins) p.showTooltip?.(this, pluginTooltip, x, y);
          } else {
            for (const p of _JHGrid._plugins) p.hideTooltip?.(this);
          }
          clearTimeout(this._tooltipTimer);
          if (invalidMsg || hostTooltip) {
            const { width: W } = this._opts;
            this._cellTooltip.textContent = invalidMsg || hostTooltip;
            this._cellTooltip.style.display = "block";
            this._cellTooltip.style.left = `${Math.min(x + 12, W - 330)}px`;
            this._cellTooltip.style.top = `${Math.max(0, y - 36)}px`;
          } else if (cell && !pluginTooltip && !this._columnRenderers[cell.col]) {
            this._tooltipTimer = setTimeout(() => {
              const val = this._cellVal(cell.row, cell.col);
              if (!val) {
                this._cellTooltip.style.display = "none";
                return;
              }
              const { theme } = this._opts;
              const ctx = this._canvas.getContext("2d");
              ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
              const colW = geo.colPositions[cell.col + 1] - geo.colPositions[cell.col];
              const maxW = colW - theme.cellPadding * 2;
              const textW = ctx.measureText(val).width;
              if (textW > maxW) {
                const { width: W } = this._opts;
                this._cellTooltip.textContent = val;
                this._cellTooltip.style.display = "block";
                this._cellTooltip.style.left = `${Math.min(x + 12, W - 330)}px`;
                this._cellTooltip.style.top = `${Math.max(0, y - 36)}px`;
              } else {
                this._cellTooltip.style.display = "none";
              }
            }, 600);
          } else {
            this._cellTooltip.style.display = "none";
          }
        } else {
          for (const p of _JHGrid._plugins) p.hideTooltip?.(this);
          this._cellTooltip.style.display = "none";
          clearTimeout(this._tooltipTimer);
        }
      };
      ev.mouseup = () => {
        if (this._finalizeStructuralGesture()) return;
        this._drag = null;
        const wasDragging = this._selDragging;
        this._selDragging = false;
        this._stopDragAutoScroll();
        if (wasDragging) this._opts.onSelectionChange?.(this._sel);
      };
      ev.dblclick = (e) => {
        const { x, y } = this._xy(e);
        const headerH = this._headerH;
        if (y >= 0 && y < headerH) {
          const geo2 = this._geo();
          const col = this._hitHeader(x, geo2);
          if (col !== null) {
            const colW = geo2.colPositions[col + 1] - geo2.colPositions[col];
            const colRight = this._colLeft(col, geo2) + colW;
            const colLeft = this._colLeft(col, geo2);
            const autoFitBoundary = (boundaryCol) => {
              const selected = this._selectedColsForAutoFit();
              if (selected && selected.size > 1 && (selected.has(boundaryCol) || selected.has(boundaryCol + 1))) {
                selected.forEach((c) => this._autoFitCol(c));
              } else {
                this._autoFitCol(boundaryCol);
              }
            };
            if (Math.abs(x - colRight) <= RESIZE_HIT_W) {
              autoFitBoundary(col);
              this._clamp(this._geo());
              this._draw();
              return;
            }
            if (col > 0 && Math.abs(x - colLeft) <= RESIZE_HIT_W) {
              autoFitBoundary(col - 1);
              this._clamp(this._geo());
              this._draw();
              return;
            }
          }
          return;
        }
        const geo = this._geo();
        if (geo.rowNumW > 0 && x < geo.rowNumW && y >= headerH) {
          const boundaryRow = this._hitRowBoundary(y, geo);
          if (boundaryRow !== null) {
            const selected = this._selectedRowsForAutoFit();
            if (selected && selected.size > 1 && (selected.has(boundaryRow) || selected.has(boundaryRow + 1))) {
              selected.forEach((r) => this._autoFitRow(r));
            } else {
              this._autoFitRow(boundaryRow);
            }
            this._clamp(this._geo());
            this._draw();
            return;
          }
        }
        const rawCell = this._hitCell(x, y);
        if (rawCell && this._isGroupRow(rawCell.row)) return;
        if (rawCell && this._hitTreeChevron(x, rawCell, this._geo())) return;
        if (rawCell) {
          this._sel = { type: "single", row: rawCell.row, col: rawCell.col };
          this._startEdit(rawCell.row, rawCell.col);
          this._draw();
        }
      };
      ev.keydown = (e) => {
        if (this._editing) return;
        if (this._headerFocusCol !== null) {
          this._handleHeaderFocusKey(e);
          return;
        }
        if (this._rowFocus !== null) {
          this._handleRowFocusKey(e);
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) this.redo();
          else this.undo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          this.redo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && (this._sel || this._selectedRowsSorted().length > 0) && navigator.clipboard?.writeText) {
          e.preventDefault();
          const text = this._buildCopyText();
          navigator.clipboard.writeText(text).catch(() => {
          });
          if (this._lastCopyMissingRows > 0) {
            this._showErrorBanner(this._i18n.copyIncomplete(this._lastCopyMissingRows));
            this._announce(this._i18n.copyIncomplete(this._lastCopyMissingRows));
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && this._sel && (navigator.clipboard?.readText || navigator.clipboard?.read)) {
          e.preventDefault();
          this._pasteFromClipboardAsync();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && this._sel) {
          e.preventDefault();
          this._selAnchor = null;
          const anchorRow = this._sel.type === "single" ? this._sel.row : this._sel.r1;
          const anchorCol = this._sel.type === "single" ? this._sel.col : this._sel.c1;
          const { r1, c1, r2, c2 } = this._usedRange(anchorRow, anchorCol);
          this._setSel(r1 === r2 && c1 === c2 ? { type: "single", row: r1, col: c1 } : { type: "range", r1, c1, r2, c2 });
          this._ensureVisible(r2, c2);
          this._updateA11yCell();
          this._draw();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          if (this._sel) {
            this._selAnchor = null;
            this._moveSel(0, e.shiftKey ? -1 : 1);
          }
          return;
        }
        if (e.key === "ArrowUp" && (e.ctrlKey || e.metaKey) && this._sel) {
          e.preventDefault();
          this._enterHeaderFocus(this._sel.type === "single" ? this._sel.col : this._sel.c1);
          return;
        }
        if (e.key === "ArrowLeft" && !e.shiftKey && this._opts.showRowNumbers && this._sel && (this._sel.type === "single" ? this._sel.col : this._sel.c1) === 0) {
          e.preventDefault();
          this._enterRowFocus(this._sel.type === "single" ? this._sel.row : this._sel.r1);
          return;
        }
        const delta = ARROWS[e.key];
        if (delta) {
          e.preventDefault();
          if (!this._sel && this._totalRows > 0) {
            this._focusDefaultCell();
            return;
          }
          if (e.shiftKey) {
            this._extendSel(...delta);
          } else {
            this._selAnchor = null;
            this._moveSel(...delta);
          }
          return;
        }
        if (e.key === "Escape") {
          if (this._colDrag) {
            const { active, undoBefore } = this._colDrag;
            this._colDrag = null;
            this._colSlide = null;
            this._colSlideTween.stop();
            if (active && undoBefore) this._restoreStructural(undoBefore);
            this._canvas.style.cursor = "";
            this._draw();
            return;
          }
          if (this._fillDrag) {
            this._fillDrag = null;
            this._fillPreview = null;
            this._canvas.style.cursor = "";
            this._draw();
            return;
          }
          if (this._filterPanel) {
            this._closeFilterPanel();
          } else if (this._colContextMenu) {
            this._closeColContextMenu();
          } else if (this._rowContextMenu) {
            this._closeRowContextMenu();
          } else if (this._cellContextMenu) {
            this._closeCellContextMenu();
          } else {
            this._setSel(null);
            this._selAnchor = null;
            this._updateA11yCell();
            this._draw();
          }
          return;
        }
        if (!this._sel) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          this._clearSelection();
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          const curRow = this._sel.type === "single" ? this._sel.row : this._sel.r1;
          const nr = e.ctrlKey ? 0 : curRow;
          const nc = 0;
          this._setSel({ type: "single", row: nr, col: nc });
          this._selAnchor = null;
          this._ensureVisible(nr, nc);
          this._updateA11yCell();
          this._announce(this._i18n.announceCell(nr + 1, this._columnLabels[nc] ?? this._columns[nc], this._cellVal(nr, nc) || this._i18n.emptyCell));
          this._draw();
        } else if (e.key === "End") {
          e.preventDefault();
          const curRow = this._sel.type === "single" ? this._sel.row : this._sel.r1;
          const nr = e.ctrlKey ? this._totalRows - 1 : curRow;
          const nc = this._columns.length - 1;
          this._setSel({ type: "single", row: nr, col: nc });
          this._selAnchor = null;
          this._ensureVisible(nr, nc);
          this._updateA11yCell();
          this._announce(this._i18n.announceCell(nr + 1, this._columnLabels[nc] ?? this._columns[nc], this._cellVal(nr, nc) || this._i18n.emptyCell));
          this._draw();
        } else if (e.key === "PageDown") {
          e.preventDefault();
          this._selAnchor = null;
          const pageRows = Math.max(1, Math.floor(this._geo().vpH / this._rowLayout.defaultHeight));
          this._moveSel(pageRows, 0);
        } else if (e.key === "PageUp") {
          e.preventDefault();
          this._selAnchor = null;
          const pageRows = Math.max(1, Math.floor(this._geo().vpH / this._rowLayout.defaultHeight));
          this._moveSel(-pageRows, 0);
        } else if (e.key === " " || e.key === "F2" || e.key === "Enter") {
          const kbRowData = this._sel.type === "single" ? this._dm.getRow(this._sel.row) : null;
          const onTreeChevronCol = !!kbRowData?.__treeHasChildren && this._colDefMap.get(this._columns[this._sel.col])?.treeColumn;
          if (this._sel.type === "single" && this._isGroupRow(this._sel.row)) {
            e.preventDefault();
            this.toggleGroup(this._dm.getRow(this._sel.row).path);
          } else if (onTreeChevronCol) {
            e.preventDefault();
            this.toggleTreeNode(kbRowData.__treePath);
          } else if (this._sel.type === "single") {
            e.preventDefault();
            const kbField = this._columns[this._sel.col];
            const kbDef = this._colDefMap.get(kbField);
            if (kbDef?.type === "button") {
              this._fireButtonClick(this._sel.row, this._sel.col);
              this._draw();
            } else if (kbDef?.type === "checkbox" && this._isEditable(this._sel.col)) {
              this._toggleCheckbox(this._sel.row, this._sel.col);
            } else if (e.key === " ") {
              this._startEdit(this._sel.row, this._sel.col, " ");
            } else {
              this._startEdit(this._sel.row, this._sel.col);
            }
          }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (this._sel.type === "single" && !this._isPlainTextEditor(this._sel.col)) {
            e.preventDefault();
            this._startEdit(this._sel.row, this._sel.col, e.key);
          }
        }
      };
      ev.copy = (e) => {
        if (!this._sel && this._selectedRowsSorted().length === 0 || e.target !== this._kbProxy) return;
        e.preventDefault();
        const text = this._buildCopyText();
        e.clipboardData.setData("text/plain", text);
        if (this._lastCopyMissingRows > 0) {
          this._showErrorBanner(this._i18n.copyIncomplete(this._lastCopyMissingRows));
          this._announce(this._i18n.copyIncomplete(this._lastCopyMissingRows));
        }
      };
      ev.paste = (e) => {
        if (!this._sel || e.target !== this._kbProxy) return;
        const imageItem = Array.from(e.clipboardData?.items ?? []).find((it) => it.type?.startsWith("image/"));
        const blob = imageItem?.getAsFile();
        if (blob && this._pasteImageBlob(blob)) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        this._applyPaste(e.clipboardData.getData("text/plain"));
      };
      ev.focus = () => {
        if (this._sel || this._totalRows === 0) return;
        if (_JHGrid._plugin("rowSelection")?.getRenderSet(this)) return;
        this._focusDefaultCell();
      };
      ev.kbProxyInput = () => {
        if (this._editing) return;
        const sel = this._sel;
        const eligible = sel?.type === "single" && this._isEditable(sel.col) && this._isPlainTextEditor(sel.col);
        if (!eligible) {
          this._kbProxy.value = "";
          return;
        }
        this._startEdit(sel.row, sel.col, void 0, { keepInputValue: true });
      };
      ev.docMousedown = (e) => {
        if (!this._anyOverlayOpen()) return;
        if (this._wrapper.contains(e.target)) return;
        this._closeFilterPanel();
        this._closeColContextMenu();
        this._closeRowContextMenu();
        this._closeCellContextMenu();
        this._closeColChooser();
        this._closeNewColumnDialog();
      };
      ev.touchstart = (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          const rect = this._canvas.getBoundingClientRect();
          const x = t.clientX - rect.left;
          const y = t.clientY - rect.top;
          if (this._editing) this._commitEdit();
          this._closeColContextMenu();
          this._closeRowContextMenu();
          this._closeCellContextMenu();
          const prevPanelCol = this._filterPanel?.col ?? -1;
          this._closeFilterPanel();
          this._rowTap = null;
          const geo = this._geo();
          const headerH = geo.headerH;
          if (this._hitScrollbar(x, y, geo)) {
            e.preventDefault();
            return;
          }
          if (y >= 0 && y < headerH) {
            const col = this._hitHeader(x, geo);
            if (col !== null) {
              const colW = geo.colPositions[col + 1] - geo.colPositions[col];
              const colRight = this._colLeft(col, geo) + colW;
              const filterIconX = colRight - FILTER_ICON_W;
              if (Math.abs(x - colRight) <= RESIZE_HIT_W_TOUCH) {
                this._colResize = { col, startX: x, startWidth: colW, undoBefore: this._snapshotStructural() };
                e.preventDefault();
                return;
              }
              const colLeft = this._colLeft(col, geo);
              if (col > 0 && Math.abs(x - colLeft) <= RESIZE_HIT_W_TOUCH) {
                const prevColW = geo.colPositions[col] - geo.colPositions[col - 1];
                this._colResize = { col: col - 1, startX: x, startWidth: prevColW, undoBefore: this._snapshotStructural() };
                e.preventDefault();
                return;
              }
              const _hcbField = this._columns[col];
              if (this._colDefMap.get(_hcbField)?.headerCheckbox) {
                const _hcbPad = this._opts.theme?.cellPadding ?? 4;
                const _hcbCx = this._colLeft(col, geo) + _hcbPad + 6;
                const _hcbCell = computeHeaderCells(this._opts.headerRows, this._columns, this._opts.columnLetterHeader).find((c) => c.isLeaf && c.col === col);
                const _hcbCy = _hcbCell ? _hcbCell.row * this._opts.headerHeight + _hcbCell.rowspan * this._opts.headerHeight / 2 : headerH - this._opts.headerHeight / 2;
                if (Math.abs(x - _hcbCx) <= RESIZE_HIT_W_TOUCH && Math.abs(y - _hcbCy) <= RESIZE_HIT_W_TOUCH) {
                  const _hcbChecked = !(this._headerCheckboxState.get(_hcbField) ?? false);
                  this._headerCheckboxState.set(_hcbField, _hcbChecked);
                  this._draw();
                  this._opts.onHeaderCheckboxChange?.(_hcbField, _hcbChecked);
                  e.preventDefault();
                  return;
                }
              }
              if (x >= filterIconX && y >= headerH - this._opts.headerHeight) {
                if (col !== prevPanelCol) this._openFilterPanel(col);
                e.preventDefault();
                return;
              }
              this._colDrag = {
                col,
                startX: x,
                insertBefore: col,
                active: false,
                x,
                grabDX: x - this._colLeft(col, geo),
                startCol: col,
                undoBefore: null,
                shiftKey: false
              };
              this._armLongPress(x, y);
              e.preventDefault();
              return;
            }
          }
          const boundaryRow = geo.rowNumW > 0 && x < geo.rowNumW && y >= geo.headerH ? this._hitRowBoundary(y, geo, RESIZE_HIT_W_TOUCH) : null;
          if (boundaryRow !== null) {
            this._rowResize = { row: boundaryRow, startY: y, startHeight: this._rowLayout.heightOf(boundaryRow), undoBefore: this._snapshotStructural() };
            e.preventDefault();
            return;
          }
          if (geo.rowNumW > 0 && x < geo.rowNumW && y >= geo.headerH) {
            const row = this._hitRowNumber(x, y, geo);
            if (row !== null) {
              if (this._rowReorderReady() && this._localIndexAt(row) < 0 && !this._isGroupRow(row)) {
                this._rowDrag = { row, startY: y, insertBefore: row, active: false, ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey };
              } else {
                if (this._opts.rowReorder && this._rowOrderData === null && !_JHGrid._plugins.some((p) => p.altRowSource?.(this))) {
                  this._materializeRowOrder();
                }
                this._rowTap = { row, startY: y, ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey };
              }
              this._armLongPress(x, y);
              e.preventDefault();
            }
            return;
          }
          if (this._sel && this._hitFillHandle(x, y, geo, RESIZE_HIT_W_TOUCH)) {
            this._fillDrag = { sel: this._sel };
            this._fillPreview = null;
            e.preventDefault();
            return;
          }
          this._touch = {
            startX: x,
            startY: y,
            scrollTopStart: this._scrollTop,
            scrollLeftStart: this._scrollLeft,
            moved: false
          };
          this._armLongPress(x, y);
        } else if (e.touches.length === 2) {
          this._cancelLongPress();
          const t0 = e.touches[0], t1 = e.touches[1];
          const rect = this._canvas.getBoundingClientRect();
          this._touch = {
            twoFinger: true,
            midX: (t0.clientX + t1.clientX) / 2 - rect.left,
            midY: (t0.clientY + t1.clientY) / 2 - rect.top,
            scrollTopStart: this._scrollTop,
            scrollLeftStart: this._scrollLeft
          };
          e.preventDefault();
        }
      };
      ev.touchmove = (e) => {
        if (this._colResize || this._rowResize || this._colDrag || this._rowDrag || this._fillDrag) {
          if (!e.touches.length) return;
          const t = e.touches[0];
          const rect2 = this._canvas.getBoundingClientRect();
          this._updateStructuralGesture(t.clientX - rect2.left, t.clientY - rect2.top);
          if (this._colDrag?.active || this._rowDrag?.active) this._cancelLongPress();
          e.preventDefault();
          return;
        }
        if (this._drag) {
          if (!e.touches.length) return;
          const t = e.touches[0];
          const rect2 = this._canvas.getBoundingClientRect();
          this._updateScrollbarDrag(t.clientX - rect2.left, t.clientY - rect2.top);
          e.preventDefault();
          return;
        }
        if (!this._touch) return;
        const rect = this._canvas.getBoundingClientRect();
        if (e.touches.length >= 2 && this._touch.twoFinger) {
          e.preventDefault();
          const t0 = e.touches[0], t1 = e.touches[1];
          const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
          const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
          const geo = this._geo();
          this._scrollTop = Math.max(geo.minScrollY, Math.min(geo.maxScrollY, this._touch.scrollTopStart - (midY - this._touch.midY)));
          this._scrollLeft = Math.max(0, Math.min(geo.maxScrollX, this._touch.scrollLeftStart - (midX - this._touch.midX)));
          this._schedDraw();
        } else if (e.touches.length === 1 && !this._touch.twoFinger) {
          const t = e.touches[0];
          const x = t.clientX - rect.left;
          const y = t.clientY - rect.top;
          const dx = x - this._touch.startX;
          const dy = y - this._touch.startY;
          if (!this._touch.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            this._touch.moved = true;
            this._cancelLongPress();
          }
          if (this._touch.moved) {
            e.preventDefault();
            const geo = this._geo();
            this._scrollTop = Math.max(geo.minScrollY, Math.min(geo.maxScrollY, this._touch.scrollTopStart - dy));
            this._scrollLeft = Math.max(0, Math.min(geo.maxScrollX, this._touch.scrollLeftStart - dx));
            this._schedDraw();
          }
        } else if (this._rowTap) {
          const t = e.touches[0];
          if (Math.abs(t.clientX - rect.left - this._rowTap.startX) > 5 || Math.abs(t.clientY - rect.top - this._rowTap.startY) > 5) this._cancelLongPress();
        }
      };
      ev.touchend = (e) => {
        this._cancelLongPress();
        if (this._finalizeStructuralGesture()) return;
        if (this._drag) {
          this._drag = null;
          return;
        }
        if (this._rowTap) {
          const { row, ctrlKey, shiftKey } = this._rowTap;
          this._rowTap = null;
          if ((_JHGrid._plugin("rowSelection")?.modeFor(this) ?? "none") !== "none") this._sel = null;
          this._updateRowSel(row, ctrlKey, shiftKey);
          this._draw();
          this._kbProxy.focus();
          return;
        }
        if (!this._touch) return;
        const touch2 = this._touch;
        this._touch = null;
        if (touch2.twoFinger || touch2.moved) return;
        if (e.changedTouches.length !== 1) return;
        e.preventDefault();
        const { startX: x, startY: y } = touch2;
        const geo = this._geo();
        const cell = this._hitCell(x, y, geo);
        if (!cell) return;
        const now = Date.now();
        const isDoubleTap = now - this._lastTap.time < 350 && this._lastTap.row === cell.row && this._lastTap.col === cell.col;
        if (isDoubleTap) {
          this._lastTap = { time: 0, row: -1, col: -1 };
          this._sel = { type: "single", row: cell.row, col: cell.col };
          this._startEdit(cell.row, cell.col);
          this._draw();
        } else {
          this._lastTap = { time: now, row: cell.row, col: cell.col };
          if (this._editing) this._commitEdit();
          this._closeFilterPanel();
          this._closeColContextMenu();
          this._closeRowContextMenu();
          this._closeCellContextMenu();
          this._setSel({ type: "single", row: cell.row, col: cell.col });
          this._selAnchor = null;
          if (!this._opts.showRowNumbers) this._updateRowSel(cell.row, false, false);
          else this._clearRowSelOnCellClick(e);
          this._kbProxy.focus();
          this._updateA11yCell();
          this._announce(this._i18n.announceCell(cell.row + 1, this._columnLabels[cell.col] ?? this._columns[cell.col], this._cellVal(cell.row, cell.col) || this._i18n.emptyCell));
          const tapField = this._columns[cell.col];
          const tapDef = this._colDefMap.get(tapField);
          if (tapDef?.type === "button") {
            this._fireButtonClick(cell.row, cell.col);
            this._draw();
          } else if (tapDef?.type === "checkbox" && this._isEditable(cell.col)) {
            this._toggleCheckbox(cell.row, cell.col);
          } else if ((tapDef?.type === "dropdown" || tapDef?.type === "multiselect") && this._isEditable(cell.col)) {
            this._draw();
            this._startDropdownEdit(cell.row, cell.col, tapDef);
          } else {
            this._draw();
          }
        }
      };
      this._canvas.addEventListener("wheel", ev.wheel, { passive: false });
      this._canvas.addEventListener("mousedown", ev.mousedown);
      this._canvas.addEventListener("dblclick", ev.dblclick);
      this._canvas.addEventListener("contextmenu", ev.contextmenu);
      this._canvas.addEventListener("touchstart", ev.touchstart, { passive: false });
      this._canvas.addEventListener("touchmove", ev.touchmove, { passive: false });
      this._canvas.addEventListener("touchend", ev.touchend);
      this._canvas.addEventListener("touchcancel", ev.touchend);
      this._kbProxy.addEventListener("keydown", ev.keydown);
      this._kbProxy.addEventListener("copy", ev.copy);
      this._kbProxy.addEventListener("paste", ev.paste);
      this._kbProxy.addEventListener("focus", ev.focus);
      this._kbProxy.addEventListener("input", ev.kbProxyInput);
      window.addEventListener("mousemove", ev.mousemove);
      window.addEventListener("mouseup", ev.mouseup);
      document.addEventListener("mousedown", ev.docMousedown);
      document.addEventListener("touchstart", ev.docMousedown, { passive: true });
    }
    // Core
    async _boot(state = null) {
      if (this._booting) return this._bootPromise;
      this._booting = true;
      let settle;
      this._bootPromise = new Promise((r) => {
        settle = r;
      });
      try {
        const meta = await this._opts.fetchMeta(state);
        if (this._destroyed) return;
        this._serverTotal = meta.totalRows;
        this._rowPlan.removed.dropFrom(meta.totalRows);
        this._rowPlan.clampAnchors(meta.totalRows);
        this._totalRows = this._rowPlan.totalRows;
        this._restoreLocalRowState();
        this._columns.forEach((f, i) => {
          if (this._columnWidths[i] != null) this._columnWidthMap.set(f, this._columnWidths[i]);
        });
        const metaSet = new Set(meta.columns);
        const colDefsFields = this._opts.columnDefs?.map((d) => d.field) ?? [];
        let allFields = colDefsFields.length > 0 ? [
          ...colDefsFields.filter((f) => metaSet.has(f)),
          ...meta.columns.filter((f) => !colDefsFields.includes(f))
        ] : [...meta.columns];
        if (this._localColumns.size > 0) {
          const known = /* @__PURE__ */ new Set([...allFields, ...this._localColumns.keys()]);
          allFields = this._columnOriginalOrder.length > 0 ? [...this._columnOriginalOrder.filter((f) => known.has(f)), ...[...known].filter((f) => !this._columnOriginalOrder.includes(f))] : [...allFields, ...this._localColumns.keys()];
        }
        if (this._columnOriginalOrder.length === 0) {
          this._columnOriginalOrder = [...allFields];
        }
        const visible = allFields.filter((f) => !this._hiddenColumns.has(f) && !this._deletedColumns.has(f));
        this._columns = visible;
        this._columnLabels = visible.map((f) => this._colDefMap.get(f)?.label ?? f);
        this._columnAligns = visible.map((f) => this._colDefMap.get(f)?.align ?? "left");
        this._columnHeaderAligns = visible.map((f) => this._colDefMap.get(f)?.headerAlign ?? this._colDefMap.get(f)?.align ?? "left");
        this._columnWidths = visible.map((f) => this._columnWidthMap.get(f) ?? this._colDefMap.get(f)?.width ?? this._opts.colWidth);
        this._columnRenderers = visible.map((f) => {
          const def = this._colDefMap.get(f);
          const r = def?.renderer;
          const resolved = r ? typeof r === "function" ? r : CellRenderers[r]?.() ?? null : def?.type === "checkbox" ? CellRenderers.checkbox() : def?.type === "dropdown" ? CellRenderers.dropdown() : def?.type === "button" ? CellRenderers.button(def.button ?? {}) : def?.type === "date" ? CellRenderers.date({ format: def.format, align: def.align }) : def?.type === "multiselect" ? CellRenderers.multiselect() : def?.type === "richtext" ? CellRenderers.richtext() : def?.type === "image" ? CellRenderers.image() : null;
          return def?.treeColumn ? CellRenderers.tree({ inner: resolved }) : resolved;
        });
        this._hiddenColumns.forEach((info, f) => {
          if (info !== null) return;
          const idx = allFields.indexOf(f);
          if (idx === -1) {
            this._hiddenColumns.delete(f);
            return;
          }
          this._hiddenColumns.set(f, {
            label: this._colDefMap.get(f)?.label ?? f,
            align: this._colDefMap.get(f)?.align ?? "left",
            headerAlign: this._colDefMap.get(f)?.headerAlign ?? this._colDefMap.get(f)?.align ?? "left",
            width: this._columnWidthMap.get(f) ?? this._colDefMap.get(f)?.width ?? this._opts.colWidth,
            renderer: (() => {
              const r = this._colDefMap.get(f)?.renderer;
              if (!r) return null;
              return typeof r === "function" ? r : CellRenderers[r]?.() ?? null;
            })()
          });
        });
        this._loadingEl.style.display = "none";
        this._emptyEl.style.display = this._totalRows === 0 ? "flex" : "none";
        this._wrapper.removeAttribute("aria-busy");
        this._updateA11yHeader();
        if (this._pagination) {
          this._page = Math.min(this._page, this._pageCount() - 1);
          this._updatePagerBar();
        }
        if (this._isLocalData) this._dm.loadAll(0, this._totalRows - 1);
        else this._dm.prefetch(0, Math.min(this._opts.chunkSize - 1, this._totalRows - 1));
        this._draw();
        if (this._opts.rowReorder) {
          this._rowOrderData = null;
          this._rowOrderGen++;
        }
      } catch (err) {
        console.error("[JHGrid] fetchMeta failed:", err);
        this._loadingEl.textContent = this._i18n.loadError;
        this._wrapper.removeAttribute("aria-busy");
      } finally {
        this._booting = false;
        this._bootPromise = null;
        settle();
        if (this._readyResolve) {
          this._readyResolve();
          this._readyResolve = null;
        }
      }
    }
    // Identity of a selection, for telling "the selection moved" apart from "we repainted".
    static _selKeyOf(sel) {
      if (!sel) return null;
      return sel.type === "single" ? `s${sel.row},${sel.col}` : `r${sel.r1},${sel.c1},${sel.r2},${sel.c2}`;
    }
    // Starts the selection box easing when the selection has actually moved. Called from _draw()
    // rather than from each of the many places that assign `this._sel`, so nothing can set the
    // selection by a route that forgets to animate.
    //
    // Several situations have to snap instead:
    //
    //   - a range drag, where the box has to stay under the pointer — the same reason the hover
    //     highlight tracks rows instantly;
    //   - appearing from or disappearing to nothing, which is a fade-in/out problem, not a move,
    //     and easing out of a zero-size box at the origin looks like a glitch;
    //   - a fill drag, whose preview rectangle is the thing being aimed, not the selection;
    //   - a move arriving while the previous one is still travelling. Held arrow keys repeat far
    //     faster than the box can cross a cell, and restarting the ease each time would leave it
    //     permanently a step behind the actual selection. Easing the first step and snapping the
    //     rest keeps the box exact exactly when the user is moving fast enough to care.
    _syncSelAnim(sel) {
      const key = _JHGrid._selKeyOf(sel);
      if (key === this._selKey) return;
      const snap = this._selMoveMs === 0 || this._selDragging || this._fillDrag || !sel || !this._selLast || this._selMove.animating;
      if (snap) {
        this._selPrev = null;
        this._selMove.set(1);
      } else {
        this._selPrev = this._selLast;
        this._selMove.set(0);
        this._selMove.to(1, this._selMoveMs);
      }
      this._selKey = key;
      this._selLast = sel;
    }
    _draw() {
      if (this._destroyed) return;
      const pluginParams = { filters: null, grouping: null, groupFooter: null };
      for (const p of _JHGrid._plugins) p.renderParams?.(this, pluginParams);
      if (this._filters.size > 0) {
        const iconFilters = {};
        for (const [f, v] of this._filters) if (!this._trivialSetFilters.has(f)) iconFilters[f] = v;
        pluginParams.filters = { ...iconFilters, ...pluginParams.filters };
      }
      const drawSel = this._isButtonCell(this._sel) ? null : this._sel;
      this._syncSelAnim(drawSel);
      this._renderer.render({
        scrollTop: this._scrollTop,
        scrollLeft: this._scrollLeft,
        totalRows: this._totalRows,
        columns: this._columns,
        columnLabels: this._columnLabels,
        columnAligns: this._columnAligns,
        columnHeaderAligns: this._columnHeaderAligns,
        getRow: (r) => this._getRow(r),
        geo: this._geo(),
        rowLayout: this._rowLayout,
        // Button cells are actions, not "selected" data — suppress the selection
        // border/fill-handle for them (but keep this._sel itself intact for
        // keyboard activation, onSelectionChange, a11y, etc.)
        sel: drawSel,
        editing: this._editing ? { row: this._editing.row, col: this._editing.col } : null,
        headerFocusCol: this._headerFocusCol,
        rowFocus: this._rowFocus,
        colDrag: this._colDrag,
        rowDrag: this._rowDrag,
        sorts: this._sorts,
        filters: pluginParams.filters,
        columnRenderers: this._columnRenderers,
        invalidCells: this._validator.isValid() ? null : this._validator.map,
        selectedRows: _JHGrid._plugin("rowSelection")?.getRenderSet(this) ?? null,
        fillPreview: this._fillPreview,
        deletedRows: this._deletedRows.size > 0 ? this._deletedRows : null,
        skeletonPhase: this._skeletonPhase(),
        rowNumberLabel: this._i18n.rowNumberLabel ?? "No.",
        grouping: pluginParams.grouping,
        groupFooter: pluginParams.groupFooter,
        hiddenNeighbors: this._computeHiddenNeighbors(),
        // null = all editable (no distinction), boolean[] = per-column editable flag.
        // Derived from _isEditable() (not this._editableCols directly) so a per-column
        // `editable: false` override is reflected in the readonly tint even when
        // editableCols is '*'.
        editableColumns: (() => {
          const flags = this._columns.map((_, i) => this._isEditable(i));
          return flags.every(Boolean) ? null : flags;
        })(),
        i18n: this._i18n,
        // Read once per frame, from the clock — see core/anim.js. Stays non-null through a fade-out
        // (the wash needs a row to dissolve on); alpha 0 is what stops it rendering.
        hoverRow: this._hoverRow === null ? null : { row: this._hoverRow, alpha: this._hoverFade.value },
        // Null once the box has landed, so the common case costs the renderer nothing.
        selAnim: this._selPrev && this._selMove.value < 1 ? { prev: this._selPrev, t: this._selMove.value } : null,
        // The residual offset, not the progress — the renderer only needs to know how far the run
        // still has to travel. Null once it has arrived, which is the state the grid is in for all
        // but a fraction of a second per drag.
        colSlide: this._colSlide && this._colSlideTween.value < 1 ? { ...this._colSlide, dx: this._colSlide.dx * (1 - this._colSlideTween.value) } : null,
        remoteSelections: this._remoteSelections ?? null,
        headerCheckboxCols: this._columns.some((f) => this._colDefMap.get(f)?.headerCheckbox) ? new Set(this._columns.filter((f) => this._colDefMap.get(f)?.headerCheckbox)) : null
      });
      this._drawHeaderCheckboxes();
      this._syncKbProxyPosition();
      this._opts.onRender?.();
    }
    _drawHeaderCheckboxes() {
      const geo = this._geo();
      const { headerH, colPositions } = geo;
      const rowH = this._opts.headerHeight;
      const SIZE = 12;
      const dpr = window.devicePixelRatio || 1;
      const ctx = this._canvas.getContext("2d");
      const canvasW = this._canvas.width / dpr;
      const _hcbCellMap = /* @__PURE__ */ new Map();
      for (const cell of computeHeaderCells(this._opts.headerRows, this._columns, this._opts.columnLetterHeader)) {
        if (cell.isLeaf) _hcbCellMap.set(cell.col, cell.row * rowH + cell.rowspan * rowH / 2);
      }
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let col = 0; col < this._columns.length; col++) {
        const field = this._columns[col];
        if (!this._colDefMap.get(field)?.headerCheckbox) continue;
        const x = this._colLeft(col, geo);
        const colW = (colPositions[col + 1] ?? colPositions[col]) - colPositions[col];
        if (x + colW < 0 || x > canvasW) continue;
        const n = colPositions.length - 1;
        const isFrozenLeft = col < geo.frozenCount;
        const isFrozenRight = geo.frozenRightCount > 0 && col >= n - geo.frozenRightCount;
        if (!isFrozenLeft && !isFrozenRight && x < geo.frozenWidth) continue;
        if (!isFrozenLeft && !isFrozenRight && geo.frozenRightCount > 0 && x >= geo.rightX) continue;
        const PAD = this._opts.theme?.cellPadding ?? 4;
        const cx = x + PAD + SIZE / 2;
        const cy = _hcbCellMap.get(col) ?? headerH - rowH / 2;
        const checked = this._headerCheckboxState.get(field) ?? false;
        ctx.fillStyle = checked ? "#2563eb" : "#ffffff";
        ctx.strokeStyle = checked ? "#2563eb" : "#9ca3af";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(cx - SIZE / 2, cy - SIZE / 2, SIZE, SIZE);
        ctx.fill();
        ctx.stroke();
        if (checked) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy);
          ctx.lineTo(cx - 0.5, cy + 2.5);
          ctx.lineTo(cx + 3.5, cy - 2.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    _computeHiddenNeighbors() {
      if (this._hiddenColumns.size === 0 || this._columnOriginalOrder.length === 0) return null;
      const origOrder = this._columnOriginalOrder;
      const hiddenSet = this._hiddenColumns;
      const visibleSet = new Set(this._columns);
      return this._columns.map((field) => {
        const p = origOrder.indexOf(field);
        if (p < 0) return { left: false, right: false };
        let left = false, right = false;
        for (let i = p - 1; i >= 0; i--) {
          if (hiddenSet.has(origOrder[i])) {
            left = true;
            break;
          }
          if (visibleSet.has(origOrder[i])) break;
        }
        for (let i = p + 1; i < origOrder.length; i++) {
          if (hiddenSet.has(origOrder[i])) {
            right = true;
            break;
          }
          if (visibleSet.has(origOrder[i])) break;
        }
        return { left, right };
      });
    }
    // Public API
    // Resolves once the grid's first `fetchMeta`/`fetchData` boot has finished (successfully or not)
    // — i.e. once `this._columns` etc. are populated and any plugin-provided structural API will
    // actually run instead of silently no-op'ing or bailing out while a boot is in flight. Await
    // this before calling one right after construction:
    //   const grid = new JHGrid({ ... });
    //   await grid.ready();
    //   await grid.someStructuralApi(...);
    // Not needed before a *user-triggered* call (e.g. a button's `onclick`), since the page — and so
    // the grid's initial boot — has necessarily already finished loading by then.
    ready() {
      return this._readyPromise;
    }
    setHeaderCheckbox(field, checked) {
      this._headerCheckboxState.set(field, checked);
      this._draw();
    }
    getHeaderCheckbox(field) {
      return this._headerCheckboxState.get(field) ?? false;
    }
    // Schedules a repaint without touching data, scroll position, edits, filters, or sort -- for
    // when something a cellBackground/rowHighlighter callback reads changed outside the grid (host
    // state a plugin keeps, say) and the next frame needs to pick it up. Multiple calls before the
    // next frame coalesce into one draw, same as any other render trigger; much cheaper than refresh()
    // below when nothing about the data itself changed.
    repaint() {
      this._schedDraw();
    }
    // Fully reloads the grid: clears all edits, filters, sort, column widths, and selection,
    // then re-fetches metadata and data from scratch.
    refresh() {
      this._closeFilterPanel();
      this._cancelEdit();
      for (const p of _JHGrid._plugins) p.hideTooltip?.(this);
      this._setSel(null);
      this._scrollTop = 0;
      this._scrollLeft = 0;
      this._page = 0;
      this._edits.clear();
      this._editedRows.clear();
      this._validator.clear();
      this._undoMgr.clear();
      this._editTxn = null;
      this._filters.clear();
      this._trivialSetFilters.clear();
      this._sorts = [];
      this._clearPlugins("full");
      this._rowLayout.clear();
      this._fillDrag = null;
      this._fillPreview = null;
      this._localRows.length = 0;
      this._deletedRows.clear();
      this._serverTotal = 0;
      this._rowPlan.reset(0);
      this._localColumns.clear();
      this._deletedColumns.clear();
      this._dm.setFetch((page, size) => this._opts.fetchData(page, size, null));
      this._columnWidths = [];
      this._columnWidthMap.clear();
      this._columnOriginalOrder = [];
      this._emptyEl.style.display = "none";
      this._loadingEl.style.display = "flex";
      this._wrapper.setAttribute("aria-busy", "true");
      this._updateA11yCell();
      this._boot();
    }
    // Scrolls the viewport so that the given row is visible at the top. When pagination is enabled,
    // this first switches to the page containing the row (like calling goToPage()), then positions
    // within it. Throws TypeError if rowIndex is not a finite number.
    scrollTo(rowIndex) {
      if (typeof rowIndex !== "number" || !isFinite(rowIndex))
        throw new TypeError("[JHGrid] scrollTo: rowIndex must be a finite number");
      if (this._pagination) {
        const targetPage = Math.floor(Math.max(0, rowIndex) / this._pagination.pageSize);
        if (targetPage !== this._page) this._switchToPage(targetPage);
      }
      const { minScrollY, maxScrollY } = this._geo();
      this._scrollTop = Math.min(maxScrollY, Math.max(minScrollY, this._rowLayout.yOf(rowIndex)));
      this._draw();
    }
    // Pagination (public)
    // Jumps to a specific page (0-based), clamped to a valid page. No-op if pagination is not
    // enabled. Resets selection and fires onPageChange if the page actually changes.
    goToPage(page) {
      if (typeof page !== "number" || !isFinite(page)) return;
      this._switchToPage(page);
    }
    // Advances to the next page. No-op at the last page or if pagination is not enabled.
    nextPage() {
      if (!this._pagination) return;
      this._switchToPage(this._page + 1);
    }
    // Goes back to the previous page. No-op at the first page or if pagination is not enabled.
    prevPage() {
      if (!this._pagination) return;
      this._switchToPage(this._page - 1);
    }
    // Returns the current 0-based page index, or 0 if pagination is not enabled.
    getCurrentPage() {
      return this._pagination ? this._page : 0;
    }
    // Returns the total number of pages, or 1 if pagination is not enabled.
    getPageCount() {
      return this._pageCount();
    }
    // Returns all unsaved cell edits as `{ [rowIndex]: { [field]: value } }`.
    getEdits() {
      const result = {};
      this._edits.forEach((value, key) => {
        const u = key.indexOf("_");
        const row = Number(key.slice(0, u));
        const field = key.slice(u + 1);
        (result[row] ??= {})[field] = value;
      });
      return result;
    }
    // Discards all unsaved cell edits and redraws.
    clearEdits() {
      this._edits.clear();
      this._editedRows.clear();
      this._validator.clear();
      this._fillDrag = null;
      this._fillPreview = null;
      this._undoMgr.clear();
      this._editTxn = null;
      this._draw();
    }
    // Draws other participants' current selections as colored outline + name-tag highlights, for
    // real-time collaborative editing -- see Renderer#drawRemoteSelection. `list` is
    // `{ sel, color, label }[]`; `sel` is the same shape this grid's own onSelectionChange reports
    // (single: { type, row, col }, range: { type, r1, c1, r2, c2 }), so a host can take one client's
    // reported selection and hand it straight to every other client's setRemoteSelections() call,
    // unchanged. Entries with no `sel` (a participant who isn't focused in this grid) are skipped.
    setRemoteSelections(list) {
      if (!Array.isArray(list)) throw new TypeError("[JHGrid] setRemoteSelections: list must be an array");
      this._remoteSelections = list;
      this._schedDraw();
    }
    // Programmatically sets a single cell's value, pushing it through the same
    // edit/validation/undo/onCellChange pipeline as a manual edit (checkbox toggle, paste, fill).
    // Useful for driving cell state from outside a normal edit flow — e.g. a `type: 'button'`
    // column's `onClick` toggling another column's value.
    setCellValue(row, field, value) {
      if (!Number.isInteger(row) || row < 0)
        throw new TypeError("[JHGrid] setCellValue: row must be a non-negative integer");
      if (typeof field !== "string")
        throw new TypeError("[JHGrid] setCellValue: field must be a string");
      if (typeof value !== "string")
        throw new TypeError("[JHGrid] setCellValue: value must be a string");
      if (this._columns.length > 0 && !this._columns.includes(field))
        throw new RangeError(`[JHGrid] setCellValue: unknown field "${field}"`);
      if (this._isGroupRow(row)) return;
      this._editTxnBegin();
      this._setEdit(row, field, value);
      this._editTxnCommit();
      this._updateA11yCell();
      this._draw();
    }
    // Bulk counterpart to setCellValue() — same edit/validation/undo/onCellChange pipeline, but for
    // many cells at once (e.g. a header checkbox toggling every filtered row). Calling setCellValue()
    // in a loop pays one full _draw() per cell, which on large row counts stalls the page; this
    // collapses the whole batch into one edit-undo step and one redraw.
    setCellValues(entries) {
      if (!Array.isArray(entries))
        throw new TypeError("[JHGrid] setCellValues: entries must be an array");
      for (const entry of entries) {
        const { row, field, value } = entry ?? {};
        if (!Number.isInteger(row) || row < 0)
          throw new TypeError("[JHGrid] setCellValues: row must be a non-negative integer");
        if (typeof field !== "string")
          throw new TypeError("[JHGrid] setCellValues: field must be a string");
        if (typeof value !== "string")
          throw new TypeError("[JHGrid] setCellValues: value must be a string");
        if (this._columns.length > 0 && !this._columns.includes(field))
          throw new RangeError(`[JHGrid] setCellValues: unknown field "${field}"`);
      }
      this._editTxnBegin();
      for (const { row, field, value } of entries) {
        if (this._isGroupRow(row)) continue;
        this._setEdit(row, field, value);
      }
      this._editTxnCommit();
      this._updateA11yCell();
      this._draw();
    }
    // Adds a new blank (or pre-filled) row (client-side only). By default appends at the bottom;
    // `{ index }` puts it at that visual position instead — anywhere, including between server
    // rows. The row is anchored to the record it precedes rather than to the screen position, so
    // it stays put as rows above it are added or removed. Returns its zero-based visual index.
    addRow(rowData = {}, { index } = {}) {
      return this._withStructuralUndo(() => {
        const insertIdx = index == null ? this._totalRows : Math.max(0, Math.min(index, this._totalRows));
        const localIdx = this._rowPlan.insertLocal(insertIdx);
        this._localRows.splice(localIdx, 0, { ...rowData });
        this._totalRows = this._rowPlan.totalRows;
        this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
        this._emptyEl.style.display = "none";
        if (insertIdx < this._totalRows - 1) {
          this._shiftRowKeyedState((r) => r >= insertIdx ? r + 1 : r, { grow: true });
        }
        this._draw();
        return insertIdx;
      });
    }
    // Deletes a row. What that means depends on where the row came from and on `permanent`:
    //
    //   local row (addRow)          always removed outright — it was never sent anywhere, so there
    //                               is nothing to tell a server about and nothing to mark
    //   server row, permanent off   marked: dimmed with a strikethrough, still on screen, still
    //                               undoable, reported by getDeletedRows()
    //   server row, permanent on    taken off the screen, reported by getRemovedRows()
    //
    // `permanent` defaults to whatever `opts.deleteMode` says, so a screen states its policy once
    // instead of at every call. Passing it explicitly overrides that for this one call — a single
    // screen can legitimately need both, e.g. marking a saved record while discarding a draft.
    //
    // Both server cases leave the server itself untouched — the grid has no authority to delete
    // anything. They differ in what the user sees while deciding.
    deleteRow(rowIndex, { permanent = this._opts.deleteMode === "permanent" } = {}) {
      if (rowIndex < 0 || rowIndex >= this._totalRows) return;
      this._withStructuralUndo(() => {
        const localIdx = this._localIndexAt(rowIndex);
        if (localIdx >= 0) {
          this._localRows.splice(localIdx, 1);
          this._rowPlan.removeLocal(localIdx);
          this._totalRows = this._rowPlan.totalRows;
          this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
          if (this._totalRows === 0) this._emptyEl.style.display = "flex";
          this._shiftAfterRemoval(rowIndex);
        } else if (permanent) {
          if (this._rowPlan.removed.add(this._rowPlan.sourceAt(rowIndex).server)) {
            this._totalRows--;
            this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
            if (this._totalRows === 0) this._emptyEl.style.display = "flex";
            this._shiftAfterRemoval(rowIndex);
          }
        } else {
          this._deletedRows.add(rowIndex);
        }
        if (this._sel) {
          const stale = this._sel.type === "single" ? this._sel.row === rowIndex : this._sel.r1 === rowIndex || this._sel.r2 === rowIndex;
          if (stale) this._setSel(null);
        }
        this._draw();
      });
    }
    // Renumbers everything keyed by a visual row index. Adding a row, removing one, and putting one
    // back are the same operation with a different `shift` — kept in one place because the failure
    // mode of three copies is that a new piece of state gets added to two of them.
    //
    // `drop` names a row whose own state goes away with it (a removal); `grow` says the shift makes
    // room rather than closing a gap, which is the only thing RowLayout needs told apart.
    _shiftRowKeyedState(shift, { drop = -1, grow = false } = {}) {
      const remap = (map, onKey) => {
        const old = new Map(map);
        map.clear();
        old.forEach((val, key) => {
          const u = key.indexOf("_");
          const r = Number(key.slice(0, u));
          if (r === drop) return;
          const nr = shift(r);
          map.set(`${nr}_${key.slice(u + 1)}`, val);
          onKey?.(nr);
        });
      };
      this._editedRows.clear();
      remap(this._edits, (nr) => this._editedRows.add(nr));
      remap(this._validator.map);
      if (this._deletedRows.size > 0) {
        const marks = [...this._deletedRows];
        this._deletedRows.clear();
        for (const r of marks) if (r !== drop) this._deletedRows.add(shift(r));
      }
      if (this._sel) {
        this._sel = this._sel.type === "single" ? { ...this._sel, row: shift(this._sel.row) } : { ...this._sel, r1: shift(this._sel.r1), r2: shift(this._sel.r2) };
      }
      _JHGrid._plugin("rowSelection")?.shiftRows(this, shift, drop);
      if (grow) this._rowLayout.shiftRows(shift);
      else if (drop >= 0) this._rowLayout.deleteRow(drop);
      else this._rowLayout.shiftRows(shift);
    }
    _shiftAfterRemoval(rowIndex) {
      this._shiftRowKeyedState((r) => r > rowIndex ? r - 1 : r, { drop: rowIndex });
    }
    // Removes a deletion mark, or puts back a row that was removed outright. No-op if the row is
    // neither. A removed row has no visual index while it is gone, so it is named by the server
    // index getRemovedRows() reported.
    undeleteRow(rowIndex) {
      if (this._deletedRows.has(rowIndex)) {
        this._withStructuralUndo(() => {
          this._deletedRows.delete(rowIndex);
          this._draw();
        });
        return;
      }
      if (this._rowPlan.removed.has(rowIndex)) {
        this._withStructuralUndo(() => {
          this._rowPlan.removed.delete(rowIndex);
          const visual = this._rowPlan.visualOfServer(rowIndex);
          this._totalRows++;
          this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
          this._emptyEl.style.display = "none";
          this._shiftAfterRestore(visual);
          this._draw();
        });
      }
    }
    // Makes room for a row coming back. Nothing is dropped — the restored row has no state yet.
    _shiftAfterRestore(rowIndex) {
      this._shiftRowKeyedState((r) => r >= rowIndex ? r + 1 : r, { grow: true });
    }
    // Returns shallow copies of all rows added via addRow(), in order.
    getNewRows() {
      return this._localRows.map((r) => ({ ...r }));
    }
    // Server indices of rows marked for deletion — the ones still on screen with a strikethrough.
    // Reported as server indices, not screen positions, so a row removed elsewhere on the grid
    // can't change what this names.
    getDeletedRows() {
      return [...this._deletedRows].map((r) => this._rowPlan.sourceAt(r)?.server ?? -1).filter((s) => s >= 0).sort((a, b) => a - b);
    }
    // Server indices of rows taken off the screen via deleteRow(i, { permanent: true }). Kept apart
    // from getDeletedRows() because the two mean different things to the person who chose them: a
    // mark is still being decided, a removal has been decided. Both still need deleting server-side.
    getRemovedRows() {
      return this._rowPlan.removed.values();
    }
    // getSelectedRows/clearRowSelection are attached to this prototype by
    // core/RowSelection.js's RowSelectionPlugin.install() (installed unconditionally — see the
    // JHGrid.use(RowSelectionPlugin) call at the bottom of this file).
    // Clears all active filters and sort, resets scroll position and selection, then reloads data.
    // Does NOT clear edits.
    clearFilters() {
      this._filters.clear();
      this._trivialSetFilters.clear();
      this._quickFilter = "";
      this._clearPlugins("filterState");
      this._sorts = [];
      this._cancelEdit();
      this._closeFilterPanel();
      this._closeColContextMenu();
      this._closeRowContextMenu();
      this._closeCellContextMenu();
      this._closeColChooser();
      this._closeNewColumnDialog();
      if (this._cellTooltip) this._cellTooltip.style.display = "none";
      for (const p of _JHGrid._plugins) p.hideTooltip?.(this);
      this._dm.setFetch((page, size) => this._opts.fetchData(page, size, null));
      this._scrollTop = 0;
      this._scrollLeft = 0;
      this._setSel(null);
      this._undoMgr.clear();
      this._editTxn = null;
      this._emptyEl.style.display = "none";
      this._loadingEl.style.display = "flex";
      this._wrapper.setAttribute("aria-busy", "true");
      this._updateA11yCell();
      this._boot();
    }
    // State serialization
    // Returns a serializable snapshot of column order, widths, hidden columns, frozen column count,
    // active sort, active filters, header-checkbox state, row selection, and any
    // addColumn()/deleteColumn() pending changes not yet persisted server-side (see commitColumns())
    // — everything else needed to restore the grid to how it looked/behaved, short of unsaved cell
    // edits/new/deleted rows (getEdits()/getNewRows()/getDeletedRows() track those separately, since
    // restoring them isn't a "view state" concern).
    getState() {
      const pluginState = { selectedRows: [], grouping: null, treeData: null, colorFilters: null };
      for (const p of _JHGrid._plugins) p.exportState?.(this, pluginState);
      return {
        columns: [...this._columns],
        columnWidths: Object.fromEntries(this._columns.map((f, i) => [f, this._columnWidths[i]])),
        hiddenColumns: [...this._hiddenColumns.keys()],
        frozenCols: this._opts.frozenCols ?? 0,
        frozenColsRight: this._opts.frozenColsRight ?? 0,
        sorts: this._sorts.map((s) => ({ ...s })),
        filters: Object.fromEntries(this._filters),
        quickFilter: this._quickFilter,
        headerCheckboxState: Object.fromEntries(this._headerCheckboxState),
        localColumns: this.getNewColumns(),
        deletedColumns: this.getDeletedColumns(),
        rowChanges: this._exportRowChanges(),
        ...pluginState
      };
    }
    // Unsaved row work, in a form that survives being written to storage and read back.
    //
    // Everything is named by *server* index, never by screen position. A screen position only means
    // something next to the exact arrangement that produced it, and the whole point of a snapshot is
    // to outlive that. An added row travels with its own edits for the same reason: keyed separately
    // they would be two lists that have to agree about ordering, and one day they wouldn't.
    //
    // Column-level unsaved work (addColumn/deleteColumn) was already in here. Rows being left out
    // was the odd part, not their being added.
    _exportRowChanges() {
      const editsAt = (visual) => {
        const out = {};
        const prefix = `${visual}_`;
        this._edits.forEach((v, k) => {
          if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
        });
        return out;
      };
      const added = this._localRows.map((data, i) => ({
        anchor: this._rowPlan.anchors[i],
        data: { ...data },
        edits: editsAt(this._rowPlan.visualOfLocal(i))
      }));
      const serverEdits = {};
      this._edits.forEach((v, k) => {
        const u = k.indexOf("_");
        const r = Number(k.slice(0, u));
        const src = this._rowPlan.sourceAt(r);
        if (!src || src.local >= 0) return;
        (serverEdits[src.server] ??= {})[k.slice(u + 1)] = v;
      });
      return {
        added,
        removed: this.getRemovedRows(),
        marked: this.getDeletedRows(),
        edits: serverEdits
      };
    }
    // Puts back what _exportRowChanges captured. Order matters: removals first because they decide
    // where everything else lands, then the added rows, and only then the things that name a screen
    // position — by which point the plan can work one out.
    _importRowChanges(rc) {
      if (!rc || typeof rc !== "object") return;
      this._localRows.length = 0;
      this._rowPlan.anchors.length = 0;
      this._rowPlan.removed.clear();
      this._deletedRows.clear();
      this._edits.clear();
      this._editedRows.clear();
      for (const s of rc.removed ?? []) this._rowPlan.removed.add(s);
      const added = [...rc.added ?? []].sort((a, b) => (a.anchor ?? 0) - (b.anchor ?? 0));
      for (const a of added) {
        this._localRows.push({ ...a.data ?? {} });
        this._rowPlan.anchors.push(a.anchor ?? this._rowPlan.serverTotal);
      }
      this._rowPlan.clampAnchors(this._serverTotal);
      this._totalRows = this._rowPlan.totalRows;
      const setEditsAt = (visual, edits) => {
        if (visual < 0 || !edits) return;
        for (const [f, v] of Object.entries(edits)) {
          this._edits.set(`${visual}_${f}`, v);
          this._editedRows.add(visual);
        }
      };
      added.forEach((a, i) => setEditsAt(this._rowPlan.visualOfLocal(i), a.edits));
      for (const [s, edits] of Object.entries(rc.edits ?? {})) {
        setEditsAt(this._rowPlan.visualOfServer(Number(s)), edits);
      }
      for (const s of rc.marked ?? []) {
        const v = this._rowPlan.visualOfServer(s);
        if (v >= 0) this._deletedRows.add(v);
      }
      this._wrapper.setAttribute("aria-rowcount", String(this._totalRows + 1));
      this._emptyEl.style.display = this._totalRows === 0 ? "flex" : "none";
    }
    // Restores a state snapshot previously obtained from {@link getState}. Silently ignores unknown
    // fields in the snapshot.
    setState(state) {
      if (!state) return;
      this._withStructuralUndo(() => {
        if (Array.isArray(state.localColumns)) {
          for (const { field, ...def } of state.localColumns) {
            if (this._columns.includes(field) || this._hiddenColumns.has(field) || this._deletedColumns.has(field)) continue;
            this._addColumnImpl(field, def);
          }
        }
        if (Array.isArray(state.deletedColumns)) {
          for (const field of state.deletedColumns) {
            if (!this._columns.includes(field) || this._localColumns.has(field) || this._deletedColumns.has(field)) continue;
            this._hideColumnInternal(field);
            this._deletedColumns.add(field);
            this._purgeFieldEdits(field);
          }
        }
        if (Array.isArray(state.columns)) {
          const wantHidden = new Set(state.hiddenColumns ?? []);
          [...this._hiddenColumns.keys()].forEach((f) => this._showColumnInternal(f));
          wantHidden.forEach((f) => this._hideColumnInternal(f));
          const savedOrder = state.columns.filter((f) => this._columns.includes(f));
          const others = this._columns.filter((f) => !savedOrder.includes(f));
          const newOrder = [...savedOrder, ...others];
          const reindex = (arr) => newOrder.map((f) => arr[this._columns.indexOf(f)]);
          this._columnLabels = reindex(this._columnLabels);
          this._columnAligns = reindex(this._columnAligns);
          this._columnHeaderAligns = reindex(this._columnHeaderAligns);
          this._columnWidths = reindex(this._columnWidths);
          this._columnRenderers = reindex(this._columnRenderers);
          this._columns = newOrder;
        }
        if (state.columnWidths) {
          Object.entries(state.columnWidths).forEach(([f, w]) => {
            const idx = this._columns.indexOf(f);
            if (idx !== -1) this._columnWidths[idx] = w;
            this._columnWidthMap.set(f, w);
          });
        }
        if (state.frozenCols != null) this._opts.frozenCols = state.frozenCols;
        if (state.frozenColsRight != null) this._opts.frozenColsRight = state.frozenColsRight;
        if (Array.isArray(state.sorts)) {
          const allowExtraSorts = _JHGrid._plugins.some((p) => p.extraSortSlots);
          this._sorts = (allowExtraSorts ? state.sorts : state.sorts.slice(0, 1)).map((s) => ({ ...s }));
        } else if (
          /** @type {any} */
          state.sort
        ) this._sorts = [{ .../** @type {any} */
        state.sort }];
        if (state.filters) {
          this._filters.clear();
          this._trivialSetFilters.clear();
          Object.entries(state.filters).forEach(([k, v]) => this._filters.set(k, v));
        }
        if (typeof state.quickFilter === "string") this._quickFilter = state.quickFilter;
        if (state.headerCheckboxState) {
          this._headerCheckboxState.clear();
          Object.entries(state.headerCheckboxState).forEach(([f, v]) => this._headerCheckboxState.set(f, v));
        }
        this._clamp(this._geo());
        this._updateA11yHeader();
        this._draw();
      });
      for (const p of _JHGrid._plugins) p.importState?.(this, state);
      const refetches = state.sorts !== void 0 || state.filters !== void 0 || state.quickFilter !== void 0;
      const restoreRows = () => {
        if (state.rowChanges) this._importRowChanges(state.rowChanges);
        this._draw();
      };
      if (!refetches) {
        restoreRows();
        return Promise.resolve();
      }
      const loading = this._reloadFiltered({ confirmUnsaved: false, carryRows: false });
      return Promise.resolve(loading).then(restoreRows);
    }
    // Programmatic filter / sort
    // Applies or clears a single-column filter, then reloads data. Passing `null`, `undefined`, or
    // `''` as value removes the filter for that field. Throws if value exceeds 1000 characters or
    // field does not exist.
    setFilter(field, value) {
      if (typeof field !== "string") throw new TypeError("[JHGrid] setFilter: field must be a string");
      if (value !== null && value !== void 0 && value !== "" && typeof value !== "string")
        throw new TypeError("[JHGrid] setFilter: value must be a string, null, or undefined");
      if (typeof value === "string" && value.length > 1e3)
        throw new RangeError("[JHGrid] setFilter: value exceeds maximum length of 1000 characters");
      if (this._columns.length > 0 && !this._columns.includes(field))
        throw new RangeError(`[JHGrid] setFilter: unknown field "${field}"`);
      this._trivialSetFilters.delete(field);
      if (value == null || value === "") this._filters.delete(field);
      else this._filters.set(field, value);
      this._reloadFiltered();
    }
    // Removes the active filter for a specific field and reloads data. No-op if the field has no active filter.
    removeFilter(field) {
      if (typeof field !== "string") throw new TypeError("[JHGrid] removeFilter: field must be a string");
      if (!this._filters.has(field)) return;
      this._filters.delete(field);
      this._trivialSetFilters.delete(field);
      this._reloadFiltered();
    }
    // Applies or clears a Set-filter (exact-match checkbox list, as opposed to setFilter()'s
    // substring match) for a single column, then reloads. `values` is the list of allowed values
    // (coerced to strings); null/undefined clears it, equivalent to removeFilter(field). Also
    // reachable from the header filter panel when the column's distinct values are cheap to
    // discover from already-loaded rows — see _discoverFilterValues().
    // Unlike the panel's own checkbox-list apply, this has no distinctValues to compare `values`
    // against, so it can't tell whether every possible value was passed — the header filter icon
    // always shows active here, even if `values` happens to cover the whole column.
    setFilterValues(field, values) {
      if (typeof field !== "string") throw new TypeError("[JHGrid] setFilterValues: field must be a string");
      if (values !== null && values !== void 0 && !Array.isArray(values))
        throw new TypeError("[JHGrid] setFilterValues: values must be an array, null, or undefined");
      if (this._columns.length > 0 && !this._columns.includes(field))
        throw new RangeError(`[JHGrid] setFilterValues: unknown field "${field}"`);
      this._trivialSetFilters.delete(field);
      if (values == null) this._filters.delete(field);
      else this._filters.set(field, values.map(String));
      this._reloadFiltered();
    }
    // Sets the global quick filter (a single opaque search term applied across every column — the
    // host's fetchData/fetchMeta decides how, via state.quickFilter) and reloads. '' / null /
    // undefined clears it. There is no built-in search box for this (JHGrid has no top toolbar of
    // its own) — wire it to your own input's 'input' event, debouncing there if desired.
    setQuickFilter(value) {
      if (value !== null && value !== void 0 && typeof value !== "string")
        throw new TypeError("[JHGrid] setQuickFilter: value must be a string, null, or undefined");
      if (typeof value === "string" && value.length > 1e3)
        throw new RangeError("[JHGrid] setQuickFilter: value exceeds maximum length of 1000 characters");
      const next = value ?? "";
      if (next === this._quickFilter) return;
      this._quickFilter = next;
      this._reloadFiltered();
    }
    // Current quick filter term ('' when inactive).
    getQuickFilter() {
      return this._quickFilter;
    }
    // Shorthand for setQuickFilter('').
    clearQuickFilter() {
      this.setQuickFilter("");
    }
    // Sets the active sort column and direction, then reloads data.
    setSort(field, dir = "asc") {
      if (typeof field !== "string") throw new TypeError("[JHGrid] setSort: field must be a string");
      if (dir !== "asc" && dir !== "desc")
        throw new RangeError('[JHGrid] setSort: dir must be "asc" or "desc"');
      if (this._columns.length > 0 && !this._columns.includes(field))
        throw new RangeError(`[JHGrid] setSort: unknown field "${field}"`);
      this._sorts = [{ field, dir }];
      this._reloadFiltered();
    }
    // Removes the sort for a specific field. No-op if field is not sorted.
    removeSort(field) {
      if (typeof field !== "string") throw new TypeError("[JHGrid] removeSort: field must be a string");
      const len = this._sorts.length;
      this._sorts = this._sorts.filter((s) => s.field !== field);
      if (this._sorts.length !== len) this._reloadFiltered();
    }
    // Clears all active sorts and reloads data. No-op if no sorts are active.
    clearSort() {
      if (this._sorts.length === 0) return;
      this._sorts = [];
      this._reloadFiltered();
    }
    // Row data access
    // Returns the raw server row object for a given row index, or `null` if the chunk containing
    // that row has not yet been loaded.
    getRowData(rowIndex) {
      return this._getRow(rowIndex);
    }
    // Returns the row's pre-edit snapshot -- what getRowData() would have returned for this index
    // before any unsaved cell edits were applied. Unlike a snapshot taken by the caller at fetch
    // time, this stays correct across any addRow()/deleteRow() calls that happen afterward
    // (including ones from the built-in row context menu), because it is resolved through the same
    // index-shift-aware row plan getRowData() itself uses. Useful for a "what changed" diff, or as a
    // stable WHERE-clause anchor on tables with no primary key.
    getOriginalRowData(rowIndex) {
      const base = this._rowSource(rowIndex);
      return base ? { ...base } : null;
    }
    // True if the row at this index was added via addRow() and has no server-side counterpart yet.
    isNewRow(rowIndex) {
      return this._localIndexAt(rowIndex) >= 0;
    }
    // Tells the grid that the row at `rowIndex` has just been persisted with `savedData` as its
    // confirmed server-side value. Patches the cache in place and drops any pending edit for that
    // row, so the next edit's getOriginalRowData()/getEdits() picks up from here -- without the
    // full reset (scroll position, filters, sort, selection) refresh() does. Meant for a host that
    // saves incrementally (e.g. auto-save on commit) and doesn't want a disruptive reload after
    // every edit.
    //
    // No-op for a row added via addRow() (isNewRow() true) -- it has no server slot yet to patch;
    // use acknowledgeInsert() once that row's own create request lands instead.
    acknowledgeSave(rowIndex, savedData) {
      const src = this._rowPlan.sourceAt(rowIndex);
      if (!src || src.local >= 0) return;
      this._dm.setRow(src.server, { ...savedData });
      this._columns.forEach((field) => this._edits.delete(`${rowIndex}_${field}`));
      this._editedRows.delete(rowIndex);
      this._updateA11yCell();
      this._draw();
    }
    // Turns a just-created row (added via addRow(), then POSTed by the host) into an ordinary server
    // row in place, so the next edit on it PUTs instead of POSTing a duplicate -- without refresh()'s
    // full reload (which would also drop filters/sort/selection). Returns false only if `rowIndex`
    // is not a local (still-unsaved) row -- nothing to promote.
    //
    // Anchors record "before server row N". Promoting a row anchored at N to a real server row at
    // index N grows serverTotal by one, and everything else that referenced server indices >= N --
    // other added rows still anchored there, and rows already marked removed -- has to move up by one
    // to keep meaning the same record, since there is now a real row occupying N. Total row count and
    // every row's visual position stay the same; only this one row's source flips from local to
    // server, and the (renumbered) rows from N on trade places with their new indices.
    //
    // The cache already holds correct values for every row from N on -- they just need to slide over
    // by one to make room, not be re-fetched. A re-fetch is actively wrong here for a table with no
    // fixed row order: the server has no notion of "the row that was visually at this position" and
    // would hand back rows in its own default order, which can land far from where the row was
    // inserted -- reading, from the host's side, as an unprompted resort. dm.insertAt() shifts the
    // cache in place instead, so a plain append (nothing after it) and a mid-list insert (everything
    // after it) both just work, with no network round trip either way.
    acknowledgeInsert(rowIndex, savedData) {
      const src = this._rowPlan.sourceAt(rowIndex);
      if (!src || src.local < 0) return false;
      const rp = this._rowPlan;
      const anchor = rp.anchors[src.local];
      rp.serverTotal++;
      rp.anchors.splice(src.local, 1);
      for (let i = 0; i < rp.anchors.length; i++) {
        if (rp.anchors[i] >= anchor) rp.anchors[i]++;
      }
      rp.removed.shiftFrom(anchor);
      this._localRows.splice(src.local, 1);
      this._dm.insertAt(anchor, { ...savedData });
      this._columns.forEach((field) => this._edits.delete(`${rowIndex}_${field}`));
      this._editedRows.delete(rowIndex);
      this._updateA11yCell();
      this._draw();
      return true;
    }
    // Column auto-fit (public)
    // Resizes one or more columns to fit their content (header + cached data). Columns with a custom
    // renderer are skipped — canvas drawing cannot be measured. Pass no arguments to fit all visible columns.
    autoFitColumns(...fields) {
      if (this._destroyed) return;
      this._withStructuralUndo(() => {
        const targets = fields.length ? fields.map((f) => this._columns.indexOf(f)).filter((i) => i !== -1) : this._columns.map((_, i) => i);
        targets.forEach((i) => this._autoFitCol(i));
        this._clamp(this._geo());
        this._draw();
        if (this._opts.onColumnResize) {
          targets.forEach(
            (i) => this._opts.onColumnResize(this._columns[i], this._columnWidths[i])
          );
        }
      });
    }
    // Row height (public)
    // setRowHeight(height) changes the default pixel height used by every row that doesn't have
    // its own override. setRowHeight(rowIndex, height) sets just that one row's individual height
    // (Excel-style — same thing a row-number-gutter boundary drag does; see _rowResize in _bind()).
    // Throws if height is not a positive finite number, or (two-arg form) rowIndex is out of range.
    setRowHeight(rowIndexOrHeight, height) {
      if (this._destroyed) return;
      if (height === void 0) {
        if (typeof rowIndexOrHeight !== "number" || !isFinite(rowIndexOrHeight) || rowIndexOrHeight <= 0)
          throw new TypeError("[JHGrid] setRowHeight: height must be a positive finite number");
        this._commitEdit();
        this._opts.rowHeight = rowIndexOrHeight;
        this._rowLayout.defaultHeight = rowIndexOrHeight;
        this._clamp(this._geo());
        this._draw();
        return;
      }
      const row = rowIndexOrHeight;
      if (typeof row !== "number" || !Number.isInteger(row) || row < 0 || row >= this._totalRows)
        throw new RangeError("[JHGrid] setRowHeight: rowIndex out of range");
      if (typeof height !== "number" || !isFinite(height) || height <= 0)
        throw new TypeError("[JHGrid] setRowHeight: height must be a positive finite number");
      this._commitEdit();
      this._rowLayout.setHeight(row, height);
      this._clamp(this._geo());
      this._draw();
    }
    // Returns rowIndex's current pixel height (its own override, or the shared default).
    getRowHeight(rowIndex) {
      return this._rowLayout.heightOf(rowIndex);
    }
    // Clears rowIndex's individual height override, if any, back to the shared default.
    resetRowHeight(rowIndex) {
      if (this._destroyed || !this._rowLayout.hasOverride(rowIndex)) return;
      this._commitEdit();
      this._rowLayout.setHeight(rowIndex, this._rowLayout.defaultHeight);
      this._clamp(this._geo());
      this._draw();
    }
    // Column visibility (public)
    // Hides the specified column. No-op if already hidden.
    hideColumn(field) {
      if (this._hiddenColumns.has(field)) return;
      this._withStructuralUndo(() => {
        this._hideColumnInternal(field);
        this._clamp(this._geo());
        this._updateA11yHeader();
        this._updateA11yCell();
        this._draw();
      });
    }
    // Shows a previously hidden column. No-op if already visible.
    showColumn(field) {
      if (!this._hiddenColumns.has(field)) return;
      this._withStructuralUndo(() => {
        this._showColumnInternal(field);
        this._clamp(this._geo());
        this._updateA11yHeader();
        this._draw();
      });
    }
    isColumnVisible(field) {
      return !this._hiddenColumns.has(field);
    }
    // Returns the field names of all currently hidden columns.
    getHiddenColumns() {
      return [...this._hiddenColumns.keys()];
    }
    // Column add / delete (public)
    // If both immediate neighbors of a newly inserted column belong to the same
    // headerRows group (fields-based groups only), fold the new column into that
    // group too — otherwise it would split the group's label into two sibling
    // cells with a blank, group-less gap in between.
    _foldColumnIntoAdjacentGroups(field, insertIdx) {
      const headerRows = this._opts.headerRows;
      if (!headerRows?.length) return;
      const leftField = insertIdx > 0 ? this._columns[insertIdx - 1] : null;
      const rightField = insertIdx < this._columns.length - 1 ? this._columns[insertIdx + 1] : null;
      if (!leftField || !rightField) return;
      for (const row of headerRows) {
        for (const def of row ?? []) {
          if (def.fields?.includes(leftField) && def.fields?.includes(rightField) && !def.fields.includes(field)) {
            def.fields.push(field);
          }
        }
      }
    }
    // Adds a new column (client-side only), analogous to addRow(). No-op (returns false) if the
    // field already exists (visible, hidden, or deleted). If both immediate neighbors of the
    // insertion point belong to the same opts.headerRows group, the new column is folded into that
    // group too (avoiding a label-splitting gap).
    addColumn(field, def = {}, { index } = {}) {
      if (typeof field !== "string" || !field) return false;
      if (this._columns.includes(field) || this._hiddenColumns.has(field) || this._deletedColumns.has(field)) return false;
      return this._withStructuralUndo(() => this._addColumnImpl(field, def, index));
    }
    _addColumnImpl(field, def, index) {
      this._colDefMap.set(field, {
        label: def.label,
        align: def.align,
        headerAlign: def.headerAlign,
        width: def.width,
        renderer: def.renderer,
        editable: def.editable,
        type: def.type,
        options: def.options,
        validation: def.validation,
        button: def.button,
        editor: def.editor,
        editorOptions: def.editorOptions,
        treeColumn: def.treeColumn,
        group: def.group
      });
      this._localColumns.set(field, { ...def });
      const insertIdx = index == null ? this._columns.length : Math.max(0, Math.min(index, this._columns.length));
      const label = def.label ?? field;
      const align = def.align ?? "left";
      const headerAlign = def.headerAlign ?? align;
      const width = def.width ?? this._opts.colWidth;
      const resolvedRenderer = def.renderer ? typeof def.renderer === "function" ? def.renderer : CellRenderers[def.renderer]?.() ?? null : def.type === "checkbox" ? CellRenderers.checkbox() : def.type === "dropdown" ? CellRenderers.dropdown() : def.type === "button" ? CellRenderers.button(def.button ?? {}) : def.type === "date" ? CellRenderers.date({ format: def.format, align: def.align }) : def.type === "multiselect" ? CellRenderers.multiselect() : def.type === "richtext" ? CellRenderers.richtext() : def.type === "image" ? CellRenderers.image() : null;
      const renderer = def.treeColumn ? CellRenderers.tree({ inner: resolvedRenderer }) : resolvedRenderer;
      const splice = (arr, val) => {
        const c = [...arr];
        c.splice(insertIdx, 0, val);
        return c;
      };
      this._columns = splice(this._columns, field);
      this._columnLabels = splice(this._columnLabels, label);
      this._columnAligns = splice(this._columnAligns, align);
      this._columnHeaderAligns = splice(this._columnHeaderAligns, headerAlign);
      this._columnWidths = splice(this._columnWidths, width);
      this._columnRenderers = splice(this._columnRenderers, renderer);
      this._columnWidthMap.set(field, width);
      this._foldColumnIntoAdjacentGroups(field, insertIdx);
      const afterField = this._columns[insertIdx + 1] ?? null;
      const origIdx = afterField ? this._columnOriginalOrder.indexOf(afterField) : -1;
      if (origIdx === -1) this._columnOriginalOrder.push(field);
      else this._columnOriginalOrder.splice(origIdx, 0, field);
      if (this._sel) {
        const shift = (c) => c >= insertIdx ? c + 1 : c;
        this._sel = this._sel.type === "single" ? { ...this._sel, col: shift(this._sel.col) } : { ...this._sel, c1: shift(this._sel.c1), c2: shift(this._sel.c2) };
      }
      this._clamp(this._geo());
      this._updateA11yHeader();
      this._draw();
      return true;
    }
    // Removes a local column (added via addColumn) entirely, or marks a server column for deletion
    // (hidden from view; call getDeletedColumns() to retrieve field names for server-side
    // processing, or undeleteColumn() to restore).
    deleteColumn(field) {
      if (!this._columns.includes(field)) return false;
      this._withStructuralUndo(() => {
        if (this._localColumns.has(field)) {
          const idx = this._columns.indexOf(field);
          const keep = (_, i) => i !== idx;
          this._columns = this._columns.filter(keep);
          this._columnLabels = this._columnLabels.filter(keep);
          this._columnAligns = this._columnAligns.filter(keep);
          this._columnHeaderAligns = this._columnHeaderAligns.filter(keep);
          this._columnWidths = this._columnWidths.filter(keep);
          this._columnRenderers = this._columnRenderers.filter(keep);
          this._remapSelForColRemoval(idx);
          this._localColumns.delete(field);
          this._colDefMap.delete(field);
          this._columnWidthMap.delete(field);
          const origIdx = this._columnOriginalOrder.indexOf(field);
          if (origIdx !== -1) this._columnOriginalOrder.splice(origIdx, 1);
        } else {
          this._hideColumnInternal(field);
          this._deletedColumns.add(field);
        }
        this._purgeFieldEdits(field);
        this._clamp(this._geo());
        this._updateA11yHeader();
        this._updateA11yCell();
        this._draw();
      });
      return true;
    }
    // Removes a deletion mark from a server column previously removed via deleteColumn(). No-op if
    // the field is not marked deleted. The column reappears at its original position.
    undeleteColumn(field) {
      if (!this._deletedColumns.has(field)) return;
      this._withStructuralUndo(() => {
        this._deletedColumns.delete(field);
        this._showColumnInternal(field);
        this._clamp(this._geo());
        this._updateA11yHeader();
        this._draw();
      });
    }
    // Returns shallow copies of the definitions of all columns added via addColumn(), in order.
    getNewColumns() {
      return [...this._localColumns].map(([field, def]) => ({ field, ...def }));
    }
    // Returns the field names of all server columns marked for deletion via deleteColumn().
    getDeletedColumns() {
      return [...this._deletedColumns];
    }
    // Call after your own save request has persisted pending column changes (getNewColumns() /
    // getDeletedColumns()) to the server — marks them as no longer pending, without touching the
    // rendered grid. A field added via addColumn() stops being reported by getNewColumns() (it keeps
    // rendering exactly as before — _colDefMap already holds everything needed to draw it); a field
    // removed via deleteColumn() stops being reported by getDeletedColumns() (it stays hidden — that
    // deletion is now real). `fields` may be a single field name, an array, or omitted to commit every
    // pending column change at once. Fields with no pending add/delete are silently ignored.
    commitColumns(fields) {
      const list = fields == null ? [...this._localColumns.keys(), ...this._deletedColumns] : Array.isArray(fields) ? fields : [fields];
      for (const field of list) {
        this._localColumns.delete(field);
        this._deletedColumns.delete(field);
      }
    }
    // Print
    // Opens a print-preview window containing the currently loaded rows as an HTML table. Only rows
    // that have already been loaded into the client cache are included.
    printGrid({ title = "", includeHeaders = true } = {}) {
      const cols = this._columns.filter((f) => !this._hiddenColumns.has(f));
      const labels = cols.map((f) => this._colDefMap.get(f)?.label ?? f);
      const sortedRows = collectSortedRows(
        (cb) => this._dm.forEachLoaded(cb),
        this._localRows,
        (s) => this._rowPlan.visualOfServer(s),
        (i) => this._rowPlan.visualOfLocal(i)
      ).map(([rowIndex, rowData]) => {
        const cells = {};
        for (const f of cols) {
          const key = `${rowIndex}_${f}`;
          const raw = this._edits.has(key) ? this._edits.get(key) : rowData?.[f];
          cells[f] = formatCellForDisplay(raw, this._colDefMap.get(f), this._opts.theme.locale);
        }
        return cells;
      });
      const lang = document.documentElement.lang || navigator.language || "en";
      const html = buildPrintHtml({
        cols,
        labels,
        rows: sortedRows,
        title,
        includeHeaders,
        i18n: this._i18n,
        lang
      });
      const win = window.open("", "_blank", "width=1000,height=720");
      if (!win) {
        console.error("[JHGrid] printGrid: popup blocked");
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
    }
    // CSV export
    // Generates a CSV file and triggers a browser download. Values starting with `=`, `+`, `-`, `@`,
    // tab, or CR are prefixed with `'` to prevent formula injection in spreadsheet applications.
    // `opts.full`: when `true`, fetches every row matching the grid's current filter/sort state —
    // text filters/sorts via the server, plus any active color filters — instead of only exporting
    // already-loaded cache chunks.
    async exportCsv({ filename, delimiter = ",", includeHeaders = true, bom = true, full = false } = {}) {
      const esc = (v) => escapeCsvValue(v, delimiter);
      const rowLines = [];
      if (includeHeaders) {
        rowLines.push(this._columnLabels.map(esc).join(delimiter));
      }
      const cellFor = (f, raw) => formatCellForDisplay(raw, this._colDefMap.get(f), this._opts.theme.locale);
      if (full) {
        const state = this._filterState();
        await this._forEachFilteredRow(state, (pageRows, baseIndex) => {
          pageRows.forEach((rowData, i) => {
            const line = this._columns.map((f) => {
              const raw = baseIndex != null && this._edits.has(`${baseIndex + i}_${f}`) ? this._edits.get(`${baseIndex + i}_${f}`) : rowData?.[f];
              return esc(cellFor(f, raw));
            });
            rowLines.push(line.join(delimiter));
          });
        });
      } else {
        const sortedEntries = collectSortedRows(
          (cb) => this._dm.forEachLoaded(cb),
          this._localRows,
          (s) => this._rowPlan.visualOfServer(s),
          (i) => this._rowPlan.visualOfLocal(i)
        );
        for (const [rowIndex, rowData] of sortedEntries) {
          const line = this._columns.map((f) => {
            const editKey = `${rowIndex}_${f}`;
            const val = this._edits.has(editKey) ? this._edits.get(editKey) : rowData?.[f];
            return esc(cellFor(f, val));
          });
          rowLines.push(line.join(delimiter));
        }
        const serverLoadedCount = sortedEntries.length - this._localRows.length;
        if (this._serverTotal > serverLoadedCount) {
          console.warn(`[JHGrid] exportCsv: ${serverLoadedCount} of ${this._serverTotal} server rows exported (only loaded chunks). Pass { full: true } to export all server rows.`);
        }
      }
      const content = (bom ? "\uFEFF" : "") + rowLines.join("\r\n");
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? this._i18n.exportCsvFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    // Excel export (getExcelExportSchema/exportExcel) is attached to this prototype by an
    // installed plugin (see JHGrid.use()). CSV export above has no such dependency (core/csv.js
    // only, no xlsx dependency).
    // Removes all DOM nodes created by the grid, cancels pending animations, and detaches all event
    // listeners. The instance must not be used after this call.
    destroy() {
      this._destroyed = true;
      this._clearPlugins("filterState");
      cancelAnimationFrame(this._announceRaf);
      cancelAnimationFrame(this._schedRaf);
      this._hoverFade.stop();
      this._selMove.stop();
      this._scrollEase.stop();
      this._colSlideTween.stop();
      this._dm.onChunkLoaded = null;
      removeLoadListener(this._imageLoadListener);
      for (const url of this._pastedImageUrls) URL.revokeObjectURL(url);
      this._pastedImageUrls.clear();
      this._hcMq?.removeEventListener("change", this._hcMqHandler);
      this._dprMq?.removeEventListener("change", this._dprMqHandler);
      this._resizeObserver?.disconnect();
      this._pagerBar = null;
      const ev = this._ev;
      clearTimeout(this._tooltipTimer);
      clearTimeout(this._errorBannerTimer);
      this._stopDragAutoScroll();
      this._cancelEdit();
      this._closeFilterPanel();
      this._closeColContextMenu();
      this._closeRowContextMenu();
      this._closeCellContextMenu();
      this._closeColChooser();
      this._closeNewColumnDialog();
      this._canvas.removeEventListener("wheel", ev.wheel);
      this._canvas.removeEventListener("mousedown", ev.mousedown);
      this._canvas.removeEventListener("dblclick", ev.dblclick);
      this._canvas.removeEventListener("contextmenu", ev.contextmenu);
      this._canvas.removeEventListener("touchstart", ev.touchstart);
      this._canvas.removeEventListener("touchmove", ev.touchmove);
      this._canvas.removeEventListener("touchend", ev.touchend);
      this._canvas.removeEventListener("touchcancel", ev.touchend);
      this._kbProxy.removeEventListener("keydown", ev.keydown);
      this._kbProxy.removeEventListener("copy", ev.copy);
      this._kbProxy.removeEventListener("paste", ev.paste);
      this._kbProxy.removeEventListener("focus", ev.focus);
      this._kbProxy.removeEventListener("input", ev.kbProxyInput);
      window.removeEventListener("mousemove", ev.mousemove);
      window.removeEventListener("mouseup", ev.mouseup);
      document.removeEventListener("mousedown", ev.docMousedown);
      document.removeEventListener("touchstart", ev.docMousedown);
      this._cancelLongPress();
      this._container.replaceChildren();
    }
  };
  JHGrid.use(RowSelectionPlugin);

  // index.js
  var VERSION = "0.1.1";
  var SUPPORTED_BROWSERS = {
    chrome: 99,
    edge: 99,
    firefox: 112,
    safari: 15.4
  };
  return __toCommonJS(index_exports);
})();
