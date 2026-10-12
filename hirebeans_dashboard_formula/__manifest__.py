{
    'name': 'BI Dashboard',
    'version': '19.0.1.2.2',
    'category': 'Reporting/Dashboard',
    'summary': 'Advanced BI Dashboard Builder with AI, 17 chart types, drag-drop, real-time data',
    'description': """
        Complete dashboard builder platform for Odoo 19 Community.
        Build interactive dashboards from any Odoo model with drag-drop layout,
        17 ECharts chart types, AI generation (Claude/OpenAI), 20+ date filters,
        drill-down, multi-theme, dark mode, export (Excel/CSV/PDF/PNG),
        dashboard import/export, access control, multi-company, and RTL support.

        Third-party libraries vendored under static/lib/ (loaded on demand,
        no external network calls): GridStack 10.3.1 (MIT), Apache ECharts
        5.4.3 (Apache-2.0), html2canvas 1.4.1 (MIT), jsPDF 2.5.1 (MIT),
        SheetJS/xlsx 0.20.1 (Apache-2.0).
    """,
    'author': 'HireBeans.cloud',
    'images': ['images/main_screenshot.png'],
    'depends': ['base', 'web', 'mail', 'bus'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'views/menu.xml',
        'views/hb_dashboard_views.xml',
        'views/hb_res_config_settings_views.xml',
        'data/hb_dashboard_templates.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'hirebeans_dashboard_suite/static/src/scss/hb_dashboard.scss',
            'hirebeans_dashboard_suite/static/src/js/hb_dashboard_main.js',
            'hirebeans_dashboard_suite/static/src/js/hb_dashboard_builder.js',
            'hirebeans_dashboard_suite/static/src/js/hb_dashboard_chart.js',
            'hirebeans_dashboard_suite/static/src/xml/hb_dashboard_main.xml',
            'hirebeans_dashboard_suite/static/src/xml/hb_dashboard_builder.xml',
            'hirebeans_dashboard_suite/static/src/xml/hb_dashboard_dialogs.xml',
        ],
    },
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
    'post_init_hook': 'post_init_hook',
}
