/** @odoo-module **/

// ─── BI Chart Builder — ECharts option factory for all 17 chart types ────────
// Exposed as window.HbChartBuilder so the builder component can call it.

const COLOR_PALETTES = {
    default:        ["#667eea","#a855f7","#43c46e","#f7971e","#f5576c","#11998e","#4776e6","#fc5c7d","#6a3093","#1fa2ff"],
    vintage:        ["#d87c7c","#919e8b","#d7ab82","#6e7074","#61a0a8","#efa18d","#787464","#cc7e63","#724e58","#4b565b"],
    dark:           ["#dd6b66","#759aa0","#e69d87","#8dc1a9","#ea7e53","#eedd78","#73a373","#73b9bc","#7289ab","#91ca8c"],
    westeros:       ["#516b91","#59c4e6","#edafda","#93b7e3","#a5e7f0","#cbb0e3"],
    essos:          ["#893448","#d95850","#eb8146","#ffb248","#f2d643","#ebdba4"],
    wonderland:     ["#4ea397","#22c3aa","#7bd9a5","#d0648a","#f58db2","#f2b3c9"],
    walden:         ["#3fb1e3","#6be6c1","#626c91","#a0a7e6","#c4ebad","#96dee8"],
    chalk:          ["#fc97af","#87f7cf","#f7f494","#72ccff","#f7c5a0","#d4a4eb"],
    infographic:    ["#c1232b","#27727b","#fcce10","#e87c25","#b5c334","#fe8463","#9bca63","#fad860","#f3a43b","#60c0dd"],
    macarons:       ["#2ec7c9","#b6a2de","#5ab1ef","#ffb980","#d87a80","#8d98b3","#e5cf0d","#97b552","#95706d","#dc69aa"],
    roma:           ["#e01f54","#001852","#f5e8c8","#b8d2c7","#c6b38e","#a4d8c2","#f3d999","#d3758f","#dcc392","#2e4783"],
    shine:          ["#c12e34","#e6b600","#0098d9","#2b821d","#005eaa","#339ca8","#cda819","#32a487"],
    purple_passion: ["#9b8bba","#e098c7","#8fd3e8","#71669e","#cc70af","#7cb4cc"],
    halloween:      ["#ff715e","#ffaf51","#ffee51","#fb8bc3","#56b3d2"],
};

function getPalette(scheme, baseColor) {
    const palette = COLOR_PALETTES[scheme] || COLOR_PALETTES.default;
    if (baseColor && baseColor !== "#667eea") {
        return [baseColor, ...palette.filter(c => c !== baseColor).slice(0, 9)];
    }
    return palette;
}

function getCommonConfig(item, palette) {
    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor  = isDark ? "#a0aec0" : "#718096";
    const gridColor  = isDark ? "#4a5568" : "#e2e8f0";

    return {
        backgroundColor: "transparent",
        color: palette,
        textStyle: { color: textColor, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        legend: {
            show: item.show_legend,
            textStyle: { color: textColor },
            type: "scroll",
        },
        grid: {
            left: "5%", right: "5%", top: item.show_legend ? "14%" : "8%", bottom: item.show_data_zoom ? "20%" : "8%",
            containLabel: true,
        },
        tooltip: {
            trigger: "axis",
            backgroundColor: isDark ? "#2d3748" : "#fff",
            borderColor: isDark ? "#4a5568" : "#e2e8f0",
            textStyle: { color: isDark ? "#f7fafc" : "#2d3748" },
        },
        xAxis: {
            axisLine:      { lineStyle: { color: gridColor } },
            axisTick:      { lineStyle: { color: gridColor } },
            axisLabel:     { color: textColor, overflow: "truncate", width: 80 },
            splitLine:     { lineStyle: { color: gridColor } },
        },
        yAxis: {
            axisLine:  { lineStyle: { color: gridColor } },
            axisLabel: { color: textColor },
            splitLine: { lineStyle: { color: gridColor } },
        },
        dataZoom: item.show_data_zoom ? [
            { type: "inside", start: 0, end: 100 },
            { type: "slider",  start: 0, end: 100, bottom: 4, height: 20 },
        ] : [],
    };
}

function buildMarkLine(values) {
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    return {
        data: [{ type: "average", name: "Avg", label: { formatter: `Avg: ${avg.toFixed(1)}` } }],
        lineStyle: { type: "dashed", color: "#f7971e" },
    };
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────
function buildBar(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const cfg = getCommonConfig(item, palette);
    const categories = data.categories || [];
    const series = (data.series || []).map((s, i) => ({
        name:      s.name,
        type:      "bar",
        data:      s.data,
        stack:     item.stack_chart ? "total" : undefined,
        barMaxWidth: 60,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: palette[i % palette.length] },
        label:     { show: item.show_data_labels, position: "top" },
        markLine:  item.show_markline ? buildMarkLine(s.data) : undefined,
    }));

    cfg.tooltip.trigger = "axis";
    cfg.xAxis.type = "category";
    cfg.xAxis.data = categories;
    cfg.yAxis.type = "value";
    cfg.series = series;
    return cfg;
}

// ─── LINE CHART ───────────────────────────────────────────────────────────────
function buildLine(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const cfg = getCommonConfig(item, palette);
    const series = (data.series || []).map((s, i) => ({
        name:      s.name,
        type:      "line",
        data:      s.data,
        smooth:    item.smooth_line !== false,
        lineStyle: { width: 2.5 },
        itemStyle: { color: palette[i % palette.length] },
        areaStyle: undefined,
        label:     { show: item.show_data_labels },
        markLine:  item.show_markline ? buildMarkLine(s.data) : undefined,
        emphasis:  { focus: "series" },
    }));

    cfg.xAxis.type = "category";
    cfg.xAxis.data = data.categories || [];
    cfg.yAxis.type = "value";
    cfg.series = series;
    return cfg;
}

// ─── AREA CHART ───────────────────────────────────────────────────────────────
function buildArea(item) {
    const opt = buildLine(item);
    opt.series = opt.series.map((s, i) => ({
        ...s,
        areaStyle: {
            opacity: 0.2,
            color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                    { offset: 0, color: getPalette(item.color_scheme, item.chart_color)[i % 10] },
                    { offset: 1, color: "transparent" },
                ]},
        },
    }));
    return opt;
}

