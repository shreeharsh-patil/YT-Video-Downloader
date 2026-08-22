"""FastAPI application entry point."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import ALLOWED_ORIGINS, APP_NAME, DEBUG, ENVIRONMENT, TEMP_ROOT
from .routes import analyze, download
from .schemas import HealthResponse
from .services.ffmpeg import ensure_ffmpeg
from .utils.errors import AppError

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("ytdl")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(TEMP_ROOT, exist_ok=True)
    if not ensure_ffmpeg():
        logger.warning(
            "ffmpeg was not found. Video merging and audio conversion will fail."
        )
    # Pre-import the YouTube extractor so the first concurrent requests never
    # race on yt-dlp's lazy extractor import (which can raise ImportError).
    import yt_dlp.extractor.youtube  # noqa: F401

    yield


app = FastAPI(
    title="YtDL API",
    version="1.0.0",
    description="Analyze and download YouTube videos (content you own or have permission to download).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(download.router)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=exc.to_dict())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL",
            "message": "Something went wrong while processing the video. Please try again.",
        },
    )


@app.get("/api/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=APP_NAME,
        ffmpeg=ensure_ffmpeg(),
    )


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": APP_NAME, "environment": ENVIRONMENT}