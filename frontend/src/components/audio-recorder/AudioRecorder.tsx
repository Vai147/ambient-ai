"use client";

import { useEffect, useRef } from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
    <Card padding={24} style={{ gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isRecording && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--radius-full)",
                background: "var(--danger)",
                animation: "as-pulse 2s var(--ease-in-out) infinite",
              }}
            />
          )}
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text-primary)" }}>
            {isIdle && "Ready to record"}
            {isRecording && "Recording"}
            {isStopped && "Recording complete"}
          </span>
        </div>

        {(isRecording || isStopped) && (
          <span
            style={{
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: isRecording ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Waveform well */}
      <Card variant="inset" padding={8} style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <WaveformCanvas analyser={isRecording ? analyserNode : null} />
      </Card>

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {isIdle && (
          <Button
            variant="record"
            size="lg"
            onClick={start}
            icon={
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <circle cx="7" cy="7" r="5" />
              </svg>
            }
          >
            Start recording
          </Button>
        )}

        {isRecording && (
          <Button
            variant="record"
            size="lg"
            onClick={stop}
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect width="12" height="12" rx="2" />
              </svg>
            }
          >
            Stop recording
          </Button>
        )}

        {isStopped && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: "var(--radius-lg)",
              fontSize: "var(--text-sm)",
              background: "var(--success-faint)",
              color: "var(--success)",
              border: "1px solid var(--success-border)",
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
          </span>
        )}
      </div>
    </Card>
  );
}
