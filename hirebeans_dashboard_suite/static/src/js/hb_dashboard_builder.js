/** @odoo-module **/
import { Component, useState, onMounted, onWillUnmount, useRef, onPatched, markup } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { loadJS, loadCSS } from "@web/core/assets";

// Vendored locally under static/lib/ (no external CDN) — served automatically
// by Odoo's static file route, loaded on-demand with the same lazy pattern as
// before, just same-origin instead of a third-party host.
const GRIDSTACK_CSS = "/hirebeans_dashboard_suite/static/lib/gridstack/gridstack.min.css";
const GRIDSTACK_JS  = "/hirebeans_dashboard_suite/static/lib/gridstack/gridstack-all.js";
const ECHARTS_JS    = "/hirebeans_dashboard_suite/static/lib/echarts/echarts.min.js";
const HTML2CANVAS   = "/hirebeans_dashboard_suite/static/lib/html2canvas/html2canvas.min.js";
const JSPDF         = "/hirebeans_dashboard_suite/static/lib/jspdf/jspdf.umd.min.js";
const SHEETJS       = "/hirebeans_dashboard_suite/static/lib/sheetjs/xlsx.full.min.js";

const DATE_FILTER_LABELS = {
    all: "All Time", today: "Today", yesterday: "Yesterday",
    this_week: "This Week", last_week: "Last Week",
    this_month: "This Month", last_month: "Last Month",
    this_quarter: "This Quarter", last_quarter: "Last Quarter",
    this_year: "This Year", last_year: "Last Year",
    last_7: "Last 7 Days", last_14: "Last 14 Days",
    last_30: "Last 30 Days", last_60: "Last 60 Days",
    last_90: "Last 90 Days", last_180: "Last 180 Days",
    last_365: "Last 365 Days", mtd: "Month to Date",
    qtd: "Quarter to Date", ytd: "Year to Date", custom: "Custom Range",
};

const CHART_TYPES = [
    { type: "tile",       icon: "fa-th-large",      label: "KPI Tile" },
    { type: "bar",        icon: "fa-bar-chart",      label: "Bar" },
    { type: "line",       icon: "fa-line-chart",     label: "Line" },
    { type: "area",       icon: "fa-area-chart",     label: "Area" },
    { type: "pie",        icon: "fa-pie-chart",      label: "Pie" },
    { type: "doughnut",   icon: "fa-circle-o",       label: "Doughnut" },
    { type: "funnel",     icon: "fa-filter",         label: "Funnel" },
    { type: "radar",      icon: "fa-star-o",         label: "Radar" },
    { type: "scatter",    icon: "fa-braille",        label: "Scatter" },
    { type: "gauge",      icon: "fa-dashboard",      label: "Gauge" },
    { type: "treemap",    icon: "fa-th",             label: "Treemap" },
    { type: "heatmap",    icon: "fa-table",          label: "Heatmap" },
    { type: "waterfall",  icon: "fa-signal",         label: "Waterfall" },
    { type: "boxplot",    icon: "fa-sliders",        label: "Box Plot" },
    { type: "candlestick",icon: "fa-bar-chart",      label: "Candlestick" },
    { type: "map",        icon: "fa-globe",          label: "Map" },
    { type: "list",       icon: "fa-list",           label: "List View" },
];

const KPI_COLORS = ["blue", "green", "orange", "red", "purple", "teal", "pink", "indigo"];
const KPI_ICONS  = [
    "fa-bar-chart", "fa-line-chart", "fa-pie-chart", "fa-users", "fa-money",
    "fa-shopping-cart", "fa-truck", "fa-cube", "fa-trophy", "fa-bullseye",
    "fa-file-text", "fa-clock-o", "fa-star", "fa-check-circle", "fa-tachometer",
    "fa-cog", "fa-building", "fa-calendar",
];

// ─── Dashboard Builder Component ──────────────────────────────────────────────
export class HbDashboardBuilder extends Component {
    static template = "hirebeans_dashboard_suite.DashboardBuilder";
    static props = ["*"];

