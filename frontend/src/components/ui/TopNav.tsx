import type { ReactNode } from "react";

export function TopNav({
  left,
  right,
  sticky = true,
}: {
  left?: ReactNode;
  right?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      style={{
        position: sticky ? "sticky" : "relative",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 24px",
        height: "var(--header-height)",
        background: "var(--surface-header)",
        borderBottom: "1px solid var(--border-faint)",
        backdropFilter: "var(--blur-header)",
        WebkitBackdropFilter: "var(--blur-header)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>{right}</div>
    </header>
  );
}
