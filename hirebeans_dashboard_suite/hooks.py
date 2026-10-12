import logging

_logger = logging.getLogger(__name__)

# Default dashboard items (data/hb_dashboard_templates.xml) resolve their
# model_id via a noupdate=1 XML search lookup against ir.model. If crm/sale/
# account/stock aren't installed yet at the moment that data loads, the
# lookup finds nothing and model_id is left empty - and noupdate=1 means a
# later module upgrade will never retry it. This hook re-resolves any item
# left without a model_id, regardless of install order.
MODEL_ID_FIXUP_MAP = {
    # Sales Overview
    'item_sales_total_orders': 'sale.order',
    'item_sales_revenue': 'sale.order',
    'item_sales_avg_order': 'sale.order',
    'item_sales_quotations': 'sale.order',
    'item_sales_to_invoice': 'sale.order',
    'item_sales_by_month': 'sale.order',
    'item_sales_by_salesperson': 'sale.order',
    'item_sales_by_team': 'sale.order',
    'item_sales_by_status': 'sale.order',
    'item_sales_top_customers': 'sale.order',
    'item_sales_trend': 'sale.order',
    'item_sales_invoice_status': 'sale.order',
    'item_sales_delivery_status': 'sale.order',
    'item_sales_by_source': 'sale.order',
    'item_sales_by_warehouse': 'sale.order',
    # CRM Pipeline
    'item_crm_opportunities': 'crm.lead',
    'item_crm_pipeline_value': 'crm.lead',
    'item_crm_weighted_pipeline': 'crm.lead',
    'item_crm_avg_revenue': 'crm.lead',
    'item_crm_total_leads': 'crm.lead',
    'item_crm_by_stage': 'crm.lead',
    'item_crm_value_by_stage': 'crm.lead',
    'item_crm_by_source': 'crm.lead',
    'item_crm_by_salesperson': 'crm.lead',
    'item_crm_by_team': 'crm.lead',
    'item_crm_trend': 'crm.lead',
    'item_crm_lost_reasons': 'crm.lead',
    'item_crm_priority': 'crm.lead',
    'item_crm_avg_prob': 'crm.lead',
    'item_crm_created_trend': 'crm.lead',
    # HR Overview
    'item_hr_employees': 'hr.employee',
    'item_hr_open_positions': 'hr.job',
    'item_hr_candidates': 'hr.applicant',
    'item_hr_hired': 'hr.applicant',
    'item_hr_avg_days': 'hr.applicant',
    'item_hr_by_stage': 'hr.applicant',
    'item_hr_by_job': 'hr.applicant',
    'item_hr_by_source': 'hr.applicant',
    'item_hr_by_priority': 'hr.applicant',
    'item_hr_apps_trend': 'hr.applicant',
    'item_hr_refusal_reasons': 'hr.applicant',
    'item_hr_openings_by_dept': 'hr.job',
    'item_hr_hired_by_job': 'hr.job',
    'item_hr_avg_salary': 'hr.applicant',
    'item_hr_by_manager': 'hr.employee',
    # Accounting Overview
    'item_acc_invoices': 'account.move',
    'item_acc_revenue': 'account.move',
    'item_acc_outstanding': 'account.move',
    'item_acc_avg_invoice': 'account.move',
    'item_acc_bills': 'account.move',
    'item_acc_revenue_by_month': 'account.move',
    'item_acc_by_payment_status': 'account.move',
    'item_acc_top_customers': 'account.move',
    'item_acc_outstanding_by_customer': 'account.move',
    'item_acc_bills_by_vendor': 'account.move',
    'item_acc_by_journal': 'account.move',
    'item_acc_status_breakdown': 'account.move',
    'item_acc_bills_trend': 'account.move',
    'item_acc_overdue': 'account.move',
    'item_acc_tax_by_month': 'account.move',
    # Inventory Overview
    'item_inv_products': 'product.product',
    'item_inv_on_hand': 'stock.quant',
    'item_inv_reserved': 'stock.quant',
    'item_inv_transfers': 'stock.picking',
    'item_inv_backorders': 'stock.picking',
    'item_inv_qty_by_product': 'stock.quant',
    'item_inv_qty_by_location': 'stock.quant',
    'item_inv_moves_by_state': 'stock.move',
    'item_inv_incoming_trend': 'stock.move',
    'item_inv_outgoing_trend': 'stock.move',
    'item_inv_by_picking_type': 'stock.picking',
    'item_inv_by_status': 'stock.picking',
    'item_inv_value_by_month': 'stock.move',
    'item_inv_top_moved': 'stock.move',
    'item_inv_by_warehouse': 'stock.move',
}


def fixup_missing_model_ids(env):
    """Re-resolve model_id on default dashboard items left unset because
    their target app (crm/sale/account/stock/...) wasn't installed yet when
    this module's demo data first loaded. Safe to call repeatedly: once an
    item has a model_id it is left untouched."""
    IrModel = env['ir.model'].sudo()
    model_id_by_name = {}
    fixed = 0

    for xmlid, model_name in MODEL_ID_FIXUP_MAP.items():
        item = env.ref('hirebeans_dashboard_suite.%s' % xmlid, raise_if_not_found=False)
        if not item or item.model_id:
            continue

        if model_name not in model_id_by_name:
            model_id_by_name[model_name] = IrModel.search([('model', '=', model_name)], limit=1).id

        model_id = model_id_by_name[model_name]
        if model_id:
            item.sudo().write({'model_id': model_id})
            fixed += 1

    if fixed:
        _logger.info("hirebeans_dashboard_suite: fixed model_id on %s dashboard item(s)", fixed)


def post_init_hook(env):
    fixup_missing_model_ids(env)
