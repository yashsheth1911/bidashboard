/** @odoo-module **/
import { patch }   from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { rpc }     from "@web/core/network/rpc";
import { HbDashboardBuilder } from "@hirebeans_dashboard_suite/js/hb_dashboard_builder";

const FORMULA_TYPE = { type: "formula", icon: "fa-calculator", label: "Formula KPI" };
const VAR_LETTERS  = ["A", "B", "C", "D"];

function emptyVar(letter) {
    return {
        var:             letter,
        label:           "",
        model_name:      "",
        domain:          "[]",
        aggregate:       "count",
        y_field:         "",
        date_field:      "create_date",
        use_date_filter: true,
        // per-variable model selector state
        modelSelOpen:    false,
        modelSelQuery:   "",
        // per-variable visual domain builder state
        dbRules:         [],
        dbMatchMode:     "ALL",
        dbAdvanced:      false,
        dbFields:        [],
        dbFieldsLoaded:  false,
    };
}

patch(HbDashboardBuilder.prototype, {

    // ── Lifecycle ──────────────────────────────────────────────────────────

    setup() {
        super.setup();
        this.formulaState = useState({ vars: [emptyVar("A")] });
    },

    // Chart-type picker reflects the feature flag only once config has loaded
    // (setup() runs before _loadConfig() resolves, so the flag isn't known yet).
    async _loadConfig() {
        await super._loadConfig();
        const idx = this.CHART_TYPES.findIndex(ct => ct.type === "formula");
        if (this.state.configEnableFormula === false) {
            if (idx >= 0) this.CHART_TYPES.splice(idx, 1);
        } else if (idx < 0) {
            this.CHART_TYPES.push(FORMULA_TYPE);
        }
    },

    // ── itemForm defaults ──────────────────────────────────────────────────

    _emptyItemForm() {
        return { ...super._emptyItemForm(), formula_variables: "[]", formula_expr: "" };
    },

    // ── Dialog open / init ─────────────────────────────────────────────────

    async showAddItem() {
        await super.showAddItem();
        this.formulaState.vars = [emptyVar("A")];
    },

    async showEditItem(item) {
        await super.showEditItem(item);
        if (item.item_type === "formula") {
            let vars;
            try {
                const parsed = JSON.parse(item.formula_variables || "[]");
                vars = parsed.length
                    ? parsed.map(v => ({ ...emptyVar(v.var || "A"), ...v }))
                    : [emptyVar("A")];
            } catch (e) {
                vars = [emptyVar("A")];
            }
            // Parse each var's domain into visual rules
            vars = vars.map(v => {
                const result = this._parseDomainString(v.domain || "");
                if (result === null) {
                    return { ...v, dbRules: [], dbMatchMode: "ALL", dbAdvanced: true };
                }
                return { ...v, dbRules: result.rules, dbMatchMode: result.matchMode, dbAdvanced: false };
            });
            this.formulaState.vars = vars;
            // Load fields for each variable that already has a model set
            vars.forEach((v, i) => {
                if (v.model_name) this._varLoadFields(i, v.model_name);
            });
        }
    },

    // ── Rendering ─────────────────────────────────────────────────────────

    async _renderItemChart(item) {
        if (item.item_type !== "formula") return super._renderItemChart(item);
        try {
            const res = await rpc("/hb_dashboard/get_formula_data", {
                item_id: item.id,
                filters: this.state.filters,
            });
            if (res.status === "ok") {
                item._data   = res.data;
                item._loaded = true;
                item._error  = null;
            } else {
                item._loaded = true;
                item._error  = res.message || "Formula error";
            }
        } catch (e) {
            item._loaded = true;
            item._error  = e.message || "Load failed";
        }
        this._updateItemBody(item);
    },

    _updateItemBody(item) {
        if (item.item_type === "formula") {
            const body = document.getElementById(`hb-item-body-${item.id}`);
            if (!body) return;
            if (item._error) {
                body.innerHTML = `<div class="hb-item-error"><i class="fa fa-exclamation-circle"></i><div>${this._escapeHtml(item._error)}</div></div>`;
                return;
            }
            if (!item._data) return;
            body.innerHTML = this._buildTileHTML(item);
            return;
        }
        super._updateItemBody(item);
    },

    // ── Save ──────────────────────────────────────────────────────────────

    async saveItem() {
        if (this.state.itemForm.item_type !== "formula") return super.saveItem();

        // Serialize each variable's domain from its builder state before saving
        const serializedVars = this.formulaState.vars.map((v, i) => {
            const domain = v.dbAdvanced ? (v.domain || "[]") : this._varRulesToDomain(i);
            return {
                var:             v.var,
                label:           v.label,
                model_name:      v.model_name,
                domain:          domain,
                aggregate:       v.aggregate,
                y_field:         v.y_field,
                date_field:      v.date_field,
                use_date_filter: v.use_date_filter,
            };
        });
        this.state.itemForm.formula_variables = JSON.stringify(serializedVars);

        const form = this.state.itemForm;
        if (!form.name?.trim()) { this._toast("Item name is required", "error"); return; }

        try {
            const res = await rpc("/hb_dashboard/save_formula_item", {
                item_id: form.id || null,
                data: { ...form, dashboard_id: this.state.dashboard.id },
            });
            if (res.status === "ok") {
                this.state.showItemDialog = false;
                this._toast("Formula item saved!", "success");
                if (form.id) {
                    const idx = this.state.items.findIndex(i => i.id === form.id);
                    if (idx >= 0) {
                        Object.assign(this.state.items[idx], form);
                        const titleEl = document.querySelector(`.grid-stack-item[gs-id="${form.id}"] .hb-item-title`);
                        if (titleEl) titleEl.textContent = form.custom_title || form.name;
                        const cardEl  = document.querySelector(`.grid-stack-item[gs-id="${form.id}"] .hb-chart-item`);
                        if (cardEl) cardEl.style.borderTop = form.top_border_color ? `4px solid ${form.top_border_color}` : "";
                        this._renderItemChart(this.state.items[idx]);
                    }
                } else {
                    const newItem = { ...form, id: res.data.id, _loaded: false, _data: null, _error: null };
                    this.state.items.push(newItem);
                    this._addItemWidget(newItem);
                    this._renderItemChart(newItem);
                }
            } else {
                this._toast(res.message || "Save failed", "error");
            }
        } catch (e) {
            this._toast("Error saving formula item: " + e.message, "error");
        }
    },

    // ── Formula variable helpers ───────────────────────────────────────────

    addFormulaVar() {
        const used = this.formulaState.vars.map(v => v.var);
        const next = VAR_LETTERS.find(l => !used.includes(l));
        if (next) this.formulaState.vars = [...this.formulaState.vars, emptyVar(next)];
    },

    removeFormulaVar(idx) {
        if (this.formulaState.vars.length > 1)
            this.formulaState.vars = this.formulaState.vars.filter((_, i) => i !== idx);
    },

    onFormulaVarChange(idx, field, ev) {
        const val = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === idx ? { ...v, [field]: val } : v
        );
        // When model changes, reload fields for the domain builder
        if (field === "model_name") {
            if (val) {
                this._varLoadFields(idx, val);
            } else {
                this.formulaState.vars = this.formulaState.vars.map((v, i) =>
                    i === idx ? { ...v, dbFields: [], dbFieldsLoaded: false, dbRules: [] } : v
                );
            }
        }
    },

    insertFormulaVar(letter) {
        this.state.itemForm.formula_expr = (this.state.itemForm.formula_expr || "") + letter;
    },

    canAddFormulaVar() {
        return this.formulaState.vars.length < VAR_LETTERS.length;
    },

    // ── Per-variable model selector ───────────────────────────────────────

    async varModelFocus(vi) {
        // Close all other variable model selectors, open this one
        const query = this.formulaState.vars[vi]?.model_name || "";
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi
                ? { ...v, modelSelOpen: true, modelSelQuery: query }
                : { ...v, modelSelOpen: false }
        );
        await this._loadModels(query);
    },

    varModelBlur(vi) {
        // Delay so mousedown on a result fires before blur closes the list
        setTimeout(() => {
            this.formulaState.vars = this.formulaState.vars.map((v, i) =>
                i === vi ? { ...v, modelSelOpen: false } : v
            );
        }, 220);
    },

    varModelSearch(vi, ev) {
        const q = ev.target.value;
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi ? { ...v, modelSelQuery: q, model_name: q } : v
        );
        clearTimeout(this._varModelSearchTimer);
        this._varModelSearchTimer = setTimeout(() => {
            this._loadModels(q);
        }, 250);
    },

    varModelSelect(vi, modelName) {
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi
                ? { ...v, model_name: modelName, modelSelOpen: false, modelSelQuery: modelName,
                    dbRules: [], dbFields: [], dbFieldsLoaded: false }
                : v
        );
        this._varLoadFields(vi, modelName);
    },

    // ── Per-variable domain builder ────────────────────────────────────────

    async _varLoadFields(vi, modelName) {
        if (!modelName) return;
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi ? { ...v, dbFields: [], dbFieldsLoaded: false } : v
        );
        try {
            const res = await rpc("/hb_dashboard/get_fields", { model_name: modelName });
            this.formulaState.vars = this.formulaState.vars.map((v, i) =>
                i === vi ? { ...v, dbFields: res.status === "ok" ? (res.data || []) : [], dbFieldsLoaded: true } : v
            );
        } catch (e) {
            this.formulaState.vars = this.formulaState.vars.map((v, i) =>
                i === vi ? { ...v, dbFields: [], dbFieldsLoaded: true } : v
            );
        }
    },

    _varRulesToDomain(vi) {
        const v = this.formulaState.vars[vi];
        if (!v) return "[]";
        const rules = (v.dbRules || []).filter(r => r.field);
        if (!rules.length) return "[]";
        const leaves = rules.map(r => {
            let val = r.value;
            if (["in", "not in"].includes(r.operator)) {
                val = String(val).split(",").map(s => s.trim()).filter(Boolean);
            } else if (r.fieldType === "boolean") {
                val = (val === "true" || val === true);
            } else if (["integer", "float", "monetary"].includes(r.fieldType) && !["in", "not in"].includes(r.operator)) {
                val = parseFloat(val) || 0;
            } else if (r.fieldType === "many2one" && !["in", "not in"].includes(r.operator)) {
                val = parseInt(val) || val;
            }
            return [r.field, r.operator, val];
        });
        if (leaves.length === 1) return JSON.stringify(leaves);
        if ((v.dbMatchMode || "ALL") === "ALL") return JSON.stringify(leaves);
        // ANY mode: prefix with | operators
        const prefixed = [];
        for (let i = 1; i < leaves.length; i++) prefixed.push("|");
        return JSON.stringify([...prefixed, ...leaves]);
    },

    varDbToggleMode(vi) {
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi ? { ...v, dbMatchMode: (v.dbMatchMode || "ALL") === "ALL" ? "ANY" : "ALL" } : v
        );
    },

    varDbToggleAdvanced(vi) {
        const v = this.formulaState.vars[vi];
        if (!v) return;
        if (!v.dbAdvanced) {
            const domain = this._varRulesToDomain(vi);
            this.formulaState.vars = this.formulaState.vars.map((fv, i) =>
                i === vi ? { ...fv, domain, dbAdvanced: true } : fv
            );
        } else {
            const result = this._parseDomainString(v.domain);
            if (result === null) {
                // eslint-disable-next-line no-alert
                alert("Domain is too complex to visualize. Keep editing in Advanced mode.");
                return;
            }
            this.formulaState.vars = this.formulaState.vars.map((fv, i) =>
                i === vi ? { ...fv, dbRules: result.rules, dbMatchMode: result.matchMode, dbAdvanced: false } : fv
            );
        }
    },

    varDbAddRule(vi) {
        const v = this.formulaState.vars[vi];
        if (!v) return;
        const firstField = (v.dbFields || [])[0];
        const fieldType  = firstField ? (firstField.type || "char") : "char";
        const ops        = this._getDomainOperators(fieldType);
        const newRule = {
            field:            firstField ? firstField.name : "",
            fieldType,
            operator:         ops[0] ? ops[0].v : "=",
            value:            "",
            selectionOptions: firstField && fieldType === "selection" ? (firstField.selection || []) : [],
            m2oOptions:       [],
            m2oLoading:       false,
            m2oTotal:         0,
            m2oRelation:      firstField && fieldType === "many2one" ? (firstField.relation || "") : "",
            m2oDisplay:       "",
            m2oOpen:          false,
        };
        this.formulaState.vars = this.formulaState.vars.map((fv, i) =>
            i === vi ? { ...fv, dbRules: [...(fv.dbRules || []), newRule] } : fv
        );
    },

    varDbRemoveRule(vi, ri) {
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi ? { ...v, dbRules: (v.dbRules || []).filter((_, j) => j !== ri) } : v
        );
    },

    varDbOnField(vi, ri, ev) {
        const v = this.formulaState.vars[vi];
        if (!v) return;
        const fieldName = ev.target.value;
        const field     = (v.dbFields || []).find(f => f.name === fieldName);
        const fieldType = field ? (field.type || "char") : "char";
        const ops       = this._getDomainOperators(fieldType);
        const rules = (v.dbRules || []).map((r, j) => j === ri ? {
            ...r,
            field:            fieldName,
            fieldType,
            operator:         ops[0] ? ops[0].v : "=",
            value:            "",
            selectionOptions: field && fieldType === "selection" ? (field.selection || []) : [],
            m2oRelation:      field && fieldType === "many2one" ? (field.relation || "") : "",
            m2oDisplay:       "",
            m2oOptions:       [],
            m2oOpen:          false,
        } : r);
        this.formulaState.vars = this.formulaState.vars.map((fv, i) =>
            i === vi ? { ...fv, dbRules: rules } : fv
        );
    },

    varDbOnOp(vi, ri, ev) {
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi
                ? { ...v, dbRules: (v.dbRules || []).map((r, j) => j === ri ? { ...r, operator: ev.target.value } : r) }
                : v
        );
    },

    varDbOnValue(vi, ri, ev) {
        const val = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi
                ? { ...v, dbRules: (v.dbRules || []).map((r, j) => j === ri ? { ...r, value: val } : r) }
                : v
        );
    },

    varDbOnAdvancedInput(vi, ev) {
        this.formulaState.vars = this.formulaState.vars.map((v, i) =>
            i === vi ? { ...v, domain: ev.target.value } : v
        );
    },
});
