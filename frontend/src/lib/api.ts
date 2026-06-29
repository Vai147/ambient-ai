import { getToken } from "@/lib/cookies";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type TokenResponse = { access_token: string; token_type: string };
export type UserResponse = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<UserResponse>("/api/auth/me"),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export type SessionStatus =
  | "recording"
  | "uploading"
  | "transcribing"
  | "transcribed"
  | "generating"
  | "note_generated"
  | "approved";

export type SessionResponse = {
  id: string;
  clinician_id: string;
  status: SessionStatus;
  audio_file_path: string | null;
  patient_name: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionListResponse = {
  sessions: SessionResponse[];
  total: number;
};

export const sessionsApi = {
  list: () => request<SessionListResponse>("/api/sessions"),

  get: (id: string) => request<SessionResponse>(`/api/sessions/${id}`),

  create: (patient_name?: string) =>
    request<SessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ patient_name: patient_name ?? null }),
    }),

  status: (id: string) =>
    request<{ session_id: string; status: SessionStatus }>(`/api/sessions/${id}/status`),

  remove: (id: string) =>
    request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
};

// ─── Audio / Transcription ────────────────────────────────────────────────────

export type TaskStatusResponse = {
  task_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";
  result: Record<string, unknown> | null;
  error: string | null;
};

export type TranscriptResponse = {
  id: string;
  session_id: string;
  content: string;
  speaker_turns: Array<{
    start: number;
    end: number;
    text: string;
    speaker: string;
  }>;
  whisper_model: string;
  created_at: string;
};

// ─── Notes ────────────────────────────────────────────────────────────────────

export type ICD10Code = { code: string; description: string };
export type Medication = {
  name: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
};
export type SOAPNoteResponse = {
  id: string;
  session_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: {
    summary: string;
    diagnoses: string[];
    icd10_codes: ICD10Code[];
  };
  plan: {
    medications: Medication[];
    instructions: string;
    follow_up: string | null;
    referrals: string[];
  };
  hallucination_flags: Record<string, unknown> | null;
  corrections: Record<string, unknown> | null;
  clinician_approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteSectionEdit = {
  section: "subjective" | "objective" | "assessment" | "plan";
  action: "accept" | "edit" | "reject";
  edited_text?: string | null;
};

export const notesApi = {
  getNote: (sessionId: string) =>
    request<SOAPNoteResponse>(`/api/sessions/${sessionId}/note`),

  generateNote: (sessionId: string) =>
    request<TaskStatusResponse>(`/api/sessions/${sessionId}/generate-note`, {
      method: "POST",
    }),

  updateNote: (sessionId: string, edits: NoteSectionEdit[], approve = false) =>
    request<SOAPNoteResponse>(`/api/sessions/${sessionId}/note`, {
      method: "PATCH",
      body: JSON.stringify({ edits, approve }),
    }),
};

// ─── FHIR Export ─────────────────────────────────────────────────────────────

export type FHIRValidationIssue = {
  severity: "error" | "warning" | "information";
  code: string;
  location: string | null;
  message: string;
  source: "local" | "hapi";
};

export type FHIRValidation = {
  valid: boolean;
  issues: FHIRValidationIssue[];
  validated_by: string[];
  hapi_reachable: boolean | null;
  validated_at: string;
};

export type FHIRExportResponse = {
  bundle_id: string;
  bundle: Record<string, unknown>;
  posted: boolean;
  validation: FHIRValidation;
};

export const fhirApi = {
  exportBundle: (sessionId: string) =>
    request<FHIRExportResponse>(`/api/fhir/${sessionId}/export-fhir`, {
      method: "POST",
    }),

  getComposition: (compositionId: string) =>
    request<Record<string, unknown>>(`/api/fhir/Composition/${compositionId}`),
};

// ─── Audio / Transcription ────────────────────────────────────────────────────

export const audioApi = {
  upload: (sessionId: string, blob: Blob, filename = "recording.webm") => {
    const token = typeof window !== "undefined"
      ? document.cookie.match(/token=([^;]+)/)?.[1]
      : null;
    const form = new FormData();
    form.append("file", blob, filename);
    return fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/sessions/${sessionId}/audio`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail ?? "Upload failed");
      }
      return res.json() as Promise<SessionResponse>;
    });
  },

  transcribe: (sessionId: string) =>
    request<TaskStatusResponse>(`/api/sessions/${sessionId}/transcribe`, {
      method: "POST",
    }),

  getTranscript: (sessionId: string) =>
    request<TranscriptResponse>(`/api/sessions/${sessionId}/transcript`),
};
