import json
import io
import base64
import logging
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class HbDashboardController(http.Controller):

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Dashboard CRUD
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/list', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def dashboard_list(self, **kwargs):
        try:
            uid = request.env.uid
            dashboards = request.env['hb.dashboard'].sudo().search([
                '|', '|', '|',
                ('user_id', '=', uid),
                ('is_public', '=', True),
                ('shared_user_ids', 'in', [uid]),
                ('bookmark_user_ids', 'in', [uid]),
            ], order='sequence, name')
            result = []
            for d in dashboards:
                result.append({
                    'id': d.id,
                    'name': d.name,
                    'description': d.description or '',
                    'icon': d.icon,
                    'color_class': d.color_class,
                    'theme': d.theme,
                    'item_count': d.item_count,
                    'is_owner': d.user_id.id == uid,
                    'is_bookmarked': d.is_bookmarked,
                    'is_public': d.is_public,
                    'industry_tag': d.industry_tag,
                    'is_template': d.is_template,
                    'owner_name': d.user_id.name or '',
                    'last_opened': d.last_opened.isoformat() if d.last_opened else False,
                })
            return {'status': 'ok', 'data': result}
        except Exception as e:
            _logger.exception("AB Dashboards list error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/get', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def dashboard_get(self, dashboard_id=None, filters=None, **kwargs):
        try:
            dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
            if not dashboard.exists():
                return {'status': 'error', 'message': 'Dashboard not found'}
            dashboard.write({'last_opened': datetime.now()})
            items = []
            for item in dashboard.dashboard_item_ids:
                item_config = item.get_item_config()
                items.append(item_config)
            return {
                'status': 'ok',
                'data': {
                    'dashboard': dashboard.get_dashboard_data(),
                    'items': items,
                }
            }
        except Exception as e:
            _logger.exception("AB Dashboards get error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/create', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def dashboard_create(self, data=None, **kwargs):
        try:
            data = data or {}
            dashboard = request.env['hb.dashboard'].sudo().create({
                'name': data.get('name', 'New Dashboard'),
                'description': data.get('description', ''),
                'theme': data.get('theme', 'light'),
                'primary_color': data.get('primary_color', '#667eea'),
                'background_color': data.get('background_color', '#f5f7fa'),
                'is_public': data.get('is_public', False),
                'industry_tag': data.get('industry_tag', 'none'),
                'default_date_filter': data.get('default_date_filter', 'this_month'),
                'user_id': request.env.uid,
            })
            return {'status': 'ok', 'data': {'id': dashboard.id, 'name': dashboard.name}}
        except Exception as e:
            _logger.exception("AB Dashboards create error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/update', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def dashboard_update(self, dashboard_id=None, data=None, **kwargs):
        try:
            dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
            if not dashboard.exists():
                return {'status': 'error', 'message': 'Dashboard not found'}
            allowed = ['name', 'description', 'theme', 'primary_color', 'background_color',
                       'card_color', 'text_color', 'is_public', 'default_date_filter',
                       'auto_refresh', 'refresh_interval', 'icon', 'color_class']
            write_data = {k: v for k, v in (data or {}).items() if k in allowed}
            if write_data:
                dashboard.write(write_data)
            return {'status': 'ok'}
        except Exception as e:
            _logger.exception("AB Dashboards update error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/delete', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def dashboard_delete(self, dashboard_id=None, **kwargs):
        try:
            dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
            if not dashboard.exists():
                return {'status': 'error', 'message': 'Dashboard not found'}
            if dashboard.user_id.id != request.env.uid:
                return {'status': 'error', 'message': 'Only the owner can delete this dashboard'}
            dashboard.unlink()
            return {'status': 'ok'}
        except Exception as e:
            _logger.exception("AB Dashboards delete error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/toggle_bookmark', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def toggle_bookmark(self, dashboard_id=None, **kwargs):
        try:
            dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
            result = dashboard.toggle_bookmark()
            return {'status': 'ok', 'data': {'is_bookmarked': result}}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Dashboard Items CRUD
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/save_item', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def save_item(self, item_id=None, data=None, **kwargs):
        try:
            data = data or {}
            Item = request.env['hb.dashboard.item'].sudo()

            # Resolve model_id from model_name
            if data.get('model_name') and not data.get('model_id'):
                model = request.env['ir.model'].sudo().search(
                    [('model', '=', data['model_name'])], limit=1)
                if model:
                    data['model_id'] = model.id

            allowed_fields = [
                'name', 'item_type', 'x', 'y', 'w', 'h', 'dashboard_id',
                'model_id', 'date_field', 'x_field', 'y_field', 'aggregate',
                'domain', 'date_filter', 'date_from', 'date_to',
                'groupby_field', 'second_groupby', 'limit', 'sort_by', 'sort_order', 'list_columns',
                'chart_color', 'color_scheme', 'segment_colors',
                'show_legend', 'stack_chart', 'show_data_zoom', 'show_markline', 'smooth_line',
                'kpi_icon', 'kpi_color', 'kpi_format', 'kpi_suffix', 'kpi_prefix',
                'compare_period', 'gauge_min', 'gauge_max', 'gauge_target',
                'show_data_labels', 'is_drill_down', 'drilldown_field',
                'top_border_color',
                'click_action_model', 'click_action_domain', 'click_action_view',
                'custom_title', 'sequence',
            ]
            write_data = {k: v for k, v in data.items() if k in allowed_fields}

            if item_id:
                item = Item.browse(item_id)
                if not item.exists():
                    return {'status': 'error', 'message': 'Item not found'}
                item.write(write_data)
            else:
                item = Item.create(write_data)

            return {'status': 'ok', 'data': {'id': item.id}}
        except Exception as e:
            _logger.exception("AB Dashboards save_item error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/delete_item', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def delete_item(self, item_id=None, **kwargs):
        try:
            item = request.env['hb.dashboard.item'].sudo().browse(item_id)
            if item.exists():
                item.unlink()
            return {'status': 'ok'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/update_layout', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def update_layout(self, positions=None, **kwargs):
        try:
            positions = positions or []
            Item = request.env['hb.dashboard.item'].sudo()
            for pos in positions:
                item = Item.browse(pos.get('id'))
                if item.exists():
                    item.write({
                        'x': pos.get('x', 0),
                        'y': pos.get('y', 0),
                        'w': pos.get('w', 4),
                        'h': pos.get('h', 3),
                    })
            return {'status': 'ok'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Chart Data Engine
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/get_item_data', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_item_data(self, item_id=None, filters=None, drilldown=None, **kwargs):
        try:
            filters = filters or {}
            item = request.env['hb.dashboard.item'].sudo().browse(item_id)
            if not item.exists():
                return {'status': 'error', 'message': 'Item not found'}
            data = self._compute_item_data(item, filters, drilldown)
            return {'status': 'ok', 'data': data}
        except Exception as e:
            _logger.exception("AB Dashboards get_item_data error: %s", e)
            return {'status': 'error', 'message': str(e)}

    def _compute_item_data(self, item, filters, drilldown=None):
        if not item.model_name:
            return {'error': 'No model configured'}

        try:
            Model = request.env[item.model_name].sudo()
        except KeyError:
            return {'error': f'Model {item.model_name} not found or not accessible'}

        domain = self._build_domain(item, filters)
        item_type = item.item_type

        try:
            if item_type == 'tile':
                return self._data_tile(Model, item, domain, filters)
            elif item_type in ('bar', 'line', 'area', 'scatter'):
                return self._data_series(Model, item, domain, drilldown)
            elif item_type in ('pie', 'doughnut'):
                return self._data_pie(Model, item, domain)
            elif item_type == 'funnel':
                return self._data_funnel(Model, item, domain)
            elif item_type == 'radar':
                return self._data_radar(Model, item, domain)
            elif item_type == 'gauge':
                return self._data_gauge(Model, item, domain)
            elif item_type == 'treemap':
                return self._data_treemap(Model, item, domain)
            elif item_type == 'heatmap':
                return self._data_heatmap(Model, item, domain)
            elif item_type == 'waterfall':
                return self._data_waterfall(Model, item, domain)
            elif item_type == 'boxplot':
                return self._data_boxplot(Model, item, domain)
            elif item_type == 'list':
                return self._data_list(Model, item, domain)
            else:
                return self._data_series(Model, item, domain, drilldown)
        except Exception as e:
            _logger.exception("BI chart data error for item %s: %s", item.id, e)
            return {'error': str(e)}

    def _build_domain(self, item, filters):
        domain = []

        # Item's stored domain
        try:
            item_domain = json.loads(item.domain or '[]')
            if item_domain:
                domain.extend(item_domain)
        except Exception:
            pass

        # Dynamic variable substitution
        uid = request.env.uid
        company_id = request.env.company.id

        def substitute(val):
            if val == '%UID':
                return uid
            if val == '%MYCOMPANY':
                return company_id
            return val

        domain = [(t[0], t[1], substitute(t[2])) if len(t) == 3 else t for t in domain]

        # Date filter (item-level or runtime override)
        date_filter = filters.get('date_filter') or item.date_filter or 'all'
        date_from = filters.get('date_from') or (str(item.date_from) if item.date_from else None)
        date_to = filters.get('date_to') or (str(item.date_to) if item.date_to else None)
        date_field = item.date_field or 'create_date'

        date_domain = self._build_date_domain(date_field, date_filter, date_from, date_to)
        domain.extend(date_domain)

        # Runtime additional filters (from the filter bar)
        if filters.get('search_domain'):
            try:
                domain.extend(json.loads(filters['search_domain']))
            except Exception:
                pass

        return domain

    def _build_date_domain(self, field, preset, date_from=None, date_to=None):
        today = date.today()
        domain = []

        if preset == 'custom':
            if date_from:
                domain.append((field, '>=', date_from + ' 00:00:00' if ' ' not in str(date_from) else str(date_from)))
            if date_to:
                domain.append((field, '<=', date_to + ' 23:59:59' if ' ' not in str(date_to) else str(date_to)))
        elif preset == 'today':
            domain += [(field, '>=', str(today)), (field, '<=', str(today) + ' 23:59:59')]
        elif preset == 'yesterday':
            y = today - timedelta(days=1)
            domain += [(field, '>=', str(y)), (field, '<=', str(y) + ' 23:59:59')]
        elif preset == 'this_week':
            start = today - timedelta(days=today.weekday())
            domain += [(field, '>=', str(start))]
        elif preset == 'last_week':
            start = today - timedelta(days=today.weekday() + 7)
            end = start + timedelta(days=6)
            domain += [(field, '>=', str(start)), (field, '<=', str(end) + ' 23:59:59')]
        elif preset == 'this_month':
            start = date(today.year, today.month, 1)
            domain += [(field, '>=', str(start))]
        elif preset == 'last_month':
            end = date(today.year, today.month, 1) - timedelta(days=1)
            start = date(end.year, end.month, 1)
            domain += [(field, '>=', str(start)), (field, '<=', str(end) + ' 23:59:59')]
        elif preset == 'this_quarter':
            q = (today.month - 1) // 3
            start = date(today.year, q * 3 + 1, 1)
            domain += [(field, '>=', str(start))]
        elif preset == 'last_quarter':
            q = (today.month - 1) // 3
            if q == 0:
                start = date(today.year - 1, 10, 1)
                end = date(today.year - 1, 12, 31)
            else:
                start = date(today.year, (q - 1) * 3 + 1, 1)
                end = date(today.year, q * 3, 1) - timedelta(days=1)
            domain += [(field, '>=', str(start)), (field, '<=', str(end) + ' 23:59:59')]
        elif preset == 'this_year':
            start = date(today.year, 1, 1)
            domain += [(field, '>=', str(start))]
        elif preset == 'last_year':
            start = date(today.year - 1, 1, 1)
            end = date(today.year - 1, 12, 31)
            domain += [(field, '>=', str(start)), (field, '<=', str(end) + ' 23:59:59')]
        elif preset == 'last_7':
            domain += [(field, '>=', str(today - timedelta(days=7)))]
        elif preset == 'last_14':
            domain += [(field, '>=', str(today - timedelta(days=14)))]
        elif preset == 'last_30':
            domain += [(field, '>=', str(today - timedelta(days=30)))]
        elif preset == 'last_60':
            domain += [(field, '>=', str(today - timedelta(days=60)))]
        elif preset == 'last_90':
            domain += [(field, '>=', str(today - timedelta(days=90)))]
        elif preset == 'last_180':
            domain += [(field, '>=', str(today - timedelta(days=180)))]
        elif preset == 'last_365':
            domain += [(field, '>=', str(today - timedelta(days=365)))]
        elif preset == 'mtd':
            start = date(today.year, today.month, 1)
            domain += [(field, '>=', str(start)), (field, '<=', str(today) + ' 23:59:59')]
        elif preset == 'ytd':
            start = date(today.year, 1, 1)
            domain += [(field, '>=', str(start)), (field, '<=', str(today) + ' 23:59:59')]

        return domain

    def _get_measure_field(self, item):
        if item.aggregate == 'count':
            return '__count'
        return item.y_field or '__count'

    def _run_read_group(self, Model, domain, groupby, measure, limit, sort_by, sort_order):
        if measure == '__count' or not measure:
            fields = []
        else:
            fields = [f'{measure}:{item_agg}' for item_agg in ['sum']]

        try:
            result = Model.read_group(
                domain=domain,
                fields=[measure] if measure and measure != '__count' else [],
                groupby=[groupby],
                limit=limit or 20,
                orderby=f'{sort_by} {sort_order}' if sort_by else None,
                lazy=False,
            )
            return result
        except Exception as e:
            _logger.warning("read_group failed: %s", e)
            return []

    def _data_tile(self, Model, item, domain, filters):
        aggregate = item.aggregate or 'count'

        if aggregate == 'count':
            value = Model.search_count(domain)
        else:
            field = item.y_field
            if not field:
                value = Model.search_count(domain)
            else:
                records = Model.search_read(domain, [field], limit=False)
                vals = [r.get(field) or 0 for r in records if isinstance(r.get(field), (int, float))]
                if aggregate == 'sum':
                    value = sum(vals)
                elif aggregate == 'avg':
                    value = sum(vals) / len(vals) if vals else 0
                elif aggregate == 'min':
                    value = min(vals) if vals else 0
                elif aggregate == 'max':
                    value = max(vals) if vals else 0
                else:
                    value = sum(vals)

        compare_value = None
        change_pct = None
        if item.compare_period and item.compare_period != 'none':
            compare_domain = self._build_compare_domain(item, filters)
            if aggregate == 'count':
                compare_value = Model.search_count(compare_domain)
            else:
                records = Model.search_read(compare_domain, [item.y_field or 'id'], limit=False)
                vals = [r.get(item.y_field) or 0 for r in records if isinstance(r.get(item.y_field), (int, float))]
                if aggregate == 'sum':
                    compare_value = sum(vals)
                elif aggregate == 'avg':
                    compare_value = sum(vals) / len(vals) if vals else 0
                else:
                    compare_value = sum(vals)

            if compare_value and compare_value != 0:
                change_pct = round(((value - compare_value) / abs(compare_value)) * 100, 1)

        trend = self._data_tile_trend(Model, item)

        return {
            'value': value,
            'compare_value': compare_value,
            'change_pct': change_pct,
            'format': item.kpi_format or 'number',
            'trend': trend,
        }

    def _data_tile_trend(self, Model, item, periods=6):
        """Cheap sparkline series: same tile metric bucketed by month over the
        trailing N months, ignoring the item's own date_filter window so a
        short trend is visible even when the tile itself shows an all-time
        or single-period value. One read_group call, same cost as a chart."""
        date_field = item.date_field or 'create_date'
        if date_field not in Model._fields or not Model._fields[date_field].store:
            return []

        try:
            base_domain = json.loads(item.domain or '[]')
        except Exception:
            base_domain = []
        uid = request.env.uid
        company_id = request.env.company.id
        base_domain = [
            (t[0], t[1], uid if t[2] == '%UID' else company_id if t[2] == '%MYCOMPANY' else t[2])
            if len(t) == 3 else t
            for t in base_domain
        ]

        today = date.today()
        start = (date(today.year, today.month, 1) - relativedelta(months=periods - 1))
        domain = base_domain + [(date_field, '>=', str(start))]

        aggregate = item.aggregate or 'count'
        measure = item.y_field if aggregate not in ('count',) else '__count'

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[measure] if measure != '__count' else [],
                groupby=[f'{date_field}:month'],
                lazy=False,
                orderby=f'{date_field}:month asc',
            )
        except Exception as e:
            _logger.warning("Tile trend read_group error: %s", e)
            return []

        values = []
        for g in groups:
            if measure == '__count':
                val = g.get('__count', 0)
            else:
                val = g.get(measure, 0)
                if isinstance(val, (list, tuple)):
                    val = val[0] if val else 0
                val = round(float(val or 0), 2)
            values.append(val)
        return values[-periods:]

    def _build_compare_domain(self, item, filters):
        date_filter = filters.get('date_filter') or item.date_filter or 'this_month'
        date_field = item.date_field or 'create_date'
        today = date.today()

        if item.compare_period == 'previous':
            # Shift the current period backward by one unit
            if date_filter == 'this_month':
                end = date(today.year, today.month, 1) - timedelta(days=1)
                start = date(end.year, end.month, 1)
            elif date_filter == 'this_year':
                start = date(today.year - 1, 1, 1)
                end = date(today.year - 1, 12, 31)
            elif date_filter == 'this_week':
                start = today - timedelta(days=today.weekday() + 7)
                end = start + timedelta(days=6)
            elif date_filter == 'last_30':
                start = today - timedelta(days=60)
                end = today - timedelta(days=31)
            else:
                start = today - timedelta(days=60)
                end = today - timedelta(days=31)
            return [(date_field, '>=', str(start)), (date_field, '<=', str(end) + ' 23:59:59')]
        elif item.compare_period == 'last_year':
            current_start = date(today.year, today.month, 1)
            prev_start = date(today.year - 1, today.month, 1)
            prev_end = date(today.year - 1, today.month, 1) + relativedelta(months=1) - timedelta(days=1)
            return [(date_field, '>=', str(prev_start)), (date_field, '<=', str(prev_end) + ' 23:59:59')]
        return []

    def _data_series(self, Model, item, domain, drilldown=None):
        groupby = drilldown or item.x_field or item.groupby_field
        if not groupby:
            return {'categories': [], 'series': []}

        aggregate = item.aggregate or 'count'
        measure = item.y_field if aggregate != 'count' else '__count'
        limit = item.limit or 20

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[measure] if measure != '__count' else [],
                groupby=[groupby],
                limit=limit,
                lazy=False,
            )
        except Exception as e:
            _logger.warning("Series read_group error: %s", e)
            return {'categories': [], 'series': [], 'error': str(e)}

        categories = []
        values = []
        for g in groups:
            label = g.get(groupby)
            if isinstance(label, tuple):
                label = label[1]  # (id, name) tuple from many2one
            elif label is False or label is None:
                label = 'Unknown'
            categories.append(str(label))

            if measure == '__count':
                values.append(g.get('__count', 0))
            else:
                val = g.get(measure, 0)
                if isinstance(val, (list, tuple)):
                    val = val[0] if val else 0
                values.append(round(float(val or 0), 2))

        # Second series (second_groupby)
        series = [{'name': item.custom_title or item.name, 'data': values}]
        if item.second_groupby and item.second_groupby != groupby:
            try:
                groups2 = Model.read_group(
                    domain=domain,
                    fields=[measure] if measure != '__count' else [],
                    groupby=[item.second_groupby],
                    limit=limit,
                    lazy=False,
                )
                vals2 = []
                for g in groups2:
                    val = g.get(measure, 0) if measure != '__count' else g.get('__count', 0)
                    vals2.append(round(float(val or 0), 2))
                series.append({'name': item.second_groupby, 'data': vals2})
            except Exception:
                pass

        return {
            'categories': categories,
            'series': series,
            'drilldown_field': item.drilldown_field if item.is_drill_down else None,
        }

    def _data_pie(self, Model, item, domain):
        groupby = item.x_field or item.groupby_field
        if not groupby:
            return {'data': []}

        aggregate = item.aggregate or 'count'
        measure = item.y_field if aggregate != 'count' else '__count'
        limit = item.limit or 20

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[measure] if measure != '__count' else [],
                groupby=[groupby],
                limit=limit,
                lazy=False,
            )
        except Exception as e:
            return {'data': [], 'error': str(e)}

        data = []
        for g in groups:
            label = g.get(groupby)
            if isinstance(label, tuple):
                label = label[1]
            elif label is False or label is None:
                label = 'Unknown'
            val = g.get(measure, 0) if measure != '__count' else g.get('__count', 0)
            data.append({'name': str(label), 'value': round(float(val or 0), 2)})

        # Sort desc
        data.sort(key=lambda x: x['value'], reverse=True)
        return {'data': data}

    def _data_funnel(self, Model, item, domain):
        groupby = item.x_field or item.groupby_field
        if not groupby:
            return {'data': []}
        result = self._data_pie(Model, item, domain)
        return result

    def _data_radar(self, Model, item, domain):
        groupby = item.x_field or item.groupby_field
        if not groupby:
            return {'indicators': [], 'data': []}

        aggregate = item.aggregate or 'count'
        measure = item.y_field if aggregate != 'count' else '__count'

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[measure] if measure != '__count' else [],
                groupby=[groupby],
                limit=item.limit or 8,
                lazy=False,
            )
        except Exception as e:
            return {'indicators': [], 'data': [], 'error': str(e)}

        indicators = []
        values = []
        for g in groups:
            label = g.get(groupby)
            if isinstance(label, tuple):
                label = label[1]
            elif label is False or label is None:
                label = 'Unknown'
            val = g.get(measure, 0) if measure != '__count' else g.get('__count', 0)
            val = float(val or 0)
            indicators.append({'name': str(label), 'max': val * 1.2 or 1})
            values.append(round(val, 2))

        return {
            'indicators': indicators,
            'data': [{'name': item.name, 'value': values}],
        }

    def _data_gauge(self, Model, item, domain):
        aggregate = item.aggregate or 'count'
        if aggregate == 'count':
            value = Model.search_count(domain)
        else:
            field = item.y_field
            if not field:
                value = Model.search_count(domain)
            else:
                records = Model.search_read(domain, [field], limit=False)
                vals = [r.get(field) or 0 for r in records if isinstance(r.get(field), (int, float))]
                value = sum(vals) if aggregate == 'sum' else (sum(vals) / len(vals) if vals else 0)

        return {
            'value': round(float(value), 2),
            'min': item.gauge_min,
            'max': item.gauge_max or max(float(value) * 1.5, 100),
            'target': item.gauge_target,
        }

    def _data_treemap(self, Model, item, domain):
        groupby = item.x_field or item.groupby_field
        if not groupby:
            return {'data': []}
        result = self._data_pie(Model, item, domain)
        data = [{'name': d['name'], 'value': d['value']} for d in result.get('data', [])]
        return {'data': data}

    def _data_heatmap(self, Model, item, domain):
        x_field = item.x_field or item.date_field or 'create_date'
        groupby = item.groupby_field or x_field

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[],
                groupby=[groupby + ':month'],
                limit=50,
                lazy=False,
            )
        except Exception as e:
            return {'data': [], 'error': str(e)}

        data = []
        for g in groups:
            label = g.get(f'{groupby}:month') or g.get(groupby, '')
            if isinstance(label, tuple):
                label = label[1]
            data.append([str(label), g.get('__count', 0)])

        return {'data': data}

    def _data_waterfall(self, Model, item, domain):
        result = self._data_series(Model, item, domain)
        categories = result.get('categories', [])
        values = result.get('series', [{}])[0].get('data', []) if result.get('series') else []
        running = 0
        waterfall_data = []
        for i, (cat, val) in enumerate(zip(categories, values)):
            waterfall_data.append({
                'name': cat,
                'value': [running, running + val],
                'raw': val,
                'itemStyle': {'color': '#43c46e' if val >= 0 else '#f5576c'},
            })
            running += val
        return {'categories': categories, 'data': waterfall_data, 'total': running}

    def _data_boxplot(self, Model, item, domain):
        groupby = item.x_field or item.groupby_field
        measure = item.y_field
        if not groupby or not measure:
            return {'categories': [], 'data': []}

        try:
            groups = Model.read_group(
                domain=domain,
                fields=[measure],
                groupby=[groupby],
                limit=item.limit or 20,
                lazy=False,
            )
        except Exception:
            return {'categories': [], 'data': []}

        categories = []
        data = []
        for g in groups:
            label = g.get(groupby)
            if isinstance(label, tuple):
                label = label[1]
            categories.append(str(label or 'Unknown'))
            val = float(g.get(measure, 0) or 0)
            # Approximate box from single agg; real impl would need raw data
            data.append([val * 0.7, val * 0.85, val, val * 1.1, val * 1.25])

        return {'categories': categories, 'data': data}

    def _data_list(self, Model, item, domain):
        try:
            columns = json.loads(item.list_columns or '[]')
        except Exception:
            columns = []
        if not isinstance(columns, list) or not columns:
            columns = ['display_name']

        order = None
        if item.sort_by:
            order = f'{item.sort_by} {item.sort_order or "desc"}'

        try:
            records = Model.search_read(domain, columns, limit=item.limit or 50, order=order)
        except Exception as e:
            return {'columns': [], 'rows': [], 'error': str(e)}

        try:
            fields_info = Model.fields_get(columns, attributes=['string', 'type'])
        except Exception:
            fields_info = {}

        col_meta = [
            {
                'name': c,
                'string': fields_info.get(c, {}).get('string', c),
                'type': fields_info.get(c, {}).get('type', 'char'),
            }
            for c in columns
        ]

        rows = []
        for rec in records:
            row = []
            for c in columns:
                val = rec.get(c)
                if isinstance(val, (list, tuple)) and len(val) == 2 and isinstance(val[0], int):
                    val = val[1]
                elif val is False:
                    val = None
                row.append(val)
            rows.append(row)

        return {'columns': col_meta, 'rows': rows, 'total': len(rows)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Model & Field Introspection
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/get_models', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_models(self, search='', offset=0, limit=50, **kwargs):
        """
        Return installed, non-transient, non-abstract models.
        Supports server-side search (name / technical name / module)
        and pagination (offset + limit) so the frontend can load lazily.
        """
        try:
            limit  = min(int(limit  or 50),  200)   # cap per-page at 200
            offset = max(int(offset or 0),    0)
            domain = [('transient', '=', False), ('abstract', '=', False)]
            if search:
                domain += ['|',
                    ('name',  'ilike', search),
                    ('model', 'ilike', search),
                ]
            IrModel = request.env['ir.model'].sudo()
            total   = IrModel.search_count(domain)
            records = IrModel.search(domain, limit=limit, offset=offset, order='name')
            return {
                'status': 'ok',
                'data': [
                    {
                        'id':      m.id,
                        'name':    m.name,
                        'model':   m.model,
                        'modules': m.modules or '',
                    }
                    for m in records
                ],
                'total':  total,
                'offset': offset,
                'limit':  limit,
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/get_m2o_options', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_m2o_options(self, model_name='', search='', limit=100, ids=None, **kwargs):
        """Return id + display_name records for a many2one related model."""
        try:
            if not model_name:
                return {'status': 'error', 'message': 'No model specified'}
            try:
                Model = request.env[model_name].sudo()
            except KeyError:
                return {'status': 'error', 'message': f'Model {model_name} not found'}
            if ids:
                records = Model.browse([int(i) for i in ids]).read(['display_name'])
                return {
                    'status': 'ok',
                    'data':   [{'id': r['id'], 'name': r['display_name']} for r in records],
                    'total':  len(records),
                }
            limit   = min(int(limit or 20), 200)
            # name_search is the correct Odoo API for M2O lookups —
            # it handles computed display_name fields correctly
            results = Model.name_search(name=search or '', limit=limit)
            data    = [{'id': r[0], 'name': r[1]} for r in results]
            return {
                'status': 'ok',
                'data':   data,
                'total':  len(data),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/get_fields', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_fields(self, model_name='', **kwargs):
        try:
            if not model_name:
                return {'status': 'error', 'message': 'No model specified'}
            try:
                Model = request.env[model_name].sudo()
            except KeyError:
                return {'status': 'error', 'message': f'Model {model_name} not found'}

            fields_data = Model.fields_get(attributes=['string', 'type', 'relation', 'selection'])
            result = []
            for fname, finfo in fields_data.items():
                if fname.startswith('_'):
                    continue
                result.append({
                    'name':      fname,
                    'string':    finfo.get('string', fname),
                    'type':      finfo.get('type', 'char'),
                    'relation':  finfo.get('relation', ''),
                    'selection': finfo.get('selection') or [],
                })
            result.sort(key=lambda x: x['string'])
            return {'status': 'ok', 'data': result}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  AI Integration
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _extract_visualization_intent(self, intent_text):
        """
        Scan the user intent string for explicit visualization keywords.
        Returns a list of canonical chart-type strings in the order they
        appear in the text (e.g. ['tile', 'pie']).
        Returns [] when no specific type is mentioned → free-form AI mode.
        """
        # Each entry: (canonical_type, [keyword_phrases longest-first])
        VISUALIZATION_MAP = [
            ('tile',      ['kpi card', 'kpi tile', 'kpi', 'kpi cards', 'tile',
                           'metric card', 'metric', 'counter card', 'counter',
                           'number card', 'number', 'count card', 'total card', 'card']),
            ('pie',       ['pie chart', 'pie charts', 'pie graph', 'pie']),
            ('doughnut',  ['doughnut chart', 'donut chart', 'doughnut', 'donut']),
            ('bar',       ['bar chart', 'bar graph', 'bar charts', 'column chart',
                           'histogram', 'bar']),
            ('line',      ['line chart', 'line graph', 'line charts', 'trend chart',
                           'trend line', 'time series', 'trend', 'line']),
            ('area',      ['area chart', 'area graph', 'area charts', 'area']),
            ('scatter',   ['scatter plot', 'scatter chart', 'scatter graph', 'scatter']),
            ('funnel',    ['funnel chart', 'funnel']),
            ('gauge',     ['gauge chart', 'speedometer', 'dial', 'gauge']),
            ('treemap',   ['treemap', 'tree map']),
            ('heatmap',   ['heatmap', 'heat map']),
            ('waterfall', ['waterfall chart', 'waterfall']),
            ('radar',     ['radar chart', 'spider chart', 'radar']),
        ]

        if not intent_text:
            return []

        text = intent_text.lower()
        found = []
        seen  = set()

        for chart_type, keywords in VISUALIZATION_MAP:
            for kw in keywords:
                if kw in text and chart_type not in seen:
                    found.append(chart_type)
                    seen.add(chart_type)
                    break

        return found

    def _enforce_visualization_intent(self, items_config, detected_types, model_label):
        """
        Filter AI-generated items so only the explicitly requested types are kept.
        If the AI missed a detected type entirely, a sensible default is created
        for it so the user always gets exactly what they asked for.
        """
        TYPE_DEFAULTS = {
            'tile':      {'w': 4, 'h': 3, 'kpi_icon': 'fa-bar-chart',    'kpi_color': 'blue'},
            'bar':       {'w': 6, 'h': 4, 'kpi_icon': 'fa-bar-chart',    'kpi_color': 'blue'},
            'line':      {'w': 6, 'h': 4, 'kpi_icon': 'fa-line-chart',   'kpi_color': 'teal'},
            'area':      {'w': 6, 'h': 4, 'kpi_icon': 'fa-area-chart',   'kpi_color': 'green'},
            'pie':       {'w': 6, 'h': 4, 'kpi_icon': 'fa-pie-chart',    'kpi_color': 'purple'},
            'doughnut':  {'w': 6, 'h': 4, 'kpi_icon': 'fa-circle-o',     'kpi_color': 'purple'},
            'scatter':   {'w': 6, 'h': 4, 'kpi_icon': 'fa-braille',      'kpi_color': 'orange'},
            'funnel':    {'w': 6, 'h': 4, 'kpi_icon': 'fa-filter',       'kpi_color': 'orange'},
            'gauge':     {'w': 4, 'h': 4, 'kpi_icon': 'fa-tachometer',   'kpi_color': 'red'},
            'treemap':   {'w': 6, 'h': 4, 'kpi_icon': 'fa-th',           'kpi_color': 'blue'},
            'heatmap':   {'w': 6, 'h': 4, 'kpi_icon': 'fa-table',        'kpi_color': 'teal'},
            'waterfall': {'w': 8, 'h': 4, 'kpi_icon': 'fa-signal',       'kpi_color': 'blue'},
            'radar':     {'w': 6, 'h': 4, 'kpi_icon': 'fa-star-o',       'kpi_color': 'purple'},
        }

        result    = []
        used_types = set()

        # Pass 1 — keep AI-generated items that match a requested type (one per type)
        for cfg in items_config:
            ai_type = cfg.get('item_type', 'tile')
            if ai_type in detected_types and ai_type not in used_types:
                result.append(cfg)
                used_types.add(ai_type)

        # Pass 2 — fill in any requested type the AI completely omitted
        for t in detected_types:
            if t not in used_types:
                defaults = TYPE_DEFAULTS.get(t, {'w': 6, 'h': 4, 'kpi_icon': 'fa-bar-chart', 'kpi_color': 'blue'})
                result.append({
                    'name': model_label,
                    'item_type': t,
                    'x_field': '',
                    'y_field': '',
                    'aggregate': 'count',
                    'date_filter': 'this_month',
                    **defaults,
                })

        return result

    @http.route('/hb_dashboard/ai_generate', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def ai_generate(self, model_name='', intent='', dashboard_id=None, **kwargs):
        try:
            provider = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_provider', 'disabled')
            api_key = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_api_key', '')
            ai_model = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_model', 'claude-sonnet-4-6')

            if provider == 'disabled' or not api_key:
                return {'status': 'error', 'message': 'AI is not configured. Go to Settings → BI Dashboard to add an API key.'}

            # Detect which visualization type(s) the user explicitly mentioned.
            # An empty list means free-form mode (AI decides how many items).
            detected_types = self._extract_visualization_intent(intent)

            # Get model fields for context and later field-name validation
            fields_data = {}
            fields_info = []
            if model_name:
                try:
                    Model = request.env[model_name].sudo()
                    fields_data = Model.fields_get(attributes=['string', 'type'])  # stored for validation below
                    fields_info = [f"{fname} ({finfo['type']}): {finfo.get('string', fname)}"
                                   for fname, finfo in list(fields_data.items())[:40]
                                   if not fname.startswith('_')]
                except Exception:
                    pass

            model_label = model_name
            try:
                ir_model = request.env['ir.model'].sudo().search([('model', '=', model_name)], limit=1)
                if ir_model:
                    model_label = ir_model.name
            except Exception:
                pass

            # Build intent-specific prompt constraints
            if detected_types:
                n = len(detected_types)
                type_list = ", ".join(detected_types)
                intent_constraint = (
                    f"\nCRITICAL INSTRUCTION: The user explicitly requested EXACTLY {n} visualization(s): [{type_list}].\n"
                    f"You MUST return EXACTLY {n} JSON object(s) — one per requested type, in that order.\n"
                    "Do NOT add extra items. Do NOT change the types. Strict compliance required."
                )
                item_count_line = f"Return EXACTLY {n} item(s): {type_list}."
            else:
                intent_constraint = ""
                item_count_line = "Generate 6-8 items that best represent this data."

            system_prompt = """You are an Odoo BI dashboard expert. Generate dashboard item configurations in JSON.
Return a JSON array of dashboard items. Each item MUST have exactly these fields:
  name           - descriptive widget title
  item_type      - one of: tile, bar, line, pie, doughnut, funnel, radar, area, gauge, treemap
  x_field        - group-by field name (must be from Available fields list; empty string for KPI tiles)
  y_field        - numeric measure field name (must be from Available fields list; empty string for count)
  aggregate      - count, sum, or avg
  date_filter    - this_month, this_year, last_30, last_90, this_quarter, all, etc.
  kpi_icon       - Font Awesome class like fa-users, fa-money, fa-bar-chart, fa-check-circle
  kpi_color      - one of: blue, green, orange, red, purple, teal
  w              - grid width in columns: 4 for KPI tiles, 6 for medium charts, 12 for wide charts
  h              - grid height in rows: 3 for tiles, 4 for standard charts, 5 for tall charts
Do NOT include x or y position fields - positions are assigned automatically.
Return ONLY a valid JSON array. No markdown fences, no explanatory text.""" + intent_constraint

            user_prompt = f"""Model: {model_label} ({model_name})
Available fields: {', '.join(fields_info[:25]) if fields_info else 'unknown'}
User intent: {intent or 'Create a comprehensive dashboard showing key metrics'}

{item_count_line}
Use ONLY the exact field names listed above for x_field and y_field.
Use empty string for x_field on KPI tiles (item_type=tile)."""

            result = self._call_ai_api(provider, api_key, ai_model, system_prompt, user_prompt)

            if result.get('error'):
                return {'status': 'error', 'message': result['error']}

            try:
                items_config = json.loads(result['content'])
                if not isinstance(items_config, list):
                    return {'status': 'error', 'message': 'AI returned invalid format'}
            except json.JSONDecodeError as e:
                return {'status': 'error', 'message': f'AI returned invalid JSON: {e}'}

            # Enforce intent: keep/fill only the requested visualization types.
            # When no specific type was detected we leave items_config untouched
            # (free-form mode) so the AI can suggest its own variety.
            if detected_types:
                items_config = self._enforce_visualization_intent(
                    items_config, detected_types, model_label
                )

            # Resolve model_id
            model_id = False
            if model_name:
                ir_model = request.env['ir.model'].sudo().search([('model', '=', model_name)], limit=1)
                if ir_model:
                    model_id = ir_model.id

            # Find the lowest free row so new items never overlap existing ones.
            max_y = 0
            if dashboard_id:
                existing = request.env['hb.dashboard.item'].sudo().search([
                    ('dashboard_id', '=', dashboard_id),
                ])
                for ei in existing:
                    max_y = max(max_y, (ei.y or 0) + (ei.h or 3))

            # Pack new items into rows (simple bin-packing — no overlaps).
            COLS = 12
            col_cursor = 0
            row_cursor = max_y
            row_height = 0

            # Valid field names for this model (reject hallucinated names from AI)
            valid_fields = set(fields_data.keys()) if fields_data else set()

            created_items = []
            for i, cfg in enumerate(items_config):
                try:
                    item_w = min(max(int(cfg.get('w', 4)), 2), 12)
                    item_h = min(max(int(cfg.get('h', 3)), 2), 8)

                    # Wrap to next row when this item does not fit horizontally
                    if col_cursor + item_w > COLS:
                        col_cursor = 0
                        row_cursor += row_height
                        row_height = item_h
                    else:
                        row_height = max(row_height, item_h)

                    item_x = col_cursor
                    item_y = row_cursor
                    col_cursor += item_w

                    # Reject field names the model does not expose (AI hallucinations)
                    x_field = cfg.get('x_field') or ''
                    y_field = cfg.get('y_field') or ''
                    if valid_fields:
                        if x_field and x_field not in valid_fields:
                            _logger.debug('AI: unknown x_field %r for %s', x_field, model_name)
                            x_field = ''
                        if y_field and y_field not in valid_fields:
                            _logger.debug('AI: unknown y_field %r for %s', y_field, model_name)
                            y_field = ''

                    item = request.env['hb.dashboard.item'].sudo().create({
                        'dashboard_id': dashboard_id,
                        'name': cfg.get('name', f'Item {i+1}'),
                        'item_type': cfg.get('item_type', 'tile'),
                        'model_id': model_id,
                        'x_field': x_field,
                        'y_field': y_field,
                        'aggregate': cfg.get('aggregate', 'count'),
                        'date_filter': cfg.get('date_filter', 'this_month'),
                        'kpi_icon': cfg.get('kpi_icon', 'fa-bar-chart'),
                        'kpi_color': cfg.get('kpi_color', 'blue'),
                        'w': item_w,
                        'h': item_h,
                        'x': item_x,
                        'y': item_y,
                        'groupby_field': x_field,
                        'show_legend': True,
                    })
                    created_items.append(item.get_item_config())
                except Exception as e:
                    _logger.warning('AI item create error (item %d): %s', i, e)

            return {'status': 'ok', 'data': {'items': created_items, 'detected_types': detected_types}}
        except Exception as e:
            _logger.exception("AI generate error: %s", e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/ai_explain', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def ai_explain(self, item_id=None, chart_data=None, **kwargs):
        try:
            provider = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_provider', 'disabled')
            api_key = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_api_key', '')
            ai_model = request.env['ir.config_parameter'].sudo().get_param('hb_dashboard.ai_model', 'claude-sonnet-4-6')

            if provider == 'disabled' or not api_key:
                return {'status': 'error', 'message': 'AI not configured'}

            item = request.env['hb.dashboard.item'].sudo().browse(item_id) if item_id else None
            item_name = item.name if item and item.exists() else 'Chart'

            system_prompt = "You are a business analyst. Explain the chart data in 2-3 concise sentences, highlighting key insights and trends. Be specific about numbers."
            user_prompt = f"Chart: {item_name}\nData: {json.dumps(chart_data or {})[:2000]}\nProvide a brief business insight."

            result = self._call_ai_api(provider, api_key, ai_model, system_prompt, user_prompt)
            if result.get('error'):
                return {'status': 'error', 'message': result['error']}

            return {'status': 'ok', 'data': {'explanation': result['content']}}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def _call_ai_api(self, provider, api_key, model, system_prompt, user_prompt):
        try:
            if provider == 'claude':
                url = 'https://api.anthropic.com/v1/messages'
                payload = json.dumps({
                    'model': model or 'claude-sonnet-4-6',
                    'max_tokens': 2048,
                    'system': system_prompt,
                    'messages': [{'role': 'user', 'content': user_prompt}],
                }).encode('utf-8')
                req = urllib.request.Request(url, data=payload, method='POST')
                req.add_header('Content-Type', 'application/json')
                req.add_header('x-api-key', api_key)
                req.add_header('anthropic-version', '2023-06-01')
            elif provider == 'openai':
                url = 'https://api.openai.com/v1/chat/completions'
                openai_body = {
                    'model': model or 'gpt-4o-mini',
                    'messages': [
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': user_prompt},
                    ],
                    # Current OpenAI models reject the legacy 'max_tokens' param
                    # for chat completions and require 'max_completion_tokens'.
                    'max_completion_tokens': 2048,
                }
                payload = json.dumps(openai_body).encode('utf-8')
                req = urllib.request.Request(url, data=payload, method='POST')
                req.add_header('Content-Type', 'application/json')
                req.add_header('Authorization', f'Bearer {api_key}')
            else:
                return {'error': 'Unknown provider'}

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
            except urllib.error.HTTPError as e:
                # Older OpenAI models (e.g. gpt-4, gpt-3.5) reject
                # max_completion_tokens and want max_tokens instead. Retry once
                # with the legacy parameter name before giving up.
                body = e.read().decode('utf-8', errors='replace')
                if provider == 'openai' and e.code == 400 and 'max_completion_tokens' in body and 'max_tokens' in body:
                    openai_body.pop('max_completion_tokens', None)
                    openai_body['max_tokens'] = 2048
                    payload = json.dumps(openai_body).encode('utf-8')
                    req = urllib.request.Request(url, data=payload, method='POST')
                    req.add_header('Content-Type', 'application/json')
                    req.add_header('Authorization', f'Bearer {api_key}')
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        data = json.loads(resp.read().decode('utf-8'))
                else:
                    raise

            if provider == 'claude':
                content = data.get('content', [{}])[0].get('text', '')
            else:
                content = data.get('choices', [{}])[0].get('message', {}).get('content', '')

            return {'content': content}
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            return {'error': f'API error {e.code}: {body[:200]}'}
        except Exception as e:
            return {'error': str(e)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Export / Import
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/export_json', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def export_json(self, dashboard_id=None, **kwargs):
        try:
            dashboard = request.env['hb.dashboard'].sudo().browse(dashboard_id)
            if not dashboard.exists():
                return {'status': 'error', 'message': 'Dashboard not found'}
            data = dashboard.export_json()
            return {'status': 'ok', 'data': data}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/import_json', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def import_json(self, data=None, **kwargs):
        try:
            if not data:
                return {'status': 'error', 'message': 'No data provided'}
            new_id = request.env['hb.dashboard'].sudo().import_json(data)
            return {'status': 'ok', 'data': {'id': new_id}}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/hb_dashboard/get_export_data', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_export_data(self, item_id=None, filters=None, **kwargs):
        """Return raw tabular data for Excel/CSV export."""
        try:
            item = request.env['hb.dashboard.item'].sudo().browse(item_id)
            if not item.exists() or not item.model_name:
                return {'status': 'error', 'message': 'Item not configured'}

            Model = request.env[item.model_name].sudo()
            domain = self._build_domain(item, filters or {})

            if item.item_type == 'list':
                try:
                    columns = json.loads(item.list_columns or '[]')
                except Exception:
                    columns = []
                if not isinstance(columns, list) or not columns:
                    columns = ['display_name']
                order = f'{item.sort_by} {item.sort_order or "desc"}' if item.sort_by else None
                records = Model.search_read(domain, columns, limit=item.limit or 1000, order=order)
                rows = []
                for rec in records:
                    row = []
                    for c in columns:
                        val = rec.get(c)
                        if isinstance(val, (list, tuple)) and len(val) == 2 and isinstance(val[0], int):
                            val = val[1]
                        elif val is False:
                            val = ''
                        row.append(val)
                    rows.append(row)
                return {'status': 'ok', 'data': {'headers': columns, 'rows': rows, 'title': item.name}}

            groupby = item.x_field or item.groupby_field
            measure = item.y_field if item.aggregate != 'count' else '__count'

            if groupby:
                groups = Model.read_group(
                    domain=domain,
                    fields=[measure] if measure != '__count' else [],
                    groupby=[groupby],
                    limit=item.limit or 1000,
                    lazy=False,
                )
                headers = [groupby, measure if measure != '__count' else 'count']
                rows = []
                for g in groups:
                    label = g.get(groupby)
                    if isinstance(label, tuple):
                        label = label[1]
                    val = g.get(measure, 0) if measure != '__count' else g.get('__count', 0)
                    rows.append([str(label or ''), val])
            else:
                fields_to_read = [item.y_field] if item.y_field else ['id', 'display_name']
                records = Model.search_read(domain, fields_to_read, limit=item.limit or 1000)
                headers = list(fields_to_read)
                rows = [[r.get(f, '') for f in fields_to_read] for r in records]

            return {'status': 'ok', 'data': {'headers': headers, 'rows': rows, 'title': item.name}}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    #  Utility
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @http.route('/hb_dashboard/get_config', type='jsonrpc', auth='user', methods=['POST'], csrf=False)
    def get_config(self, **kwargs):
        try:
            params = request.env['ir.config_parameter'].sudo()
            return {
                'status': 'ok',
                'data': {
                    'ai_provider': params.get_param('hb_dashboard.ai_provider', 'disabled'),
                    'ai_configured': bool(params.get_param('hb_dashboard.ai_api_key', '')),
                    'enable_export': params.get_param('hb_dashboard.enable_export', 'True') == 'True',
                    'default_theme': params.get_param('hb_dashboard.default_theme', 'light'),
                    'enable_crossfilter': params.get_param('hb_dashboard.enable_crossfilter', 'True') == 'True',
                    'enable_filterbar': params.get_param('hb_dashboard.enable_filterbar', 'True') == 'True',
                    'enable_formula': params.get_param('hb_dashboard.enable_formula', 'True') == 'True',
                }
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

