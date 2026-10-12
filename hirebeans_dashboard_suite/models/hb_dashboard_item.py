import json
import logging
from odoo import models, fields, api, _

_logger = logging.getLogger(__name__)

CHART_TYPES = [
    ('tile', 'KPI Tile'),
    ('bar', 'Bar Chart'),
    ('line', 'Line Chart'),
    ('area', 'Area Chart'),
    ('pie', 'Pie Chart'),
    ('doughnut', 'Doughnut Chart'),
    ('funnel', 'Funnel Chart'),
    ('radar', 'Radar Chart'),
    ('scatter', 'Scatter Plot'),
    ('gauge', 'Gauge'),
    ('treemap', 'Treemap'),
    ('heatmap', 'Heatmap'),
    ('waterfall', 'Waterfall Chart'),
    ('boxplot', 'Box Plot'),
    ('candlestick', 'Candlestick'),
    ('map', 'Map Chart'),
    ('list', 'List View'),
]

DATE_FILTERS = [
    ('all', 'All Time'),
    ('today', 'Today'),
    ('yesterday', 'Yesterday'),
    ('this_week', 'This Week'),
    ('last_week', 'Last Week'),
    ('this_month', 'This Month'),
    ('last_month', 'Last Month'),
    ('this_quarter', 'This Quarter'),
    ('last_quarter', 'Last Quarter'),
    ('this_year', 'This Year'),
    ('last_year', 'Last Year'),
    ('last_7', 'Last 7 Days'),
    ('last_14', 'Last 14 Days'),
    ('last_30', 'Last 30 Days'),
    ('last_60', 'Last 60 Days'),
    ('last_90', 'Last 90 Days'),
    ('last_180', 'Last 180 Days'),
    ('last_365', 'Last 365 Days'),
    ('mtd', 'Month to Date'),
    ('qtd', 'Quarter to Date'),
    ('ytd', 'Year to Date'),
    ('custom', 'Custom Range'),
]


