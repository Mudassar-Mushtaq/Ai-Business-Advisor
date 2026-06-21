"""Prophet-based forecasting, exposed via the same result shape as model.py.

Returns dailyBreakdown enriched with native p10/p50/p90 bands derived from
Prophet's yhat_lower / yhat / yhat_upper, so the dashboard can draw a real
confidence band instead of one heuristically derived from accuracy %.
"""
import pandas as pd
import numpy as np
import hashlib
import json
import logging
import os
import threading
import time

# Quiet down Prophet's chatter (model fit logs every call otherwise).
logging.getLogger('prophet').setLevel(logging.WARNING)
logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
os.environ.setdefault('CMDSTANPY_LOG_LEVEL', 'WARNING')

from prophet import Prophet  # noqa: E402

_RESULT_CACHE = {}
_RESULT_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 60 * 60 * 6
_CACHE_MAX_ENTRIES = 256


def _payload_hash(product: str, sales_history: list, forecast_days: int) -> str:
    payload = json.dumps(
        {'p': product, 'h': sales_history, 'd': forecast_days, 'm': 'prophet'},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _cache_get(key):
    with _RESULT_CACHE_LOCK:
        entry = _RESULT_CACHE.get(key)
        if not entry:
            return None
        ts, value = entry
        if time.time() - ts > _CACHE_TTL_SECONDS:
            _RESULT_CACHE.pop(key, None)
            return None
        return value


def _cache_put(key, value):
    with _RESULT_CACHE_LOCK:
        if len(_RESULT_CACHE) >= _CACHE_MAX_ENTRIES:
            oldest = min(_RESULT_CACHE.items(), key=lambda kv: kv[1][0])[0]
            _RESULT_CACHE.pop(oldest, None)
        _RESULT_CACHE[key] = (time.time(), value)


def _build_prophet(n_rows: int) -> Prophet:
    # Yearly seasonality only meaningful with ~2 years of data — disable below
    # that to keep the trend from absorbing noise.
    yearly = 'auto' if n_rows >= 365 * 2 else False
    return Prophet(
        yearly_seasonality=yearly,
        weekly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.8,
        changepoint_prior_scale=0.05,
        seasonality_mode='additive',
    )


def _accuracy_via_holdout(df: pd.DataFrame) -> float:
    """MAPE-based accuracy on a small holdout of the quantity series."""
    n = len(df)
    if n < 30:
        return 70.0

    holdout = min(14, max(7, n // 5))
    train = df.iloc[:-holdout]
    test = df.iloc[-holdout:]

    try:
        m = Prophet(
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.8,
        )
        m.fit(pd.DataFrame({'ds': train['date'], 'y': train['quantity']}))
        pred = m.predict(pd.DataFrame({'ds': test['date']}))

        actual = test['quantity'].to_numpy(dtype=float)
        forecast = pred['yhat'].to_numpy(dtype=float)
        denom = np.where(actual == 0, 1.0, actual)
        mape = float(np.mean(np.abs((actual - forecast) / denom)))
        return max(0.0, min(100.0, (1 - mape) * 100))
    except Exception:
        return 70.0


def train_and_forecast_prophet(product: str, sales_history: list, forecast_days: int = 30) -> dict:
    """Fit Prophet on quantity + revenue and forecast forward."""
    cache_key = _payload_hash(product, sales_history, forecast_days)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    df = pd.DataFrame(sales_history)
    df['date'] = pd.to_datetime(df['date'])
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').fillna(0)
    df['revenue']  = pd.to_numeric(df['revenue'], errors='coerce').fillna(0)
    df = df.groupby('date', as_index=False).agg({'quantity': 'sum', 'revenue': 'sum'})
    df = df.sort_values('date').reset_index(drop=True)

    if len(df) < 5:
        raise ValueError("Not enough data for Prophet (need at least 5 daily rows).")

    # Fill calendar gaps with 0 so the trend isn't biased by missing days.
    full_range = pd.date_range(df['date'].min(), df['date'].max(), freq='D')
    df = df.set_index('date').reindex(full_range).fillna(0).rename_axis('date').reset_index()

    n = len(df)
    accuracy = _accuracy_via_holdout(df)

    m_qty = _build_prophet(n)
    m_rev = _build_prophet(n)
    m_qty.fit(pd.DataFrame({'ds': df['date'], 'y': df['quantity']}))
    m_rev.fit(pd.DataFrame({'ds': df['date'], 'y': df['revenue']}))

    future_qty = m_qty.make_future_dataframe(periods=forecast_days, include_history=False)
    future_rev = m_rev.make_future_dataframe(periods=forecast_days, include_history=False)
    fcst_qty = m_qty.predict(future_qty)
    fcst_rev = m_rev.predict(future_rev)

    daily_breakdown = []
    for i in range(forecast_days):
        d = fcst_qty['ds'].iloc[i]
        q    = max(0.0, float(fcst_qty['yhat'].iloc[i]))
        q_lo = max(0.0, float(fcst_qty['yhat_lower'].iloc[i]))
        q_hi = max(0.0, float(fcst_qty['yhat_upper'].iloc[i]))
        r    = max(0.0, float(fcst_rev['yhat'].iloc[i]))
        r_lo = max(0.0, float(fcst_rev['yhat_lower'].iloc[i]))
        r_hi = max(0.0, float(fcst_rev['yhat_upper'].iloc[i]))

        daily_breakdown.append({
            'date':        d.strftime('%Y-%m-%d'),
            'quantity':    round(q, 2),
            'revenue':     round(r, 2),
            'p10':         round(q_lo, 2),
            'p50':         round(q, 2),
            'p90':         round(q_hi, 2),
            'bandLow':     round(q_lo, 2),
            'bandRange':   round(max(0.0, q_hi - q_lo), 2),
            'revenue_p10': round(r_lo, 2),
            'revenue_p90': round(r_hi, 2),
        })

    total_qty = sum(d['quantity'] for d in daily_breakdown)
    total_rev = sum(d['revenue'] for d in daily_breakdown)

    result = {
        'product':           product,
        'forecastedSales':   round(total_qty, 2),
        'forecastedRevenue': round(total_rev, 2),
        'confidence':        round(accuracy, 1),
        'modelAccuracy':     round(accuracy, 1),
        'dailyBreakdown':    daily_breakdown,
        'model':             'prophet',
    }

    _cache_put(cache_key, result)
    return result
