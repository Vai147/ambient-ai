"use client";

import { useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";

type InputProps = {
  label?: string;
  hint?: string;
  optional?: boolean;
  type?: string;
  multiline?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  style?: CSSProperties;
};

export function Input({
  label,
  hint,
  optional = false,
  type = "text",
  multiline = false,
  value,
  defaultValue,
  onChange,
  placeholder,
  required = false,
  autoFocus = false,
  autoComplete,
  style,
}: InputProps) {
  const [focused, setFocused] = useState(false);

  const fieldStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--text-sm)",
    fontFamily: "var(--font-sans)",
    lineHeight: 1.5,
    outline: "none",
    background: "var(--surface-input)",
    color: "var(--text-primary)",
    border: focused ? "1px solid var(--focus-border)" : "1px solid var(--border-strong)",
    boxShadow: focused ? "var(--ring-focus)" : "none",
    transition: "all var(--duration-fast) var(--ease-in-out)",
    resize: multiline ? "none" : undefined,
    minHeight: multiline ? "6rem" : undefined,
    ...style,
  };

  const shared = {
    value,
    defaultValue,
    onChange: onChange
      ? (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value, e)
      : undefined,
    placeholder,
    required,
    autoFocus,
    autoComplete,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: fieldStyle,
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)" as CSSProperties["fontWeight"],
            color: "var(--text-secondary)",
          }}
        >
          {label}
          {optional && (
            <span style={{ color: "var(--text-tertiary)", fontWeight: "var(--weight-regular)" as CSSProperties["fontWeight"] }}>
              {" "}
              (optional)
            </span>
          )}
        </span>
      )}
      {multiline ? <textarea {...shared} /> : <input type={type} {...shared} />}
      {hint && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}
