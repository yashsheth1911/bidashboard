from odoo import models, fields, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    hb_ai_provider = fields.Selection([
        ('claude', 'Anthropic Claude'),
        ('openai', 'OpenAI ChatGPT'),
        ('disabled', 'Disabled'),
    ], string='AI Provider', config_parameter='hb_dashboard.ai_provider', default='disabled')

    hb_ai_api_key = fields.Char(
        string='AI API Key',
        config_parameter='hb_dashboard.ai_api_key',
    )

    hb_ai_model = fields.Char(
        string='AI Model',
        config_parameter='hb_dashboard.ai_model',
        default='claude-sonnet-4-6',
    )

    hb_ai_max_tokens = fields.Integer(
        string='AI Max Tokens',
        config_parameter='hb_dashboard.ai_max_tokens',
        default=2048,
    )

    hb_default_theme = fields.Selection([
        ('light', 'Light'),
        ('dark', 'Dark'),
    ], string='Default Dashboard Theme',
        config_parameter='hb_dashboard.default_theme',
        default='light',
    )

    hb_enable_export = fields.Boolean(
        string='Enable Data Export',
        config_parameter='hb_dashboard.enable_export',
        default=True,
    )

    hb_max_items_per_dashboard = fields.Integer(
        string='Max Items Per Dashboard',
        config_parameter='hb_dashboard.max_items',
        default=50,
    )

    # ── Feature suite toggles ──────────────────────────────────────────────
    # Control the three optional dashboard extensions (hb_dashboard_crossfilter,
    # hb_dashboard_filterbar, hb_dashboard_formula). Each must still be installed
    # as its own module — these only gate whether its already-installed code is
    # active. Default True so installing this update changes nothing for
    # existing users until they touch this settings page.
    hb_enable_crossfilter = fields.Boolean(
        string='Enable Click-to-Filter Charts',
        config_parameter='hb_dashboard.enable_crossfilter',
        default=True,
    )

    hb_enable_filterbar = fields.Boolean(
        string='Enable Dashboard Filter Bar',
        config_parameter='hb_dashboard.enable_filterbar',
        default=True,
    )

    hb_enable_formula = fields.Boolean(
        string='Enable Formula KPI Cards',
        config_parameter='hb_dashboard.enable_formula',
        default=True,
    )
