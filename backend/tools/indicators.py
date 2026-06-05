"""Tool 3 — Technical indicators: Wilder's RSI(14), MA7 and MA30.

The three returned lists are **index-aligned** with the input price series (same
length), using `None` where the indicator can't be computed yet (e.g. MA30 in the
first 29 days). That makes it trivial to plot them against the prices on the
frontend.
"""

import numpy as np
import pandas as pd


def _wilder_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """RSI using Wilder's standard smoothing.

    Seed: simple average of the first `period` deltas.
    Then:  avg = (prev_avg * (period - 1) + current_value) / period
    """
    n = len(series)
    rsi = pd.Series([np.nan] * n, index=series.index, dtype="float64")
    if n <= period:
        return rsi  # not enough data

    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)

    avg_gain = pd.Series([np.nan] * n, index=series.index, dtype="float64")
    avg_loss = pd.Series([np.nan] * n, index=series.index, dtype="float64")

    # Seed = simple mean of the first `period` deltas (indices 1..period)
    avg_gain.iloc[period] = gain.iloc[1 : period + 1].mean()
    avg_loss.iloc[period] = loss.iloc[1 : period + 1].mean()

    # Wilder's smoothing
    for i in range(period + 1, n):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    # If there were no losses in the window, RSI is 100 by definition.
    rsi[avg_loss == 0] = 100.0
    return rsi


def calculate_indicators(prices: list) -> dict:
    """Compute RSI(14), MA7 and MA30 over a daily price series.

    Args:
        prices: [[timestamp_ms, price], ...] (one point per day).

    Returns:
        {"rsi": [...], "ma7": [...], "ma30": [...]} — lists index-aligned with
        `prices`; `None` where the indicator doesn't apply yet.
    """
    if not prices:
        return {"rsi": [], "ma7": [], "ma30": []}

    df = pd.DataFrame(prices, columns=["timestamp", "price"])
    price = df["price"]

    ma7 = price.rolling(window=7, min_periods=7).mean()
    ma30 = price.rolling(window=30, min_periods=30).mean()
    rsi = _wilder_rsi(price, period=14)

    def to_list(s: pd.Series) -> list:
        return [None if pd.isna(v) else round(float(v), 4) for v in s]

    return {"rsi": to_list(rsi), "ma7": to_list(ma7), "ma30": to_list(ma30)}
