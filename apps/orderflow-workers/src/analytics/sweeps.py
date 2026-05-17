"""
Sweep and large-print detector.

A *sweep* is a burst of same-side aggressor trades that, within a short time
window (``window_ms``), collectively exceed a notional threshold
(``min_notional_usd``) and span at least ``min_trades`` individual prints.

A *large print* is a single trade whose notional value exceeds a threshold.

Public API
----------
detect_sweeps(ticks, ...)        → List[SweepEvent]
detect_large_prints(ticks, ...)  → List[dict]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .cvd import Tick


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class SweepEvent:
    instrument: str
    exchange: str
    ts: int             # timestamp of the first trade in the sweep (Unix ms)
    side: str           # 'buy' | 'sell'
    notional_usd: float
    price_start: float  # price of the first trade in the sweep
    price_end: float    # price of the last trade in the sweep
    levels_consumed: int
    trade_count: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _notional(tick: Tick) -> float:
    """Approximate USD notional for a tick (price × size)."""
    return tick.price * tick.size


def _count_price_levels(ticks: List[Tick]) -> int:
    """Count distinct price levels touched by a group of ticks."""
    return len({t.price for t in ticks})


def _try_build_sweep(
    window: List[Tick],
    instrument: str,
    exchange: str,
    min_notional_usd: float,
    min_trades: int,
) -> Optional[SweepEvent]:
    """
    Attempt to build a SweepEvent from a candidate same-side window.

    Returns ``None`` if the window does not meet the threshold criteria.
    """
    if len(window) < min_trades:
        return None

    total_notional = sum(_notional(t) for t in window)
    if total_notional < min_notional_usd:
        return None

    levels = _count_price_levels(window)
    # A sweep must cross at least 2 distinct price levels to distinguish it from
    # a single resting block that was partially filled at one price.
    if levels < 2:
        return None

    side = window[0].side
    return SweepEvent(
        instrument=instrument,
        exchange=exchange,
        ts=window[0].ts,
        side=side,
        notional_usd=total_notional,
        price_start=window[0].price,
        price_end=window[-1].price,
        levels_consumed=levels,
        trade_count=len(window),
    )


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------
def detect_sweeps(
    ticks: List[Tick],
    instrument: str,
    exchange: str,
    min_notional_usd: float = 100_000,
    window_ms: int = 500,
    min_trades: int = 3,
) -> List[SweepEvent]:
    """
    Detect sweep events in a tick stream.

    A sweep is defined as a sequence of same-side (buy or sell) trades that:
    - All fall within a rolling ``window_ms``-millisecond window,
    - Collectively exceed ``min_notional_usd`` notional value,
    - Span at least ``min_trades`` individual prints,
    - Touch at least 2 distinct price levels.

    The algorithm uses a sliding-window approach:

    1. Iterate through ticks in chronological order.
    2. Maintain a running window of same-side ticks whose timestamps span
       at most ``window_ms`` milliseconds.
    3. When the side changes or the window expires, attempt to materialise
       the buffered window as a SweepEvent.
    4. After a sweep is recorded, the window is reset (no double-counting).

    Parameters
    ----------
    ticks:
        Chronologically sorted trade ticks.
    instrument:
        Normalised instrument string (e.g. ``'BTCUSDT'``).
    exchange:
        Exchange identifier (e.g. ``'binance'``).
    min_notional_usd:
        Minimum aggregate USD notional for a burst to qualify as a sweep.
    window_ms:
        Maximum time span in milliseconds for same-side trades to be grouped.
    min_trades:
        Minimum number of individual trades in the burst.

    Returns
    -------
    List[SweepEvent]
        Detected sweep events, in chronological order.
    """
    if not ticks:
        return []

    sweeps: list[SweepEvent] = []
    window: list[Tick] = []
    current_side: str = ""

    for tick in ticks:
        # Skip unknown-side ticks — they cannot be attributed to a direction.
        if tick.side not in ("buy", "sell"):
            # Flush current window before the gap.
            if window:
                ev = _try_build_sweep(window, instrument, exchange, min_notional_usd, min_trades)
                if ev is not None:
                    sweeps.append(ev)
                window = []
                current_side = ""
            continue

        side_changed = tick.side != current_side
        window_expired = bool(window) and (tick.ts - window[0].ts) > window_ms

        if side_changed or window_expired:
            # Try to materialise whatever was buffered.
            if window:
                ev = _try_build_sweep(window, instrument, exchange, min_notional_usd, min_trades)
                if ev is not None:
                    sweeps.append(ev)
            # Start a fresh window with the current tick.
            window = [tick]
            current_side = tick.side
        else:
            window.append(tick)

    # Don't forget the trailing window.
    if window:
        ev = _try_build_sweep(window, instrument, exchange, min_notional_usd, min_trades)
        if ev is not None:
            sweeps.append(ev)

    return sweeps


def detect_large_prints(
    ticks: List[Tick],
    instrument: str,
    exchange: str,
    min_notional_usd: float = 500_000,
) -> List[dict]:
    """
    Identify single trades whose USD notional exceeds *min_notional_usd*.

    Parameters
    ----------
    ticks:
        Trade ticks to scan.
    instrument:
        Normalised instrument string (e.g. ``'BTCUSDT'``).
    exchange:
        Exchange identifier (e.g. ``'binance'``).
    min_notional_usd:
        Minimum single-trade USD notional threshold.

    Returns
    -------
    List[dict]
        Each dict has keys:
        ``instrument``, ``exchange``, ``ts``, ``side``,
        ``price``, ``size``, ``notional_usd``.
        Sorted chronologically.
    """
    result: list[dict] = []
    for tick in ticks:
        notional = _notional(tick)
        if notional >= min_notional_usd:
            result.append(
                {
                    "instrument": instrument,
                    "exchange": exchange,
                    "ts": tick.ts,
                    "side": tick.side,
                    "price": tick.price,
                    "size": tick.size,
                    "notional_usd": notional,
                }
            )
    return result
