"""Application entry point for Uvicorn and production deployments."""

from __future__ import annotations

from app.main import app

__all__ = ["app"]

