{
    'name': 'HireBeans Dashboards – Formula KPI',
    'version': '19.0.1.1.0',
    'category': 'Reporting/Dashboard',
    'summary': 'Self-contained Formula KPI cards: define inline sub-queries and combine with a formula',
    'author': 'HireBeans.cloud',
    'depends': ['hirebeans_dashboard_suite'],
    'data': [
        'data/hb_dashboard_formula_defaults.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'hirebeans_dashboard_formula/static/src/xml/hb_formula_dialog.xml',
            'hirebeans_dashboard_formula/static/src/js/hb_formula_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
