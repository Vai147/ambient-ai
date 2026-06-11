import type { CSSProperties, ReactNode } from "react";

type CardVariant = "default" | "soft" | "inset" | "dashed";

const CARD_VARIANTS: Record<CardVariant, CSSProperties> = {
  default: { background: "var(--surface-card)", border: "1px solid var(--border-subtle)" },
  soft: { background: "var(--surface-soft)", border: "1px solid var(--border-faint)" },
  inset: { background: "var(--surface-inset)", border: "none" },
  dashed: { background: "var(--surface-card)", border: "1px dashed var(--border-strong)" },
};

export function Card({
  variant = "default",
  padding = 20,
  title,
  aside,
  flush = false,
  style,
  children,
}: {
  variant?: CardVariant;
  padding?: number;
  title?: string;
  aside?: ReactNode;
  flush?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-xl)",
        overflow: flush ? "hidden" : undefined,
        padding: flush ? 0 : padding,
        display: "flex",
        flexDirection: "column",
        gap: title ? 12 : undefined,
        ...CARD_VARIANTS[variant],
        ...style,
      }}
    >
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3
            style={{
              margin: 0,
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)" as CSSProperties["fontWeight"],
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-widest)",
              color: "var(--text-tertiary)",
            }}
          >
            {title}
          </h3>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}
