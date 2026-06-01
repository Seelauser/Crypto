"""
Delta divergence detector.

A divergence occurs when price and CVD (Cumulative Volume Delta) move in
opposite directions — a leading indicator of potential reversals.

Bearish divergence: price makes a new higher-high, but CVD makes a lower-high.
    → Hidden sellers are distributing into the price rally.
    → The buying power driving the new high is weakening.

Bullish divergence: price makes a new lower-low, but CVD makes a higher-low.
    → Hidden buyers are absorbing the price decline.
    → Sellers are running out of conviction.

Public API
----------
detect_divergences(bars, lookback, threshold)  → List[DivergenceEvent]
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import groupby
from typing import List

import numpy as np


@dataclass
class DivergenceEvent:
    instrument: str
    ts: int                    # Unix ms — timestamp of the confirming bar
    kind: str                  # 'bearish' | 'bullish'
    price_extreme: float       # the new price high or low
    cvd_at_extreme: float      # CVD value at that same bar
    prior_price_extreme: float # the reference high/low from lookback
    prior_cvd_extreme: float   # CVD at the reference bar
    divergence_strength: float # normalised 0-1; higher = clearer divergence
    bars_span: int             # how many bars the divergence spans


def detect_divergences(
    bars: List[dict],
    instrument: str,
    lookback: int = 20,
    min_price_move_pct: float = 0.3,
    min_cvd_divergence_pct: float = 0.2,
) -> List[DivergenceEvent]:
    """
    Detect bearish and bullish delta divergences in a bar series.

    Parameters
    ----------
    bars:
        List of bar dicts with keys: ts_open, close, high, low, cvd.
        Must be chronologically ordered. Produced by cvd.compute_bar_delta().
    instrument:
        Instrument identifier (e.g. 'BTCUSDT').
    lookback:
        How many bars back to search for the reference swing point.
    min_price_move_pct:
        Minimum % price move required to call it a new high/low.
        Prevents noise from tiny fluctuations.
    min_cvd_divergence_pct:
        Minimum % divergence between price direction and CVD direction
        required to qualify as a divergence event.

    Returns
    -------
    List[DivergenceEvent]
        Detected divergences, most recent last.
    """
    if len(bars) < lookback + 2:
        return []

    highs  = np.array([b['high']  for b in bars], dtype=np.float64)
    lows   = np.array([b['low']   for b in bars], dtype=np.float64)
    closes = np.array([b['close'] for b in bars], dtype=np.float64)
    cvds   = np.array([b['cvd']   for b in bars], dtype=np.float64)
    times  = np.array([b['ts_open'] for b in bars], dtype=np.int64)

    events: list[DivergenceEvent] = []

    for i in range(lookback, len(bars)):
        window_start = i - lookback
        window = slice(window_start, i)

        # Shared: CVD range for this window (used by both bearish and bullish checks)
        cvd_range = float(np.abs(cvds[window_start:i + 1]).max()) + 1e-10

        # ── Bearish divergence ────────────────────────────────────────────────
        # Current bar makes a higher high vs any bar in the lookback window,
        # but CVD at the current bar is lower than CVD at that prior high.
        prior_high_idx = window_start + int(np.argmax(highs[window]))
        prior_high     = highs[prior_high_idx]
        current_high   = highs[i]

        price_up_pct  = (current_high - prior_high) / (prior_high + 1e-10) * 100
        cvd_move      = cvds[i] - cvds[prior_high_idx]
        cvd_move_pct  = abs(cvd_move) / cvd_range * 100

        if (
            price_up_pct >= min_price_move_pct
            and cvd_move < 0
            and cvd_move_pct >= min_cvd_divergence_pct
        ):
            events.append(DivergenceEvent(
                instrument=instrument,
                ts=int(times[i]),
                kind='bearish',
                price_extreme=float(current_high),
                cvd_at_extreme=float(cvds[i]),
                prior_price_extreme=float(prior_high),
                prior_cvd_extreme=float(cvds[prior_high_idx]),
                divergence_strength=min(1.0, cvd_move_pct / 50.0),
                bars_span=i - prior_high_idx,
            ))

        # ── Bullish divergence ────────────────────────────────────────────────
        # Current bar makes a lower low vs lookback window,
        # but CVD at the current bar is higher than CVD at that prior low.
        prior_low_idx  = window_start + int(np.argmin(lows[window]))
        prior_low      = lows[prior_low_idx]
        current_low    = lows[i]

        price_down_pct   = (prior_low - current_low) / (prior_low + 1e-10) * 100
        cvd_move_bull    = cvds[i] - cvds[prior_low_idx]
        cvd_move_bull_pct = abs(cvd_move_bull) / cvd_range * 100

        if (
            price_down_pct >= min_price_move_pct
            and cvd_move_bull > 0
            and cvd_move_bull_pct >= min_cvd_divergence_pct
        ):
            events.append(DivergenceEvent(
                instrument=instrument,
                ts=int(times[i]),
                kind='bullish',
                price_extreme=float(current_low),
                cvd_at_extreme=float(cvds[i]),
                prior_price_extreme=float(prior_low),
                prior_cvd_extreme=float(cvds[prior_low_idx]),
                divergence_strength=min(1.0, cvd_move_bull_pct / 50.0),
                bars_span=i - prior_low_idx,
            ))

    # Deduplicate: keep only the strongest divergence within any 5-bar window,
    # separately for bearish and bullish kinds.
    if not events:
        return events

    bar_ms = bars[1]['ts_open'] - bars[0]['ts_open'] if len(bars) > 1 else 60_000
    cluster_window_ms = 5 * bar_ms

    def _bucket(e: DivergenceEvent) -> tuple[int, str]:
        return (e.ts // cluster_window_ms, e.kind)

    events.sort(key=_bucket)
    return [
        max(grp, key=lambda e: e.divergence_strength)
        for _, grp in groupby(events, key=_bucket)
    ]