    setup() {
        this.action      = useService("action");
        this.notification = useService("notification");

        this.gridRef  = useRef("gridContainer");
        this._grid    = null;
        this._charts  = {};
        this._refreshTimer = null;

        this.state = useState({
            dashboard:      null,
            items:          [],
            loading:        true,
            editMode:       false,
            aiPanelOpen:    false,
            showItemDialog: false,
            showDashboardDialog: false,
            showShareDialog: false,
            showExportMenu: false,
            aiLoading:      false,
            aiExplainText:  "",
            aiExplainItem:  null,
            configAiProvider: "disabled",
            configEnableExport: true,
            configEnableCrossfilter: true,
            configEnableFilterbar: true,
            configEnableFormula: true,

            // Active filters (runtime, not persisted)
            filters: {
                date_filter: "this_month",
                date_from:   "",
                date_to:     "",
            },

            // Filter bar: manually-added chips + the one click-to-filter chip
            // (cross-filtering). Both feed the same model_domain mechanism.
            filterChips: [],
            filterPopover: {
                open: false,
                modelSelOpen: false, modelSelQuery: "",
                model: "", modelLabel: "",
                fields: [], fieldsLoaded: false,
                field: "", fieldLabel: "", fieldType: "char", selectionOptions: [],
                operator: "=",
                value: "",
            },

            // Item dialog state
            editItem:       null,  // item being edited (null = new)
            itemForm:       this._emptyItemForm(),

            // AI panel
            aiModel:        "",
            aiIntent:       "",
            aiLoading:      false,
            aiResponse:     "",

            // Dashboard edit form
            dashForm: {},

            // Models/fields for item dialog
            models:         [],
            fields:         [],
            modelsLoading:  false,
            fieldsLoading:  false,

            // Searchable model selector dropdown state
            modelSel: {
                open:        false,  // panel visible?
                query:       '',     // current search term
                total:       0,      // total results from backend
                offset:      0,      // pagination cursor for Load More
                highlighted: -1,     // keyboard-focused row index
            },

            // Searchable field-picker dropdown state (List View columns)
            listFieldSel: {
                open:  false,
                query: '',
            },

            // Visual domain builder state
            domainBuilder: {
                rules:     [],      // [{field, fieldType, operator, value}]
                matchMode: 'ALL',   // 'ALL' (AND) | 'ANY' (OR)
                advanced:  false,   // show raw textarea instead
            },
        });

        this.CHART_TYPES = CHART_TYPES;
        this.KPI_COLORS  = KPI_COLORS;
        this.KPI_ICONS   = KPI_ICONS;
        this.DATE_FILTER_LABELS = DATE_FILTER_LABELS;

        onMounted(async () => {
            await this._loadLibraries();
            await this._loadDashboard();
            await this._loadConfig();
        });

        onWillUnmount(() => {
            this._disposeAll();
        });
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    async _loadLibraries() {
        // Load the vendored libraries in parallel with a 6-second timeout each.
        // If loading is slow, we continue anyway and fall back to CSS-only layout.
        const withTimeout = (promise, ms = 6000) =>
            Promise.race([promise, new Promise(r => setTimeout(r, ms))]);
        try {
            await Promise.all([
                withTimeout(loadCSS(GRIDSTACK_CSS)),
                withTimeout(loadJS(GRIDSTACK_JS)),
                withTimeout(loadJS(ECHARTS_JS)),
            ]);
        } catch (e) {
            console.warn("[BI Dashboard] Library load warning:", e.message);
        }
    }

    async _loadConfig() {
        try {
            const res = await rpc("/hb_dashboard/get_config", {});
            if (res.status === "ok") {
                this.state.configAiProvider   = res.data.ai_provider;
                this.state.configEnableExport  = res.data.enable_export;
                this.state.configEnableCrossfilter = res.data.enable_crossfilter;
                this.state.configEnableFilterbar   = res.data.enable_filterbar;
                this.state.configEnableFormula     = res.data.enable_formula;
            }
        } catch (e) { /* ignore */ }
    }

    async _loadDashboard() {
        this.state.loading = true;
        const dashboard_id = this.props.dashboard_id ||
            (this.props.params && this.props.params.dashboard_id) ||
            (this.props.action && this.props.action.params && this.props.action.params.dashboard_id);

        if (!dashboard_id) {
            this.state.loading = false;
            this._toast("No dashboard ID provided", "error");
            return;
        }

        try {
            const res = await rpc("/hb_dashboard/get", {
                dashboard_id,
                filters: this.state.filters,
            });
            if (res.status === "ok") {
                this.state.dashboard = res.data.dashboard;
                this.state.items     = res.data.items || [];
                this.state.filters.date_filter = res.data.dashboard.default_date_filter || "this_month";

                // CRITICAL FIX: set loading=false BEFORE nextTick so OWL renders
                // the grid container (inside t-elif="state.dashboard") first.
                // Without this, this.gridRef.el is null and GridStack never inits.
                this.state.loading = false;
                await this._nextTick();
                await this._waitForGridEl();

                this._applyTheme(res.data.dashboard.theme);
                this._initGrid();
                this._populateGrid();
                this._renderAllCharts();

                // Auto-refresh
                if (res.data.dashboard.auto_refresh && res.data.dashboard.refresh_interval > 0) {
                    this._refreshTimer = setInterval(
                        () => this._refreshAllCharts(),
                        res.data.dashboard.refresh_interval * 1000
                    );
                }
            } else {
                this.state.loading = false;
                this._toast("Error loading dashboard: " + res.message, "error");
            }
        } catch (e) {
            console.error("[BI Dashboard] Load error:", e);
            this.state.loading = false;
            this._toast("Failed to load dashboard", "error");
        }
    }

    // Poll briefly for the grid container ref to attach. OWL's nextTick settles
    // the *reactive* render, but the browser can still be a frame or two behind
    // actually inserting the element — rAF-based retries cover that gap without
    // a fixed, guessable delay.
    _waitForGridEl(maxFrames = 20) {
        return new Promise(resolve => {
            const check = (n) => {
                if (this.gridRef.el || n <= 0) return resolve();
                requestAnimationFrame(() => check(n - 1));
            };
            check(maxFrames);
        });
    }

    // ─── GridStack ────────────────────────────────────────────────────────────
    _initGrid() {
        if (!window.GridStack) {
            console.warn("[BI] GridStack not loaded — will use CSS fallback");
            return;
        }
        const el = this.gridRef.el;
        if (!el) {
            console.error("[BI] _initGrid: gridRef.el is null");
            return;
        }
        console.log("[BI] Initializing GridStack on", el);

        if (this._grid) {
            try { this._grid.destroy(false); } catch (e) { /* ignore */ }
        }

        this._grid = window.GridStack.init({
            column:      this.state.dashboard?.grid_columns || 12,
            cellHeight:  this.state.dashboard?.cell_height  || 80,
            margin:      8,
            animate:     true,
            draggable:   { handle: ".hb-item-header" },
            resizable:   { handles: "se" },
            disableDrag:   !this.state.editMode,
            disableResize: !this.state.editMode,
        }, el);

        this._grid.on("change", (event, items) => {
            if (!items || !this.state.editMode) return;
            const positions = items.map(item => ({
                id:  parseInt(item.id, 10),
                x:   item.x, y: item.y, w: item.w, h: item.h,
            }));
            rpc("/hb_dashboard/update_layout", { positions }).catch(console.warn);
        });
    }

    _updateGridMode() {
        if (!this._grid) return;
        this._grid.enableMove(this.state.editMode);
        this._grid.enableResize(this.state.editMode);
    }

    // ─── Item DOM Management (imperative — avoids OWL+GridStack conflict) ─────
    _populateGrid() {
        const gridEl = this.gridRef.el;
        if (!gridEl) {
            console.error("[BI] _populateGrid: gridRef.el is null — grid container not in DOM");
            return;
        }

        if (!this._grid) {
            // GridStack CDN failed — fallback to CSS flex grid
            console.warn("[BI] GridStack not available, using fallback layout");
            gridEl.classList.add("hb-fallback-grid");
            this.state.items.forEach(item => {
                const w = document.createElement("div");
                w.className = "hb-fallback-item";
                w.setAttribute("data-gs-id", String(item.id));
                w.innerHTML = this._buildItemShell(item);
                gridEl.appendChild(w);
                this._bindItemEvents(item, w);
            });
            return;
        }

        // Clear any existing widgets (with DOM removal)
        try { this._grid.removeAll(); } catch (e) { /* grid was empty */ }

        console.log("[BI] Populating grid with", this.state.items.length, "items");
        this.state.items.forEach(item => {
            try {
                this._addItemWidget(item);
            } catch (e) {
                console.error("[BI] Failed to add widget for item", item.id, e);
            }
        });
    }

    _addItemWidget(item) {
        const gridEl = this.gridRef.el;
        if (!gridEl) return;

        // Build the full grid-stack-item DOM manually — more reliable than
        // addWidget({content}) whose API varies between GridStack versions.
        const wrapper = document.createElement("div");
        wrapper.className = "grid-stack-item";
        wrapper.setAttribute("gs-x",  String(item.x || 0));
        wrapper.setAttribute("gs-y",  String(item.y || 0));
        wrapper.setAttribute("gs-w",  String(item.w || 4));
        wrapper.setAttribute("gs-h",  String(item.h || 3));
        wrapper.setAttribute("gs-id", String(item.id));

        const inner = document.createElement("div");
        inner.className = "grid-stack-item-content";
        inner.innerHTML = this._buildItemShell(item);
        wrapper.appendChild(inner);

        gridEl.appendChild(wrapper);

        if (this._grid) {
            try {
                this._grid.makeWidget(wrapper);
            } catch (e) {
                console.warn("[BI] makeWidget failed for item", item.id, e);
            }
        }

        this._bindItemEvents(item, wrapper);
    }

    _buildItemShell(item) {
        const title = this._escapeHtml(item.custom_title || item.name || "Item");
        const topBorder = item.top_border_color
            ? ` style="border-top:4px solid ${item.top_border_color}"`
            : '';
        return `<div class="hb-chart-item"${topBorder}>
  <div class="hb-item-header">
    <span class="hb-item-title" title="${title}">${title}</span>
    <div class="hb-item-actions" role="toolbar" aria-label="Chart actions">
      ${item.model_name ? '<button class="hb-ia hb-ia-nav" type="button" title="Open in related module"><i class="fa fa-external-link"></i></button>' : ''}
      <button class="hb-ia hb-ia-magic"  type="button" title="AI Explain"><i class="fa fa-magic"></i></button>
      <button class="hb-ia hb-ia-png"    type="button" title="Export PNG"><i class="fa fa-image"></i></button>
      <button class="hb-ia hb-ia-excel"  type="button" title="Export Excel"><i class="fa fa-file-excel-o"></i></button>
      <button class="hb-ia hb-ia-csv"    type="button" title="Export CSV"><i class="fa fa-file-text-o"></i></button>
      <button class="hb-ia hb-ia-edit   hb-edit-only" type="button" title="Edit"><i class="fa fa-pencil"></i></button>
      <button class="hb-ia hb-ia-delete danger hb-edit-only" type="button" title="Delete"><i class="fa fa-trash"></i></button>
    </div>
  </div>
  <div class="hb-item-body" id="hb-item-body-${item.id}">
    <div class="hb-item-loading"><div class="hb-spinner"></div></div>
  </div>
</div>`;
    }

    _bindItemEvents(item, el) {
        if (!el) return;
        const q = s => el.querySelector(s);
        const on = (btn, fn) => btn && btn.addEventListener("click", e => { e.stopPropagation(); fn(); });
        on(q(".hb-ia-magic"),  () => this.aiExplainItem(item));
        on(q(".hb-ia-excel"),  () => this.exportItemExcel(item));
        on(q(".hb-ia-csv"),    () => this.exportItemCSV(item));
        on(q(".hb-ia-png"),    () => this.exportItemPNG(item));
        on(q(".hb-ia-edit"),   () => this.showEditItem(item));
        on(q(".hb-ia-delete"), () => this.deleteItem(item));
        on(q(".hb-ia-nav"),    () => this._navigateItem(item));
    }

    _updateItemBody(item) {
        const body = document.getElementById(`hb-item-body-${item.id}`);
        if (!body) return;

        if (item._error) {
            body.innerHTML = `<div class="hb-item-error"><i class="fa fa-exclamation-circle"></i><div>${this._escapeHtml(item._error)}</div></div>`;
            return;
        }
        if (!item._data) return;

        if (item.item_type === "tile") {
            body.innerHTML = this._buildTileHTML(item);
            return;
        }

        if (item.item_type === "list") {
            body.innerHTML = this._buildListHTML(item);
            return;
        }

        // ECharts chart — set canvas div then draw after DOM settles
        body.innerHTML = `<div id="hb-chart-${item.id}" class="hb-chart-canvas"></div>`;
        setTimeout(() => this._drawChart(item), 60);
    }

    _buildTileHTML(item) {
        const d = item._data;
        const val = this.formatValue(d.value, item.kpi_format, item.kpi_prefix, item.kpi_suffix, item.currency_symbol);
        const color = this._escapeHtml(item.kpi_color || "blue");
        const icon  = this._escapeHtml(item.kpi_icon  || "fa-bar-chart");
        let cmpHTML = "";
        if (d.change_pct !== null && d.change_pct !== undefined) {
            const pct = parseFloat(d.change_pct);
            const cls = pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral";
            const arr = pct > 0 ? "fa-arrow-up" : pct < 0 ? "fa-arrow-down" : "fa-minus";
            cmpHTML = `<div class="hb-tile-compare ${cls}"><i class="fa ${arr}"></i><span>${Math.abs(pct).toFixed(1)}% vs prev</span></div>`;
        }
        const sparkHTML = this._buildSparklineSVG(d.trend, color);
        return `<div class="hb-tile hb-tile-compact">
  <div class="hb-tile-top">
    <div class="hb-tile-icon ${color}"><i class="fa ${icon}"></i></div>
    <div class="hb-tile-main">
      <div class="hb-tile-value">${this._escapeHtml(String(val))}</div>
      <div class="hb-tile-label">${this._escapeHtml(item.custom_title || item.name)}</div>
    </div>
  </div>
  <div class="hb-tile-bottom">
    ${cmpHTML || '<span class="hb-tile-compare neutral"></span>'}
    ${sparkHTML}
  </div>
</div>`;
    }

    _buildSparklineSVG(trend, color) {
        if (!trend || trend.length < 2) return "";
        const w = 64, h = 22, pad = 2;
        const min = Math.min(...trend), max = Math.max(...trend);
        const range = (max - min) || 1;
        const step = (w - pad * 2) / (trend.length - 1);
        const points = trend.map((v, i) => {
            const x = pad + i * step;
            const y = h - pad - ((v - min) / range) * (h - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        return `<svg class="hb-tile-spark hb-spark-${color}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
  <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    _buildListHTML(item) {
        const d = item._data || {};
        const cols = d.columns || [];
        const rows = d.rows || [];

        if (!cols.length) {
            return `<div class="hb-item-error"><i class="fa fa-table"></i><div>No columns selected — edit this item to choose fields</div></div>`;
        }

        const thead = cols.map(c => `<th>${this._escapeHtml(c.string)}</th>`).join('');
        const tbody = rows.length
            ? rows.map(row => {
                const tds = row.map((val, i) => `<td>${this._escapeHtml(this._formatListCell(val, cols[i]))}</td>`).join('');
                return `<tr>${tds}</tr>`;
            }).join('')
            : `<tr><td class="hb-list-empty-row" colspan="${cols.length}">No records found</td></tr>`;

        return `<div class="hb-list-table-wrap">
  <table class="hb-list-table">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</div>`;
    }

    _formatListCell(val, colMeta) {
        if (val === false || val === null || val === undefined || val === '') return '—';
        const type = colMeta && colMeta.type;
        if (type === 'boolean') return val ? 'Yes' : 'No';
        if ((type === 'float' || type === 'monetary') && typeof val === 'number') {
            return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        if (type === 'datetime' && typeof val === 'string') return val.replace('T', ' ').slice(0, 19);
        return String(val);
    }

    _escapeHtml(str) {
        if (str == null) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ─── Chart Rendering ──────────────────────────────────────────────────────
    _renderAllCharts() {
        this.state.items.forEach(item => this._renderItemChart(item));
    }

    async _renderItemChart(item) {
        try {
            const res = await rpc("/hb_dashboard/get_item_data", {
                item_id: item.id,
                filters: this.state.filters,
            });
            if (res.status === "ok") {
                item._data   = res.data;
                item._loaded = true;
                item._error  = null;
            } else {
                item._loaded = true;
                item._error  = res.message || "Error loading data";
            }
        } catch (e) {
            item._loaded = true;
            item._error  = e.message || "Load failed";
        }
        // Update widget DOM directly — no OWL re-render needed
        this._updateItemBody(item);
    }

    _drawChart(item) {
        if (!item._data || !item._loaded) return;
        const el = document.getElementById(`hb-chart-${item.id}`);
        if (!el) return;

        if (item.item_type === "tile") {
            // Tile rendering is pure template — no ECharts needed
            return;
        }

        if (!window.echarts) return;

        if (this._charts[item.id]) {
            try { this._charts[item.id].dispose(); } catch (e) { /* ignore */ }
        }

        const isDark = this.state.dashboard?.theme === "dark";
        const chart  = window.echarts.init(el, isDark ? "dark" : undefined, { renderer: "canvas" });
        this._charts[item.id] = chart;

        const option = this._buildChartOption(item);
        chart.setOption(option, { notMerge: true });

        // Force resize — container may not have its final size yet
        setTimeout(() => { try { chart.resize(); } catch (e) {} }, 200);

        // Handle drill-down click
        if (item.is_drill_down && item._data.drilldown_field) {
            chart.on("click", (params) => {
                this._handleDrilldown(item, params.name || params.data);
            });
        }

        // Handle click-to-navigate
        if (item.click_action_model) {
            chart.on("click", (params) => {
                this._navigateFromChart(item, params);
            });
        }

        // Handle click-to-filter (cross-filtering): clicking a category on
        // one chart filters every sibling chart on the same model. Skipped
        // for items that already have a click behavior (drilldown/navigate)
        // so a click never fires two conflicting actions.
        const crossFilterField = item.x_field || item.groupby_field;
        if (this.state.configEnableCrossfilter && !item.is_drill_down && !item.click_action_model
            && crossFilterField && item.model_name
            && ["bar", "line", "area", "pie", "doughnut", "funnel", "treemap"].includes(item.item_type)) {
            chart.on("click", (params) => {
                const value = params.name != null ? params.name : (Array.isArray(params.data) ? params.data[0] : null);
                if (value == null || value === "") return;
                this._applyCrossFilter(item.model_name, crossFilterField, value);
            });
        }
    }

    _buildChartOption(item) {
        // Delegate to hb_dashboard_chart.js helper
        if (window.HbChartBuilder) {
            return window.HbChartBuilder.buildOption(item);
        }
        return {};
    }

    async _handleDrilldown(item, drillValue) {
        const drillField = item._data.drilldown_field;
        if (!drillField) return;
        try {
            const res = await rpc("/hb_dashboard/get_item_data", {
                item_id: item.id,
                filters: this.state.filters,
                drilldown: drillField,
            });
            if (res.status === "ok") {
                item._data   = res.data;
                item._drillDepth = (item._drillDepth || 0) + 1;
                this._drawChart(item);
            }
        } catch (e) { this._toast("Drilldown failed", "error"); }
    }

    _navigateItem(item) {
        const model = item.click_action_model || item.model_name;
        if (!model) return;
        let baseDomain = [];
        try { baseDomain = JSON.parse(item.domain || '[]'); } catch(e) {}
        const f  = this.state.filters;
        const df = f.date_filter || item.date_filter || 'all';
        const dateDomain = this._buildDateDomainJS(
            item.date_field || 'create_date',
            df,
            f.date_from || (item.date_from || ''),
            f.date_to   || (item.date_to   || '')
        );
        const domain    = baseDomain.concat(dateDomain);
        const viewMode  = item.click_action_view || 'list,form';
        const views     = viewMode.split(',').map(v => [false, v.trim()]);
        this.action.doAction({
            type:      'ir.actions.act_window',
            name:      item.custom_title || item.name,
            res_model: model,
            view_mode: viewMode,
            views,
            domain,
            target:    'current',
        });
    }

    _buildDateDomainJS(field, preset, dateFrom, dateTo) {
        if (!preset || preset === 'all') return [];
        const pad  = n => String(n).padStart(2, '0');
        const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const eod  = d => `${fmt(d)} 23:59:59`;
        const add  = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
        const t    = new Date(); t.setHours(0,0,0,0);
        const som  = d => new Date(d.getFullYear(), d.getMonth(), 1);
        const soy  = d => new Date(d.getFullYear(), 0, 1);
        if (preset === 'custom') {
            const d = [];
            if (dateFrom) d.push([field, '>=', dateFrom]);
            if (dateTo)   d.push([field, '<=', dateTo + ' 23:59:59']);
            return d;
        }
        const mon  = (t.getDay() + 6) % 7;  // days since Monday
        switch (preset) {
            case 'today':         return [[field,'>=',fmt(t)],[field,'<=',eod(t)]];
            case 'yesterday':     { const y=add(t,-1); return [[field,'>=',fmt(y)],[field,'<=',eod(y)]]; }
            case 'this_week':     return [[field,'>=',fmt(add(t,-mon))]];
            case 'last_week':     { const s=add(t,-mon-7); return [[field,'>=',fmt(s)],[field,'<=',eod(add(s,6))]]; }
            case 'this_month':    return [[field,'>=',fmt(som(t))]];
            case 'last_month':    { const e=add(som(t),-1); return [[field,'>=',fmt(som(e))],[field,'<=',eod(e)]]; }
            case 'this_quarter':  { const q=Math.floor(t.getMonth()/3); const s=new Date(t.getFullYear(),q*3,1); return [[field,'>=',fmt(s)]]; }
            case 'last_quarter':  {
                const q=Math.floor(t.getMonth()/3);
                const s = q===0 ? new Date(t.getFullYear()-1,9,1)  : new Date(t.getFullYear(),(q-1)*3,1);
                const e = q===0 ? new Date(t.getFullYear()-1,11,31): add(new Date(t.getFullYear(),q*3,1),-1);
                return [[field,'>=',fmt(s)],[field,'<=',eod(e)]];
            }
            case 'this_year':     return [[field,'>=',fmt(soy(t))]];
            case 'last_year':     { const s=new Date(t.getFullYear()-1,0,1); const e=new Date(t.getFullYear()-1,11,31); return [[field,'>=',fmt(s)],[field,'<=',eod(e)]]; }
            case 'last_7':        return [[field,'>=',fmt(add(t,-7))]];
            case 'last_14':       return [[field,'>=',fmt(add(t,-14))]];
            case 'last_30':       return [[field,'>=',fmt(add(t,-30))]];
            case 'last_60':       return [[field,'>=',fmt(add(t,-60))]];
            case 'last_90':       return [[field,'>=',fmt(add(t,-90))]];
            case 'last_180':      return [[field,'>=',fmt(add(t,-180))]];
            case 'last_365':      return [[field,'>=',fmt(add(t,-365))]];
            case 'mtd':           return [[field,'>=',fmt(som(t))],[field,'<=',eod(t)]];
            case 'qtd':           { const q=Math.floor(t.getMonth()/3); const s=new Date(t.getFullYear(),q*3,1); return [[field,'>=',fmt(s)],[field,'<=',eod(t)]]; }
            case 'ytd':           return [[field,'>=',fmt(soy(t))],[field,'<=',eod(t)]];
            default:              return [];
        }
    }

    _navigateFromChart(item, params) {
        if (!item.click_action_model) return;
        let domain = [];
        try { domain = JSON.parse(item.click_action_domain || "[]"); } catch (e) {}
        const views = (item.click_action_view || "list,form")
            .split(",")
            .map(v => [false, v.trim()]);
        this.action.doAction({
            type: "ir.actions.act_window",
            name: params.name || item.name,
            res_model: item.click_action_model,
            view_mode: item.click_action_view || "list,form",
            views,
            domain,
            target: "current",
        });
    }

    async _refreshAllCharts() {
        const loadPromises = this.state.items.map(item => this._renderItemChart(item));
        await Promise.all(loadPromises);
    }

    // ─── Filter Bar (manual chips + click-to-filter) ─────────────────────────
    // Both mechanisms feed the same state.filterChips list and the same
    // filters.model_domain the backend applies per-item by model_name.

    _recomputeModelDomain() {
        const byModel = {};
        for (const chip of this.state.filterChips) {
            let val = chip.value;
            if (["in", "not in"].includes(chip.operator)) {
                val = String(val).split(",").map(s => s.trim()).filter(Boolean);
            } else if (["integer", "float", "monetary"].includes(chip.fieldType)) {
                val = Number(val);
                if (isNaN(val)) val = 0;
            } else if (chip.fieldType === "boolean") {
                val = (val === "true" || val === true);
            }
            if (!byModel[chip.model]) byModel[chip.model] = [];
            byModel[chip.model].push([chip.field, chip.operator, val]);
        }
        this.state.filters.model_domain = byModel;
        this._refreshAllCharts();
    }

    // Clicking a chart segment: at most one click-driven chip is active at a
    // time (clicking again replaces it, matching typical BI cross-filter UX).
    async _applyCrossFilter(model, field, value) {
        this.state.filterChips = this.state.filterChips.filter(c => c.source !== "click");

        let fieldType = "char", fieldLabel = field, operator = "=";
        try {
            const res = await rpc("/hb_dashboard/get_fields", { model_name: model });
            if (res.status === "ok") {
                const f = (res.data || []).find(f => f.name === field);
                if (f) {
                    fieldType = f.type;
                    fieldLabel = f.string || field;
                }
            }
        } catch (e) { /* fall back to defaults below */ }
        // Many2one groupby values are display names, not ids — 'ilike' lets
        // the ORM resolve them via name match instead of requiring an id.
        if (fieldType === "many2one") operator = "ilike";

        this.state.filterChips = [...this.state.filterChips, {
            id: `click-${Date.now()}`,
            source: "click",
            model, modelLabel: model,
            field, fieldLabel, fieldType,
            operator, value,
            valueLabel: String(value),
        }];
        this._recomputeModelDomain();
    }

    removeFilterChip(id) {
        this.state.filterChips = this.state.filterChips.filter(c => c.id !== id);
        this._recomputeModelDomain();
    }

    clearAllFilterChips() {
        this.state.filterChips = [];
        this._recomputeModelDomain();
    }

    // ── Add-filter popover ────────────────────────────────────────────────
    openFilterPopover() {
        this.state.filterPopover = {
            open: true,
            modelSelOpen: false, modelSelQuery: "",
            model: "", modelLabel: "",
            fields: [], fieldsLoaded: false,
            field: "", fieldLabel: "", fieldType: "char", selectionOptions: [],
            operator: "=",
            value: "",
        };
    }

    closeFilterPopover() {
        this.state.filterPopover.open = false;
    }

    async filterPopoverModelFocus() {
        this.state.filterPopover.modelSelOpen = true;
        this.state.filterPopover.modelSelQuery = this.state.filterPopover.modelLabel || "";
        await this._loadModels(this.state.filterPopover.modelSelQuery);
    }

    filterPopoverModelBlur() {
        setTimeout(() => { this.state.filterPopover.modelSelOpen = false; }, 220);
    }

    filterPopoverModelSearch(ev) {
        const q = ev.target.value;
        this.state.filterPopover.modelSelQuery = q;
        clearTimeout(this._filterPopoverModelTimer);
        this._filterPopoverModelTimer = setTimeout(() => this._loadModels(q), 250);
    }

    async filterPopoverSelectModel(modelName, modelLabel) {
        this.state.filterPopover.model = modelName;
        this.state.filterPopover.modelLabel = modelLabel;
        this.state.filterPopover.modelSelOpen = false;
        this.state.filterPopover.field = "";
        this.state.filterPopover.fields = [];
        this.state.filterPopover.fieldsLoaded = false;
        try {
            const res = await rpc("/hb_dashboard/get_fields", { model_name: modelName });
            this.state.filterPopover.fields = res.status === "ok" ? (res.data || []) : [];
        } catch (e) {
            this.state.filterPopover.fields = [];
        }
        this.state.filterPopover.fieldsLoaded = true;
    }

    filterPopoverOnField(ev) {
        const fieldName = ev.target.value;
        const field = this.state.filterPopover.fields.find(f => f.name === fieldName);
        const fieldType = field ? field.type : "char";
        const ops = this._getDomainOperators(fieldType);
        this.state.filterPopover.field = fieldName;
        this.state.filterPopover.fieldLabel = field ? field.string : fieldName;
        this.state.filterPopover.fieldType = fieldType;
        this.state.filterPopover.selectionOptions = field && fieldType === "selection" ? (field.selection || []) : [];
        this.state.filterPopover.operator = ops[0] ? ops[0].v : "=";
        this.state.filterPopover.value = "";
    }

    filterPopoverOnOp(ev) {
        this.state.filterPopover.operator = ev.target.value;
    }

    filterPopoverOnValue(ev) {
        const val = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        this.state.filterPopover.value = val;
    }

    addFilterChip() {
        const p = this.state.filterPopover;
        if (!p.model || !p.field) {
            this._toast("Pick a model and a field first", "error");
            return;
        }
        this.state.filterChips = [...this.state.filterChips, {
            id: `manual-${Date.now()}`,
            source: "manual",
            model: p.model, modelLabel: p.modelLabel,
            field: p.field, fieldLabel: p.fieldLabel, fieldType: p.fieldType,
            operator: p.operator, value: p.value,
            valueLabel: p.fieldType === "boolean" ? (p.value ? "true" : "false") : String(p.value),
        }];
        this.state.filterPopover.open = false;
        this._recomputeModelDomain();
    }

    _disposeAll() {
        Object.values(this._charts).forEach(c => { try { c?.dispose?.(); } catch (e) {} });
        this._charts = {};
        if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
        if (this._grid) { try { this._grid.destroy(false); } catch (e) {} this._grid = null; }
    }

    _resizeCharts() {
        Object.values(this._charts).forEach(c => { try { c?.resize?.(); } catch (e) {} });
    }

    // ─── Edit Mode ────────────────────────────────────────────────────────────
    toggleEditMode() {
        this.state.editMode = !this.state.editMode;
        this._updateGridMode();
    }

    // ─── Filters ──────────────────────────────────────────────────────────────
    onDateFilterChange(ev) {
        this.state.filters.date_filter = ev.target.value;
        if (ev.target.value !== "custom") {
            this.state.filters.date_from = "";
            this.state.filters.date_to   = "";
            this._refreshAllCharts();
        }
    }

    onDateFromChange(ev) {
        this.state.filters.date_from = ev.target.value;
        if (this.state.filters.date_to) this._refreshAllCharts();
    }

    onDateToChange(ev) {
        this.state.filters.date_to = ev.target.value;
        this._refreshAllCharts();
    }

    applyFilters() { this._refreshAllCharts(); }

    // ─── Add / Edit Item Dialog ───────────────────────────────────────────────
    _emptyItemForm() {
        return {
            id:              null,
            name:            "New Item",
            item_type:       "tile",
            model_name:      "",
            model_id:        null,
            date_field:      "create_date",
            x_field:         "",
            y_field:         "",
            aggregate:       "count",
            domain:          "[]",
            date_filter:     "this_month",
            date_from:       "",
            date_to:         "",
            groupby_field:   "",
            second_groupby:  "",
            limit:           20,
            sort_by:         "",
            sort_order:      "desc",
            list_columns:    "[]",
            chart_color:     "#667eea",
            color_scheme:    "default",
            segment_colors:  "[]",
            show_legend:     true,
            stack_chart:     false,
            show_data_zoom:  false,
            show_markline:   false,
            smooth_line:     true,
            kpi_icon:        "fa-bar-chart",
            kpi_color:       "blue",
            kpi_format:      "number",
            kpi_suffix:      "",
            kpi_prefix:      "",
            compare_period:  "none",
            gauge_min:       0,
            gauge_max:       100,
            gauge_target:    0,
            show_data_labels: false,
            is_drill_down:   false,
            drilldown_field: "",
            top_border_color:    "",
            click_action_model:  "",
            click_action_domain: "[]",
            click_action_view:   "list,form",
            custom_title:    "",
            w: 4, h: 3, x: 0, y: 0,
        };
    }

    async showAddItem() {
        this.state.itemForm = this._emptyItemForm();
        this.state.editItem = null;
        this.state.modelSel.open  = false;
        this.state.modelSel.query = '';
        this.state.listFieldSel.open  = false;
        this.state.listFieldSel.query = '';
        this.state.showItemDialog = true;
        this._initDomainBuilder('');
        // Pre-load first page of models in background so the selector
        // label is ready when the user opens the panel (non-blocking).
        this._loadModels('');
    }

    async showEditItem(item) {
        this.state.itemForm = { ...item };
        this.state.editItem = item;
        this.state.modelSel.open  = false;
        this.state.modelSel.query = '';
        this.state.listFieldSel.open  = false;
        this.state.listFieldSel.query = '';
        this.state.showItemDialog = true;
        // Load models (for selector label) and fields in parallel.
        this._loadModels('');
        if (item.model_name) {
            await this._loadFields(item.model_name);
        }
        // Fields are now loaded; parse the stored domain into visual rules.
        this._initDomainBuilder(item.domain || '');
    }

    hideItemDialog() {
        this.state.showItemDialog = false;
        this.closeModelSel();
        this.closeListFieldSel();
    }

    async _loadModels(search = "", limit = 50, append = false) {
        this.state.modelsLoading = true;
        try {
            const offset = append ? this.state.modelSel.offset : 0;
            const res = await rpc("/hb_dashboard/get_models", { search, limit, offset });
            if (res.status === "ok") {
                if (append) {
                    this.state.models = this.state.models.concat(res.data);
                } else {
                    this.state.models = res.data;
                }
                this.state.modelSel.total  = res.total || res.data.length;
                this.state.modelSel.offset = offset + res.data.length;
            }
        } catch (e) { console.warn("[BI] Model load error:", e); }
        this.state.modelsLoading = false;
    }

    async _loadFields(modelName) {
        if (!modelName) { this.state.fields = []; return; }
        this.state.fieldsLoading = true;
        try {
            const res = await rpc("/hb_dashboard/get_fields", { model_name: modelName });
            if (res.status === "ok") this.state.fields = res.data;
        } catch (e) { console.warn("[BI] Fields load error:", e); }
        this.state.fieldsLoading = false;
    }

    // ─── Searchable Model Selector ────────────────────────────────────────

    openModelSel() {
        this.state.modelSel.open        = true;
        this.state.modelSel.query       = '';
        this.state.modelSel.highlighted = -1;
        this.state.modelSel.offset      = 0;
        this._loadModels('', 50);
        // Focus the search input on the next paint
        setTimeout(() => {
            const inp = document.querySelector('.hb-model-sel-input');
            if (inp) inp.focus();
        }, 40);
        // Close when user clicks anywhere outside the selector
        this._modelSelClose = (e) => {
            if (!e.target.closest('.hb-model-sel')) this.closeModelSel();
        };
        setTimeout(() => document.addEventListener('click', this._modelSelClose), 0);
    }

    closeModelSel() {
        this.state.modelSel.open        = false;
        this.state.modelSel.highlighted = -1;
        if (this._modelSelClose) {
            document.removeEventListener('click', this._modelSelClose);
            this._modelSelClose = null;
        }
    }

    clearModelSearch() {
        this.state.modelSel.query       = '';
        this.state.modelSel.offset      = 0;
        this.state.modelSel.highlighted = -1;
        // Clear the DOM input imperatively — OWL does not own this input's value
        const inp = document.querySelector('.hb-model-sel-input');
        if (inp) { inp.value = ''; inp.focus(); }
        this._loadModels('', 50, false);
    }

    loadMoreModels() {
        const q = this.state.modelSel.query;
        this._loadModels(q, 50, true);
    }

    // ─── Visual Domain Builder ────────────────────────────────────────────────

    _getDomainOperators(fieldType) {
        const eq  = [
            {v: '=',         l: 'is equal to'},
            {v: '!=',        l: 'is not equal to'},
        ];
        const cmp = [
            {v: '<',         l: 'is less than'},
            {v: '<=',        l: 'is ≤'},
            {v: '>',         l: 'is greater than'},
            {v: '>=',        l: 'is ≥'},
        ];
        const txt = [
            {v: 'ilike',     l: 'contains'},
            {v: 'not ilike', l: 'does not contain'},
        ];
        const set = [
            {v: 'in',        l: 'is in  (comma-sep)'},
            {v: 'not in',    l: 'is not in  (comma-sep)'},
        ];
        switch (fieldType) {
            case 'integer': case 'float': case 'monetary':
                return [...eq, ...cmp, ...set];
            case 'date': case 'datetime':
                return [...eq, ...cmp];
            case 'boolean':
                return eq;
            case 'many2one': case 'selection':
                return [...eq, ...set];
            default: // char, text, html, …
                return [...eq, ...txt, ...set];
        }
    }

    _parseDomainString(domainStr) {
        if (!domainStr || !domainStr.trim() || domainStr.trim() === '[]') {
            return { rules: [], matchMode: 'ALL' };
        }
        let parsed;
        try {
            parsed = JSON.parse(domainStr);
        } catch (e) {
            try {
                // Handle Python-tuple / single-quote syntax
                const j = domainStr
                    .replace(/\(/g, '[').replace(/\)/g, ']')
                    .replace(/'/g, '"');
                parsed = JSON.parse(j);
            } catch (e2) { return null; }
        }
        if (!Array.isArray(parsed)) return null;
        const operators = parsed.filter(x => x === '&' || x === '|');
        const leaves    = parsed.filter(x => Array.isArray(x));
        if (leaves.some(l => l.length !== 3)) return null;
        // Mixed AND+OR logic is too complex for the visual builder
        if (operators.includes('&') && operators.includes('|')) return null;
        const matchMode = operators.includes('|') ? 'ANY' : 'ALL';
        const rules = leaves.map(([field, operator, value]) => {
            const f         = this.state.fields.find(f => f.name === field);
            const fieldType = f ? f.type : 'char';
            return {
                field,
                fieldType,
                operator:         String(operator),
                value:            Array.isArray(value) ? value.join(', ')
                                  : (value === null || value === undefined ? '' : String(value)),
                selectionOptions: f && fieldType === 'selection' ? (f.selection || []) : [],
                m2oOptions:       [],
                m2oLoading:       false,
                m2oTotal:         0,
                m2oRelation:      f && fieldType === 'many2one' ? (f.relation || '') : '',
                m2oDisplay:       '',
                m2oOpen:          false,
            };
        });
        return { rules, matchMode };
    }

    _syncDomainRuleValues() {
        // Use data-rule-idx to sync text/number/date inputs before save.
        // Selects update state via onChange so they don't need syncing here.
        document.querySelectorAll('.hb-db-rule [data-rule-idx]').forEach(inp => {
            const idx = parseInt(inp.dataset.ruleIdx);
            if (!isNaN(idx) && this.state.domainBuilder.rules[idx] !== undefined) {
                this.state.domainBuilder.rules[idx].value = inp.value;
            }
        });
    }

    _rulesToDomainStr() {
        this._syncDomainRuleValues();
        const rules = this.state.domainBuilder.rules.filter(r => r.field);
        if (!rules.length) return '[]';
        const leaves = rules.map(r => {
            let val = r.value ?? '';
            if (['in', 'not in'].includes(r.operator)) {
                if (r.fieldType === 'many2one') {
                    // comma-separated IDs → array of integers
                    val = String(val).split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n));
                } else {
                    val = String(val).split(',').map(v => v.trim()).filter(Boolean);
                }
            } else if (r.fieldType === 'many2one') {
                const n = parseInt(String(val));
                val = isNaN(n) ? false : n;
            } else if (['integer', 'float', 'monetary'].includes(r.fieldType)) {
                const n = Number(val);
                val = isNaN(n) ? 0 : n;
            } else if (r.fieldType === 'boolean') {
                val = (val === 'true' || val === true);
            }
            return [r.field, r.operator, val];
        });
        if (leaves.length === 1) return JSON.stringify(leaves);
        if (this.state.domainBuilder.matchMode === 'ALL') {
            return JSON.stringify(leaves); // implicit AND (no prefix needed)
        }
        // OR: (n-1) prefix '|' operators in Polish notation
        const prefixes = Array(leaves.length - 1).fill('|');
        return JSON.stringify([...prefixes, ...leaves]);
    }

    _initDomainBuilder(domainStr) {
        const result = this._parseDomainString(domainStr || '');
        if (result === null) {
            // Cannot be represented visually → open in advanced mode
            this.state.domainBuilder = { rules: [], matchMode: 'ALL', advanced: true };
        } else {
            this.state.domainBuilder = { rules: result.rules, matchMode: result.matchMode, advanced: false };
            // Async-load many2one options for any existing m2o rules
            result.rules.forEach((rule, idx) => {
                const f = this.state.fields.find(f => f.name === rule.field);
                if (f && f.type === 'many2one' && f.relation) {
                    const id = parseInt(rule.value);
                    if (!isNaN(id) && id > 0) {
                        this._resolveM2oDisplay(idx, id, f.relation);
                    }
                }
            });
        }
    }

    toggleDomainMode() {
        this.state.domainBuilder.matchMode =
            this.state.domainBuilder.matchMode === 'ALL' ? 'ANY' : 'ALL';
    }

    toggleDomainAdvanced() {
        if (!this.state.domainBuilder.advanced) {
            // → switch to raw textarea: serialise current rules first
            this.state.itemForm.domain     = this._rulesToDomainStr();
            this.state.domainBuilder.advanced = true;
        } else {
            // → switch to visual: try parsing the current raw string
            const result = this._parseDomainString(this.state.itemForm.domain);
            if (result === null) {
                this._toast("Cannot convert this domain to visual rules — simplify it or use Advanced mode", "warning");
                return;
            }
            this.state.domainBuilder.rules     = result.rules;
            this.state.domainBuilder.matchMode = result.matchMode;
            this.state.domainBuilder.advanced  = false;
            result.rules.forEach((rule, idx) => {
                const f = this.state.fields.find(f => f.name === rule.field);
                if (f && f.type === 'many2one' && f.relation) {
                    const id = parseInt(rule.value);
                    if (!isNaN(id) && id > 0) {
                        this._resolveM2oDisplay(idx, id, f.relation);
                    }
                }
            });
        }
    }

    addDomainRule() {
        const firstField = this.state.fields[0];
        const fieldType  = firstField ? firstField.type : 'char';
        const ops        = this._getDomainOperators(fieldType);
        const newRule = {
            field:            firstField ? firstField.name : '',
            fieldType,
            operator:         ops[0].v,
            value:            '',
            selectionOptions: firstField && fieldType === 'selection' ? (firstField.selection || []) : [],
            m2oOptions:       [],
            m2oLoading:       false,
            m2oTotal:         0,
            m2oRelation:      firstField && fieldType === 'many2one' ? (firstField.relation || '') : '',
            m2oDisplay:       '',
            m2oOpen:          false,
        };
        this.state.domainBuilder.rules = [...this.state.domainBuilder.rules, newRule];
        if (fieldType === 'many2one' && firstField && firstField.relation) {
            this._loadM2oOptions(this.state.domainBuilder.rules.length - 1, firstField.relation);
        }
    }

    removeDomainRule(idx) {
        const rules = [...this.state.domainBuilder.rules];
        rules.splice(idx, 1);
        this.state.domainBuilder.rules = rules;
    }

    onDomainField(idx, ev) {
        const fieldName = ev.target.value;
        const field     = this.state.fields.find(f => f.name === fieldName);
        const fieldType = field ? field.type : 'char';
        const ops       = this._getDomainOperators(fieldType);
        const rules     = [...this.state.domainBuilder.rules];
        rules[idx] = {
            ...rules[idx],
            field:            fieldName,
            fieldType,
            operator:         ops[0].v,
            value:            '',
            selectionOptions: field && fieldType === 'selection' ? (field.selection || []) : [],
            m2oOptions:       [],
            m2oLoading:       false,
            m2oTotal:         0,
            m2oRelation:      field && fieldType === 'many2one' ? (field.relation || '') : '',
            m2oDisplay:       '',
            m2oOpen:          false,
        };
        this.state.domainBuilder.rules = rules;
        if (fieldType === 'many2one' && field && field.relation) {
            this._loadM2oOptions(idx, field.relation);
        }
    }

    onDomainOp(idx, ev) {
        const rules = [...this.state.domainBuilder.rules];
        rules[idx]  = { ...rules[idx], operator: ev.target.value };
        this.state.domainBuilder.rules = rules;
    }

    onDomainValue(idx, ev) {
        const rules = [...this.state.domainBuilder.rules];
        rules[idx]  = { ...rules[idx], value: ev.target.value };
        this.state.domainBuilder.rules = rules;
    }

    async _loadM2oOptions(idx, relationModel, search) {
        if (!this.state.domainBuilder.rules[idx]) return;
        const rules = [...this.state.domainBuilder.rules];
        rules[idx]  = { ...rules[idx], m2oLoading: true, m2oOptions: [] };
        this.state.domainBuilder.rules = rules;
        try {
            const res = await rpc('/hb_dashboard/get_m2o_options', { model_name: relationModel, search: search || '', limit: 20 });
            if (res.status === 'ok') {
                const r2 = [...this.state.domainBuilder.rules];
                if (r2[idx]) {
                    r2[idx] = { ...r2[idx], m2oLoading: false, m2oOptions: res.data, m2oTotal: res.total || res.data.length };
                    this.state.domainBuilder.rules = r2;
                }
            } else {
                // Server returned an error — stop the spinner
                const r2 = [...this.state.domainBuilder.rules];
                if (r2[idx]) {
                    r2[idx] = { ...r2[idx], m2oLoading: false };
                    this.state.domainBuilder.rules = r2;
                }
            }
        } catch (e) {
            console.warn('[BI] M2O options error:', e);
            const r2 = [...this.state.domainBuilder.rules];
            if (r2[idx]) {
                r2[idx] = { ...r2[idx], m2oLoading: false };
                this.state.domainBuilder.rules = r2;
            }
        }
    }


    onM2oFocus(idx) {
        const rules = [...this.state.domainBuilder.rules];
        if (!rules[idx]) return;
        rules[idx] = { ...rules[idx], m2oOpen: true, m2oOptions: [], m2oLoading: true };
        this.state.domainBuilder.rules = rules;
        const rel = this.state.domainBuilder.rules[idx].m2oRelation;
        if (rel) this._loadM2oOptions(idx, rel, '');
        setTimeout(() => {
            const inp = document.querySelector(`.hb-db-m2o-input[data-m2o-idx='${idx}']`);
            if (inp) inp.focus();
        }, 40);
    }

    onM2oBlur(idx) {
        setTimeout(() => {
            const rules = [...this.state.domainBuilder.rules];
            if (!rules[idx]) return;
            rules[idx] = { ...rules[idx], m2oOpen: false };
            this.state.domainBuilder.rules = rules;
        }, 200);
    }

    onM2oSearch(idx, ev) {
        const q = ev.target.value;
        clearTimeout(this._m2oSearchTimer);
        this._m2oSearchTimer = setTimeout(() => {
            const rule = this.state.domainBuilder.rules[idx];
            if (rule && rule.m2oRelation) this._loadM2oOptions(idx, rule.m2oRelation, q);
        }, 280);
    }

    onM2oSelect(idx, optId, optName) {
        const rules = [...this.state.domainBuilder.rules];
        if (!rules[idx]) return;
        rules[idx] = { ...rules[idx], value: optId, m2oDisplay: optName, m2oOpen: false };
        this.state.domainBuilder.rules = rules;
    }

    onM2oClear(idx) {
        const rules = [...this.state.domainBuilder.rules];
        if (!rules[idx]) return;
        rules[idx] = { ...rules[idx], value: '', m2oDisplay: '', m2oOpen: false };
        this.state.domainBuilder.rules = rules;
    }

    async _resolveM2oDisplay(idx, id, relationModel) {
        try {
            const res = await rpc('/hb_dashboard/get_m2o_options', { model_name: relationModel, ids: [id] });
            if (res.status === 'ok' && res.data && res.data.length) {
                const r2 = [...this.state.domainBuilder.rules];
                if (r2[idx]) {
                    r2[idx] = { ...r2[idx], m2oDisplay: res.data[0].name };
                    this.state.domainBuilder.rules = r2;
                }
            }
        } catch(e) {
            console.warn('[BI] M2O resolve error:', e);
        }
    }

    onModelSearch(ev) {
        const q = ev.target.value;
        this.state.modelSel.query       = q;
        this.state.modelSel.highlighted = -1;
        this.state.modelSel.offset      = 0;
        clearTimeout(this._modelSearchTimer);
        // Debounce: wait 280 ms after the user stops typing
        this._modelSearchTimer = setTimeout(() => this._loadModels(q, 50, false), 280);
    }

    onModelSelKeydown(ev) {
        const items = this.state.models;
        const cur   = this.state.modelSel.highlighted;
        switch (ev.key) {
            case 'ArrowDown':
                ev.preventDefault();
                this.state.modelSel.highlighted = Math.min(cur + 1, items.length - 1);
                this._scrollModelSelItem(this.state.modelSel.highlighted);
                break;
            case 'ArrowUp':
                ev.preventDefault();
                this.state.modelSel.highlighted = Math.max(cur - 1, 0);
                this._scrollModelSelItem(this.state.modelSel.highlighted);
                break;
            case 'Enter':
                ev.preventDefault();
                if (cur >= 0 && items[cur]) this.selectModel(items[cur]);
                break;
            case 'Escape':
                ev.preventDefault();
                this.closeModelSel();
                break;
        }
    }

    _scrollModelSelItem(idx) {
        const list = document.querySelector('.hb-model-sel-list');
        if (!list || idx < 0) return;
        const item = list.children[idx];
        if (item) item.scrollIntoView({ block: 'nearest' });
    }

    selectModel(m) {
        const prev = this.state.itemForm.model_name;
        this.state.itemForm.model_name = m.model;
        this.state.itemForm.model_id   = m.id;
        this.closeModelSel();
        // Reset dependent field selections when the data model changes
        if (m.model !== prev) {
            this.state.itemForm.x_field        = '';
            this.state.itemForm.y_field         = '';
            this.state.itemForm.groupby_field   = '';
            this.state.itemForm.second_groupby  = '';
            this.state.itemForm.drilldown_field = '';
            this._loadFields(m.model);
        }
    }

    /** Return the human-readable label for the currently selected model. */
    getSelectedModelLabel() {
        const name = this.state.itemForm.model_name;
        if (!name) return '';
        const m = this.state.models.find(x => x.model === name);
        return m ? m.name : '';
    }

    /**
     * Return HTML with query matches wrapped in <mark class="hb-hl">.
     * Input is HTML-escaped before replacement, so t-out is safe.
     */
    _hl(text, query) {
        if (!text) return markup('');
        const t = String(text);
        if (!query) return markup(this._escapeHtml(t));
        try {
            const re    = new RegExp(
                '(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')',
                'gi'
            );
            return markup(t.split(re).map((part, i) =>
                i % 2 === 1
                    ? `<mark class="hb-hl">${this._escapeHtml(part)}</mark>`
                    : this._escapeHtml(part)
            ).join(''));
        } catch (e) {
            return markup(this._escapeHtml(t));
        }
    }

    onItemFormChange(field, ev) {
        const val = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        this.state.itemForm[field] = val;

        if (field === "model_name") {
            const model = this.state.models.find(m => m.model === val);
            this.state.itemForm.model_id = model ? model.id : null;
            this._loadFields(val);
        }
    }

    selectChartType(type) { this.state.itemForm.item_type = type; }
    selectKpiColor(color) { this.state.itemForm.kpi_color = color; }
    selectKpiIcon(icon)   { this.state.itemForm.kpi_icon  = icon; }

    // ─── List View column picker ─────────────────────────────────────────────
    listColumnsArray() {
        try {
            const arr = JSON.parse(this.state.itemForm.list_columns || "[]");
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    toggleListColumn(name) {
        const arr = this.listColumnsArray();
        const idx = arr.indexOf(name);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(name);
        this.state.itemForm.list_columns = JSON.stringify(arr);
    }

    moveListColumn(index, dir) {
        const arr = this.listColumnsArray();
        const newIdx = index + dir;
        if (newIdx < 0 || newIdx >= arr.length) return;
        [arr[index], arr[newIdx]] = [arr[newIdx], arr[index]];
        this.state.itemForm.list_columns = JSON.stringify(arr);
    }

    _fieldLabel(name) {
        const f = this.state.fields.find(f => f.name === name);
        return f ? f.string : name;
    }

    // ─── Searchable field picker (List View columns) ─────────────────────────
    openListFieldSel() {
        this.state.listFieldSel.open  = true;
        this.state.listFieldSel.query = '';
        setTimeout(() => {
            const inp = document.querySelector('.hb-list-field-sel-input');
            if (inp) inp.focus();
        }, 40);
        this._listFieldSelClose = (e) => {
            if (!e.target.closest('.hb-list-field-sel')) this.closeListFieldSel();
        };
        setTimeout(() => document.addEventListener('click', this._listFieldSelClose), 0);
    }

    closeListFieldSel() {
        this.state.listFieldSel.open = false;
        if (this._listFieldSelClose) {
            document.removeEventListener('click', this._listFieldSelClose);
            this._listFieldSelClose = null;
        }
    }

    onListFieldSearch(ev) {
        this.state.listFieldSel.query = ev.target.value;
    }

    clearListFieldSearch() {
        this.state.listFieldSel.query = '';
        const inp = document.querySelector('.hb-list-field-sel-input');
        if (inp) { inp.value = ''; inp.focus(); }
    }

    listFieldSelResults() {
        const q = (this.state.listFieldSel.query || '').toLowerCase();
        const selected = this.listColumnsArray();
        return this.state.fields
            .filter(f => !selected.includes(f.name))
            .filter(f => !q || f.string.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
            .slice(0, 50);
    }

    selectListField(name) {
        this.toggleListColumn(name);
        this.state.listFieldSel.query = '';
        const inp = document.querySelector('.hb-list-field-sel-input');
        if (inp) { inp.value = ''; inp.focus(); }
    }

    async saveItem() {
        // Serialise visual domain rules into itemForm.domain before save
        if (!this.state.domainBuilder.advanced) {
            this.state.itemForm.domain = this._rulesToDomainStr();
        }
        const form = this.state.itemForm;
        if (!form.name?.trim()) { this._toast("Item name is required", "error"); return; }

        const payload = {
            ...form,
            dashboard_id: this.state.dashboard.id,
        };
        if (form.id) payload.item_id = form.id;

        try {
            const res = await rpc("/hb_dashboard/save_item", {
                item_id: form.id || null,
                data: payload,
            });

            if (res.status === "ok") {
                this.state.showItemDialog = false;
                this._toast("Item saved!", "success");

                if (form.id) {
                    // Update existing item in state
                    const idx = this.state.items.findIndex(i => i.id === form.id);
                    if (idx >= 0) {
                        Object.assign(this.state.items[idx], form);
                        // Update widget header title imperatively
                        const titleEl = document.querySelector(`.grid-stack-item[gs-id="${form.id}"] .hb-item-title`);
                        if (titleEl) titleEl.textContent = form.custom_title || form.name;
                        const cardEl = document.querySelector(`.grid-stack-item[gs-id="${form.id}"] .hb-chart-item`);
                        if (cardEl) cardEl.style.borderTop = form.top_border_color ? `4px solid ${form.top_border_color}` : '';
                        this._renderItemChart(this.state.items[idx]);
                    }
                } else {
                    // New item — add to state and widget DOM
                    const newItem = {
                        ...form,
                        id: res.data.id,
                        _loaded: false,
                        _data: null,
                        _error: null,
                    };
                    this.state.items.push(newItem);
                    this._addItemWidget(newItem);
                    this._renderItemChart(newItem);
                }
            } else {
                this._toast(res.message || "Save failed", "error");
            }
        } catch (e) {
            this._toast("Error saving item: " + e.message, "error");
        }
    }

    async deleteItem(item) {
        if (!confirm(`Delete "${item.name}"?`)) return;
        try {
            const res = await rpc("/hb_dashboard/delete_item", { item_id: item.id });
            if (res.status === "ok") {
                // Remove from GridStack
                if (this._grid) {
                    const el = document.querySelector(`.grid-stack-item[gs-id="${item.id}"]`);
                    if (el) this._grid.removeWidget(el);
                }
                // Dispose chart
                if (this._charts[item.id]) {
                    try { this._charts[item.id].dispose(); } catch (e) {}
                    delete this._charts[item.id];
                }
                this.state.items = this.state.items.filter(i => i.id !== item.id);
                this._toast("Item deleted", "success");
            } else {
                this._toast(res.message || "Delete failed", "error");
            }
        } catch (e) { this._toast("Error deleting item", "error"); }
    }

    // ─── Dashboard Settings ───────────────────────────────────────────────────
    showDashboardSettings() {
        this.state.dashForm = { ...this.state.dashboard };
        this.state.showDashboardDialog = true;
    }

    hideDashboardDialog() { this.state.showDashboardDialog = false; }

    onDashFormChange(field, ev) {
        this.state.dashForm[field] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    }

    async saveDashboard() {
        try {
            const res = await rpc("/hb_dashboard/update", {
                dashboard_id: this.state.dashboard.id,
                data: this.state.dashForm,
            });
            if (res.status === "ok") {
                Object.assign(this.state.dashboard, this.state.dashForm);
                this._applyTheme(this.state.dashForm.theme);
                this.state.showDashboardDialog = false;
                this._toast("Dashboard updated!", "success");
            } else {
                this._toast(res.message || "Update failed", "error");
            }
        } catch (e) { this._toast("Error updating dashboard", "error"); }
    }

    // ─── Bookmark ─────────────────────────────────────────────────────────────
    async toggleBookmark() {
        try {
            const res = await rpc("/hb_dashboard/toggle_bookmark", {
                dashboard_id: this.state.dashboard.id,
            });
            if (res.status === "ok") {
                this.state.dashboard.is_bookmarked = res.data.is_bookmarked;
                this._toast(res.data.is_bookmarked ? "Bookmarked!" : "Bookmark removed", "info");
            }
        } catch (e) {}
    }

    // ─── AI Panel ─────────────────────────────────────────────────────────────
    toggleAiPanel() { this.state.aiPanelOpen = !this.state.aiPanelOpen; }
    closeAiPanel()  { this.state.aiPanelOpen = false; }

    onAiModelChange(ev)  { this.state.aiModel  = ev.target.value; }
    onAiIntentChange(ev) { this.state.aiIntent  = ev.target.value; }

    async aiGenerate() {
        if (!this.state.aiModel) { this._toast("Select a model first", "error"); return; }
        this.state.aiLoading  = true;
        this.state.aiResponse = "";
        try {
            const res = await rpc("/hb_dashboard/ai_generate", {
                model_name:   this.state.aiModel,
                intent:       this.state.aiIntent,
                dashboard_id: this.state.dashboard.id,
            });
            if (res.status === "ok") {
                const newItems = res.data.items || [];
                const TYPE_LABELS = {
                    tile: 'KPI Card', bar: 'Bar Chart', line: 'Line Chart',
                    area: 'Area Chart', pie: 'Pie Chart', doughnut: 'Doughnut Chart',
                    funnel: 'Funnel Chart', radar: 'Radar Chart', scatter: 'Scatter Plot',
                    gauge: 'Gauge', treemap: 'Treemap', heatmap: 'Heatmap',
                    waterfall: 'Waterfall Chart',
                };
                const detectedTypes = res.data.detected_types || [];
                let successMsg;
                if (newItems.length === 1) {
                    const label = TYPE_LABELS[newItems[0].item_type] || newItems[0].item_type;
                    successMsg = `✓ Created 1 ${label} successfully!`;
                } else if (detectedTypes.length > 0) {
                    const names = detectedTypes.map(t => TYPE_LABELS[t] || t).join(', ');
                    successMsg = `✓ Created ${newItems.length} items: ${names}`;
                } else {
                    successMsg = `✓ Created ${newItems.length} item(s) successfully!`;
                }
                this.state.aiResponse = successMsg;
                this._toast(successMsg.replace('✓ ', ''), "success");

                // Phase 1: add all widgets to DOM so GridStack can batch-calculate layout
                for (const item of newItems) {
                    item._loaded = false; item._data = null; item._error = null;
                    this.state.items.push(item);
                    this._addItemWidget(item);
                }

                // Phase 2: let GridStack finish its layout pass and the browser paint
                await new Promise(resolve => setTimeout(resolve, 200));

                // Phase 3: resize pre-existing charts, then load data for new ones
                this._resizeCharts();
                for (const item of newItems) {
                    this._renderItemChart(item);
                }
            } else {
                this.state.aiResponse = "Error: " + (res.message || "AI generation failed");
                this._toast("AI failed: " + res.message, "error");
            }
        } catch (e) {
            this.state.aiResponse = "Error: " + e.message;
            this._toast("AI error: " + e.message, "error");
        }
        this.state.aiLoading = false;
    }

    async aiExplainItem(item) {
        if (this.state.configAiProvider === "disabled") {
            this._toast("AI not configured in Settings", "warning");
            return;
        }
        this.state.aiExplainText = "Loading explanation...";
        this.state.aiPanelOpen   = true;
        this.state.aiExplainItem = item;

        try {
            const res = await rpc("/hb_dashboard/ai_explain", {
                item_id:    item.id,
                chart_data: item._data,
            });
            if (res.status === "ok") {
                this.state.aiExplainText = res.data.explanation;
            } else {
                this.state.aiExplainText = "Could not explain: " + res.message;
            }
        } catch (e) {
            this.state.aiExplainText = "Error: " + e.message;
        }
    }

    // ─── Export ───────────────────────────────────────────────────────────────
    toggleExportMenu() { this.state.showExportMenu = !this.state.showExportMenu; }

    async exportDashboardPNG() {
        this.state.showExportMenu = false;
        if (!window.html2canvas) {
            await loadJS(HTML2CANVAS);
        }
        const el = this.gridRef.el;
        if (!el) return;
        try {
            const canvas = await window.html2canvas(el, { scale: 2, useCORS: true });
            const link = document.createElement("a");
            link.download = `${this.state.dashboard.name.replace(/\s+/g, "_")}_dashboard.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            this._toast("Dashboard exported as PNG", "success");
        } catch (e) { this._toast("PNG export failed: " + e.message, "error"); }
    }

    async exportDashboardPDF() {
        this.state.showExportMenu = false;
        if (!window.html2canvas) await loadJS(HTML2CANVAS);
        if (!window.jspdf)       await loadJS(JSPDF);
        const el = this.gridRef.el;
        if (!el) return;
        try {
            const canvas = await window.html2canvas(el, { scale: 1.5, useCORS: true });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
            const imgData = canvas.toDataURL("image/jpeg", 0.95);
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = (canvas.height / canvas.width) * pdfW;
            pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
            pdf.save(`${this.state.dashboard.name.replace(/\s+/g, "_")}_dashboard.pdf`);
            this._toast("Dashboard exported as PDF", "success");
        } catch (e) { this._toast("PDF export failed: " + e.message, "error"); }
    }

    async exportItemExcel(item) {
        if (!window.XLSX) await loadJS(SHEETJS);
        try {
            const res = await rpc("/hb_dashboard/get_export_data", {
                item_id: item.id, filters: this.state.filters,
            });
            if (res.status !== "ok") { this._toast("Export failed: " + res.message, "error"); return; }
            const { headers, rows, title } = res.data;
            const wb = window.XLSX.utils.book_new();
            const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
            window.XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
            window.XLSX.writeFile(wb, `${title.replace(/\s+/g,"_")}.xlsx`);
            this._toast("Exported as Excel", "success");
        } catch (e) { this._toast("Excel export failed: " + e.message, "error"); }
    }

    async exportItemCSV(item) {
        try {
            const res = await rpc("/hb_dashboard/get_export_data", {
                item_id: item.id, filters: this.state.filters,
            });
            if (res.status !== "ok") { this._toast("Export failed: " + res.message, "error"); return; }
            const { headers, rows, title } = res.data;
            const lines = [headers, ...rows].map(r => r.map(c =>
                typeof c === "string" && c.includes(",") ? `"${c}"` : c
            ).join(","));
            const blob = new Blob([lines.join("\n")], { type: "text/csv" });
            const link = document.createElement("a");
            link.download = `${title.replace(/\s+/g,"_")}.csv`;
            link.href     = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
            this._toast("Exported as CSV", "success");
        } catch (e) { this._toast("CSV export failed: " + e.message, "error"); }
    }

    async exportItemPNG(item) {
        if (!window.html2canvas) await loadJS(HTML2CANVAS);
        const el = document.querySelector(`.grid-stack-item[gs-id="${item.id}"]`);
        if (!el) { this._toast("Could not find item element", "error"); return; }
        try {
            const canvas = await window.html2canvas(el, { scale: 2, useCORS: true });
            const link = document.createElement("a");
            link.download = `${item.name.replace(/\s+/g,"_")}.png`;
            link.href     = canvas.toDataURL("image/png");
            link.click();
            this._toast("Chart exported as PNG", "success");
        } catch (e) { this._toast("PNG export failed", "error"); }
    }

    // ─── JSON Export/Import ───────────────────────────────────────────────────
    async exportJSON() {
        this.state.showExportMenu = false;
        try {
            const res = await rpc("/hb_dashboard/export_json", {
                dashboard_id: this.state.dashboard.id,
            });
            if (res.status === "ok") {
                const json = JSON.stringify(res.data, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const link = document.createElement("a");
                link.download = `${this.state.dashboard.name.replace(/\s+/g,"_")}.json`;
                link.href     = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
                this._toast("Dashboard exported as JSON", "success");
            } else {
                this._toast("Export failed: " + res.message, "error");
            }
        } catch (e) { this._toast("Export failed: " + e.message, "error"); }
    }

    // ─── Navigation ───────────────────────────────────────────────────────────
    goHome() {
        this.action.doAction({
            type: "ir.actions.client",
            tag: "hb_dashboard_main",
            target: "main",
        });
    }

    // ─── Theme ────────────────────────────────────────────────────────────────
    _applyTheme(theme) {
        const root = document.querySelector(".hb-dashboard-root");
        if (!root) return;
        root.classList.toggle("hb-dark", theme === "dark");
    }

    toggleTheme() {
        const cur = this.state.dashboard?.theme || "light";
        const next = cur === "light" ? "dark" : "light";
        if (this.state.dashboard) this.state.dashboard.theme = next;
        this._applyTheme(next);

        // Persist
        rpc("/hb_dashboard/update", {
            dashboard_id: this.state.dashboard.id,
            data: { theme: next },
        }).catch(console.warn);

        // Re-render charts with new theme
        setTimeout(() => {
            Object.keys(this._charts).forEach(id => {
                const item = this.state.items.find(i => i.id === parseInt(id));
                if (item) this._drawChart(item);
            });
        }, 100);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    _nextTick() {
        // 50ms gives OWL enough time to fully patch the DOM (microtask queue drains,
        // then browser paints) before we try to query/init DOM elements.
        return new Promise(resolve => setTimeout(resolve, 50));
    }

    _toast(msg, type = "info") {
        this.notification.add(msg, { type, title: "BI Dashboard" });
    }

    formatValue(value, format, prefix, suffix, currencySymbol) {
        if (value === null || value === undefined) return "—";
        let v = Number(value);
        if (isNaN(v)) return String(value);

        switch (format) {
            case "currency":
                return (currencySymbol || "$") + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            case "percentage":
                return v.toFixed(1) + "%";
            case "duration": {
                const h = Math.floor(v / 3600);
                const m = Math.floor((v % 3600) / 60);
                return `${h}h ${m}m`;
            }
            default:
                return (prefix || "") + v.toLocaleString() + (suffix || "");
        }
    }

    get dateFilterOptions() {
        return Object.entries(DATE_FILTER_LABELS).map(([k, v]) => ({ value: k, label: v }));
    }

    isCustomDateFilter() {
        return this.state.filters.date_filter === "custom";
    }

    getItemTitle(item) {
        return item.custom_title || item.name;
    }

    getTileChangeIcon(pct) {
        if (!pct) return "fa-minus";
        return pct > 0 ? "fa-arrow-up" : "fa-arrow-down";
    }

    getTileChangeClass(pct) {
        if (!pct) return "neutral";
        return pct > 0 ? "positive" : "negative";
    }
}

registry.category("actions").add("hb_dashboard_builder", HbDashboardBuilder);
