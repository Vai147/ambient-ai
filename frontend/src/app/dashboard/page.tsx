"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi, authApi, type SessionResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { TopNav } from "@/components/ui/TopNav";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const trashIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M2.5 3.5h9M5.5 3.5V2.5h3v1M3.5 3.5l.5 8a1 1 0 001 1h4a1 1 0 001-1l.5-8"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Inline two-step delete — first click asks, second confirms. Stops the
 *  row click so deleting never navigates into the session. */
function RowDelete({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => sessionsApi.remove(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (mutation.isPending) {
    return <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Deleting…</span>;
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }} onClick={stop}>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            mutation.mutate();
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-medium)",
            color: "var(--danger-text)",
          }}
        >
          Delete
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setConfirming(false);
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: "var(--text-xs)",
            color: "var(--text-tertiary)",
          }}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Delete session"
      onClick={(e) => {
        stop(e);
        setConfirming(true);
      }}
      style={{
        display: "inline-flex",
        background: "none",
        border: "none",
        padding: 4,
        cursor: "pointer",
        color: "var(--text-muted)",
        transition: "color var(--duration-fast) var(--ease-in-out)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--danger-text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {trashIcon}
    </button>
  );
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
    <div style={{ minHeight: "100vh" }}>
      <TopNav
        left={<Logo size="sm" />}
        right={
          <>
            {user && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                {user.full_name ?? user.email}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </>
        }
      />

      <main style={{ maxWidth: "var(--content-wide)", margin: "0 auto", padding: "40px 24px" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "var(--text-2xl)",
                fontWeight: "var(--weight-semibold)",
                letterSpacing: "var(--tracking-tight)",
                color: "var(--text-primary)",
              }}
            >
              Sessions
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
              {data ? `${data.total} encounter${data.total !== 1 ? "s" : ""}` : "—"}
            </p>
          </div>
          <Button icon={plusIcon} onClick={() => router.push("/sessions/new")}>
            New session
          </Button>
        </div>

        {/* Sessions table */}
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "var(--radius-full)",
                border: "2px solid var(--accent-faint)",
                borderTopColor: "var(--accent)",
                animation: "as-spin 0.8s linear infinite",
              }}
            />
          </div>
        ) : !data?.sessions.length ? (
          <Card variant="dashed" style={{ alignItems: "center", padding: "80px 24px", textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--radius-lg)",
                background: "var(--accent-faint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 2v18M2 11h18" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>No sessions yet</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
              Start a new session to record an encounter
            </p>
          </Card>
        ) : (
          <Card flush>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-faint)" }}>
                  {["Patient", "Status", "Created", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "12px 20px",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s: SessionResponse, i: number) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/sessions/${s.id}`)}
                    style={{
                      borderTop: i > 0 ? "1px solid var(--border-hairline)" : "none",
                      cursor: "pointer",
                      transition: "background var(--duration-fast) var(--ease-in-out)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "oklch(96% 0.005 250 / 0.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "14px 20px", fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                      {s.patient_name ?? "Unknown patient"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <Badge status={s.status} />
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: "var(--text-secondary)" }}>
                      {formatDate(s.created_at)}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                        <RowDelete sessionId={s.id} />
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <path
                            d="M5 2.5l4.5 4.5L5 11.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
