# -*- coding: utf-8 -*-
# AB Dashboards — timezone-aware date filter engine

import os
from datetime import timedelta

import pytz
from dateutil import rrule
from dateutil.relativedelta import relativedelta
from dateutil.parser import parse
from datetime import datetime


def hb_get_date(hb_date_filter_selection, self, field_type='datetime'):
    """Main entry point. Returns dict with selected_start_date and selected_end_date."""
    try:
        timezone = self._context.get('tz') or self.env.user.tz
    except Exception:
        timezone = None

    if not timezone:
        timezone = os.environ.get('TZ')
    if not timezone:
        timezone = 'UTC'

    series = hb_date_filter_selection
    # Route to the correct function based on prefix
    prefix = series.split('_')[0]
    suffix = '_'.join(series.split('_')[1:])

    if prefix in ('t', 'l', 'ls', 'n', 'td'):
        fn_name = 'hb_date_series_' + prefix
        fn = globals().get(fn_name)
        if fn:
            return fn(suffix, timezone, field_type, self)

    # Fallback: current month
    return hb_date_series_t('month', timezone, field_type, self)


# ─── To-Date Series (td_year, td_month, td_week, td_quarter) ─────────────────
def hb_date_series_td(hb_date_selection, timezone, field_type, self=None):
    fn_name = 'hb_get_date_range_from_td_' + hb_date_selection
    fn = globals().get(fn_name)
    if fn:
        return fn(timezone, field_type, self)
    return {}


