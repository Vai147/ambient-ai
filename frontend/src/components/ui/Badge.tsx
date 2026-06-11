import type { CSSProperties, ReactNode } from "react";

type BadgeTone = "accent" | "success" | "warning" | "danger" | "neutral";

const BADGE_TONES: Record<BadgeTone, { color: string; bg: string }> = {
  accent: { color: "var(--accent)", bg: "var(--accent-tint)" },
  success: { color: "var(--success)", bg: "var(--success-tint)" },
  warning: { color: "var(--warning)", bg: "var(--warning-tint)" },
  danger: { color: "var(--danger-text)", bg: "oklch(75% 0.18 25 / 0.1)" },
  neutral: { color: "var(--text-secondary)", bg: "oklch(65% 0.01 250 / 0.12)" },
};

/** Session status → tone + label, exactly as mapped in the product. */
const STATUS_MAP: Record<string, { tone: BadgeTone; label: string }> = {
  recording: { tone: "warning", label: "Recording" },
  uploading: { tone: "warning", label: "Uploading" },
  transcribing: { tone: "accent", label: "Transcribing" },
  transcribed: { tone: "success", label: "Transcribed" },
  generating: { tone: "accent", label: "Generating" },
  note_generated: { tone: "success", label: "Note Ready" },
  approved: { tone: "success", label: "Approved" },
};

export function Badge({
  tone = "neutral",
  status,
  mono = false,
  children,
}: {
  tone?: BadgeTone;
  status?: string;
  mono?: boolean;
  children?: ReactNode;
}) {
  const mapped = status ? STATUS_MAP[status] : null;
  const t = BADGE_TONES[mapped ? mapped.tone : tone] ?? BADGE_TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--radius-base)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-medium)" as CSSProperties["fontWeight"],
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        color: t.color,
        background: t.bg,
        whiteSpace: "nowrap",
      }}
    >
      {mapped ? mapped.label : children}
    </span>
  );
}