// ─── PIE CHART ────────────────────────────────────────────────────────────────
function buildPie(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    let segColors = [];
    try { segColors = JSON.parse(item.segment_colors || "[]"); } catch (e) {}

    const seriesData = (data.data || []).map((d, i) => ({
        name:  d.name,
        value: d.value,
        itemStyle: { color: segColors[i] || palette[i % palette.length] },
    }));

    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor = isDark ? "#a0aec0" : "#718096";

    return {
        backgroundColor: "transparent",
        color: palette,
        tooltip: {
            trigger: "item",
            formatter: "{a} <br/>{b}: {c} ({d}%)",
            backgroundColor: isDark ? "#2d3748" : "#fff",
            textStyle: { color: isDark ? "#f7fafc" : "#2d3748" },
        },
        legend: {
            show: item.show_legend,
            orient: "vertical",
            right: "5%",
            top: "middle",
            textStyle: { color: textColor },
        },
        series: [{
            name:      item.name,
            type:      "pie",
            radius:    ["0%", "70%"],
            center:    ["45%", "50%"],
            data:      seriesData,
            label:     { show: item.show_data_labels, formatter: "{b}: {d}%" },
            emphasis:  { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.5)" } },
        }],
    };
}

// ─── DOUGHNUT CHART ───────────────────────────────────────────────────────────
function buildDoughnut(item) {
    const opt = buildPie(item);
    opt.series[0].radius = ["45%", "70%"];
    opt.series[0].label  = { show: item.show_data_labels, position: "outside" };
    return opt;
}

// ─── FUNNEL CHART ─────────────────────────────────────────────────────────────
function buildFunnel(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const isDark = document.querySelector(".hb-dark") !== null;

    return {
        backgroundColor: "transparent",
        color: palette,
        tooltip: { trigger: "item", formatter: "{a} <br/>{b}: {c}" },
        legend: {
            show: item.show_legend,
            textStyle: { color: isDark ? "#a0aec0" : "#718096" },
        },
        series: [{
            name: item.name,
            type: "funnel",
            left:  "10%",
            width: "80%",
            min: 0,
            max: Math.max(...(data.data || []).map(d => d.value), 1),
            minSize: "0%",
            maxSize: "100%",
            sort: "descending",
            gap: 4,
            label: { show: true, position: "inside", color: "#fff", formatter: "{b}: {c}" },
            data: (data.data || []).map((d, i) => ({
                name: d.name, value: d.value,
                itemStyle: { color: palette[i % palette.length] },
            })),
        }],
    };
}

