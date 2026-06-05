"""Tool 2 — Forecasting with Prophet.

Predicts the next `horizon` days, returning the point forecast (yhat) and the
confidence interval (yhat_lower / yhat_upper).

Robustness measures (crypto is nasty for a trend model):
1. Fit in **log-space** (y = ln(price)) so the forecast can't go negative and moves
   multiplicatively (realistic % changes).
2. A **calmer trend** (low changepoint_prior_scale) so Prophet doesn't extrapolate a
   recent spike/dump into an absurd runaway crash or moon.
3. A final **clamp** relative to the last price as a safety net against pathological
   extrapolation, so a chart/analysis never shows nonsense like -$10,000 or $0.
"""

import logging

import numpy as np
import pandas as pd
from prophet import Prophet

# Prophet/cmdstanpy are very chatty: lower the console noise.
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)


def run_forecast(prices: list, horizon: int, interval_width: float = 0.8) -> dict:
    """Predict the next `horizon` days with Prophet (log-space, tamed, clamped).

    Args:
        prices: [[timestamp_ms, price], ...] (historical daily series).
        horizon: number of days to predict ahead.
        interval_width: confidence band width (0.5-0.99, e.g. 0.8 = 80%).

    Returns:
        {"dates": [...], "yhat": [...], "yhat_lower": [...], "yhat_upper": [...]}
        (only the `horizon` future days, dates YYYY-MM-DD, all strictly positive)

    Raises:
        ValueError: if there isn't enough data to train the model.
    """
    if not prices or len(prices) < 2:
        raise ValueError("At least 2 price points are required to forecast.")

    df = pd.DataFrame(prices, columns=["timestamp", "price"])
    df["ds"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True).dt.tz_localize(None)
    df["y"] = np.log(df["price"].clip(lower=1e-12))  # log-space target
    last_price = float(df["price"].iloc[-1])

    weekly = len(df) >= 14
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=weekly,
        yearly_seasonality=False,
        interval_width=min(max(float(interval_width), 0.5), 0.99),  # configurable band
        changepoint_prior_scale=0.02,  # calmer trend (default 0.05 over-reacts on crypto)
        changepoint_range=0.9,
    )
    model.fit(df[["ds", "y"]])

    future = model.make_future_dataframe(periods=horizon, freq="D")
    forecast = model.predict(future)
    tail = forecast.tail(horizon)

    def back_to_price(col: str, lo_mult: float, hi_mult: float) -> list:
        """exp() back to price-space, then clamp to a sane band around last price."""
        lo, hi = last_price * lo_mult, last_price * hi_mult
        out = []
        for v in tail[col]:
            price = float(np.exp(v))
            out.append(round(min(max(price, lo), hi), 8))
        return out

    return {
        "dates": [d.strftime("%Y-%m-%d") for d in tail["ds"]],
        "yhat": back_to_price("yhat", 0.25, 4.0),
        "yhat_lower": back_to_price("yhat_lower", 0.15, 4.0),
        "yhat_upper": back_to_price("yhat_upper", 0.25, 8.0),
    }
