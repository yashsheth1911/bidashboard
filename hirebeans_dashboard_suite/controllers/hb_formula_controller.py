import ast
import json
import logging
import operator

from odoo import http
from odoo.http import request

from .hb_main import HbDashboardController

_logger = logging.getLogger(__name__)

# Whitelist of safe operators for formula evaluation
_OPS = {
    ast.Add:  operator.add,
    ast.Sub:  operator.sub,
    ast.Mult: operator.mul,
    ast.Div:  operator.truediv,
    ast.Mod:  operator.mod,
    ast.Pow:  operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(expr):
    """Evaluate a numeric-only arithmetic expression. No code injection possible."""
    try:
        tree = ast.parse(expr.strip(), mode='eval')
    except SyntaxError as e:
        raise ValueError(f"Invalid formula syntax: {e}")

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return float(node.value)
            raise ValueError("Non-numeric literal in formula")
        if isinstance(node, ast.BinOp):
            fn = _OPS.get(type(node.op))
            if not fn:
                raise ValueError(f"Operator not allowed: {type(node.op).__name__}")
            l, r = _eval(node.left), _eval(node.right)
            if isinstance(node.op, ast.Div) and r == 0:
                return 0.0
            return fn(l, r)
        if isinstance(node, ast.UnaryOp):
            fn = _OPS.get(type(node.op))
            if not fn:
                raise ValueError("Unary operator not allowed")
            return fn(_eval(node.operand))
        raise ValueError(f"Element not allowed: {type(node).__name__}")

    return _eval(tree)


class HbFormulaController(HbDashboardController):

    @staticmethod
    def _formula_feature_enabled():
        return request.env['ir.config_parameter'].sudo().get_param(
            'hb_dashboard.enable_formula', 'True') == 'True'

    # ── Compute formula card data ─────────────────────────────────────────────

    @http.route('/hb_dashboard/get_formula_data', type='jsonrpc',
                auth='user', methods=['POST'], csrf=False)
    def get_formula_data(self, item_id=None, filters=None, **kwargs):
        if not self._formula_feature_enabled():
            return {'status': 'error', 'message': 'Formula KPI cards are currently disabled by your administrator.'}
        try:
            filters = filters or {}
            item = request.env['hb.dashboard.item'].sudo().browse(item_id)
            if not item.exists():
                return {'status': 'error', 'message': 'Item not found'}
            if not item.dashboard_id.hb_check_access('read'):
                return {'status': 'error', 'message': 'Access denied'}

            variables_raw = json.loads(item.formula_variables or '[]')
            variable_values = {}

            for var_cfg in variables_raw:
                letter = var_cfg.get('var', 'A')
                try:
                    variable_values[letter] = float(
                        self._compute_formula_variable(var_cfg, filters)
                    )
                except Exception as e:
                    _logger.warning("Formula variable %s error: %s", letter, e)
                    variable_values[letter] = 0.0

            # Replace each letter with its value (longest first to avoid A→A0)
            formula_expr = (item.formula_expr or '0').strip()
            resolved = formula_expr
            for letter in sorted(variable_values, key=len, reverse=True):
                resolved = resolved.replace(letter, str(variable_values[letter]))

            try:
                result = _safe_eval(resolved)
            except Exception as e:
                return {'status': 'error', 'message': f"Formula error: {e}"}

            return {
                'status': 'ok',
                'data': {
                    'value':         result,
                    'variables':     variable_values,
                    'formula':       formula_expr,
                    'change_pct':    None,
                    'compare_value': None,
                },
            }
        except Exception as e:
            _logger.exception("get_formula_data error: %s", e)
            return {'status': 'error', 'message': str(e)}

    def _compute_formula_variable(self, var_cfg, filters):
        """Run a single variable's query and return its numeric value."""
        model_name      = (var_cfg.get('model_name') or '').strip()
        domain_raw      = var_cfg.get('domain', '[]')
        aggregate       = var_cfg.get('aggregate', 'count')
        y_field         = (var_cfg.get('y_field') or '').strip()
        date_field      = (var_cfg.get('date_field') or 'create_date').strip()
        use_date_filter = var_cfg.get('use_date_filter', True)

        if not model_name:
            return 0

        try:
            # Deliberately NOT .sudo(): the formula must only aggregate data the
            # viewing user can actually read. Without this, a formula configured
            # against a sensitive model (e.g. hr.employee salary) by the dashboard
            # owner would silently leak aggregates to any user the dashboard is
            # shared with, bypassing that model's own access rights and record
            # rules entirely. If the user lacks read access, the ORM call below
            # raises AccessError, which the caller in get_formula_data already
            # catches per-variable and defaults to 0.0 — no crash, no leak.
            Model = request.env[model_name]
        except KeyError:
            raise ValueError(f"Model '{model_name}' not found or not accessible")

        # Parse domain — accept both JSON arrays and Python tuple syntax
        domain = []
        if domain_raw:
            raw = domain_raw if isinstance(domain_raw, str) else str(domain_raw)
            try:
                domain = json.loads(raw)
            except Exception:
                try:
                    parsed = ast.literal_eval(raw)
                    # Convert tuples to lists so Odoo ORM accepts them
                    domain = [list(leaf) if isinstance(leaf, tuple) else leaf for leaf in parsed]
                except Exception:
                    domain = []

        # Apply dashboard date filter if enabled for this variable
        if use_date_filter:
            date_filter = filters.get('date_filter', 'all')
            if date_filter and date_filter != 'all':
                date_domain = self._build_date_domain(
                    date_field,
                    date_filter,
                    filters.get('date_from'),
                    filters.get('date_to'),
                )
                domain.extend(date_domain)

        # Compute aggregate
        if aggregate == 'count' or not y_field:
            return Model.search_count(domain)

        records = Model.search_read(domain, [y_field], limit=False)
        vals = [r[y_field] for r in records if isinstance(r.get(y_field), (int, float))]
        if not vals:
            return 0
        if aggregate == 'sum':   return sum(vals)
        if aggregate == 'avg':   return sum(vals) / len(vals)
        if aggregate == 'min':   return min(vals)
        if aggregate == 'max':   return max(vals)
        return sum(vals)

    # ── Save formula item (separate endpoint — no changes to original module) ──

    @http.route('/hb_dashboard/save_formula_item', type='jsonrpc',
                auth='user', methods=['POST'], csrf=False)
    def save_formula_item(self, item_id=None, data=None, **kwargs):
        if not self._formula_feature_enabled():
            return {'status': 'error', 'message': 'Formula KPI cards are currently disabled by your administrator.'}
        try:
            data = data or {}
            Item = request.env['hb.dashboard.item'].sudo()

            allowed = [
                'name', 'item_type', 'x', 'y', 'w', 'h', 'dashboard_id',
                'kpi_icon', 'kpi_color', 'kpi_format', 'kpi_suffix', 'kpi_prefix',
                'custom_title', 'top_border_color',
                'formula_variables', 'formula_expr',
                'sequence',
            ]
            write_data = {k: v for k, v in data.items() if k in allowed}

            if item_id:
                item = Item.browse(item_id)
                if not item.exists():
                    return {'status': 'error', 'message': 'Item not found'}
                if not item.dashboard_id.hb_check_access('write'):
                    return {'status': 'error', 'message': 'Access denied'}
                # dashboard_id is a writable field here, so a payload could try to
                # re-parent this item onto a different dashboard than the one just
                # checked above. If so, write access to *that* dashboard needs
                # checking too — otherwise write access to any owned dashboard
                # would be enough to move content into one you don't own.
                new_dashboard_id = write_data.get('dashboard_id')
                if new_dashboard_id and new_dashboard_id != item.dashboard_id.id:
                    target = request.env['hb.dashboard'].sudo().browse(new_dashboard_id)
                    if not target.exists():
                        return {'status': 'error', 'message': 'Dashboard not found'}
                    if not target.hb_check_access('write'):
                        return {'status': 'error', 'message': 'Access denied'}
                item.write(write_data)
            else:
                dashboard_id = write_data.get('dashboard_id')
                if not dashboard_id:
                    return {'status': 'error', 'message': 'dashboard_id is required'}
                dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
                if not dashboard.exists():
                    return {'status': 'error', 'message': 'Dashboard not found'}
                if not dashboard.hb_check_access('write'):
                    return {'status': 'error', 'message': 'Access denied'}
                item = Item.create(write_data)

            return {'status': 'ok', 'data': {'id': item.id}}
        except Exception as e:
            _logger.exception("save_formula_item error: %s", e)
            return {'status': 'error', 'message': str(e)}
