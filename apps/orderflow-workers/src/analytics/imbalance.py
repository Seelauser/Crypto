"""
Bid/ask imbalance calculator.

Public API
----------
compute_top_n_imbalance(bids, asks, n)   → Tuple[float, float, float, str]
compute_level_imbalances(bids, asks)     → List[dict]

Design notes
------------
* Imbalance ratio is always >= 1.0 — the numerator is always the *larger* side.
* ``dominant_side`` is ``'buy'`` when bids dominate, ``'sell'`` when asks do.
* Per-level highlight thresholds follow common footprint-chart conventions:
    - ``'3x'``  when one side is >= 3× the other
    - ``'10x'`` when one side is >= 10× the other (takes precedence)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------
@dataclass
class OrderBookLevel:
    price: float
    size: float


@dataclass
class ImbalanceResult:
    instrument: str
    ts: int
    bid_volume: float
    ask_volume: float
    imbalance_ratio: float  # always >= 1.0
    dominant_side: str      # 'buy' | 'sell'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _levels_to_arrays(levels: List[OrderBookLevel]) -> tuple[np.ndarray, np.ndarray]:
    """Convert a list of OrderBookLevels to (prices, sizes) NumPy arrays."""
    if not levels:
        return np.array([], dtype=np.float64), np.array([], dtype=np.float64)
    n = len(levels)
    prices = np.empty(n, dtype=np.float64)
    sizes = np.empty(n, dtype=np.float64)
    for i, lvl in enumerate(levels):
        prices[i] = lvl.price
        sizes[i] = lvl.size
    return prices, sizes


def _safe_ratio(larger: float, smaller: float) -> float:
    """Return larger/smaller, guarding against division by zero."""
    if smaller == 0.0:
        return float("inf") if larger > 0 else 1.0
    return larger / smaller


def _dominant(bid_vol: float, ask_vol: float) -> tuple[float, str]:
    """Return (ratio >= 1.0, dominant_side)."""
    if bid_vol >= ask_vol:
        return _safe_ratio(bid_vol, ask_vol), "buy"
    return _safe_ratio(ask_vol, bid_vol), "sell"


def _highlight_label(bid_size: float, ask_size: float) -> Optional[str]:
    """Classify a price level for footprint highlight rendering."""
    if bid_size == 0.0 and ask_size == 0.0:
        return None
    larger = max(bid_size, ask_size)
    smaller = min(bid_size, ask_size)
    ratio = _safe_ratio(larger, smaller)
    if ratio >= 10.0:
        return "10x"
    if ratio >= 3.0:
        return "3x"
    return None


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------
def compute_top_n_imbalance(
    bids: List[OrderBookLevel],
    asks: List[OrderBookLevel],
    n: int = 10,
) -> Tuple[float, float, float, str]:
    """
    Aggregate imbalance across the top *n* price levels on each side.

    Parameters
    ----------
    bids:
        Bid levels, sorted best (highest) first.
    asks:
        Ask levels, sorted best (lowest) first.
    n:
        Number of levels to consider on each side.

    Returns
    -------
    (bid_vol, ask_vol, ratio, dominant_side)
        ``ratio`` is always >= 1.0.
        ``dominant_side`` is ``'buy'`` or ``'sell'``.
    """
    _, bid_sizes = _levels_to_arrays(bids[:n])
    _, ask_sizes = _levels_to_arrays(asks[:n])

    bid_vol = float(bid_sizes.sum()) if bid_sizes.size > 0 else 0.0
    ask_vol = float(ask_sizes.sum()) if ask_sizes.size > 0 else 0.0

    ratio, side = _dominant(bid_vol, ask_vol)
    return bid_vol, ask_vol, ratio, side


def compute_level_imbalances(
    bids: List[OrderBookLevel],
    asks: List[OrderBookLevel],
) -> List[dict]:
    """
    Per-price-level imbalance for footprint-chart rendering.

    The function matches bid and ask levels by price.  Levels that exist on
    only one side are included with a zero for the missing side.

    Returns
    -------
    list of dict
        Keys: ``price``, ``bid_vol``, ``ask_vol``, ``ratio``, ``dominant_side``,
        ``highlight`` (``None`` | ``'3x'`` | ``'10x'``).
        Sorted by price descending (highest price first).
    """
    # Build price → size maps.
    bid_map: dict[float, float] = {lvl.price: lvl.size for lvl in bids}
    ask_map: dict[float, float] = {lvl.price: lvl.size for lvl in asks}

    all_prices = sorted(bid_map.keys() | ask_map.keys(), reverse=True)

    result: list[dict] = []
    for price in all_prices:
        bid_size = bid_map.get(price, 0.0)
        ask_size = ask_map.get(price, 0.0)
        ratio, dom_side = _dominant(bid_size, ask_size)
        result.append(
            {
                "price": price,
                "bid_vol": bid_size,
                "ask_vol": ask_size,
                "ratio": ratio,
                "dominant_side": dom_side,
                "highlight": _highlight_label(bid_size, ask_size),
            }
        )
    return result


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------
def make_imbalance_result(
    bids: List[OrderBookLevel],
    asks: List[OrderBookLevel],
    instrument: str,
    ts: int,
    n: int = 10,
) -> ImbalanceResult:
    """
    Build a full :class:`ImbalanceResult` from an order-book snapshot.

    Parameters
    ----------
    bids, asks:
        Order-book levels (best first).
    instrument:
        Normalised instrument identifier, e.g. ``'BTCUSDT'``.
    ts:
        Event timestamp in Unix milliseconds.
    n:
        Top-N levels used for aggregation.
    """
    bid_vol, ask_vol, ratio, side = compute_top_n_imbalance(bids, asks, n)
    return ImbalanceResult(
        instrument=instrument,
        ts=ts,
        bid_volume=bid_vol,
        ask_volume=ask_vol,
        imbalance_ratio=ratio,
        dominant_side=side,
    )
