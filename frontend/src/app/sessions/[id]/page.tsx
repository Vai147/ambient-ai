"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { audioApi, notesApi, fhirApi, type FHIRExportResponse } from "@/lib/api";
import { useSession, useTranscript, useNote } from "@/hooks/useSession";
import { AudioRecorder } from "@/components/audio-recorder/AudioRecorder";
import { TranscriptView } from "@/components/transcript-view/TranscriptView";
import { SOAPNoteEditor } from "@/components/soap-editor/SOAPNoteEditor";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    recording:      { label: "Recording",    color: "oklch(78% 0.19 75)",  bg: "oklch(78% 0.19 75 / 0.12)"  },
    uploading:      { label: "Uploading",    color: "oklch(78% 0.19 75)",  bg: "oklch(78% 0.19 75 / 0.12)"  },
    transcribing:   { label: "Transcribing", color: "oklch(70% 0.18 195)", bg: "oklch(70% 0.18 195 / 0.12)" },
    transcribed:    { label: "Transcribed",  color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
    generating:     { label: "Generating",   color: "oklch(70% 0.18 195)", bg: "oklch(70% 0.18 195 / 0.12)" },
    note_generated: { label: "Note Ready",   color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
    approved:       { label: "Approved",     color: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.12)" },
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

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "oklch(70% 0.18 195 / 0.2)", borderTopColor: "oklch(70% 0.18 195)" }}
      />
      <p className="text-sm" style={{ color: "oklch(65% 0.01 250)" }}>{label}</p>
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
    <div className="flex flex-col items-end gap-2">
      {error && <span className="text-xs" style={{ color: "oklch(75% 0.18 25)" }}>{error}</span>}
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: loading ? "oklch(70% 0.18 195 / 0.5)" : "oklch(70% 0.18 195)",
          color: "oklch(14% 0.01 250)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Starting…" : "Generate SOAP note"}
      </button>
    </div>
  );
}


function FHIRExportButton({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<FHIRExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return (
      <div
        className="rounded-xl px-5 py-4 flex flex-col gap-2"
        style={{ background: "oklch(72% 0.18 155 / 0.08)", border: "1px solid oklch(72% 0.18 155 / 0.25)" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "oklch(72% 0.18 155)" }} className="text-sm font-medium">
            FHIR Bundle exported
          </span>
        </div>
        <p className="text-xs font-mono" style={{ color: "oklch(65% 0.01 250)" }}>
          Bundle ID: {result.bundle_id}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <span className="text-xs" style={{ color: "oklch(75% 0.18 25)" }}>{error}</span>}
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: loading ? "oklch(55% 0.01 250 / 0.3)" : "oklch(22% 0.01 250)",
          border: "1px solid oklch(55% 0.01 250 / 0.3)",
          color: loading ? "oklch(45% 0.01 250)" : "oklch(80% 0.005 250)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Exporting…" : "Export to FHIR R4"}
      </button>
    </div>
  );
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(14% 0.01 250)" }}>
      <Spinner label="Loading session…" />
    </div>
  );
  if (!session) return null;

  const status = session.status;

  return (
    <div className="min-h-screen" style={{ background: "oklch(14% 0.01 250)" }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 h-14"
        style={{
          background: "oklch(14% 0.01 250 / 0.85)",
          borderBottom: "1px solid oklch(96% 0.005 250 / 0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "oklch(55% 0.01 250)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sessions
        </button>
        <StatusBadge status={status} />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "oklch(96% 0.005 250)" }}>
            {session.patient_name ?? "Unknown patient"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "oklch(55% 0.01 250)" }}>
            {new Intl.DateTimeFormat("en-US", {
              month: "long", day: "numeric", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            }).format(new Date(session.created_at))}
          </p>
        </div>

        {status === "recording" && (
          <>
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
            {uploadError && (
              <div
                className="text-xs px-3 py-2.5 rounded-lg"
                style={{ background: "oklch(55% 0.22 25 / 0.12)", border: "1px solid oklch(55% 0.22 25 / 0.3)", color: "oklch(75% 0.18 25)" }}
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
            {transcript && <TranscriptView transcript={transcript} />}
            <div className="flex justify-end">
              <GenerateNoteButton
                sessionId={id}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ["session", id] })}
              />
            </div>
          </>
        )}

        {status === "generating" && (
          <>
            {transcript && <TranscriptView transcript={transcript} />}
            <Spinner label="Claude is generating the SOAP note…" />
          </>
        )}

        {(status === "note_generated" || status === "approved") && (
          <>
            {transcript && <TranscriptView transcript={transcript} />}
            {note ? <SOAPNoteEditor note={note} sessionId={id} /> : <Spinner label="Loading note…" />}
            {status === "approved" && <FHIRExportButton sessionId={id} />}
          </>
        )}
      </main>
    </div>
  );
}
