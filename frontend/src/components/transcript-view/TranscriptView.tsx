"use client";

import type { TranscriptResponse } from "@/lib/api";
import { Card } from "@/components/ui/Card";

interface TranscriptViewProps {
  transcript: TranscriptResponse;
  /** Logged-in clinician — labels their turns instead of a generic "Dr". */
  clinicianName?: string | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Two-letter initials from a name or email; falls back to "Dr". */
function clinicianInitials(name?: string | null): string {
  if (!name) return "Dr";
  const local = name.includes("@") ? name.split("@")[0] : name;
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "Dr";
}

export function TranscriptView({ transcript, clinicianName }: TranscriptViewProps) {
  const clinicianLabel = clinicianInitials(clinicianName);
  const turns = transcript.speaker_turns as Array<{
    start: number;
    end: number;
    text: string;
    speaker: string;
  }>;

  const hasTurns = Array.isArray(turns) && turns.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-semibold)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
            color: "var(--text-secondary)",
          }}
        >
          Transcript
        </h2>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
          {transcript.content.length.toLocaleString()} chars · {transcript.whisper_model}
        </span>
      </div>

      <Card flush>
        {hasTurns ? (
          turns.map((turn, i) => {
            const isClinician = turn.speaker === "clinician" || i % 2 === 0;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "16px 20px",
                  background: isClinician ? "transparent" : "oklch(14% 0.01 250 / 0.4)",
                  borderTop: i > 0 ? "1px solid var(--border-hairline)" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    paddingTop: 2,
                    flexShrink: 0,
                    width: 48,
                  }}
                >
                  <div
                    title={isClinician && clinicianName ? clinicianName : undefined}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "var(--radius-full)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--weight-semibold)",
                      background: isClinician ? "var(--accent-subtle)" : "oklch(72% 0.18 155 / 0.15)",
                      color: isClinician ? "var(--accent)" : "var(--success)",
                    }}
                  >
                    {isClinician ? clinicianLabel : "Pt"}
                  </div>
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontFamily: "var(--font-mono)",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatTime(turn.start)}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    paddingTop: 2,
                    fontSize: "var(--text-sm)",
                    lineHeight: "var(--leading-relaxed)",
                    color: "var(--text-reading)",
                  }}
                >
                  {turn.text}
                </p>
              </div>
            );
          })
        ) : (
          /* Flat transcript fallback when no speaker turns */
          <div style={{ padding: "20px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-sm)",
                lineHeight: "var(--leading-relaxed)",
                whiteSpace: "pre-wrap",
                color: "var(--text-reading)",
              }}
            >
              {transcript.content}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
