"""
Volume profile calculator.

Identifies VPOC (Volume Point of Control), VAH (Value Area High), and
VAL (Value Area Low) from a session's tick or bar data.

Public API
----------
compute_volume_profile(ticks_or_bars, tick_size, value_area_pct)
    -> VolumeProfileResult

compute_session_profile(bars, tick_size)
    -> VolumeProfileResult   (convenience wrapper for OHLCV bars)

Algorithm
---------
1. Round each price to the nearest *tick_size* bucket.
2. Aggregate buy_vol and sell_vol per bucket.
3. VPOC = bucket with the highest total volume.
4. Value Area: starting from VPOC, expand upward and downward one level at a
   time (always taking the side with the higher volume next) until the
   accumulated volume reaches ``value_area_pct`` of total session volume.
5. VAH = highest price included in the value area.
6. VAL = lowest price included in the value area.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class VolumeProfileResult:
    vpoc: float                   # Volume Point of Control (price of max volume)
    vah: float                    # Value Area High (70 % of session volume above)
    val: float                    # Value Area Low
    levels: List[dict]            # sorted by price desc; one dict per bucket
    naked_vpoc: bool = False      # True if current price has not crossed VPOC


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------
def compute_volume_profile(
    ticks_or_bars: List[dict],
    tick_size: float = 1.0,
    value_area_pct: float = 0.70,
) -> VolumeProfileResult:
    """
    Build a volume profile from a list of tick or bar dicts.

    Accepted dict formats
    ---------------------
    Tick format (true aggressor data):
        { 'price': float, 'buy_vol': float, 'sell_vol': float }
        or { 'price': float, 'size': float, 'side': 'buy'|'sell'|'unknown' }

    Bar format (OHLCV with inferred buy/sell):
        { 'close': float, 'buy_volume': float, 'sell_volume': float }
        or { 'close': float, 'volume': float, 'delta': float }

    Parameters
    ----------
    ticks_or_bars:
        List of dicts (ticks or bars).
    tick_size:
        Price bucket width. Prices are rounded to the nearest multiple.
    value_area_pct:
        Fraction of total volume that defines the value area (default: 0.70).

    Returns
    -------
    VolumeProfileResult
    """
    if not ticks_or_bars:
        return VolumeProfileResult(vpoc=0.0, vah=0.0, val=0.0, levels=[])

    # Accumulate buy and sell volume per rounded price bucket.
    buy_map: Dict[float, float] = {}
    sell_map: Dict[float, float] = {}

    for item in ticks_or_bars:
        price, buy_vol, sell_vol = _extract_price_and_volumes(item)
        if price <= 0.0:
            continue
        bucket = _round_to_tick(price, tick_size)
        buy_map[bucket] = buy_map.get(bucket, 0.0) + buy_vol
        sell_map[bucket] = sell_map.get(bucket, 0.0) + sell_vol

    if not buy_map and not sell_map:
        return VolumeProfileResult(vpoc=0.0, vah=0.0, val=0.0, levels=[])

    all_prices = sorted(buy_map.keys() | sell_map.keys())

    # Build per-level totals.
    level_data: List[Tuple[float, float, float, float]] = []
    total_volume = 0.0
    for price in all_prices:
        bv = buy_map.get(price, 0.0)
        sv = sell_map.get(price, 0.0)
        tv = bv + sv
        total_volume += tv
        level_data.append((price, bv, sv, tv))

    if total_volume == 0.0:
        return VolumeProfileResult(vpoc=0.0, vah=0.0, val=0.0, levels=[])

    # VPOC: level with the maximum total volume.
    vpoc_idx = int(np.argmax([ld[3] for ld in level_data]))
    vpoc_price = level_data[vpoc_idx][0]

    # Value Area: expand from VPOC.
    vah_price, val_price = _compute_value_area(
        level_data, vpoc_idx, total_volume, value_area_pct
    )

    # Build output levels list (sorted price descending).
    levels: List[dict] = []
    for price, bv, sv, tv in reversed(level_data):
        delta = bv - sv
        levels.append(
            {
                "price": price,
                "buy_vol": round(bv, 6),
                "sell_vol": round(sv, 6),
                "total_vol": round(tv, 6),
                "delta": round(delta, 6),
                "is_vpoc": price == vpoc_price,
                "is_vah": price == vah_price,
                "is_val": price == val_price,
            }
        )

    return VolumeProfileResult(
        vpoc=vpoc_price,
        vah=vah_price,
        val=val_price,
        levels=levels,
        naked_vpoc=False,
    )


def compute_session_profile(
    bars: List[dict],
    tick_size: float = 1.0,
) -> VolumeProfileResult:
    """
    Convenience function: compute a volume profile from a list of OHLCV bar dicts.

    Each bar's volume is distributed between buy and sell using the delta field
    (or inferred via Price-Position if only OHLCV is available).

    Parameters
    ----------
    bars:
        List of OHLCV bar dicts.  Expected keys: ``open``, ``high``, ``low``,
        ``close``, ``volume``.  Optional: ``buy_volume``, ``sell_volume``,
        ``delta``.
    tick_size:
        Price bucket width.

    Returns
    -------
    VolumeProfileResult
    """
    normalised: List[dict] = []
    for bar in bars:
        close = float(bar.get("close", 0.0))
        if close <= 0.0:
            continue
        volume = float(bar.get("volume", 0.0))

        # Try explicit buy/sell volumes first.
        if "buy_volume" in bar and "sell_volume" in bar:
            buy_vol = float(bar["buy_volume"])
            sell_vol = float(bar["sell_volume"])
        elif "delta" in bar:
            delta = float(bar["delta"])
            buy_vol = (volume + delta) / 2.0
            sell_vol = (volume - delta) / 2.0
        else:
            # Price-Position fallback.
            open_ = float(bar.get("open", close))
            high = float(bar.get("high", close))
            low = float(bar.get("low", close))
            buy_vol, sell_vol = _price_position_split(open_, high, low, close, volume)

        normalised.append({"price": close, "buy_vol": max(buy_vol, 0.0), "sell_vol": max(sell_vol, 0.0)})

    return compute_volume_profile(normalised, tick_size=tick_size)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _round_to_tick(price: float, tick_size: float) -> float:
    """Round *price* to the nearest *tick_size* multiple."""
    if tick_size <= 0.0:
        return price
    return round(round(price / tick_size) * tick_size, 10)


def _extract_price_and_volumes(item: dict) -> Tuple[float, float, float]:
    """
    Extract (price, buy_vol, sell_vol) from an item dict.

    Tries tick format first (``price``, ``buy_vol``/``sell_vol`` or ``size``/``side``),
    then bar format (``close``, ``buy_volume``/``sell_volume`` or ``delta``).
    """
    # --- Tick format ---
    if "price" in item:
        price = float(item["price"])
        if "buy_vol" in item or "sell_vol" in item:
            return price, float(item.get("buy_vol", 0.0)), float(item.get("sell_vol", 0.0))
        size = float(item.get("size", 0.0))
        side = item.get("side", "unknown")
        if side == "buy":
            return price, size, 0.0
        if side == "sell":
            return price, 0.0, size
        # Unknown side: split 50/50.
        return price, size / 2.0, size / 2.0

    # --- Bar format ---
    close = float(item.get("close", 0.0))
    volume = float(item.get("volume", 0.0))
    if "buy_volume" in item or "sell_volume" in item:
        return close, float(item.get("buy_volume", 0.0)), float(item.get("sell_volume", 0.0))
    if "delta" in item:
        delta = float(item["delta"])
        buy_vol = (volume + delta) / 2.0
        sell_vol = (volume - delta) / 2.0
        return close, max(buy_vol, 0.0), max(sell_vol, 0.0)

    # Last resort: use OHLCV Price-Position.
    open_ = float(item.get("open", close))
    high = float(item.get("high", close))
    low = float(item.get("low", close))
    buy_vol, sell_vol = _price_position_split(open_, high, low, close, volume)
    return close, buy_vol, sell_vol


def _price_position_split(
    open_: float, high: float, low: float, close: float, volume: float
) -> Tuple[float, float]:
    """Price-Position approximation: returns (buy_vol, sell_vol)."""
    range_ = high - low + 1e-8
    if close >= open_:
        buy_vol = volume * (close - low) / range_
        sell_vol = volume - buy_vol
    else:
        sell_vol = volume * (high - close) / range_
        buy_vol = volume - sell_vol
    return max(buy_vol, 0.0), max(sell_vol, 0.0)


def _compute_value_area(
    level_data: List[Tuple[float, float, float, float]],
    vpoc_idx: int,
    total_volume: float,
    value_area_pct: float,
) -> Tuple[float, float]:
    """
    Expand outward from VPOC to capture *value_area_pct* of total volume.

    Parameters
    ----------
    level_data:
        Sorted list of (price, buy_vol, sell_vol, total_vol) tuples.
    vpoc_idx:
        Index of the VPOC within *level_data*.
    total_volume:
        Sum of all total_vols.
    value_area_pct:
        Target fraction (e.g. 0.70).

    Returns
    -------
    (vah_price, val_price)
    """
    target = total_volume * value_area_pct
    accumulated = level_data[vpoc_idx][3]

    lo_idx = vpoc_idx
    hi_idx = vpoc_idx

    while accumulated < target:
        can_go_up = hi_idx + 1 < len(level_data)
        can_go_down = lo_idx - 1 >= 0

        if not can_go_up and not can_go_down:
            break

        next_up_vol = level_data[hi_idx + 1][3] if can_go_up else -1.0
        next_dn_vol = level_data[lo_idx - 1][3] if can_go_down else -1.0

        if next_up_vol >= next_dn_vol:
            hi_idx += 1
            accumulated += level_data[hi_idx][3]
        else:
            lo_idx -= 1
            accumulated += level_data[lo_idx][3]

    return level_data[hi_idx][0], level_data[lo_idx][0]
