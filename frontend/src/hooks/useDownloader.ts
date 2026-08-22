"use client";

import { useCallback, useMemo, useState } from "react";
import { analyzeUrl, fetchDownload, ApiError } from "@/lib/api";
import {
  isPlaylistOrChannelUrl,
  normalizeYouTubeUrl,
} from "@/lib/youtube";
import { buildVideoQualityGroups, downloadBlob, formatBytes } from "@/lib/utils";
import type {
  AppState,
  AudioFormatKey,
  CompletedInfo,
  DownloadMode,
  DownloadProgressState,
  VideoContainer,
  VideoMetadata,
} from "@/types";

const IDLE_PROGRESS: DownloadProgressState = {
  stage: "preparing",
  progress: null,
  downloadedBytes: null,
  totalBytes: null,
  message: null,
};

export function useDownloader() {
  const [urlInput, setUrlInput] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<DownloadMode>("video");
  const [videoContainer, setVideoContainer] = useState<VideoContainer>("mp4");
  const [videoQuality, setVideoQuality] = useState("best");
  const [audioFormat, setAudioFormat] = useState<AudioFormatKey>("mp3");
  const [audioQuality, setAudioQuality] = useState("best");

  const [progress, setProgress] = useState<DownloadProgressState>(IDLE_PROGRESS);
  const [completed, setCompleted] = useState<CompletedInfo | null>(null);

  const defaultVideoQuality = useMemo(() => {
    if (!metadata) return "best";
    const groups = buildVideoQualityGroups(metadata.formats, videoContainer);
    return groups.length > 0 ? String(groups[0].quality) : "best";
  }, [metadata, videoContainer]);

  const analyze = useCallback(
    async (rawUrl: string) => {
      const url = normalizeYouTubeUrl(rawUrl);
      if (!url) {
        setError(
          isPlaylistOrChannelUrl(rawUrl)
            ? "That's a playlist or channel link. Paste a link to a single video instead."
            : "That doesn't look like a YouTube link. Please check and try again.",
        );
        setAppState("error");
        return;
      }
      setError(null);
      setAppState("analyzing");
      try {
        const result = await analyzeUrl(url);
        setMetadata(result);
        setMode("video");
        setVideoContainer("mp4");
        setVideoQuality("best");
        setAudioFormat("mp3");
        setAudioQuality("best");
        setCompleted(null);
        setProgress(IDLE_PROGRESS);
        setAppState("analyzed");
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong while analyzing the video. Please try again.",
        );
        setAppState("error");
      }
    },
    [],
  );

  const download = useCallback(async () => {
    if (!metadata) return;
    setError(null);
    setCompleted(null);
    setProgress(IDLE_PROGRESS);
    setAppState("downloading");
    try {
      const body =
        mode === "video"
          ? {
              url: metadata.url,
              type: "video" as const,
              quality: videoQuality,
              container: videoContainer,
            }
          : {
              url: metadata.url,
              type: "audio" as const,
              quality: audioQuality,
              container: audioFormat,
            };
      const result = await fetchDownload(body, (update) => {
        setProgress({
          stage: update.stage,
          progress: update.progress,
          downloadedBytes: update.downloadedBytes,
          totalBytes: update.totalBytes,
          message: update.message,
        });
      });
      downloadBlob(result.blob, result.filename);
      setCompleted({
        filename: result.filename,
        size: result.blob.size,
        size_human: formatBytes(result.blob.size),
      });
      setAppState("completed");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong during the download. Please try again.",
      );
      setAppState("error");
    }
  }, [metadata, mode, videoContainer, videoQuality, audioFormat, audioQuality]);

  const reset = useCallback(() => {
    setUrlInput("");
    setMetadata(null);
    setError(null);
    setCompleted(null);
    setProgress(IDLE_PROGRESS);
    setAppState("idle");
  }, []);

  // Switching container invalidates the previously selected quality, so
  // fall back to "best" instead of keeping a stale selection.
  const handleVideoContainerChange = useCallback((c: VideoContainer) => {
    setVideoContainer(c);
    setVideoQuality("best");
  }, []);

  return {
    state: {
      urlInput,
      appState,
      metadata,
      error,
      mode,
      videoContainer,
      videoQuality,
      audioFormat,
      audioQuality,
      progress,
      completed,
      defaultVideoQuality,
    },
    setUrl: setUrlInput,
    analyze,
    download,
    reset,
    setMode,
    setVideoContainer: handleVideoContainerChange,
    setVideoQuality,
    setAudioFormat,
    setAudioQuality,
  };
}