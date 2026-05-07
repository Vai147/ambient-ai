"use client";

import { useEffect, useRef } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function WaveformCanvas({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser!.getByteTimeDomainData(dataArray);

      const w = canvas!.width;
      const h = canvas!.height;

      ctx.clearRect(0, 0, w, h);

      // Baseline
      ctx.beginPath();
      ctx.strokeStyle = "oklch(70% 0.18 195 / 0.15)";
      ctx.lineWidth = 1;
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Waveform
      ctx.beginPath();
      ctx.strokeStyle = "oklch(70% 0.18 195)";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";

      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.stroke();
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  // Static idle line when not recording
  useEffect(() => {
    if (analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = "oklch(70% 0.18 195 / 0.2)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={64}
      className="w-full"
      style={{ height: 64 }}
    />
  );
}

export function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const { state, blob, elapsed, analyserNode, start, stop } = useAudioRecorder();

  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;

  useEffect(() => {
    if (blob) onRecordingCompleteRef.current(blob);
  }, [blob]);

  const isIdle = state === "idle";
  const isRecording = state === "recording";
  const isStopped = state === "stopped";

  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-5"
      style={{
        background: "oklch(18% 0.01 250)",
        border: "1px solid oklch(96% 0.005 250 / 0.08)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isRecording && (
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "oklch(65% 0.22 25)" }}
            />
          )}
          <span
            className="text-sm font-medium"
            style={{ color: "oklch(96% 0.005 250)" }}
          >
            {isIdle && "Ready to record"}
            {isRecording && "Recording"}
            {isStopped && "Recording complete"}
          </span>
        </div>

        {(isRecording || isStopped) && (
          <span
            className="text-sm tabular-nums font-mono"
            style={{ color: isRecording ? "oklch(70% 0.18 195)" : "oklch(65% 0.01 250)" }}
          >
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Waveform */}
      <div
        className="rounded-lg px-3 py-2 overflow-hidden"
        style={{ background: "oklch(14% 0.01 250)" }}
      >
        <WaveformCanvas analyser={isRecording ? analyserNode : null} />
      </div>

      {/* Controls */}
      <div className="flex justify-center">
        {isIdle && (
          <button
            onClick={start}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "oklch(65% 0.22 25 / 0.15)",
              color: "oklch(75% 0.18 25)",
              border: "1px solid oklch(65% 0.22 25 / 0.3)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="7" r="5" />
            </svg>
            Start recording
          </button>
        )}

        {isRecording && (
          <button
            onClick={stop}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "oklch(65% 0.22 25 / 0.15)",
              color: "oklch(75% 0.18 25)",
              border: "1px solid oklch(65% 0.22 25 / 0.3)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect width="12" height="12" rx="2" />
            </svg>
            Stop recording
          </button>
        )}

        {isStopped && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
            style={{
              background: "oklch(72% 0.18 155 / 0.1)",
              color: "oklch(72% 0.18 155)",
              border: "1px solid oklch(72% 0.18 155 / 0.25)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2.5 7l3 3 6-6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Audio captured — uploading
          </div>
        )}
      </div>
    </div>
  );
}
