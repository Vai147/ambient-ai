"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";

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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "oklch(14% 0.01 250)" }}>
      <div className="w-full max-w-sm">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-sm mb-8 transition-colors"
          style={{ color: "oklch(55% 0.01 250)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to sessions
        </button>

        <h1 className="text-xl font-semibold mb-1" style={{ color: "oklch(96% 0.005 250)" }}>
          New encounter
        </h1>
        <p className="text-sm mb-8" style={{ color: "oklch(55% 0.01 250)" }}>
          Enter patient details to start recording
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "oklch(65% 0.01 250)" }}>
              Patient name <span style={{ color: "oklch(55% 0.01 250)" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: "oklch(22% 0.015 250)",
                border: "1px solid oklch(96% 0.005 250 / 0.1)",
                color: "oklch(96% 0.005 250)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "oklch(70% 0.18 195 / 0.6)";
                e.target.style.boxShadow = "0 0 0 3px oklch(70% 0.18 195 / 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "oklch(96% 0.005 250 / 0.1)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {error && (
            <div
              className="text-xs px-3 py-2.5 rounded-lg"
              style={{
                background: "oklch(55% 0.22 25 / 0.12)",
                border: "1px solid oklch(55% 0.22 25 / 0.3)",
                color: "oklch(75% 0.18 25)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="py-2.5 rounded-lg text-sm font-medium transition-all mt-2"
            style={{
              background: loading ? "oklch(70% 0.18 195 / 0.5)" : "oklch(70% 0.18 195)",
              color: "oklch(14% 0.01 250)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating…" : "Start session"}
          </button>
        </form>
      </div>
    </div>
  );
}
