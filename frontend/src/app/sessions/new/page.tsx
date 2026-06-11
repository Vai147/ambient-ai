"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function NewSessionPage() {
  const router = useRouter();
  const [patientName, setPatientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await sessionsApi.create(patientName.trim() || undefined);
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 384 }}>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 32,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            color: "var(--text-tertiary)",
            transition: "color var(--duration-fast) var(--ease-in-out)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-tertiary)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to sessions
        </button>

        <h1 style={{ margin: "0 0 4px", fontSize: "var(--text-xl)", fontWeight: "var(--weight-semibold)", color: "var(--text-primary)" }}>
          New encounter
        </h1>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: "var(--text-tertiary)" }}>
          Enter patient details to start recording
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Patient name"
            optional
            value={patientName}
            onChange={setPatientName}
            placeholder="e.g. Jane Doe"
          />

          {error && (
            <div
              style={{
                fontSize: "var(--text-xs)",
                padding: "10px 12px",
                borderRadius: "var(--radius-lg)",
                background: "var(--danger-tint-2)",
                border: "1px solid var(--danger-border)",
                color: "var(--danger-text)",
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" fullWidth loading={loading} style={{ marginTop: 8 }}>
            {loading ? "Creating…" : "Start session"}
          </Button>
        </form>
      </div>
    </div>
  );
}
