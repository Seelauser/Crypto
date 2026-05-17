"""Tests for bid/ask imbalance calculator."""
import pytest
from src.analytics.imbalance import OrderBookLevel, compute_top_n_imbalance, compute_level_imbalances


def make_level(price: float, size: float) -> OrderBookLevel:
    return OrderBookLevel(price=price, size=size)


class TestComputeTopNImbalance:
    def test_bid_dominant(self):
        bids = [make_level(100 - i * 0.1, 100.0) for i in range(10)]
        asks = [make_level(100 + (i + 1) * 0.1, 20.0) for i in range(10)]
        bid_vol, ask_vol, ratio, side = compute_top_n_imbalance(bids, asks, n=5)
        assert bid_vol == pytest.approx(500.0)
        assert ask_vol == pytest.approx(100.0)
        assert ratio == pytest.approx(5.0)
        assert side == "buy"

    def test_ask_dominant(self):
        bids = [make_level(100 - i * 0.1, 10.0) for i in range(10)]
        asks = [make_level(100 + (i + 1) * 0.1, 80.0) for i in range(10)]
        _, _, ratio, side = compute_top_n_imbalance(bids, asks, n=5)
        assert ratio == pytest.approx(8.0)
        assert side == "sell"

    def test_balanced(self):
        bids = [make_level(100 - i * 0.1, 50.0) for i in range(5)]
        asks = [make_level(100 + (i + 1) * 0.1, 50.0) for i in range(5)]
        _, _, ratio, _ = compute_top_n_imbalance(bids, asks, n=5)
        assert ratio == pytest.approx(1.0)


class TestComputeLevelImbalances:
    def test_3x_highlight(self):
        bids = [make_level(99.9, 300.0)]
        asks = [make_level(100.1, 100.0)]
        levels = compute_level_imbalances(bids, asks)
        matched_bid = next((l for l in levels if l["price"] == pytest.approx(99.9)), None)
        assert matched_bid is not None
        assert matched_bid["highlight"] == "3x"

    def test_10x_highlight(self):
        bids = [make_level(99.9, 1000.0)]
        asks = [make_level(100.1, 100.0)]
        levels = compute_level_imbalances(bids, asks)
        matched_bid = next((l for l in levels if l["price"] == pytest.approx(99.9)), None)
        assert matched_bid is not None
        assert matched_bid["highlight"] == "10x"
