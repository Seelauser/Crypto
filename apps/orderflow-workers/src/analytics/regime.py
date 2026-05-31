"""
Hidden Markov Model-based market regime detector.

Uses a 3-state Gaussian HMM fitted on rolling windows of order-flow features
to classify the current market into one of five labelled regimes.

Feature vector (per bar)
------------------------
    [returns, log_volume_ratio, cvd_velocity, imbalance_ratio]

    returns          — log return: log(close[t] / close[t-1])
    log_volume_ratio — log(volume[t] / rolling_mean_volume + 1e-8)
    cvd_velocity     — first difference of CVD (delta of delta)
    imbalance_ratio  — buy_volume / (sell_volume + 1e-8)  (sign-preserving ratio)

Regime labelling
----------------
States are post-hoc labelled by inspecting the fitted HMM's state means:

    trending_up    — high positive returns mean + positive cvd_velocity
    trending_down  — high negative returns mean + negative cvd_velocity
    accumulating   — near-zero returns + strongly positive cvd_velocity
    distributing   — near-zero returns + strongly negative cvd_velocity
    mean_reverting — low returns variance + low cvd_velocity magnitude

The 3-state HMM is kept small deliberately; the fifth label (mean_reverting)
is assigned to whichever state does not clearly map to the first four.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
from hmmlearn.hmm import GaussianHMM

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REGIME_LABELS = frozenset(
    {"trending_up", "trending_down", "mean_reverting", "distributing", "accumulating"}
)

# Minimum number of bars required to fit or predict.
MIN_BARS_FIT = 30
MIN_BARS_PREDICT = 5

# Feature indices
_IDX_RETURNS = 0
_IDX_LOG_VOL = 1
_IDX_CVD_VEL = 2
_IDX_IMBAL = 3


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class RegimeState:
    instrument: str
    ts: int
    regime: str   # one of REGIME_LABELS
    confidence: float   # posterior probability of the predicted state, 0-1
    prev_regime: Optional[str] = None


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------
class RegimeDetector:
    """
    Fits a Gaussian HMM on rolling windows of order-flow features and
    predicts the current market regime.

    Parameters
    ----------
    n_components:
        Number of HMM hidden states (default: 3).
    lookback:
        Maximum number of recent bars used for fitting / prediction.
    """

    def __init__(self, n_components: int = 3, lookback: int = 100) -> None:
        self.n_components = n_components
        self.lookback = lookback
        self.model = GaussianHMM(
            n_components=n_components,
            covariance_type="diag",
            n_iter=100,
            random_state=42,
        )
        self._fitted = False
        self._state_labels: Dict[int, str] = {}

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def fit(self, bars: List[dict]) -> bool:
        """
        Fit the HMM on a list of bar dicts.

        Parameters
        ----------
        bars:
            List of dicts with at minimum the keys:
            ``close``, ``volume``, ``delta``, ``cvd``.
            Optionally ``buy_volume`` / ``sell_volume`` for imbalance.

        Returns
        -------
        bool
            ``True`` if fitting succeeded, ``False`` otherwise.
        """
        if len(bars) < MIN_BARS_FIT:
            logger.warning(
                "RegimeDetector.fit: need >= %d bars, got %d", MIN_BARS_FIT, len(bars)
            )
            return False

        window = bars[-self.lookback :]
        try:
            X = self._extract_features(window)
            if X.shape[0] < MIN_BARS_FIT:
                return False
            self.model.fit(X)
            self._fitted = True
            self._state_labels = self._label_states(self.model.means_)
            logger.info(
                "RegimeDetector fitted on %d bars; state labels: %s",
                X.shape[0],
                self._state_labels,
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("RegimeDetector.fit failed: %s", exc)
            self._fitted = False
            return False

    def predict(self, bars: List[dict]) -> Optional[RegimeState]:
        """
        Predict the current regime given recent bars.

        Parameters
        ----------
        bars:
            Recent bar dicts (same format as :meth:`fit`).
            Uses the last ``lookback`` bars.

        Returns
        -------
        RegimeState or None
            ``None`` if the model has not been fitted yet or bars are insufficient.
        """
        if not self._fitted:
            logger.debug("RegimeDetector.predict called before fit.")
            return None

        if len(bars) < MIN_BARS_PREDICT:
            return None

        window = bars[-self.lookback :]
        try:
            X = self._extract_features(window)
            if X.shape[0] < 1:
                return None

            # Viterbi state sequence.
            state_seq = self.model.predict(X)
            current_state = int(state_seq[-1])

            # Posterior probabilities for confidence.
            log_posteriors = self.model.predict_proba(X)
            confidence = float(log_posteriors[-1, current_state])

            regime = self._state_labels.get(current_state, "mean_reverting")

            # Previous regime (second-to-last state if available).
            prev_regime: Optional[str] = None
            if len(state_seq) >= 2:
                prev_state = int(state_seq[-2])
                prev_regime = self._state_labels.get(prev_state, "mean_reverting")

            last_bar = window[-1]
            ts = int(last_bar.get("ts", last_bar.get("ts_open", 0)))
            instrument = str(last_bar.get("instrument", ""))

            return RegimeState(
                instrument=instrument,
                ts=ts,
                regime=regime,
                confidence=confidence,
                prev_regime=prev_regime,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("RegimeDetector.predict failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Internal — feature extraction
    # ------------------------------------------------------------------

    def _extract_features(self, bars: List[dict]) -> np.ndarray:
        """
        Build a (T, 4) feature matrix from *bars*.

        Features
        --------
        0 returns          log(close[t] / close[t-1])
        1 log_volume_ratio log(vol[t] / rolling_mean_vol + 1e-8)
        2 cvd_velocity     cvd[t] - cvd[t-1]
        3 imbalance_ratio  buy_vol / (sell_vol + 1e-8), clipped to [-5, 5]
        """
        n = len(bars)
        if n < 2:
            return np.empty((0, 4), dtype=np.float64)

        closes = np.array([float(b.get("close", 0.0)) for b in bars], dtype=np.float64)
        volumes = np.array([float(b.get("volume", 1.0)) for b in bars], dtype=np.float64)
        cvds = np.array([float(b.get("cvd", 0.0)) for b in bars], dtype=np.float64)
        buy_vols = np.array(
            [float(b.get("buy_volume", b.get("delta", 0.0))) for b in bars],
            dtype=np.float64,
        )
        sell_vols = np.array(
            [float(b.get("sell_volume", 0.0)) for b in bars],
            dtype=np.float64,
        )

        # Returns (skip index 0 — no prior bar).
        safe_closes = np.where(closes == 0.0, 1e-10, closes)
        returns = np.log(safe_closes[1:] / safe_closes[:-1])

        # Log volume ratio.
        mean_vol = volumes.mean() + 1e-8
        log_vol_ratio = np.log(volumes[1:] / mean_vol + 1e-8)

        # CVD velocity.
        cvd_velocity = np.diff(cvds)

        # Imbalance ratio (sign-preserving, clipped).
        imbalance = buy_vols[1:] / (sell_vols[1:] + 1e-8)
        imbalance = np.clip(imbalance, -5.0, 5.0)

        # Stack into (T-1, 4).
        X = np.column_stack([returns, log_vol_ratio, cvd_velocity, imbalance])

        # Replace any NaN / inf with 0.
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        return X

    # ------------------------------------------------------------------
    # Internal — regime labelling
    # ------------------------------------------------------------------

    def _label_states(self, means: np.ndarray) -> Dict[int, str]:
        """
        Map HMM state indices to regime labels based on feature means.

        Heuristic
        ---------
        - Strongest positive return mean + positive cvd_velocity  -> trending_up
        - Strongest negative return mean + negative cvd_velocity  -> trending_down
        - Near-zero return + strongly positive cvd_velocity       -> accumulating
        - Near-zero return + strongly negative cvd_velocity       -> distributing
        - Residual state                                          -> mean_reverting

        With only 3 states the last two labels are collapsed into whichever
        state remains after assigning trending_up and trending_down.
        """
        n_states = means.shape[0]
        returns_means = means[:, _IDX_RETURNS]   # shape (n_states,)
        cvd_vel_means = means[:, _IDX_CVD_VEL]   # shape (n_states,)

        labels: Dict[int, str] = {}
        assigned: set[int] = set()

        # Trending up: highest positive return + positive cvd velocity.
        up_scores = returns_means + np.clip(cvd_vel_means, 0, None)
        best_up = int(np.argmax(up_scores))
        labels[best_up] = "trending_up"
        assigned.add(best_up)

        # Trending down: most negative return + negative cvd velocity.
        down_scores = returns_means + np.clip(cvd_vel_means, None, 0)
        # Mask already-assigned states.
        masked = down_scores.copy()
        for idx in assigned:
            masked[idx] = np.inf
        best_down = int(np.argmin(masked))
        labels[best_down] = "trending_down"
        assigned.add(best_down)

        # Remaining states get accumulating / distributing / mean_reverting.
        remaining = [i for i in range(n_states) if i not in assigned]
        for state_idx in remaining:
            vel = cvd_vel_means[state_idx]
            ret = returns_means[state_idx]
            abs_vel_threshold = 0.5 * np.abs(cvd_vel_means).mean()
            if abs(ret) < 0.001 and vel > abs_vel_threshold:
                labels[state_idx] = "accumulating"
            elif abs(ret) < 0.001 and vel < -abs_vel_threshold:
                labels[state_idx] = "distributing"
            else:
                labels[state_idx] = "mean_reverting"

        return labels
