# -*- coding: utf-8 -*-
# Domain utilities — %UID and %MYCOMPANY substitution

from odoo.tools.safe_eval import safe_eval


def hb_resolve_domain(domain, uid, company_id):
    """Replace %UID and %MYCOMPANY placeholders in a domain list/string."""
    if not domain:
        return domain
    domain_str = str(domain)
    changed = False
    if '%UID' in domain_str:
        domain_str = domain_str.replace('%UID', str(uid))
        changed = True
    if '%MYCOMPANY' in domain_str:
        domain_str = domain_str.replace('%MYCOMPANY', str(company_id))
        changed = True
    if changed:
        try:
            return safe_eval(domain_str)
        except Exception:
            return domain
    return domain


def hb_safe_eval_domain(domain_str, env):
    """Parse a domain string coming from the client, resolving %UID/%MYCOMPANY."""
    if not domain_str:
        return []
    uid = env.uid
    company_id = env.company.id
    domain_str = domain_str.replace('%UID', str(uid)).replace('%MYCOMPANY', str(company_id))
    try:
        return safe_eval(domain_str)
    except Exception:
        return []
