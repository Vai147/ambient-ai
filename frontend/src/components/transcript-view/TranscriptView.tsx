"use client";

import type { TranscriptResponse } from "@/lib/api";

interface TranscriptViewProps {
  transcript: TranscriptResponse;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function TranscriptView({ transcript }: TranscriptViewProps) {
  const turns = transcript.speaker_turns as Array<{
    start: number;
    end: number;
    text: string;
    speaker: string;
  }>;

  const hasTurns = Array.isArray(turns) && turns.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "oklch(65% 0.01 250)" }}
        >
          Transcript
        </h2>
        <span
          className="text-xs"
          style={{ color: "oklch(55% 0.01 250)" }}
        >
          {transcript.content.length} chars · {transcript.whisper_model}
        </span>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "oklch(18% 0.01 250)",
          border: "1px solid oklch(96% 0.005 250 / 0.08)",
        }}
      >
        {hasTurns ? (
          <div className="flex flex-col gap-0 divide-y" style={{ borderColor: "oklch(96% 0.005 250 / 0.05)" }}>
            {turns.map((turn, i) => {
              const isClinician = turn.speaker === "clinician" || i % 2 === 0;
              return (
                <div
                  key={i}
                  className="flex gap-3 px-5 py-4"
                  style={{
                    background: isClinician ? "transparent" : "oklch(14% 0.01 250 / 0.4)",
                  }}
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0" style={{ width: 48 }}>
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                      style={{
                        background: isClinician
                          ? "oklch(70% 0.18 195 / 0.15)"
                          : "oklch(72% 0.18 155 / 0.15)",
                        color: isClinician
                          ? "oklch(70% 0.18 195)"
                          : "oklch(72% 0.18 155)",
                      }}
                    >
                      {isClinician ? "Dr" : "Pt"}
                    </div>
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: "oklch(45% 0.01 250)" }}
                    >
                      {formatTime(turn.start)}
                    </span>
                  </div>
                  <p
                    className="text-sm leading-relaxed pt-0.5"
                    style={{ color: "oklch(88% 0.005 250)" }}
                  >
                    {turn.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat transcript fallback when no speaker turns */
          <div className="p-5">
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "oklch(88% 0.005 250)" }}
            >
              {transcript.content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
