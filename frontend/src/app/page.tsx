"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine } from "lucide-react";
import { useDownloader } from "@/hooks/useDownloader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UrlInput } from "@/components/UrlInput";
import { VideoPreview } from "@/components/VideoPreview";
import { FormatSelector } from "@/components/FormatSelector";
import { QualitySelector } from "@/components/QualitySelector";
import { DownloadButton } from "@/components/DownloadButton";
import { DownloadProgress } from "@/components/DownloadProgress";
import { ErrorMessage } from "@/components/ErrorMessage";
import { CompletedCard } from "@/components/CompletedCard";
import { SegmentedControl } from "@/components/SegmentedControl";
import { PLATFORMS } from "@/lib/platforms";

export default function Home() {
  const {
    state,
    setUrl,
    analyze,
    download,
    setMode,
    setVideoContainer,
    setVideoQuality,
    setAudioFormat,
    setAudioQuality,
  } = useDownloader();

  const reducedMotion = useReducedMotion();

  const analyzing = state.appState === "analyzing";
  const downloading = state.appState === "downloading";
  const showResult = state.metadata !== null;
  const showInputError = state.appState === "error" && !showResult;

  const transition = {
    duration: reducedMotion ? 0 : 0.2,
    ease: "easeOut" as const,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-7 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-[9px] bg-foreground text-background">
            <ArrowDownToLine className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="font-display text-xl leading-none tracking-tight">
            StreamKit<span className="text-accent">.</span>
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 sm:px-8">
        <section className="pt-16 sm:pt-24">
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted"
          >
            Multi-platform media saver
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transition, delay: reducedMotion ? 0 : 0.04 }}
            className="mt-4 max-w-xl font-display text-[clamp(2.75rem,7vw,4.25rem)] leading-[0.98] tracking-[-0.01em] text-balance"
          >
            Keep your favorite media{" "}
            <em className="italic">with you.</em>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transition, delay: reducedMotion ? 0 : 0.08 }}
            className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base"
          >
            Paste a link from a supported service, choose a format, and save media
            you have permission to download. Video or audio, in the quality you need.
          </motion.p>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition, delay: reducedMotion ? 0 : 0.12 }}
          className="mt-10"
        >
          <UrlInput
            value={state.urlInput}
            onChange={setUrl}
            onSubmit={() => analyze(state.urlInput)}
            loading={analyzing}
          />
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Supported services">
            {PLATFORMS.map((platform) => (
              <span
                key={platform.id}
                className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
              >
                {platform.name}
              </span>
            ))}
          </div>
          {showInputError && state.error && (
            <div className="mt-3">
              <ErrorMessage message={state.error} />
            </div>
          )}
        </motion.section>

        <AnimatePresence mode="wait">
          {showResult && state.metadata && (
            <motion.section
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transition}
              className="mt-12 rounded-2xl border border-border bg-card p-5 sm:p-7"
            >
              <VideoPreview metadata={state.metadata} />

              <div className="mt-6 border-t border-border pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                      Download
                    </span>
                    {state.platform && (
                      <span className="ml-2 rounded border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                        {state.platform.name}
                      </span>
                    )}
                  </div>
                  <SegmentedControl<"video" | "audio">
                    options={state.platform?.supportsAudio === false
                      ? [{ value: "video", label: "Video" }]
                      : [
                          { value: "video", label: "Video" },
                          { value: "audio", label: "Audio" },
                        ]}
                    value={state.mode}
                    onChange={setMode}
                    ariaLabel="Download type"
                    layoutId="download-mode"
                  />
                </div>

                <div className="mt-5">
                  {state.mode === "video" ? (
                    <FormatSelector
                      formats={state.metadata.formats}
                      container={state.videoContainer}
                      onContainerChange={setVideoContainer}
                      quality={state.videoQuality}
                      onQualityChange={setVideoQuality}
                    />
                  ) : (
                    <QualitySelector
                      audioFormats={state.metadata.audio_formats}
                      format={state.audioFormat}
                      onFormatChange={setAudioFormat}
                      quality={state.audioQuality}
                      onQualityChange={setAudioQuality}
                    />
                  )}
                </div>

                <div className="mt-7">
                  {downloading && state.progress ? (
                    <DownloadProgress
                      progress={state.progress}
                      mode={state.mode}
                    />
                  ) : state.appState === "completed" && state.completed ? (
                    <CompletedCard completed={state.completed} />
                  ) : (
                    <DownloadButton
                      mode={state.mode}
                      disabled={analyzing || downloading}
                      onClick={download}
                    />
                  )}
                </div>

                {state.appState === "error" && state.error && showResult && (
                  <div className="mt-4">
                    <ErrorMessage message={state.error} />
                  </div>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 pb-8 pt-14 sm:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          StreamKit — v1.0
        </span>
        <span className="text-right font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Download only what you have permission to save
        </span>
      </footer>
    </div>
  );
}
