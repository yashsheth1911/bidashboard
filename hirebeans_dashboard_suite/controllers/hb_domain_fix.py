# -*- coding: utf-8 -*-
# Override /web/domain/validate to handle %UID and %MYCOMPANY placeholders

import logging
from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.domain import Domain

_logger = logging.getLogger(__name__)


class HbDomainController(Domain):

    @http.route('/web/domain/validate', type='jsonrpc', auth='user')
    def validate(self, model, domain):
        uid = request.env.uid
        company_id = request.env.company.id
        if isinstance(domain, str):
            domain = domain.replace('%UID', str(uid)).replace('%MYCOMPANY', str(company_id))
        elif isinstance(domain, list):
            domain = _resolve_list(domain, uid, company_id)
        try:
            return super().validate(model, domain)
        except Exception as e:
            _logger.warning("HbDomainController.validate: %s", e)
            return True


def _resolve_list(domain, uid, company_id):
    result = []
    for item in domain:
        if isinstance(item, (list, tuple)) and len(item) == 3:
            field, op, val = item
            if isinstance(val, str):
                val = val.replace('%UID', str(uid)).replace('%MYCOMPANY', str(company_id))
            result.append([field, op, val])
        else:
            result.append(item)
    return result
