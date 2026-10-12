/** @odoo-module **/
import { Component, useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";

// ─── Dashboard Home / List Component ─────────────────────────────────────────
export class HbDashboardMain extends Component {
    static template = "hirebeans_dashboard_suite.DashboardMain";
    static props = ["*"];

    setup() {
        this.action = useService("action");
        this.notification = useService("notification");

        this.state = useState({
            dashboards: [],
            loading: true,
            searchTerm: "",
            activeFilter: "all",
            sortBy: "name",
            showCreateModal: false,
            showImportModal: false,
            newDashboard: this._emptyDashboard(),
            importJson: "",
        });

        onMounted(() => this._loadDashboards());
    }

    // ─── Greeting / Stats / Pinned / Recent ──────────────────────────────────
    get greeting() {
        const h = new Date().getHours();
        const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
        const name = user.name || "there";
        return `Good ${part}, ${name}`;
    }

    get greetingSubtitle() {
        const n = this.state.dashboards.length;
        if (!n) return "No dashboards yet — create your first one.";
        const tags = [...new Set(
            this.state.dashboards
                .map(d => this.getIndustryLabel(d.industry_tag))
                .filter(Boolean)
        )];
        const tagStr = tags.length ? ` across ${tags.join(", ")}` : "";
        return `${n} dashboard${n === 1 ? "" : "s"}${tagStr}.`;
    }

    get statCards() {
        const ds = this.state.dashboards;
        return [
            { label: "Dashboards", value: ds.length, icon: "fa-th-large", color: "blue" },
            { label: "Widgets / icons", value: ds.reduce((s, d) => s + (d.item_count || 0), 0), icon: "fa-bar-chart", color: "purple" },
            { label: "Bookmarked", value: ds.filter(d => d.is_bookmarked).length, icon: "fa-bookmark", color: "orange" },
            { label: "Shared with team", value: ds.filter(d => !d.is_owner || d.is_public).length, icon: "fa-share-alt", color: "green" },
        ];
    }

    get pinnedDashboards() {
        return this.state.dashboards.filter(d => d.is_bookmarked);
    }

    get recentDashboards() {
        return this.state.dashboards
            .filter(d => d.last_opened)
            .sort((a, b) => new Date(b.last_opened) - new Date(a.last_opened))
            .slice(0, 5);
    }

    formatRelativeTime(iso) {
        if (!iso) return "";
        const diffMs = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(iso).toLocaleDateString();
    }

    getOwnerInitial(name) {
        return (name || "?").trim().charAt(0).toUpperCase();
    }

    setSortBy(sortBy) { this.state.sortBy = sortBy; }

    _emptyDashboard() {
        return {
            name: "",
            description: "",
            theme: "light",
            primary_color: "#667eea",
            is_public: false,
            industry_tag: "none",
            default_date_filter: "this_month",
        };
    }

    async _loadDashboards() {
        this.state.loading = true;
        try {
            const res = await rpc("/hb_dashboard/list", {});
            if (res.status === "ok") {
                this.state.dashboards = res.data || [];
            } else {
                this._toast("Failed to load dashboards: " + res.message, "error");
            }
        } catch (e) {
            console.error("[BI Dashboard] Load error:", e);
            this._toast("Failed to load dashboards", "error");
        }
        this.state.loading = false;
    }

    get filteredDashboards() {
        let list = this.state.dashboards;
        const term = this.state.searchTerm.toLowerCase().trim();
        if (term) {
            list = list.filter(d =>
                d.name.toLowerCase().includes(term) ||
                (d.description || "").toLowerCase().includes(term)
            );
        }
        switch (this.state.activeFilter) {
            case "mine": list = list.filter(d => d.is_owner); break;
            case "shared": list = list.filter(d => !d.is_owner && !d.is_public); break;
            case "public": list = list.filter(d => d.is_public); break;
            case "bookmarked": list = list.filter(d => d.is_bookmarked); break;
            case "templates": list = list.filter(d => d.is_template); break;
        }
        list = [...list];
        if (this.state.sortBy === "recent") {
            list.sort((a, b) => new Date(b.last_opened || 0) - new Date(a.last_opened || 0));
        } else {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        return list;
    }

    setFilter(filter) { this.state.activeFilter = filter; }
    onSearch(ev) { this.state.searchTerm = ev.target.value; }

    openDashboard(dashboard) {
        this.action.doAction({
            type: "ir.actions.client",
            tag: "hb_dashboard_builder",
            name: dashboard.name,
            params: { dashboard_id: dashboard.id },
            target: "main",
        });
    }

    async toggleBookmark(ev, dashboard) {
        ev.stopPropagation();
        try {
            const res = await rpc("/hb_dashboard/toggle_bookmark", { dashboard_id: dashboard.id });
            if (res.status === "ok") {
                dashboard.is_bookmarked = res.data.is_bookmarked;
                // Force re-render
                this.state.dashboards = [...this.state.dashboards];
            }
        } catch (e) {
            this._toast("Error toggling bookmark", "error");
        }
    }

    async deleteDashboard(ev, dashboard) {
        ev.stopPropagation();
        if (!confirm(`Delete "${dashboard.name}"? This cannot be undone.`)) return;
        try {
            const res = await rpc("/hb_dashboard/delete", { dashboard_id: dashboard.id });
            if (res.status === "ok") {
                this.state.dashboards = this.state.dashboards.filter(d => d.id !== dashboard.id);
                this._toast("Dashboard deleted", "success");
            } else {
                this._toast(res.message || "Delete failed", "error");
            }
        } catch (e) {
            this._toast("Error deleting dashboard", "error");
        }
    }

    // ─── Create Dashboard ─────────────────────────────────────────────────────
    showCreate() { this.state.newDashboard = this._emptyDashboard(); this.state.showCreateModal = true; }
    hideCreate() { this.state.showCreateModal = false; }

    onNewDashboardChange(field, ev) {
        this.state.newDashboard[field] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    }

    async createDashboard() {
        if (!this.state.newDashboard.name.trim()) {
            this._toast("Dashboard name is required", "error");
            return;
        }
        try {
            const res = await rpc("/hb_dashboard/create", { data: this.state.newDashboard });
            if (res.status === "ok") {
                this.state.showCreateModal = false;
                this._toast("Dashboard created!", "success");
                // Open it immediately
                this.action.doAction({
                    type: "ir.actions.client",
                    tag: "hb_dashboard_builder",
                    name: this.state.newDashboard.name,
                    params: { dashboard_id: res.data.id },
                    target: "main",
                });
            } else {
                this._toast(res.message || "Creation failed", "error");
            }
        } catch (e) {
            this._toast("Error creating dashboard", "error");
        }
    }

    // ─── Import ───────────────────────────────────────────────────────────────
    showImport() { this.state.importJson = ""; this.state.showImportModal = true; }
    hideImport() { this.state.showImportModal = false; }

    onImportFileChange(ev) {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { this.state.importJson = e.target.result; };
        reader.readAsText(file);
    }

    async importDashboard() {
        if (!this.state.importJson.trim()) {
            this._toast("No data to import", "error");
            return;
        }
        try {
            const data = JSON.parse(this.state.importJson);
            const res = await rpc("/hb_dashboard/import_json", { data });
            if (res.status === "ok") {
                this.state.showImportModal = false;
                this._toast("Dashboard imported!", "success");
                await this._loadDashboards();
            } else {
                this._toast(res.message || "Import failed", "error");
            }
        } catch (e) {
            this._toast("Invalid JSON: " + e.message, "error");
        }
    }

    // ─── Utility ──────────────────────────────────────────────────────────────
    getIndustryLabel(tag) {
        const map = {
            none: "", sales: "Sales", crm: "CRM", accounting: "Accounting",
            inventory: "Inventory", pos: "POS", hr: "HR",
            manufacturing: "Manufacturing", retail: "Retail",
            healthcare: "Healthcare", finance: "Finance", logistics: "Logistics",
        };
        return map[tag] || tag;
    }

    getThemeIcon(theme) {
        return theme === "dark" ? "fa-moon-o" : "fa-sun-o";
    }

    _toast(msg, type = "info") {
        this.notification.add(msg, { type, title: "BI Dashboard" });
    }
}

registry.category("actions").add("hb_dashboard_main", HbDashboardMain);
