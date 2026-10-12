# -*- coding: utf-8 -*-
# Dashboard chat — one discuss channel per dashboard, created on demand

import logging
from odoo import models, fields, api, _

_logger = logging.getLogger(__name__)


class HbDashboard(models.Model):
    _inherit = 'hb.dashboard'

    channel_id = fields.Many2one(
        'discuss.channel',
        string='Chat Channel',
        ondelete='set null',
        copy=False,
    )

    def action_open_chat(self):
        self.ensure_one()
        channel_model = 'discuss.channel' if 'discuss.channel' in self.env else 'mail.channel'
        if channel_model not in self.env:
            return {}
        if not self.channel_id:
            channel = self.env[channel_model].create({
                'name': _('Dashboard: %s') % self.name,
                'channel_type': 'channel',
            })
            self.channel_id = channel
        return {
            'type': 'ir.actions.act_window',
            'res_model': channel_model,
            'res_id': self.channel_id.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def unlink(self):
        channels = self.mapped('channel_id')
        result = super().unlink()
        if channels:
            try:
                channels.unlink()
            except Exception:
                pass
        return result
