"""
BullMQ-compatible scan worker.

Reads scan jobs from a BullMQ Redis queue (``scans``), evaluates filter
conditions against per-instrument market state stored in Redis, and writes
results back via the internal REST API.

BullMQ queue mechanics
-----------------------
BullMQ uses Redis Streams under the hood.  The waiting-job stream key is::

    bull:scans:wait

Each XREAD entry contains a ``data`` field that holds the JSON-encoded job
payload.  The worker moves jobs through the BullMQ lifecycle:

    wait  ->  active  ->  completed / failed

This worker implements a simplified polling loop using XREAD with BLOCK.  In
production you would use the official BullMQ worker SDK; this Python worker is
intended for analytics-heavy tasks that are better run in the Python runtime.

Job payload schema
------------------
::

    {
        "scope":      "crypto" | "stocks" | "forex",
        "market":     "binance" | "alpaca" | "oanda" | ...,
        "conditions": {
            "logic":   "AND" | "OR",
            "filters": [
                { "field": str, "op": "gt"|"lt"|"gte"|"lte"|"eq"|"neq", "value": float }
            ]
        },
        "userId":  str,
        "scanId":  str
    }

Market state keys in Redis
--------------------------
Each ingestor / trigger evaluator writes per-instrument state to::

    state:{instrument}   — JSON hash of current market metrics

Available fields: ``cvd``, ``delta``, ``bid_volume``, ``ask_volume``,
``imbalance_ratio``, ``dominant_side``, ``last_price``, ``regime``, etc.

A sorted set of active instruments per market is stored at::

    instruments:{market}   — ZSET with instrument names as members
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
QUEUE_NAME = "scans"
STREAM_KEY = f"bull:{QUEUE_NAME}:wait"
ACTIVE_KEY = f"bull:{QUEUE_NAME}:active"
COMPLETED_KEY = f"bull:{QUEUE_NAME}:completed"
FAILED_KEY = f"bull:{QUEUE_NAME}:failed"

# Polling block timeout (ms); 0 = block forever until a message arrives.
XREAD_BLOCK_MS = 5_000

# Max jobs to read per XREAD call.
XREAD_COUNT = 10

# Redis key prefixes.
STATE_PREFIX = "state:"
INSTRUMENTS_PREFIX = "instruments:"

# Internal API endpoints.
SCAN_RESULTS_ENDPOINT = "/api/internal/scan-results"

# Supported comparison operators.
_OPS = frozenset({"gt", "lt", "gte", "lte", "eq", "neq"})


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------
class ScanWorker:
    """
    Reads scan jobs from the BullMQ Redis stream and evaluates filter
    conditions against live market state.

    Parameters
    ----------
    redis_url:
        Redis DSN (e.g. ``redis://localhost:6379``).
    api_url:
        Base URL of the internal REST API used to persist results.
    """

    def __init__(
        self,
        redis_url: str,
        api_url: str = "http://localhost:4000",
    ) -> None:
        self.redis_url = redis_url
        self.api_url = api_url.rstrip("/")

        self._redis: Optional[aioredis.Redis] = None
        # Last-seen stream entry ID; "$" means only new entries after startup.
        self._last_id: str = "$"

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def evaluate_filter(self, state: Dict[str, Any], filter_item: Dict[str, Any]) -> bool:
        """
        Evaluate a single filter condition against an instrument's market state.

        Parameters
        ----------
        state:
            Market-state dict (keys: cvd, delta, imbalance_ratio, etc.).
        filter_item:
            Dict with keys ``field`` (str), ``op`` (str), ``value`` (numeric).

        Returns
        -------
        bool
            ``True`` if the condition is satisfied.
        """
        field: str = filter_item.get("field", "")
        op: str = filter_item.get("op", "")
        threshold = filter_item.get("value")

        if op not in _OPS:
            logger.warning("Unknown filter op %r — skipping.", op)
            return False

        if field not in state:
            # Field not present in state; treat as unsatisfied.
            return False

        try:
            actual = float(state[field])
            threshold_f = float(threshold)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return False

        if op == "gt":
            return actual > threshold_f
        if op == "lt":
            return actual < threshold_f
        if op == "gte":
            return actual >= threshold_f
        if op == "lte":
            return actual <= threshold_f
        if op == "eq":
            return actual == threshold_f
        if op == "neq":
            return actual != threshold_f
        return False

    def evaluate_conditions(
        self, state: Dict[str, Any], conditions: Dict[str, Any]
    ) -> bool:
        """
        Evaluate a set of filter conditions (AND / OR) against a state dict.

        Parameters
        ----------
        state:
            Market-state dict for a single instrument.
        conditions:
            Dict with ``logic`` (``"AND"`` | ``"OR"``) and ``filters`` list.

        Returns
        -------
        bool
        """
        logic: str = str(conditions.get("logic", "AND")).upper()
        filters: List[Dict[str, Any]] = conditions.get("filters", [])

        if not filters:
            return False

        results = [self.evaluate_filter(state, f) for f in filters]

        if logic == "OR":
            return any(results)
        # Default: AND.
        return all(results)

    async def process_job(self, job: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Evaluate a scan job.

        1. Resolve the instrument list from the job's ``scope``/``market``.
        2. Fetch each instrument's state from Redis.
        3. Evaluate the filter conditions.
        4. Return matching rows.

        Parameters
        ----------
        job:
            Parsed job payload dict.

        Returns
        -------
        list of ScanResultRow dicts
            Keys: ``scanId``, ``instrument``, ``market``, ``matchedAt``,
            ``state`` (snapshot of the instrument state at match time).
        """
        assert self._redis is not None

        scan_id: str = job.get("scanId", "")
        market: str = job.get("market", "")
        scope: str = job.get("scope", "")
        conditions: Dict[str, Any] = job.get("conditions", {})

        # Fetch instrument list.
        instruments = await self._get_instruments(market, scope)
        if not instruments:
            logger.info("Scan %s: no instruments found for market=%s scope=%s", scan_id, market, scope)
            return []

        matched: List[Dict[str, Any]] = []
        matched_at = int(time.time() * 1000)

        for instrument in instruments:
            state = await self._get_state(instrument)
            if not state:
                continue

            if self.evaluate_conditions(state, conditions):
                matched.append(
                    {
                        "scanId": scan_id,
                        "instrument": instrument,
                        "market": market,
                        "matchedAt": matched_at,
                        "state": state,
                    }
                )

        logger.info(
            "Scan %s: %d/%d instruments matched (market=%s)",
            scan_id,
            len(matched),
            len(instruments),
            market,
        )
        return matched

    async def run(self) -> None:
        """
        Main loop: poll the BullMQ stream for scan jobs indefinitely.

        Jobs are acknowledged (XACK) after processing and published to
        ``scan:complete:{scanId}`` on Redis.  Failures are logged and the
        job is moved to the failed stream.
        """
        self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        logger.info("ScanWorker started, listening on stream %s", STREAM_KEY)

        try:
            while True:
                await self._poll_once()
        except asyncio.CancelledError:
            logger.info("ScanWorker cancelled — shutting down.")
        finally:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Internal — polling
    # ------------------------------------------------------------------

    async def _poll_once(self) -> None:
        """Read up to XREAD_COUNT entries from the BullMQ wait stream."""
        assert self._redis is not None

        try:
            # XREAD with BLOCK so we don't spin.
            results = await self._redis.xread(
                {STREAM_KEY: self._last_id},
                count=XREAD_COUNT,
                block=XREAD_BLOCK_MS,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("XREAD error: %s — retrying in 2 s", exc)
            await asyncio.sleep(2)
            return

        if not results:
            return

        for _stream_name, entries in results:
            for entry_id, fields in entries:
                self._last_id = entry_id
                await self._handle_entry(entry_id, fields)

    async def _handle_entry(self, entry_id: str, fields: Dict[str, str]) -> None:
        """Parse and process a single stream entry."""
        assert self._redis is not None

        raw_data = fields.get("data") or fields.get("payload") or ""
        if not raw_data:
            logger.warning("Empty job payload at entry %s — skipping.", entry_id)
            return

        try:
            job: Dict[str, Any] = json.loads(raw_data)
        except json.JSONDecodeError as exc:
            logger.error("Could not decode job JSON at %s: %s", entry_id, exc)
            return

        scan_id: str = job.get("scanId", entry_id)
        logger.debug("Processing scan job %s (entry %s)", scan_id, entry_id)

        try:
            matched = await self.process_job(job)
            await self._persist_results(job, matched)
            await self._publish_complete(scan_id, matched)
            await self._redis.xadd(
                COMPLETED_KEY,
                {"scanId": scan_id, "matchCount": len(matched), "entryId": entry_id},
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Error processing scan %s: %s", scan_id, exc)
            try:
                await self._redis.xadd(
                    FAILED_KEY,
                    {"scanId": scan_id, "error": str(exc), "entryId": entry_id},
                )
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------
    # Internal — Redis state fetching
    # ------------------------------------------------------------------

    async def _get_instruments(self, market: str, scope: str) -> List[str]:
        """
        Return the list of active instruments for *market* / *scope*.

        Tries the ZSET ``instruments:{market}`` first, then falls back to
        ``instruments:{scope}``.
        """
        assert self._redis is not None

        for key_suffix in [market, scope]:
            if not key_suffix:
                continue
            redis_key = f"{INSTRUMENTS_PREFIX}{key_suffix}"
            try:
                members = await self._redis.zrange(redis_key, 0, -1)
                if members:
                    return list(members)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not fetch instruments from %s: %s", redis_key, exc)

        return []

    async def _get_state(self, instrument: str) -> Optional[Dict[str, Any]]:
        """Fetch market state for *instrument* from Redis."""
        assert self._redis is not None

        key = f"{STATE_PREFIX}{instrument}"
        try:
            raw = await self._redis.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not fetch state for %s: %s", instrument, exc)
            return None

    # ------------------------------------------------------------------
    # Internal — result persistence and publishing
    # ------------------------------------------------------------------

    async def _persist_results(
        self, job: Dict[str, Any], matched: List[Dict[str, Any]]
    ) -> None:
        """
        POST scan results to the internal API.

        Failures are logged but do not raise so the job is still marked
        complete in Redis.
        """
        if not matched:
            return

        payload = {
            "scanId": job.get("scanId"),
            "userId": job.get("userId"),
            "results": matched,
        }
        url = f"{self.api_url}{SCAN_RESULTS_ENDPOINT}"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                logger.debug("Persisted %d results for scan %s", len(matched), job.get("scanId"))
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to persist scan results to API: %s", exc)

    async def _publish_complete(self, scan_id: str, matched: List[Dict[str, Any]]) -> None:
        """Publish results to ``scan:complete:{scanId}`` so clients can listen."""
        assert self._redis is not None

        channel = f"scan:complete:{scan_id}"
        payload = json.dumps(
            {
                "scanId": scan_id,
                "matchCount": len(matched),
                "results": matched,
                "ts": int(time.time() * 1000),
            }
        )
        try:
            await self._redis.publish(channel, payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to publish scan:complete for %s: %s", scan_id, exc)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------
async def main() -> None:
    from dotenv import load_dotenv

    load_dotenv()
    worker = ScanWorker(
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"),
        api_url=os.getenv("API_URL", "http://localhost:4000"),
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