class HbDashboardItem(models.Model):
    _name = 'hb.dashboard.item'
    _description = 'BI Dashboard Item'
    _order = 'sequence, id'

    dashboard_id = fields.Many2one('hb.dashboard', string='Dashboard', required=True, ondelete='cascade')
    name = fields.Char(string='Item Title', required=True, default='New Item')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    # Chart type
    item_type = fields.Selection(CHART_TYPES, string='Chart Type', required=True, default='tile')

    # Grid position (GridStack layout)
    x = fields.Integer(string='Grid X', default=0)
    y = fields.Integer(string='Grid Y', default=0)
    w = fields.Integer(string='Grid Width', default=4)
    h = fields.Integer(string='Grid Height', default=3)

    # Data source
    model_id = fields.Many2one('ir.model', string='Data Model', ondelete='set null')
    model_name = fields.Char(string='Model Technical Name', related='model_id.model', store=True)

    # Fields configuration
    date_field = fields.Char(string='Date Field', default='create_date')
    x_field = fields.Char(string='X / Group By Field')
    y_field = fields.Char(string='Y / Measure Field')
    aggregate = fields.Selection([
        ('count', 'Count'),
        ('sum', 'Sum'),
        ('avg', 'Average'),
        ('min', 'Minimum'),
        ('max', 'Maximum'),
    ], string='Aggregate', default='count')

    # Domain & Filters
    domain = fields.Char(string='Domain Filter', default='[]')
    date_filter = fields.Selection(DATE_FILTERS, string='Date Filter', default='this_month')
    date_from = fields.Date(string='Date From')
    date_to = fields.Date(string='Date To')

    # Drilldown
    is_drill_down = fields.Boolean(string='Enable Drill-down', default=False)
    drilldown_field = fields.Char(string='Drill-down Field')

    # Grouping
    groupby_field = fields.Char(string='Group By')
    second_groupby = fields.Char(string='Second Group By')
    limit = fields.Integer(string='Data Limit', default=20)
    sort_by = fields.Char(string='Sort By')
    sort_order = fields.Selection([('asc', 'Ascending'), ('desc', 'Descending')], default='desc')
    list_columns = fields.Char(string='List View Columns (JSON)', default='[]')

    # Appearance
    chart_color = fields.Char(string='Chart Color', default='#667eea')
    color_scheme = fields.Selection([
        ('default', 'Default'),
        ('vintage', 'Vintage'),
        ('dark', 'Dark'),
        ('westeros', 'Westeros'),
        ('essos', 'Essos'),
        ('wonderland', 'Wonderland'),
        ('walden', 'Walden'),
        ('chalk', 'Chalk'),
        ('infographic', 'Infographic'),
        ('macarons', 'Macarons'),
        ('roma', 'Roma'),
        ('shine', 'Shine'),
        ('purple_passion', 'Purple Passion'),
        ('halloween', 'Halloween'),
    ], string='Color Scheme', default='default')
    segment_colors = fields.Char(string='Segment Colors (JSON)', default='[]')
    show_legend = fields.Boolean(string='Show Legend', default=True)
    stack_chart = fields.Boolean(string='Stack Chart', default=False)
    show_data_zoom = fields.Boolean(string='Show Data Zoom', default=False)
    show_markline = fields.Boolean(string='Show Markline (Average)', default=False)
    smooth_line = fields.Boolean(string='Smooth Line', default=True)

    # KPI Tile specific
    kpi_icon = fields.Char(string='KPI Icon (FA class)', default='fa-bar-chart')
    kpi_color = fields.Char(string='KPI Card Color Class', default='blue')
    kpi_format = fields.Selection([
        ('number', 'Number'),
        ('currency', 'Currency'),
        ('percentage', 'Percentage'),
        ('duration', 'Duration'),
    ], string='KPI Format', default='number')
    kpi_suffix = fields.Char(string='KPI Suffix')
    kpi_prefix = fields.Char(string='KPI Prefix')
    compare_period = fields.Selection([
        ('none', 'No Comparison'),
        ('previous', 'Previous Period'),
        ('last_year', 'Same Period Last Year'),
    ], string='Compare With', default='none')

    # Gauge specific
    gauge_min = fields.Float(string='Gauge Min', default=0)
    gauge_max = fields.Float(string='Gauge Max', default=100)
    gauge_target = fields.Float(string='Gauge Target')

    # Custom display
    custom_title = fields.Char(string='Custom Title Override')
    show_data_labels = fields.Boolean(string='Show Data Labels', default=False)
    chart_title_position = fields.Selection([
        ('top', 'Top'), ('bottom', 'Bottom'), ('none', 'Hidden')
    ], default='top')

    # Drill-down navigation
    top_border_color = fields.Char(string='Top Border Color', default='')
    click_action_model = fields.Char(string='Click: Open Model')
    click_action_domain = fields.Char(string='Click: Domain Filter')
    click_action_view = fields.Selection([
        ('list,form', 'List + Form'),
        ('kanban,form', 'Kanban + Form'),
        ('form', 'Form Only'),
    ], string='Click: View Mode', default='list,form')

    # Currency
    currency_id = fields.Many2one('res.currency', string='Currency',
                                  default=lambda self: self.env.company.currency_id)

    def get_item_config(self):
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.name,
            'custom_title': self.custom_title or '',
            'item_type': self.item_type,
            'x': self.x, 'y': self.y, 'w': self.w, 'h': self.h,
            'model_name': self.model_name or '',
            'model_id': self.model_id.id if self.model_id else False,
            'date_field': self.date_field or 'create_date',
            'x_field': self.x_field or '',
            'y_field': self.y_field or '',
            'aggregate': self.aggregate,
            'domain': self.domain or '[]',
            'date_filter': self.date_filter,
            'date_from': str(self.date_from) if self.date_from else False,
            'date_to': str(self.date_to) if self.date_to else False,
            'groupby_field': self.groupby_field or '',
            'second_groupby': self.second_groupby or '',
            'limit': self.limit,
            'sort_by': self.sort_by or '',
            'sort_order': self.sort_order,
            'list_columns': self.list_columns or '[]',
            'chart_color': self.chart_color,
            'color_scheme': self.color_scheme,
            'segment_colors': self.segment_colors or '[]',
            'show_legend': self.show_legend,
            'stack_chart': self.stack_chart,
            'show_data_zoom': self.show_data_zoom,
            'show_markline': self.show_markline,
            'smooth_line': self.smooth_line,
            'kpi_icon': self.kpi_icon,
            'kpi_color': self.kpi_color,
            'kpi_format': self.kpi_format,
            'kpi_suffix': self.kpi_suffix or '',
            'kpi_prefix': self.kpi_prefix or '',
            'compare_period': self.compare_period,
            'gauge_min': self.gauge_min,
            'gauge_max': self.gauge_max,
            'gauge_target': self.gauge_target,
            'show_data_labels': self.show_data_labels,
            'is_drill_down': self.is_drill_down,
            'drilldown_field': self.drilldown_field or '',
            'top_border_color': self.top_border_color or '',
            'click_action_model': self.click_action_model or '',
            'click_action_domain': self.click_action_domain or '[]',
            'click_action_view': self.click_action_view or 'list,form',
            'currency_symbol': self.currency_id.symbol if self.currency_id else '$',
        }

    def _register_hook(self):
        super()._register_hook()
        from ..hooks import fixup_missing_model_ids
        try:
            fixup_missing_model_ids(self.env)
        except Exception:
            _logger.exception("hirebeans_dashboard_suite: dashboard item model_id fixup failed")
