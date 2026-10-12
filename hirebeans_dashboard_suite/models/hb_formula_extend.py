import logging
from odoo import models, fields

_logger = logging.getLogger(__name__)


class HbDashboardItemFormula(models.Model):
    _inherit = 'hb.dashboard.item'

    # Extend the item_type selection with the new formula type
    # ondelete='set default' resets formula items to 'tile' if module is uninstalled
    item_type = fields.Selection(
        selection_add=[('formula', 'Formula KPI')],
        ondelete={'formula': 'set default'},
    )

    # JSON array: [{var, label, model_name, domain, aggregate, y_field,
    #               date_field, use_date_filter}, ...]
    formula_variables = fields.Text(
        string='Formula Variables (JSON)',
        default='[]',
    )
    formula_expr = fields.Char(
        string='Formula Expression',
        help='Arithmetic expression using variable letters, e.g.  B / A * 100',
    )

    def get_item_config(self):
        config = super().get_item_config()
        config.update({
            'formula_variables': self.formula_variables or '[]',
            'formula_expr':      self.formula_expr or '',
        })
        return config
