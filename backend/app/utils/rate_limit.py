"""Simple in-memory sliding-window rate limiter.

Suitable for a single-process deployment. If the backend is scaled to
multiple workers, switch this for a shared store (Redis) or an edge gateway.
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import Depends, Request

from ..config import RATE_LIMIT
from .errors import AppError


class _SlidingWindowLimiter:
    def __init__(self, limit: int, window: float = 60.0, max_keys: int = 10_000) -> None:
        self._limit = limit
        self._window = window
        self._max_keys = max_keys
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._events) >= self._max_keys and key not in self._events:
                self._prune(now)
            events = self._events.get(key)
            if events is None:
                events = deque()
                self._events[key] = events
            cutoff = now - self._window
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self._limit:
                return False
            events.append(now)
            return True

    def _prune(self, now: float) -> None:
        """Drop expired or empty buckets so the map cannot grow unbounded."""
        cutoff = now - self._window
        for k in [k for k, v in self._events.items() if not v or v[-1] <= cutoff]:
            del self._events[k]

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


_limiter = _SlidingWindowLimiter(RATE_LIMIT)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    client = request.client
    return client.host if client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency that 429s clients exceeding the limit."""
    if not _limiter.allow(_client_key(request)):
        raise AppError(
            "RATE_LIMITED",
            "Too many requests. Please wait a moment and try again.",
            status=429,
        )