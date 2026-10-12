import json
import logging
from odoo import models, fields, api, _
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)


class HbDashboard(models.Model):
    _name = 'hb.dashboard'
    _description = 'BI Dashboard'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'sequence, name'

    name = fields.Char(string='Dashboard Name', required=True, tracking=True)
    description = fields.Text(string='Description')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    icon = fields.Char(string='Icon (FA class)', default='fa-tachometer')
    color_class = fields.Char(string='Header Color', default='#667eea')

    # Ownership & Access
    user_id = fields.Many2one('res.users', string='Owner', default=lambda self: self.env.user, required=True)
    is_public = fields.Boolean(string='Public Dashboard', default=False)
    shared_user_ids = fields.Many2many(
        'res.users', 'hb_dashboard_shared_users_rel', 'dashboard_id', 'user_id',
        string='Shared With'
    )
    group_ids = fields.Many2many(
        'res.groups', 'hb_dashboard_group_rel', 'dashboard_id', 'group_id',
        string='Access Groups'
    )

    # Bookmarks
    bookmark_user_ids = fields.Many2many(
        'res.users', 'hb_dashboard_bookmark_rel', 'dashboard_id', 'user_id',
        string='Bookmarked By'
    )
    is_bookmarked = fields.Boolean(string='Bookmarked', compute='_compute_is_bookmarked', store=False)

    # Theme
    theme = fields.Selection([
        ('light', 'Light'),
        ('dark', 'Dark'),
        ('custom', 'Custom'),
    ], string='Theme', default='light')
    primary_color = fields.Char(string='Primary Color', default='#667eea')
    background_color = fields.Char(string='Background Color', default='#f5f7fa')
    card_color = fields.Char(string='Card Background', default='#ffffff')
    text_color = fields.Char(string='Text Color', default='#2d3748')

    # Company
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)
    is_multicompany = fields.Boolean(string='Multi-Company', default=False)

    # Industry template tag
    industry_tag = fields.Selection([
        ('none', 'None'),
        ('sales', 'Sales'),
        ('crm', 'CRM'),
        ('accounting', 'Accounting'),
        ('inventory', 'Inventory'),
        ('pos', 'Point of Sale'),
        ('hr', 'Human Resources'),
        ('manufacturing', 'Manufacturing'),
        ('retail', 'Retail'),
        ('healthcare', 'Healthcare'),
        ('finance', 'Finance'),
        ('logistics', 'Logistics'),
        ('education', 'Education'),
        ('real_estate', 'Real Estate'),
    ], string='Industry', default='none')
    is_template = fields.Boolean(string='Is Template', default=False)

    # Dashboard items
    dashboard_item_ids = fields.One2many('hb.dashboard.item', 'dashboard_id', string='Dashboard Items')
    item_count = fields.Integer(compute='_compute_item_count', string='Items')

    # Last time this dashboard was opened (drives "Continue where you left off")
    last_opened = fields.Datetime(string='Last Opened')

    # Date filter defaults
    default_date_filter = fields.Selection([
        ('all', 'All Time'),
        ('today', 'Today'),
        ('this_week', 'This Week'),
        ('this_month', 'This Month'),
        ('this_quarter', 'This Quarter'),
        ('this_year', 'This Year'),
        ('last_7', 'Last 7 Days'),
        ('last_30', 'Last 30 Days'),
        ('last_90', 'Last 90 Days'),
        ('last_365', 'Last 365 Days'),
        ('custom', 'Custom Range'),
    ], string='Default Date Filter', default='this_month')

    # Grid settings
    grid_columns = fields.Integer(string='Grid Columns', default=12)
    cell_height = fields.Integer(string='Cell Height (px)', default=80)

    # Auto-refresh
    auto_refresh = fields.Boolean(string='Auto Refresh', default=False)
    refresh_interval = fields.Integer(string='Refresh Interval (seconds)', default=300)

    @api.depends('bookmark_user_ids')
    def _compute_is_bookmarked(self):
        uid = self.env.uid
        for rec in self:
            rec.is_bookmarked = uid in rec.bookmark_user_ids.ids

    @api.depends('dashboard_item_ids')
    def _compute_item_count(self):
        for rec in self:
            rec.item_count = len(rec.dashboard_item_ids)

    def toggle_bookmark(self):
        self.ensure_one()
        uid = self.env.uid
        if uid in self.bookmark_user_ids.ids:
            self.bookmark_user_ids = [(3, uid)]
        else:
            self.bookmark_user_ids = [(4, uid)]
        return self.is_bookmarked

    def hb_check_access(self, mode='read'):
        self.ensure_one()
        uid = self.env.uid
        if self.user_id.id == uid:
            return True
        if self.is_public:
            return True
        if uid in self.shared_user_ids.ids:
            return mode == 'read'
        user_groups = self.env.user.all_group_ids.ids
        if any(g in user_groups for g in self.group_ids.ids):
            return True
        if self.env.user.has_group('hirebeans_dashboard_suite.group_hb_dashboard_manager'):
            return True
        return False

    def action_open_dashboard(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'hb_dashboard_builder',
            'name': self.name,
            'params': {'dashboard_id': self.id},
            'target': 'main',
        }

    def get_dashboard_data(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'theme': self.theme,
            'primary_color': self.primary_color,
            'background_color': self.background_color,
            'card_color': self.card_color,
            'text_color': self.text_color,
            'default_date_filter': self.default_date_filter,
            'auto_refresh': self.auto_refresh,
            'refresh_interval': self.refresh_interval,
            'grid_columns': self.grid_columns,
            'cell_height': self.cell_height,
            'is_owner': self.user_id.id == self.env.uid,
            'is_bookmarked': self.is_bookmarked,
            'is_public': self.is_public,
            'company_id': self.company_id.id,
            'company_name': self.company_id.name,
        }

    def export_json(self):
        self.ensure_one()
        items = []
        for item in self.dashboard_item_ids:
            items.append({
                'name': item.name,
                'item_type': item.item_type,
                'x': item.x, 'y': item.y, 'w': item.w, 'h': item.h,
                'model_name': item.model_name,
                'x_field': item.x_field,
                'y_field': item.y_field,
                'aggregate': item.aggregate,
                'domain': item.domain,
                'date_filter': item.date_filter,
                'groupby_field': item.groupby_field,
                'chart_color': item.chart_color,
                'color_scheme': item.color_scheme,
                'segment_colors': item.segment_colors,
                'show_legend': item.show_legend,
                'kpi_icon': item.kpi_icon,
                'kpi_color': item.kpi_color,
                'kpi_format': item.kpi_format,
                'compare_period': item.compare_period,
                'sort_by': item.sort_by,
                'sort_order': item.sort_order,
                'limit': item.limit,
                'custom_title': item.custom_title,
                'stack_chart': item.stack_chart,
                'show_data_zoom': item.show_data_zoom,
                'show_markline': item.show_markline,
                'drilldown_field': item.drilldown_field,
                'date_field': item.date_field,
            })
        return {
            'name': self.name,
            'description': self.description,
            'theme': self.theme,
            'primary_color': self.primary_color,
            'background_color': self.background_color,
            'default_date_filter': self.default_date_filter,
            'grid_columns': self.grid_columns,
            'cell_height': self.cell_height,
            'items': items,
        }

    @api.model
    def import_json(self, data):
        dashboard = self.create({
            'name': data.get('name', 'Imported Dashboard'),
            'description': data.get('description', ''),
            'theme': data.get('theme', 'light'),
            'primary_color': data.get('primary_color', '#667eea'),
            'background_color': data.get('background_color', '#f5f7fa'),
            'default_date_filter': data.get('default_date_filter', 'this_month'),
            'grid_columns': data.get('grid_columns', 12),
            'cell_height': data.get('cell_height', 80),
        })
        for item_data in data.get('items', []):
            item_data['dashboard_id'] = dashboard.id
            self.env['hb.dashboard.item'].create(item_data)
        return dashboard.id
