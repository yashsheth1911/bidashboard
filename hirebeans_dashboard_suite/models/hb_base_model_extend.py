# -*- coding: utf-8 -*-
# Real-time bus notifications — broadcast on create/write so dashboards auto-refresh

import logging
from odoo import models, api

_logger = logging.getLogger(__name__)

# Models to never notify on — includes bus.bus itself to prevent recursion
_SKIP_MODELS = frozenset({
    'bus.bus', 'bus.channel', 'bus.channel.member',
    'res.lang', 'res.currency', 'res.country', 'res.country.state',
    'ir.translation', 'ir.ui.view', 'ir.model', 'ir.model.fields',
    'ir.model.access', 'ir.rule', 'ir.module.module',
})


class HbBaseModelExtend(models.AbstractModel):
    _inherit = 'base'

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        self._hb_maybe_notify()
        return records

    def write(self, vals):
        result = super().write(vals)
        self._hb_maybe_notify()
        return result

    def _hb_maybe_notify(self):
        # Skip: internal models, install mode, already inside a notification
        if self._name in _SKIP_MODELS:
            return
        if self._name.startswith('ir.') or self._name.startswith('base.'):
            return
        if self.env.context.get('_hb_notifying') or self.env.context.get('install_mode'):
            return
        try:
            self.with_context(_hb_notifying=True).env['bus.bus']._sendone(
                'hb_dashboard_refresh',
                'hb_dashboard_model_update',
                {'model': self._name},
            )
        except Exception:
            pass