// ─── RADAR CHART ──────────────────────────────────────────────────────────────
function buildRadar(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor = isDark ? "#a0aec0" : "#718096";

    return {
        backgroundColor: "transparent",
        color: palette,
        tooltip: { trigger: "item" },
        legend: { show: item.show_legend, textStyle: { color: textColor } },
        radar: {
            indicator: data.indicators || [],
            name:      { textStyle: { color: textColor } },
            splitLine: { lineStyle: { color: isDark ? "#4a5568" : "#e2e8f0" } },
            axisLine:  { lineStyle: { color: isDark ? "#4a5568" : "#e2e8f0" } },
        },
        series: [{
            type: "radar",
            data: (data.data || []).map((d, i) => ({
                name:      d.name,
                value:     d.value,
                areaStyle: { opacity: 0.2 },
                lineStyle: { color: palette[i % palette.length] },
                itemStyle: { color: palette[i % palette.length] },
            })),
        }],
    };
}

// ─── SCATTER CHART ────────────────────────────────────────────────────────────
function buildScatter(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const cfg = getCommonConfig(item, palette);

    cfg.tooltip.trigger = "item";
    cfg.xAxis.type = "value";
    cfg.yAxis.type = "value";
    cfg.series = (data.series || []).map((s, i) => ({
        name: s.name,
        type: "scatter",
        data: s.data.map((v, j) => [j, v]),
        symbolSize: 10,
        itemStyle: { color: palette[i % palette.length] },
    }));
    return cfg;
}

// ─── GAUGE CHART ──────────────────────────────────────────────────────────────
function buildGauge(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor = isDark ? "#a0aec0" : "#2d3748";
    const val = data.value || 0;
    const max = data.max || 100;
    const pct = Math.min(100, Math.round((val / max) * 100));

    return {
        backgroundColor: "transparent",
        color: palette,
        series: [{
            type: "gauge",
            min: data.min || 0,
            max,
            axisLine: {
                lineStyle: {
                    width: 18,
                    color: [[0.3, "#43c46e"], [0.7, "#f7971e"], [1, "#f5576c"]],
                },
            },
            pointer: { itemStyle: { color: "auto" } },
            axisTick:   { distance: -22, length: 8, lineStyle: { color: "#fff", width: 2 } },
            splitLine:  { distance: -30, length: 20, lineStyle: { color: "#fff", width: 4 } },
            axisLabel:  { color: textColor, distance: 5, fontSize: 11 },
            detail: {
                valueAnimation: true,
                formatter: `{value}`,
                color: textColor,
                fontSize: 22,
                fontWeight: "bold",
                offsetCenter: [0, "70%"],
            },
            title: { color: textColor, fontSize: 12, offsetCenter: [0, "95%"] },
            data: [{ value: val, name: item.name }],
            markPoint: data.target ? [{
                name: "Target",
                symbol: "triangle",
                symbolSize: 12,
                value: data.target,
                itemStyle: { color: palette[0] },
            }] : [],
        }],
    };
}

// ─── TREEMAP ─────────────────────────────────────────────────────────────────
function buildTreemap(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const isDark = document.querySelector(".hb-dark") !== null;

    return {
        backgroundColor: "transparent",
        color: palette,
        tooltip: {
            formatter: (info) => `${info.name}<br/>${info.value.toLocaleString()}`,
        },
        series: [{
            type:      "treemap",
            data:      (data.data || []).map((d, i) => ({
                name:      d.name,
                value:     d.value,
                itemStyle: { color: palette[i % palette.length], borderColor: isDark ? "#1a202c" : "#fff" },
            })),
            label:     { show: true, formatter: "{b}: {c}" },
            emphasis:  { label: { show: true } },
        }],
    };
}

// ─── HEATMAP ─────────────────────────────────────────────────────────────────
function buildHeatmap(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor = isDark ? "#a0aec0" : "#718096";
    const rawData = data.data || [];
    const labels = [...new Set(rawData.map(d => d[0]))].sort();
    const values = rawData.map(d => [labels.indexOf(d[0]), 0, d[1]]);
    const maxVal = Math.max(...rawData.map(d => d[1]), 1);

    return {
        backgroundColor: "transparent",
        tooltip: { position: "top" },
        grid: { left: "10%", right: "5%", top: "5%", bottom: "15%" },
        xAxis: { type: "category", data: labels, axisLabel: { color: textColor, rotate: 45 }, axisLine: { lineStyle: { color: "#e2e8f0" } } },
        yAxis: { type: "category", data: ["Count"], axisLabel: { color: textColor } },
        visualMap: {
            min: 0, max: maxVal, calculable: true,
            orient: "horizontal", left: "center", bottom: "0%",
            inRange: { color: ["#edf2ff", palette[0]] },
            textStyle: { color: textColor },
        },
        series: [{
            type: "heatmap",
            data: values,
            label: { show: true },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } },
        }],
    };
}

