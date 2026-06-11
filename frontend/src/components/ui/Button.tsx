"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "success" | "warning" | "record";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const BTN_VARIANTS: Record<ButtonVariant, { base: CSSProperties; loading: CSSProperties }> = {
  primary: {
    base: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    loading: { background: "var(--accent-muted)" },
  },
  secondary: {
    base: { background: "oklch(96% 0.005 250 / 0.08)", color: "var(--text-body)", border: "1px solid transparent" },
    loading: { background: "oklch(96% 0.005 250 / 0.04)", color: "var(--text-muted)" },
  },
  outline: {
    base: { background: "oklch(22% 0.01 250)", color: "var(--text-body)", border: "1px solid oklch(55% 0.01 250 / 0.3)" },
    loading: { background: "oklch(55% 0.01 250 / 0.3)", color: "var(--text-muted)" },
  },
  ghost: {
    base: { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" },
    loading: { color: "var(--text-muted)" },
  },
  success: {
    base: { background: "var(--success)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    loading: { background: "oklch(72% 0.18 155 / 0.5)" },
  },
  warning: {
    base: { background: "var(--warning)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    loading: { background: "oklch(78% 0.19 75 / 0.5)" },
  },
  record: {
    base: { background: "var(--danger-tint)", color: "var(--danger-text)", border: "1px solid var(--danger-border)" },
    loading: { opacity: 0.5 },
  },
};

const BTN_SIZES: Record<ButtonSize, CSSProperties> = {
  xs: { padding: "4px 12px", fontSize: "var(--text-xs)", borderRadius: "var(--radius-base)" },
  sm: { padding: "6px 12px", fontSize: "var(--text-xs)", borderRadius: "var(--radius-lg)" },
  md: { padding: "8px 16px", fontSize: "var(--text-sm)", borderRadius: "var(--radius-lg)" },
  lg: { padding: "10px 20px", fontSize: "var(--text-sm)", borderRadius: "var(--radius-lg)" },
};

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  icon = null,
  type = "button",
  style,
  children,
  ...rest
}: ButtonProps) {
  const v = BTN_VARIANTS[variant];
  const s = BTN_SIZES[size];
  const inactive = loading || disabled;

  return (
    <button
      type={type}
      disabled={inactive}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: "var(--font-sans)",
        fontWeight: "var(--weight-medium)" as CSSProperties["fontWeight"],
        lineHeight: 1.45,
        whiteSpace: "nowrap",
        cursor: inactive ? "not-allowed" : "pointer",
        transition: "all var(--duration-fast) var(--ease-in-out)",
        ...s,
        ...v.base,
        ...(inactive ? v.loading : null),
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
