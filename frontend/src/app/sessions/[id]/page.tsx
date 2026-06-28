"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { audioApi, notesApi, fhirApi, type FHIRExportResponse, type FHIRValidationIssue } from "@/lib/api";
import { useSession, useTranscript, useNote } from "@/hooks/useSession";
import { useAuthStore } from "@/stores/auth";
import { AudioRecorder } from "@/components/audio-recorder/AudioRecorder";
import { TranscriptView } from "@/components/transcript-view/TranscriptView";
import { SOAPNoteEditor } from "@/components/soap-editor/SOAPNoteEditor";
import { TopNav } from "@/components/ui/TopNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const backIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 16 }}>
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-full)",
          border: "2px solid var(--accent-faint)",
          borderTopColor: "var(--accent)",
          animation: "as-spin 0.8s linear infinite",
        }}
      />
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{label}</p>
    </div>
  );
}

function GenerateNoteButton({ sessionId, onSuccess }: { sessionId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await notesApi.generateNote(sessionId);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {error && <span style={{ fontSize: "var(--text-xs)", color: "var(--danger-text)" }}>{error}</span>}
      <Button size="lg" loading={loading} onClick={handleClick}>
        {loading ? "Starting…" : "Generate SOAP note"}
      </Button>
    </div>
  );
}

function FHIRExportButton({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<FHIRExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBundle, setShowBundle] = useState(false);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fhirApi.exportBundle(sessionId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const { valid, issues, validated_by } = result.validation;
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    const shown: FHIRValidationIssue[] = valid ? warnings.slice(0, 3) : errors;
    const persistedNote = result.posted ? "persisted to HAPI" : "validated, not persisted";

    return (
      <div
        style={{
          borderRadius: "var(--radius-xl)",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: valid ? "var(--success-faint)" : "var(--danger-tint)",
          border: `1px solid ${valid ? "var(--success-border)" : "var(--danger-border)"}`,
        }}
      >
        <span
          style={{
            color: valid ? "var(--success)" : "var(--danger-text)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          {valid ? "✓ Valid FHIR R4 — exported" : "✕ Invalid FHIR R4 — not exported"}
        </span>
        <p style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
          Bundle ID: {result.bundle_id}
          {valid && ` · ${persistedNote}`}
          {` · validated ${validated_by.join(", ")}`}
        </p>
        {shown.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {shown.map((issue, idx) => (
              <li
                key={`${issue.location ?? issue.code}-${idx}`}
                style={{
                  fontSize: "var(--text-xs)",
                  color: valid ? "var(--warning)" : "var(--danger-text)",
                }}
              >
                {issue.location ? `${issue.location}: ` : ""}
                {issue.message}
              </li>
            ))}
            {valid && warnings.length > shown.length && (
              <li style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                +{warnings.length - shown.length} more warning(s)
              </li>
            )}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setShowBundle((s) => !s)}
          style={{
            alignSelf: "flex-start",
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            color: "var(--accent)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {showBundle ? "▾ Hide FHIR bundle" : "▸ View FHIR bundle"}
        </button>
        {showBundle && (
          <pre
            style={{
              margin: 0,
              maxHeight: "22rem",
              overflow: "auto",
              borderRadius: "var(--radius-lg)",
              padding: "12px 14px",
              background: "var(--surface-overlay)",
              border: "1px solid var(--border-faint)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--text-reading)",
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(result.bundle, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {error && <span style={{ fontSize: "var(--text-xs)", color: "var(--danger-text)" }}>{error}</span>}
      <Button variant="outline" size="lg" loading={loading} onClick={handleExport}>
        {loading ? "Exporting…" : "Export to FHIR R4"}
      </Button>
    </div>
  );
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clinicianName = user?.full_name ?? user?.email ?? null;
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: session, isLoading } = useSession(id);
  const { data: transcript } = useTranscript(
    id,
    !!session && ["transcribed", "generating", "note_generated", "approved"].includes(session.status),
  );
  const { data: note } = useNote(
    id,
    !!session && ["note_generated", "approved"].includes(session.status),
  );

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      setUploadError(null);
      await audioApi.upload(id, blob);
      await audioApi.transcribe(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", id] });
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  const handleRecordingComplete = useCallback(
    (blob: Blob) => uploadMutation.mutate(blob),
    [uploadMutation],
  );

  if (isLoading)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="Loading session…" />
      </div>
    );
  if (!session) return null;

  const status = session.status;

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopNav
        left={
          <Button variant="ghost" size="sm" icon={backIcon} onClick={() => router.push("/dashboard")}>
            Sessions
          </Button>
        }
        right={<Badge status={status} />}
      />

      <main
        style={{
          maxWidth: "var(--content-reading)",
          margin: "0 auto",
          padding: "40px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
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
            {session.patient_name ?? "Unknown patient"}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(session.created_at))}
          </p>
        </div>

        {status === "recording" && (
          <>
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
            {uploadError && (
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
                {uploadError}
              </div>
            )}
          </>
        )}

        {status === "uploading" && <Spinner label="Uploading audio…" />}

        {status === "transcribing" && <Spinner label="Transcribing with Whisper — this may take a minute…" />}

        {status === "transcribed" && (
          <>
            {transcript && <TranscriptView transcript={transcript} clinicianName={clinicianName} />}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <GenerateNoteButton
                sessionId={id}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ["session", id] })}
              />
            </div>
          </>
        )}

        {status === "generating" && (
          <>
            {transcript && <TranscriptView transcript={transcript} clinicianName={clinicianName} />}
            <Spinner label="Claude is generating the SOAP note…" />
          </>
        )}

        {(status === "note_generated" || status === "approved") && (
          <>
            {transcript && <TranscriptView transcript={transcript} clinicianName={clinicianName} />}
            {note ? <SOAPNoteEditor note={note} sessionId={id} /> : <Spinner label="Loading note…" />}
            {status === "approved" && <FHIRExportButton sessionId={id} />}
          </>
        )}
      </main>
    </div>
  );
}
