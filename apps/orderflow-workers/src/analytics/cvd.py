"""
Cumulative Volume Delta (CVD) calculator.

Public API
----------
compute_delta(ticks)            → float
compute_cvd_series(ticks)       → List[dict]
compute_bar_delta(ticks, bar_s) → List[dict]

All heavy work is vectorised with NumPy so even large tick buffers (~millions
of rows) are processed in milliseconds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class Tick:
    ts: int    # Unix timestamp in milliseconds
    price: float
    size: float
    side: str  # 'buy' | 'sell' | 'unknown'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_arrays(
    ticks: List[Tick],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Convert a list of Ticks to four aligned NumPy arrays.

    Returns
    -------
    ts, prices, sizes, sides_sign
        sides_sign: +1 for buy, -1 for sell, 0 for unknown.
    """
    if not ticks:
        empty = np.array([], dtype=np.float64)
        return (
            np.array([], dtype=np.int64),
            empty,
            empty,
            empty,
        )

    n = len(ticks)
    ts = np.empty(n, dtype=np.int64)
    prices = np.empty(n, dtype=np.float64)
    sizes = np.empty(n, dtype=np.float64)
    sides_sign = np.empty(n, dtype=np.float64)

    for i, t in enumerate(ticks):
        ts[i] = t.ts
        prices[i] = t.price
        sizes[i] = t.size
        if t.side == "buy":
            sides_sign[i] = 1.0
        elif t.side == "sell":
            sides_sign[i] = -1.0
        else:
            sides_sign[i] = 0.0

    return ts, prices, sizes, sides_sign


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------
def compute_delta(ticks: List[Tick]) -> float:
    """
    Net delta for a list of ticks.

    Returns
    -------
    float
        ``sum(buy_volume) - sum(sell_volume)``.  Unknown-side trades
        contribute 0.
    """
    if not ticks:
        return 0.0
    _, _, sizes, signs = _to_arrays(ticks)
    signed_vol: np.ndarray = sizes * signs
    return float(signed_vol.sum())


def compute_cvd_series(ticks: List[Tick]) -> List[dict]:
    """
    Tick-by-tick CVD series.

    Returns
    -------
    list of dict with keys:
        ts    — Unix ms of the tick
        delta — signed volume contribution of *this* tick
        cvd   — cumulative signed volume up to and including this tick
    """
    if not ticks:
        return []

    ts_arr, _, sizes, signs = _to_arrays(ticks)
    deltas: np.ndarray = sizes * signs
    cvd: np.ndarray = np.cumsum(deltas)

    return [
        {
            "ts": int(ts_arr[i]),
            "delta": float(deltas[i]),
            "cvd": float(cvd[i]),
        }
        for i in range(len(ticks))
    ]


def compute_bar_delta(ticks: List[Tick], bar_seconds: int = 60) -> List[dict]:
    """
    Aggregate ticks into time bars with OHLCV and delta/CVD fields.

    Parameters
    ----------
    ticks:
        Chronologically ordered trade ticks.
    bar_seconds:
        Bar duration in seconds (default: 60 → 1-minute bars).

    Returns
    -------
    list of dict with keys:
        ts_open      — Unix ms of bar open (left edge, inclusive)
        ts_close     — Unix ms of bar close (right edge, exclusive)
        open, high, low, close  — OHLC prices
        volume       — total traded volume
        buy_volume   — aggressor-buy volume
        sell_volume  — aggressor-sell volume
        delta        — buy_volume − sell_volume for this bar
        cvd          — cumulative CVD at bar close (running total across bars)
    """
    if not ticks:
        return []

    bar_ms = bar_seconds * 1_000
    ts_arr, prices, sizes, signs = _to_arrays(ticks)

    # Assign each tick to a bar bucket (floor division).
    buckets: np.ndarray = (ts_arr // bar_ms) * bar_ms  # left edge in ms

    unique_buckets: np.ndarray = np.unique(buckets)
    bars: list[dict] = []
    running_cvd = 0.0

    for bucket in unique_buckets:
        mask: np.ndarray = buckets == bucket
        bar_prices = prices[mask]
        bar_sizes = sizes[mask]
        bar_signs = signs[mask]

        buy_mask = bar_signs > 0
        sell_mask = bar_signs < 0

        buy_vol = float(bar_sizes[buy_mask].sum())
        sell_vol = float(bar_sizes[sell_mask].sum())
        delta = buy_vol - sell_vol
        running_cvd += delta

        bar = {
            "ts_open": int(bucket),
            "ts_close": int(bucket + bar_ms),
            "open": float(bar_prices[0]),
            "high": float(bar_prices.max()),
            "low": float(bar_prices.min()),
            "close": float(bar_prices[-1]),
            "volume": float(bar_sizes.sum()),
            "buy_volume": buy_vol,
            "sell_volume": sell_vol,
            "delta": delta,
            "cvd": running_cvd,
        }
        bars.append(bar)

    return bars