def hb_get_date_range_from_td_year(timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    start_date = datetime(date.year, 1, 1)
    end_date = date
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_td_month(timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    start_date = datetime(date.year, date.month, 1)
    end_date = date
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_td_week(timezone, field_type, self):
    try:
        lang = self.env['res.lang']._lang_get(self.env.user.lang)
        week_start = lang.week_start
    except Exception:
        week_start = '1'
    start_Date = rrule.weekday(int(week_start) - 1)
    start_date = datetime.today() + relativedelta(weekday=start_Date(-1))
    start_date = datetime.strptime(start_date.strftime('%Y-%m-%d'), '%Y-%m-%d')
    end_date = datetime.now(pytz.timezone(timezone))
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_td_quarter(timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    quarter = int((date.month - 1) / 3) + 1
    start_date = datetime(date.year, 3 * quarter - 2, 1)
    end_date = date
    return _build_result(start_date, end_date, timezone, field_type)


# ─── Last N Days Series (l_day, l_week, l_month, l_quarter, l_year) ──────────
def hb_date_series_l(hb_date_selection, timezone, field_type, self=None):
    day_map = {'day': 0, 'week': 7, 'month': 30, 'quarter': 90, 'year': 365}
    days = day_map.get(hb_date_selection, 30)
    now = datetime.now(pytz.timezone(timezone))
    end_date = datetime.strptime(now.strftime('%Y-%m-%d 23:59:59'), '%Y-%m-%d %H:%M:%S')
    start_date = datetime.strptime((now - timedelta(days=days)).strftime('%Y-%m-%d 00:00:00'), '%Y-%m-%d %H:%M:%S')
    return _build_result(start_date, end_date, timezone, field_type)


# ─── Current Period (t_day, t_week, t_month, t_quarter, t_year) ──────────────
def hb_date_series_t(hb_date_selection, timezone, field_type, self=None):
    fn_name = 'hb_get_date_range_from_' + hb_date_selection
    fn = globals().get(fn_name)
    if fn:
        return fn('current', timezone, field_type, self)
    return {}


# ─── Previous Period (ls_day, ls_week, ls_month, ls_quarter, ls_year) ────────
def hb_date_series_ls(hb_date_selection, timezone, field_type, self=None):
    fn_name = 'hb_get_date_range_from_' + hb_date_selection
    fn = globals().get(fn_name)
    if fn:
        return fn('previous', timezone, field_type, self)
    return {}


# ─── Next Period (n_day, n_week, n_month, n_quarter, n_year) ─────────────────
def hb_date_series_n(hb_date_selection, timezone, field_type, self=None):
    fn_name = 'hb_get_date_range_from_' + hb_date_selection
    fn = globals().get(fn_name)
    if fn:
        return fn('next', timezone, field_type, self)
    return {}


# ─── Date Range Calculators ───────────────────────────────────────────────────
def hb_get_date_range_from_day(date_state, timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    if date_state == 'previous':
        date = date - timedelta(days=1)
    elif date_state == 'next':
        date = date + timedelta(days=1)
    start_date = datetime(date.year, date.month, date.day)
    end_date = datetime(date.year, date.month, date.day) + timedelta(days=1, seconds=-1)
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_week(date_state, timezone, field_type, self):
    try:
        lang = self.env['res.lang']._lang_get(self.env.user.lang)
        week_start = lang.week_start
    except Exception:
        week_start = '1'
    start_Date = rrule.weekday(int(week_start) - 1)
    start_date = datetime.today() + relativedelta(weekday=start_Date(-1))
    if date_state == 'previous':
        start_date = datetime.today() - relativedelta(weeks=1, weekday=start_Date(-1))
    elif date_state == 'next':
        start_date = datetime.today() - relativedelta(weeks=-1, weekday=start_Date(-1))
    start_date = datetime.strptime(start_date.strftime('%Y-%m-%d'), '%Y-%m-%d')
    end_date = start_date + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_month(date_state, timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    year, month = date.year, date.month
    if date_state == 'previous':
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    elif date_state == 'next':
        month += 1
        if month == 13:
            month, year = 1, year + 1
    end_year, end_month = year, month
    if month == 12:
        end_year, end_month = year + 1, 1
    else:
        end_month = month + 1
    start_date = datetime(year, month, 1)
    end_date = datetime(end_year, end_month, 1) - timedelta(seconds=1)
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_quarter(date_state, timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    year, quarter = date.year, int((date.month - 1) / 3) + 1
    if date_state == 'previous':
        quarter -= 1
        if quarter == 0:
            quarter, year = 4, year - 1
    elif date_state == 'next':
        quarter += 1
        if quarter == 5:
            quarter, year = 1, year + 1
    start_date = datetime(year, 3 * quarter - 2, 1)
    month = 3 * quarter
    remaining = int(month / 12)
    end_date = datetime(year + remaining, month % 12 + 1, 1) - timedelta(seconds=1)
    return _build_result(start_date, end_date, timezone, field_type)


def hb_get_date_range_from_year(date_state, timezone, field_type, self):
    date = datetime.now(pytz.timezone(timezone))
    year = date.year
    if date_state == 'previous':
        year -= 1
    elif date_state == 'next':
        year += 1
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1) - timedelta(seconds=1)
    return _build_result(start_date, end_date, timezone, field_type)


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _build_result(start_date, end_date, timezone, field_type):
    if field_type == 'date':
        return {
            'selected_start_date': datetime.strptime(start_date.strftime('%Y-%m-%d'), '%Y-%m-%d') if start_date else False,
            'selected_end_date':   datetime.strptime(end_date.strftime('%Y-%m-%d'), '%Y-%m-%d') if end_date else False,
        }
    else:
        return {
            'selected_start_date': hb_convert_into_utc(start_date, timezone) if start_date else False,
            'selected_end_date':   hb_convert_into_utc(end_date, timezone) if end_date else False,
        }


def hb_convert_into_utc(dt, timezone):
    tz = timezone and pytz.timezone(timezone) or pytz.UTC
    dt = parse(dt) if isinstance(dt, str) else dt
    return tz.localize(dt.replace(tzinfo=None), is_dst=False).astimezone(pytz.UTC).replace(tzinfo=None)


def hb_convert_into_local(dt, timezone):
    tz = timezone and pytz.timezone(timezone) or pytz.UTC
    return pytz.UTC.localize(dt.replace(tzinfo=None), is_dst=False).astimezone(tz).replace(tzinfo=None)
