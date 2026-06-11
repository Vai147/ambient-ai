import type { CSSProperties } from "react";

type LogoSize = "sm" | "md" | "lg";

const MARK_SIZES: Record<LogoSize, { box: number; radius: number; icon: number; stroke: number }> = {
  sm: { box: 24, radius: 4, icon: 12, stroke: 1.5 },
  md: { box: 32, radius: 6.5, icon: 16, stroke: 1.8 },
  lg: { box: 40, radius: 8, icon: 20, stroke: 2 },
};

const WORD_SIZES: Record<LogoSize, number> = { sm: 14, md: 15, lg: 20 };

export function Logo({
  size = "sm",
  withWordmark = true,
}: {
  size?: LogoSize;
  withWordmark?: boolean;
}) {
  const m = MARK_SIZES[size];

  const markStyle: CSSProperties = {
    width: m.box,
    height: m.box,
    borderRadius: m.radius,
    background: "var(--accent-subtle)",
    border: "1px solid var(--accent-border)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxSizing: "border-box",
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span style={markStyle}>
        <svg width={m.icon} height={m.icon} viewBox={`0 0 ${m.icon} ${m.icon}`} fill="none" aria-hidden="true">
          <path
            d={`M${m.icon / 2} 1v${m.icon - 2}M1 ${m.icon / 2}h${m.icon - 2}`}
            stroke="var(--accent)"
            strokeWidth={m.stroke}
            strokeLinecap="round"
          />
        </svg>
      </span>
      {withWordmark && (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: WORD_SIZES[size],
            fontWeight: "var(--weight-semibold)" as CSSProperties["fontWeight"],
            letterSpacing: "var(--tracking-tight)",
            color: "var(--text-primary)",
          }}
        >
          Ambient Scribe
        </span>
      )}
    </span>
  );
}
