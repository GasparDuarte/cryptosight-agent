"""Tool 1 — CoinGecko: fetch a coin's historical prices and search for coins.

Uses the public CoinGecko API (no auth required for basic use):
    GET /coins/{id}/market_chart?vs_currency=usd&days={days}
    GET /search?query={query}

CoinGecko returns variable granularity (5-min, hourly or daily) depending on the
requested range, so we resample to **one price per day** (the day's last value).

API key (optional) via environment variables:
    COINGECKO_API_KEY   your key (gives higher rate limits)
    COINGECKO_PLAN      "demo" (default) or "pro"

Self-healing: a Demo key only works on api.coingecko.com and a Pro key only on
pro-api.coingecko.com. If the configured plan is wrong for the key, the first call
gets a 400/401/403, so we automatically retry against the other endpoint.

A small in-memory TTL cache avoids hammering the API on repeated requests.
"""

import os
import re
import time

import pandas as pd
import requests

PUBLIC_BASE = "https://api.coingecko.com/api/v3"
PRO_BASE = "https://pro-api.coingecko.com/api/v3"
REQUEST_TIMEOUT = 20  # seconds

_CACHE_TTL = 60.0  # seconds
_price_cache: dict = {}


class CoinGeckoError(Exception):
    """Descriptive error when querying CoinGecko (mapped to HTTP 502)."""


# CoinGecko ids are lowercase slugs (letters, digits, hyphens). Allowlisting the
# symbol before it goes into the request URL prevents path injection / SSRF.
_SYMBOL_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


def _validate_symbol(symbol: str) -> str:
    s = (symbol or "").strip().lower()
    if not _SYMBOL_RE.match(s):
        raise CoinGeckoError(
            "Invalid coin id. Use a CoinGecko id like 'bitcoin' (lowercase letters, digits, hyphens)."
        )
    return s


def _endpoints() -> list:
    """Ordered (base_url, headers) attempts based on the configured key/plan.

    The configured tier is tried first; the other tier is the fallback so a
    demo/pro mismatch self-corrects instead of hard-failing.
    """
    key = os.getenv("COINGECKO_API_KEY", "").strip()
    plan = os.getenv("COINGECKO_PLAN", "demo").strip().lower()
    if not key:
        return [(PUBLIC_BASE, {})]
    pro = (PRO_BASE, {"x-cg-pro-api-key": key})
    demo = (PUBLIC_BASE, {"x-cg-demo-api-key": key})
    return [pro, demo] if plan == "pro" else [demo, pro]


def _get(path: str, params: dict) -> requests.Response:
    """GET a CoinGecko endpoint, retrying the alternate tier on auth/tier errors."""
    attempts = _endpoints()
    last_error = None
    for i, (base, headers) in enumerate(attempts):
        has_fallback = i < len(attempts) - 1
        try:
            resp = requests.get(f"{base}{path}", params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            last_error = CoinGeckoError(f"Could not reach CoinGecko: {exc}")
            continue

        # Wrong endpoint for this key's tier -> try the other one.
        if resp.status_code in (400, 401, 403) and has_fallback:
            last_error = CoinGeckoError(f"CoinGecko {resp.status_code} on {base}")
            continue

        if resp.status_code == 404:
            raise CoinGeckoError("Coin not found on CoinGecko. Use the correct id (e.g. 'bitcoin', not 'BTC').")
        if resp.status_code == 429:
            raise CoinGeckoError("CoinGecko rate limit hit (429). Wait ~1 minute, or set COINGECKO_API_KEY.")
        if resp.status_code in (401, 403):
            raise CoinGeckoError("CoinGecko rejected the API key (check COINGECKO_API_KEY / COINGECKO_PLAN).")
        if not resp.ok:
            raise CoinGeckoError(f"CoinGecko responded {resp.status_code}: {resp.text[:200]}")
        return resp

    raise last_error or CoinGeckoError("CoinGecko request failed.")


def _resample_daily(raw_prices: list) -> list:
    """Resample [[timestamp_ms, price], ...] to one point per day (day's close).

    Uses pure integer math on the millisecond timestamps, independent of pandas'
    datetime resolution. (pandas >= 2.0 uses ms-resolution datetimes, which broke
    the old datetime->int64 conversion and produced bogus 1970 dates — that in turn
    gave Prophet a garbage time axis and absurd forecasts.)
    """
    day_ms = 86_400_000  # one day in milliseconds
    df = pd.DataFrame(raw_prices, columns=["timestamp", "price"])
    df["day"] = (df["timestamp"].astype("int64") // day_ms) * day_ms  # floor to UTC day
    daily = df.groupby("day", as_index=False).last().sort_values("day")
    return [[int(t), float(p)] for t, p in zip(daily["day"], daily["price"])]


def get_price_history(symbol: str, days: int) -> dict:
    """Download `symbol`'s daily USD price history (cached for a short TTL).

    Returns {"symbol": str, "days": int, "prices": [[timestamp_ms, price], ...]}.
    Raises CoinGeckoError if the coin doesn't exist, on rate limit, or network failure.
    """
    symbol = _validate_symbol(symbol)
    cache_key = (symbol, int(days))
    now = time.time()
    cached = _price_cache.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    resp = _get(f"/coins/{symbol}/market_chart", {"vs_currency": "usd", "days": days})
    try:
        payload = resp.json()
    except ValueError as exc:
        raise CoinGeckoError("CoinGecko returned a non-JSON response.") from exc

    raw_prices = payload.get("prices") or []
    if not raw_prices:
        raise CoinGeckoError(f"CoinGecko returned no prices for '{symbol}'.")

    result = {"symbol": symbol, "days": days, "prices": _resample_daily(raw_prices)}
    _price_cache[cache_key] = (now, result)
    return result


def search_coins(query: str, limit: int = 15) -> list:
    """Search CoinGecko for coins matching `query` (ordered by market-cap rank)."""
    resp = _get("/search", {"query": query})
    try:
        coins = resp.json().get("coins", [])
    except ValueError as exc:
        raise CoinGeckoError("CoinGecko returned a non-JSON response.") from exc

    return [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "symbol": (c.get("symbol") or "").upper(),
            "rank": c.get("market_cap_rank"),
        }
        for c in coins[:limit]
        if c.get("id")
    ]
