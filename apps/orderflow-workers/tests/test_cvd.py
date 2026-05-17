"""Tests for CVD calculator."""
import pytest
from src.analytics.cvd import Tick, compute_delta, compute_cvd_series, compute_bar_delta


def make_tick(ts: int, price: float, size: float, side: str) -> Tick:
    return Tick(ts=ts, price=price, size=size, side=side)


class TestComputeDelta:
    def test_all_buy(self):
        ticks = [make_tick(i, 100.0, 1.0, "buy") for i in range(5)]
        assert compute_delta(ticks) == pytest.approx(5.0)

    def test_all_sell(self):
        ticks = [make_tick(i, 100.0, 1.0, "sell") for i in range(5)]
        assert compute_delta(ticks) == pytest.approx(-5.0)

    def test_mixed(self):
        ticks = [
            make_tick(0, 100.0, 3.0, "buy"),
            make_tick(1, 100.0, 1.0, "sell"),
        ]
        assert compute_delta(ticks) == pytest.approx(2.0)

    def test_unknown_side_excluded(self):
        ticks = [
            make_tick(0, 100.0, 5.0, "unknown"),
            make_tick(1, 100.0, 2.0, "buy"),
        ]
        assert compute_delta(ticks) == pytest.approx(2.0)

    def test_empty(self):
        assert compute_delta([]) == 0.0


class TestComputeCvdSeries:
    def test_cumulative_accumulation(self):
        ticks = [make_tick(i * 1000, 100.0, 1.0, "buy") for i in range(5)]
        series = compute_cvd_series(ticks)
        assert len(series) == 5
        assert series[-1]["cvd"] == pytest.approx(5.0)

    def test_delta_per_tick(self):
        ticks = [
            make_tick(0, 100.0, 3.0, "buy"),
            make_tick(1000, 100.0, 1.0, "sell"),
            make_tick(2000, 100.0, 2.0, "buy"),
        ]
        series = compute_cvd_series(ticks)
        assert series[0]["delta"] == pytest.approx(3.0)
        assert series[1]["delta"] == pytest.approx(-1.0)
        assert series[2]["cvd"] == pytest.approx(4.0)


class TestComputeBarDelta:
    def test_bar_aggregation(self):
        # 3 ticks: first two in bar 0, third in bar 1
        ticks = [
            make_tick(0, 100.0, 2.0, "buy"),
            make_tick(10_000, 100.0, 1.0, "sell"),
            make_tick(65_000, 100.0, 3.0, "buy"),  # second bar
        ]
        bars = compute_bar_delta(ticks, bar_seconds=60)
        assert len(bars) == 2
        assert bars[0]["delta"] == pytest.approx(1.0)  # 2 - 1
        assert bars[1]["delta"] == pytest.approx(3.0)

    def test_cvd_across_bars(self):
        ticks = [
            make_tick(0, 100.0, 5.0, "buy"),
            make_tick(70_000, 100.0, 2.0, "sell"),
        ]
        bars = compute_bar_delta(ticks, bar_seconds=60)
        assert bars[1]["cvd"] == pytest.approx(3.0)
