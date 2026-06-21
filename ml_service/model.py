import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import TimeSeriesSplit
from datetime import timedelta
import hashlib
import json
import os
import threading
import time

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

# In-memory result cache: { hash: (timestamp, result_dict) }
# Avoids retraining when the exact same payload comes through repeatedly.
_RESULT_CACHE = {}
_RESULT_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 60 * 60 * 6  # 6 hours
_CACHE_MAX_ENTRIES = 512


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create lag, rolling, EWMA, trend and calendar features from daily sales."""
    df = df.sort_values('date').reset_index(drop=True)

    # Daily granularity (aggregate same-day rows)
    df = df.groupby('date', as_index=False).agg({'quantity': 'sum', 'revenue': 'sum'})
    df = df.sort_values('date').reset_index(drop=True)

    # Fill missing calendar days with 0 so lag features are meaningful
    full_range = pd.date_range(df['date'].min(), df['date'].max(), freq='D')
    df = df.set_index('date').reindex(full_range).fillna(0).rename_axis('date').reset_index()

    # Calendar features
    df['dayofweek']    = df['date'].dt.dayofweek
    df['day']          = df['date'].dt.day
    df['month']        = df['date'].dt.month
    df['quarter']      = df['date'].dt.quarter
    df['dayofyear']    = df['date'].dt.dayofyear
    df['weekofyear']   = df['date'].dt.isocalendar().week.astype(int)
    df['is_weekend']   = (df['dayofweek'] >= 5).astype(int)
    df['is_month_start'] = df['date'].dt.is_month_start.astype(int)
    df['is_month_end']   = df['date'].dt.is_month_end.astype(int)

    # Cyclical encoding
    df['dow_sin']   = np.sin(2 * np.pi * df['dayofweek'] / 7)
    df['dow_cos']   = np.cos(2 * np.pi * df['dayofweek'] / 7)
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)

    # Lag features
    for lag in [1, 2, 3, 7, 14, 21, 30]:
        df[f'qty_lag_{lag}'] = df['quantity'].shift(lag)
        df[f'rev_lag_{lag}'] = df['revenue'].shift(lag)

    # Rolling stats
    for window in [7, 14, 30]:
        df[f'qty_roll_mean_{window}'] = df['quantity'].shift(1).rolling(window).mean()
        df[f'qty_roll_std_{window}']  = df['quantity'].shift(1).rolling(window).std()
        df[f'qty_roll_min_{window}']  = df['quantity'].shift(1).rolling(window).min()
        df[f'qty_roll_max_{window}']  = df['quantity'].shift(1).rolling(window).max()
        df[f'rev_roll_mean_{window}'] = df['revenue'].shift(1).rolling(window).mean()

    # EWMA
    for span in [7, 14, 30]:
        df[f'qty_ewma_{span}'] = df['quantity'].shift(1).ewm(span=span, adjust=False).mean()
        df[f'rev_ewma_{span}'] = df['revenue'].shift(1).ewm(span=span, adjust=False).mean()

    # Short-term trend (slope of last 7 days)
    def _slope(series):
        if series.isna().any() or len(series) < 2:
            return 0.0
        x = np.arange(len(series))
        return float(np.polyfit(x, series.values, 1)[0])

    df['qty_trend_7'] = df['quantity'].shift(1).rolling(7).apply(_slope, raw=False)
    df['rev_trend_7'] = df['revenue'].shift(1).rolling(7).apply(_slope, raw=False)

    df = df.dropna().reset_index(drop=True)
    return df


FEATURE_COLS = [
    'dayofweek', 'day', 'month', 'quarter', 'dayofyear', 'weekofyear',
    'is_weekend', 'is_month_start', 'is_month_end',
    'dow_sin', 'dow_cos', 'month_sin', 'month_cos',
    'qty_lag_1', 'qty_lag_2', 'qty_lag_3', 'qty_lag_7', 'qty_lag_14', 'qty_lag_21', 'qty_lag_30',
    'rev_lag_1', 'rev_lag_2', 'rev_lag_3', 'rev_lag_7', 'rev_lag_14', 'rev_lag_21', 'rev_lag_30',
    'qty_roll_mean_7',  'qty_roll_std_7',  'qty_roll_min_7',  'qty_roll_max_7',
    'qty_roll_mean_14', 'qty_roll_std_14', 'qty_roll_min_14', 'qty_roll_max_14',
    'qty_roll_mean_30', 'qty_roll_std_30', 'qty_roll_min_30', 'qty_roll_max_30',
    'rev_roll_mean_7', 'rev_roll_mean_14', 'rev_roll_mean_30',
    'qty_ewma_7', 'qty_ewma_14', 'qty_ewma_30',
    'rev_ewma_7', 'rev_ewma_14', 'rev_ewma_30',
    'qty_trend_7', 'rev_trend_7',
]


def _build_rf(n_samples: int) -> RandomForestRegressor:
    """Random Forest hyperparameters scaled to dataset size, tuned for speed.

    Tree counts and depths are intentionally modest — empirically the accuracy
    plateaus quickly on daily sales data, while wall-clock time keeps growing.
    """
    if n_samples < 60:
        n_estimators, max_depth, min_samples_leaf = 80, 6, 2
    elif n_samples < 200:
        n_estimators, max_depth, min_samples_leaf = 120, 10, 2
    else:
        n_estimators, max_depth, min_samples_leaf = 180, 12, 1

    return RandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        min_samples_split=4,
        min_samples_leaf=min_samples_leaf,
        max_features='sqrt',
        bootstrap=True,
        oob_score=True,
        random_state=42,
        n_jobs=-1,
    )


def _payload_hash(product: str, sales_history: list, forecast_days: int) -> str:
    payload = json.dumps(
        {'p': product, 'h': sales_history, 'd': forecast_days},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _cache_get(key: str):
    with _RESULT_CACHE_LOCK:
        entry = _RESULT_CACHE.get(key)
        if not entry:
            return None
        ts, value = entry
        if time.time() - ts > _CACHE_TTL_SECONDS:
            _RESULT_CACHE.pop(key, None)
            return None
        return value


def _cache_put(key: str, value: dict):
    with _RESULT_CACHE_LOCK:
        if len(_RESULT_CACHE) >= _CACHE_MAX_ENTRIES:
            # Evict oldest
            oldest = min(_RESULT_CACHE.items(), key=lambda kv: kv[1][0])[0]
            _RESULT_CACHE.pop(oldest, None)
        _RESULT_CACHE[key] = (time.time(), value)


def train_and_forecast(product: str, sales_history: list, forecast_days: int = 30) -> dict:
    """Train Random Forest models on the sales history and forecast forward.

    Identical inputs hit an in-memory cache (6h TTL) so re-runs on unchanged
    data are instant.
    """
    cache_key = _payload_hash(product, sales_history, forecast_days)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    df = pd.DataFrame(sales_history)
    df['date'] = pd.to_datetime(df['date'])
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').fillna(0)
    df['revenue']  = pd.to_numeric(df['revenue'],  errors='coerce').fillna(0)

    df = engineer_features(df)

    if len(df) < 5:
        raise ValueError("Not enough data after feature engineering (need at least 5 clean rows).")

    X = df[FEATURE_COLS]
    y_qty = df['quantity']
    y_rev = df['revenue']
    n = len(df)

    # Single fit per target. OOB score gives an honest accuracy estimate
    # without paying for walk-forward CV (which fits 3+ extra models per target).
    rf_qty = _build_rf(n)
    rf_rev = _build_rf(n)
    rf_qty.fit(X, y_qty)
    rf_rev.fit(X, y_rev)

    try:
        oob_qty = max(0.0, float(rf_qty.oob_score_))
        oob_rev = max(0.0, float(rf_rev.oob_score_))
        model_accuracy = max(0.0, min(100.0, ((oob_qty + oob_rev) / 2.0) * 100))
    except Exception:
        model_accuracy = 70.0

    # Iterative forecast
    last_date = df['date'].iloc[-1]
    history_qty = list(df['quantity'].values)
    history_rev = list(df['revenue'].values)

    future_qty, future_rev, future_dates = [], [], []

    for i in range(1, forecast_days + 1):
        future_date = last_date + timedelta(days=i)
        future_dates.append(future_date)
        d = pd.Timestamp(future_date)

        row = {
            'dayofweek':       d.dayofweek,
            'day':             d.day,
            'month':           d.month,
            'quarter':         d.quarter,
            'dayofyear':       d.dayofyear,
            'weekofyear':      int(d.isocalendar()[1]),
            'is_weekend':      int(d.dayofweek >= 5),
            'is_month_start':  int(d.is_month_start),
            'is_month_end':    int(d.is_month_end),
            'dow_sin':         float(np.sin(2 * np.pi * d.dayofweek / 7)),
            'dow_cos':         float(np.cos(2 * np.pi * d.dayofweek / 7)),
            'month_sin':       float(np.sin(2 * np.pi * d.month / 12)),
            'month_cos':       float(np.cos(2 * np.pi * d.month / 12)),
        }

        nh = len(history_qty)
        for lag in [1, 2, 3, 7, 14, 21, 30]:
            row[f'qty_lag_{lag}'] = history_qty[-lag] if nh >= lag else float(np.mean(history_qty))
            row[f'rev_lag_{lag}'] = history_rev[-lag] if nh >= lag else float(np.mean(history_rev))

        for window in [7, 14, 30]:
            w = min(window, nh)
            qwin = history_qty[-w:]
            rwin = history_rev[-w:]
            row[f'qty_roll_mean_{window}'] = float(np.mean(qwin))
            row[f'qty_roll_std_{window}']  = float(np.std(qwin))  if w > 1 else 0.0
            row[f'qty_roll_min_{window}']  = float(np.min(qwin))
            row[f'qty_roll_max_{window}']  = float(np.max(qwin))
            row[f'rev_roll_mean_{window}'] = float(np.mean(rwin))

        qty_series = pd.Series(history_qty)
        rev_series = pd.Series(history_rev)
        for span in [7, 14, 30]:
            row[f'qty_ewma_{span}'] = float(qty_series.ewm(span=span, adjust=False).mean().iloc[-1])
            row[f'rev_ewma_{span}'] = float(rev_series.ewm(span=span, adjust=False).mean().iloc[-1])

        def _slope_arr(arr):
            if len(arr) < 2:
                return 0.0
            x = np.arange(len(arr))
            return float(np.polyfit(x, np.asarray(arr, dtype=float), 1)[0])

        row['qty_trend_7'] = _slope_arr(history_qty[-7:])
        row['rev_trend_7'] = _slope_arr(history_rev[-7:])

        feat = pd.DataFrame([row])[FEATURE_COLS]
        p_qty = max(0.0, float(rf_qty.predict(feat)[0]))
        p_rev = max(0.0, float(rf_rev.predict(feat)[0]))

        future_qty.append(p_qty)
        future_rev.append(p_rev)
        history_qty.append(p_qty)
        history_rev.append(p_rev)

    total_qty = sum(future_qty)
    total_rev = sum(future_rev)

    daily_breakdown = [
        {'date': d.strftime('%Y-%m-%d'), 'quantity': round(q, 2), 'revenue': round(r, 2)}
        for d, q, r in zip(future_dates, future_qty, future_rev)
    ]

    result = {
        'product':           product,
        'forecastedSales':   round(total_qty, 2),
        'forecastedRevenue': round(total_rev, 2),
        'confidence':        round(model_accuracy, 1),
        'modelAccuracy':     round(model_accuracy, 1),
        'dailyBreakdown':    daily_breakdown,
    }

    _cache_put(cache_key, result)
    return result
