"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi, type SessionResponse } from "@/lib/api";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

function statusBadge(status: SessionResponse["status"]) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    recording:     { label: "Recording",      color: "oklch(78% 0.19 75)",  bg: "oklch(78% 0.19 75 / 0.12)"  },
    uploading:     { label: "Uploading",      color: "oklch(78% 0.19 75)",  bg: "oklch(78% 0.19 75 / 0.12)"  },
    transcribing:  { label: "Transcribing",   color: "oklch(70% 0.18 195)", bg: "oklch(70% 0.18 195 / 0.12)" },
    transcribed:   { label: "Transcribed",    color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
    generating:    { label: "Generating",     color: "oklch(70% 0.18 195)", bg: "oklch(70% 0.18 195 / 0.12)" },
    note_generated:{ label: "Note Ready",     color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
    approved:      { label: "Approved",       color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
  };
  const s = map[status] ?? { label: status, color: "oklch(65% 0.01 250)", bg: "oklch(65% 0.01 250 / 0.12)" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  // Hydrate user on mount if cookie present but store is empty
  useEffect(() => {
    if (!user) {
      authApi.me().then(setUser).catch(() => router.push("/login"));
    }
  }, [user, setUser, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: sessionsApi.list,
    enabled: !!user,
  });

  function handleLogout() {
    useAuthStore.getState().logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen" style={{ background: "oklch(14% 0.01 250)" }}>
      {/* Top nav */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 h-14"
        style={{
          background: "oklch(14% 0.01 250 / 0.85)",
          borderBottom: "1px solid oklch(96% 0.005 250 / 0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: "oklch(70% 0.18 195 / 0.15)", border: "1px solid oklch(70% 0.18 195 / 0.3)" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="oklch(70% 0.18 195)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: "oklch(96% 0.005 250)" }}>
            Ambient Scribe
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <span className="text-xs" style={{ color: "oklch(65% 0.01 250)" }}>
              {user.full_name ?? user.email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: "oklch(65% 0.01 250)",
              border: "1px solid oklch(96% 0.005 250 / 0.1)",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "oklch(96% 0.005 250)" }}>
              Sessions
            </h1>
            <p className="text-sm mt-1" style={{ color: "oklch(65% 0.01 250)" }}>
              {data ? `${data.total} encounter${data.total !== 1 ? "s" : ""}` : "—"}
            </p>
          </div>
          <button
            onClick={() => router.push("/sessions/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "oklch(70% 0.18 195)",
              color: "oklch(14% 0.01 250)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New session
          </button>
        </div>

        {/* Sessions table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{
                borderColor: "oklch(70% 0.18 195 / 0.2)",
                borderTopColor: "oklch(70% 0.18 195)",
              }}
            />
          </div>
        ) : !data?.sessions.length ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-xl text-center"
            style={{
              background: "oklch(18% 0.01 250)",
              border: "1px dashed oklch(96% 0.005 250 / 0.1)",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "oklch(70% 0.18 195 / 0.1)" }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 2v18M2 11h18" stroke="oklch(70% 0.18 195)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "oklch(96% 0.005 250)" }}>
              No sessions yet
            </p>
            <p className="text-xs" style={{ color: "oklch(65% 0.01 250)" }}>
              Start a new session to record an encounter
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "oklch(18% 0.01 250)",
              border: "1px solid oklch(96% 0.005 250 / 0.08)",
            }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(96% 0.005 250 / 0.06)" }}>
                  {["Patient", "Status", "Created", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-medium"
                      style={{ color: "oklch(65% 0.01 250)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s, i) => (
                  <tr
                    key={s.id}
                    className="group transition-colors"
                    style={{
                      borderTop: i > 0 ? "1px solid oklch(96% 0.005 250 / 0.05)" : undefined,
                      cursor: "pointer",
                    }}
                    onClick={() => router.push(`/sessions/${s.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium" style={{ color: "oklch(96% 0.005 250)" }}>
                        {s.patient_name ?? "Unknown patient"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{statusBadge(s.status)}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs" style={{ color: "oklch(65% 0.01 250)" }}>
                        {formatDate(s.created_at)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <svg
                        width="14" height="14" viewBox="0 0 14 14" fill="none"
                        className="ml-auto"
                        style={{ color: "oklch(65% 0.01 250)" }}
                      >
                        <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