// ─── WATERFALL ───────────────────────────────────────────────────────────────
function buildWaterfall(item) {
    const data = item._data || {};
    const isDark = document.querySelector(".hb-dark") !== null;
    const textColor = isDark ? "#a0aec0" : "#718096";
    const gridColor = isDark ? "#4a5568" : "#e2e8f0";

    const categories = data.categories || [];
    const helpers = (data.data || []).map(d => Math.min(d.value[0], d.value[1]));
    const values  = (data.data || []).map(d => Math.abs(d.raw || 0));
    const colors  = (data.data || []).map(d => d.itemStyle?.color || "#667eea");

    return {
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: "5%", right: "5%", top: "8%", bottom: "8%", containLabel: true },
        xAxis: { type: "category", data: categories, axisLabel: { color: textColor }, axisLine: { lineStyle: { color: gridColor } } },
        yAxis: { type: "value", axisLabel: { color: textColor }, splitLine: { lineStyle: { color: gridColor } } },
        series: [
            {
                name: "Helper",
                type: "bar",
                stack: "waterfall",
                itemStyle: { borderColor: "transparent", color: "transparent" },
                emphasis: { itemStyle: { borderColor: "transparent", color: "transparent" } },
                data: helpers,
            },
            {
                name: item.name,
                type: "bar",
                stack: "waterfall",
                barMaxWidth: 60,
                itemStyle: { borderRadius: [4, 4, 0, 0] },
                data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
                label: { show: item.show_data_labels, position: "top" },
            },
        ],
    };
}

// ─── BOXPLOT ──────────────────────────────────────────────────────────────────
function buildBoxplot(item) {
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const cfg = getCommonConfig(item, palette);

    cfg.xAxis.type = "category";
    cfg.xAxis.data = data.categories || [];
    cfg.yAxis.type = "value";
    cfg.series = [{
        name: item.name,
        type: "boxplot",
        data: data.data || [],
        itemStyle: { color: palette[0], borderColor: palette[1] || "#555" },
    }];
    return cfg;
}

// ─── CANDLESTICK ─────────────────────────────────────────────────────────────
function buildCandlestick(item) {
    const data = item._data || {};
    const cfg = getCommonConfig(item, ["#ec0000", "#00da3c"]);

    cfg.xAxis.type = "category";
    cfg.xAxis.data = data.categories || [];
    cfg.yAxis.type = "value";
    cfg.series = [{
        type: "candlestick",
        data: (data.series && data.series[0] && data.series[0].data) || [],
        itemStyle: { color: "#00da3c", color0: "#ec0000", borderColor: "#00da3c", borderColor0: "#ec0000" },
    }];
    return cfg;
}

// ─── MAP (World / China placeholder using scatter) ────────────────────────────
function buildMap(item) {
    // A full map requires loading GeoJSON — fallback to scatter/bubble
    const data = item._data || {};
    const palette = getPalette(item.color_scheme, item.chart_color);
    const cfg = getCommonConfig(item, palette);

    cfg.tooltip.trigger = "item";
    cfg.xAxis.type = "value";
    cfg.yAxis.type = "value";
    cfg.series = [{
        type: "scatter",
        data: (data.series && data.series[0] && data.series[0].data) || [],
        symbolSize: 12,
        itemStyle: { color: palette[0] },
        label: { show: true },
    }];
    return cfg;
}

// ─── Main Option Builder ──────────────────────────────────────────────────────
function buildOption(item) {
    if (!item || !item._data) return {};

    switch (item.item_type) {
        case "bar":         return buildBar(item);
        case "line":        return buildLine(item);
        case "area":        return buildArea(item);
        case "pie":         return buildPie(item);
        case "doughnut":    return buildDoughnut(item);
        case "funnel":      return buildFunnel(item);
        case "radar":       return buildRadar(item);
        case "scatter":     return buildScatter(item);
        case "gauge":       return buildGauge(item);
        case "treemap":     return buildTreemap(item);
        case "heatmap":     return buildHeatmap(item);
        case "waterfall":   return buildWaterfall(item);
        case "boxplot":     return buildBoxplot(item);
        case "candlestick": return buildCandlestick(item);
        case "map":         return buildMap(item);
        default:            return buildBar(item);
    }
}

// Expose globally for use by the OWL builder component
window.HbChartBuilder = { buildOption, getPalette, COLOR_PALETTES };
