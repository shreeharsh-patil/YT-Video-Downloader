"""Analyze endpoint: validate URL, fetch metadata via yt-dlp, return formats."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException

from ..schemas import AnalyzeRequest, AnalyzeResponse
from ..services import youtube
from ..utils.errors import AppError
from ..utils.rate_limit import enforce_rate_limit
from ..utils.url import normalize_youtube_url

logger = logging.getLogger("ytdl.routes.analyze")

router = APIRouter(tags=["analyze"])


@router.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    responses={
        400: {"description": "Invalid or unsupported URL"},
        403: {"description": "Access restricted"},
        404: {"description": "Video unavailable"},
        429: {"description": "Rate limited"},
    },
)
def analyze(
    body: AnalyzeRequest,
    request: Request,
    _: None = Depends(enforce_rate_limit),
) -> AnalyzeResponse:
    try:
        normalized = normalize_youtube_url(body.url)
    except AppError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.to_dict()) from exc

    try:
        info = youtube.analyze_video(normalized)
    except AppError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.to_dict()) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("unexpected error during analysis of %s", normalized)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTERNAL",
                "message": "Something went wrong while processing the video. Please try again.",
            },
        ) from exc

    payload = youtube.normalize_info(info, normalized)
    logger.info(
        "analyzed video id=%s title=%r formats=%d audio=%d",
        payload["id"],
        payload["title"][:80],
        len(payload["formats"]),
        len(payload["audio_formats"]),
    )
    return AnalyzeResponse.model_validate(payload)