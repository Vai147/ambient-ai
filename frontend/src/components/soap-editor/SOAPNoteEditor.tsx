"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notesApi, type SOAPNoteResponse, type NoteSectionEdit } from "@/lib/api";

type SectionKey = "subjective" | "objective" | "assessment" | "plan";
type SectionAction = "pending" | "accept" | "edit" | "reject";

interface SectionState {
  action: SectionAction;
  editedText: string;
}

function HallucinationBadge({ risk }: { risk: string }) {
  const colors: Record<string, { text: string; bg: string }> = {
    low:    { text: "var(--success)", bg: "var(--success-tint)" },
    medium: { text: "var(--warning)",  bg: "var(--warning-tint)"  },
    high:   { text: "var(--danger-text)",  bg: "var(--danger-tint)"  },
  };
  const c = colors[risk] ?? colors.low;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: c.text, background: c.bg }}
    >
      <span aria-hidden>⚠</span>
      {risk} hallucination risk
    </span>
  );
}

function UnverifiedFlag({ item }: { item: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="rounded px-1 text-xs font-medium cursor-pointer"
        style={{
          background: "var(--warning-flag)",
          color: "var(--warning-bright)",
          textDecoration: "underline dotted",
        }}
      >
        {item}
      </button>
      {open && (
        <span
          className="absolute bottom-full left-0 mb-1.5 z-10 w-56 rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid var(--warning-border)",
            color: "var(--text-reading)",
          }}
        >
          Not found in transcript — verify before approving
        </span>
      )}
    </span>
  );
}

function SectionActionBar({
  state,
  onChange,
  locked,
}: {
  state: SectionState;
  onChange: (next: SectionState) => void;
  locked: boolean;
}) {
  const btn = (label: string, action: SectionAction, activeColor: string) => (
    <button
      type="button"
      disabled={locked}
      onClick={() =>
        onChange(
          state.action === action
            ? { ...state, action: "pending" }
            : { ...state, action },
        )
      }
      className="px-3 py-1 rounded text-xs font-medium transition-all"
      style={{
        background:
          state.action === action
            ? activeColor
            : "var(--border-faint)",
        color:
          state.action === action
            ? "var(--text-on-accent)"
            : "var(--text-secondary)",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {btn("Accept", "accept", "var(--success)")}
      {btn("Edit", "edit", "var(--accent)")}
      {btn("Reject", "reject", "var(--danger-text)")}
    </div>
  );
}

function SectionShell({
  title,
  locked,
  lockedColor,
  children,
}: {
  title: string;
  locked?: boolean;
  lockedColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-5 py-4 flex flex-col gap-3"
      style={{
        background: "var(--surface-soft)",
        border: `1px solid ${locked && lockedColor ? "var(--success-border)" : "var(--border-faint)"}`,
        transition: "border-color var(--duration-normal) var(--ease-in-out)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          {title}
        </h3>
        {locked && lockedColor && (
          <span className="text-xs font-medium" style={{ color: lockedColor }}>
            ✓ Accepted
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TextSection({
  label,
  value,
  state,
  unverified,
  onChange,
  approved,
}: {
  label: string;
  value: string | null;
  state: SectionState;
  unverified: string[];
  onChange: (s: SectionState) => void;
  approved: boolean;
}) {
  const isAccepted = state.action === "accept";
  const isRejected = state.action === "reject";

  return (
    <SectionShell
      title={label}
      locked={isAccepted}
      lockedColor="var(--success)"
    >
      {state.action === "edit" ? (
        <textarea
          className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
          style={{
            background: "var(--surface-overlay)",
            border: "1px solid var(--accent-border)",
            color: "var(--text-reading)",
            minHeight: "6rem",
          }}
          value={state.editedText}
          onChange={(e) => onChange({ ...state, editedText: e.target.value })}
          autoFocus
        />
      ) : (
        <p
          className="text-sm leading-relaxed"
          style={{
            color: isRejected
              ? "var(--text-tertiary)"
              : "var(--text-body)",
            textDecoration: isRejected ? "line-through" : "none",
          }}
        >
          {value ?? "—"}
          {unverified.length > 0 && (
            <span className="ml-1.5 gap-1 inline-flex flex-wrap">
              {unverified.map((u) => (
                <UnverifiedFlag key={u} item={u} />
              ))}
            </span>
          )}
        </p>
      )}
      <SectionActionBar state={state} onChange={onChange} locked={approved} />
    </SectionShell>
  );
}

function AssessmentSection({
  note,
  state,
  unverified,
  onChange,
  approved,
}: {
  note: SOAPNoteResponse;
  state: SectionState;
  unverified: string[];
  onChange: (s: SectionState) => void;
  approved: boolean;
}) {
  const isRejected = state.action === "reject";
  const isAccepted = state.action === "accept";
  const a = note.assessment;

  return (
    <SectionShell title="Assessment" locked={isAccepted} lockedColor="var(--success)">
      <div
        className="text-sm leading-relaxed space-y-2"
        style={{
          color: isRejected ? "var(--text-tertiary)" : "var(--text-body)",
          textDecoration: isRejected ? "line-through" : "none",
        }}
      >
        {a.summary && <p>{a.summary}</p>}
        {a.icd10_codes.length > 0 && (
          <ul className="space-y-0.5">
            {a.icd10_codes.map((c) => {
              const flagged = unverified.includes(c.description);
              return (
                <li key={c.code} className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "var(--surface-overlay)", color: "var(--accent)" }}
                  >
                    {c.code}
                  </span>
                  {flagged ? (
                    <UnverifiedFlag item={c.description} />
                  ) : (
                    <span>{c.description}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <SectionActionBar state={state} onChange={onChange} locked={approved} />
    </SectionShell>
  );
}

function PlanSection({
  note,
  state,
  unverified,
  onChange,
  approved,
}: {
  note: SOAPNoteResponse;
  state: SectionState;
  unverified: string[];
  onChange: (s: SectionState) => void;
  approved: boolean;
}) {
  const isRejected = state.action === "reject";
  const isAccepted = state.action === "accept";
  const p = note.plan;

  return (
    <SectionShell title="Plan" locked={isAccepted} lockedColor="var(--success)">
      <div
        className="text-sm leading-relaxed space-y-2"
        style={{
          color: isRejected ? "var(--text-tertiary)" : "var(--text-body)",
          textDecoration: isRejected ? "line-through" : "none",
        }}
      >
        {p.medications.length > 0 && (
          <div>
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Medications
            </span>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              {p.medications.map((m) => {
                const flagged = unverified.includes(m.name);
                const detail = [m.dose, m.frequency, m.duration].filter(Boolean).join(" · ");
                return (
                  <li key={m.name}>
                    {flagged ? <UnverifiedFlag item={m.name} /> : <span>{m.name}</span>}
                    {detail && (
                      <span style={{ color: "var(--text-tertiary)" }}> — {detail}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {p.instructions && <p>{p.instructions}</p>}
        {p.follow_up && (
          <p style={{ color: "var(--text-secondary)" }}>Follow-up: {p.follow_up}</p>
        )}
      </div>
      <SectionActionBar state={state} onChange={onChange} locked={approved} />
    </SectionShell>
  );
}

function initState(note: SOAPNoteResponse): Record<SectionKey, SectionState> {
  const corrections = (note.corrections ?? {}) as Record<string, { action: string; edited_text: string | null }>;
  const init = (key: SectionKey, defaultText: string): SectionState => {
    const c = corrections[key];
    if (c) return { action: c.action as SectionAction, editedText: c.edited_text ?? defaultText };
    return { action: "pending", editedText: defaultText };
  };
  return {
    subjective: init("subjective", note.subjective ?? ""),
    objective:  init("objective",  note.objective ?? ""),
    assessment: init("assessment", note.assessment.summary ?? ""),
    plan:       init("plan",       note.plan.instructions ?? ""),
  };
}

export function SOAPNoteEditor({
  note,
  sessionId,
}: {
  note: SOAPNoteResponse;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(
    () => initState(note),
  );
  const [approveConfirm, setApproveConfirm] = useState(false);

  const hal = note.hallucination_flags as {
    unverified?: string[];
    hallucination_risk?: string;
  } | null;
  const unverified = hal?.unverified ?? [];
  const risk = hal?.hallucination_risk ?? "low";
  const isApproved = !!note.clinician_approved_at;

  const mutation = useMutation({
    mutationFn: ({ edits, approve }: { edits: NoteSectionEdit[]; approve: boolean }) =>
      notesApi.updateNote(sessionId, edits, approve),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      setApproveConfirm(false);
    },
  });

  function buildEdits(): NoteSectionEdit[] {
    return (Object.entries(sections) as [SectionKey, SectionState][])
      .filter(([, s]) => s.action !== "pending")
      .map(([key, s]) => ({
        section: key,
        action: s.action as "accept" | "edit" | "reject",
        edited_text: s.action === "edit" ? s.editedText : null,
      }));
  }

  function handleSave() {
    mutation.mutate({ edits: buildEdits(), approve: false });
  }

  function handleApprove() {
    if (!approveConfirm) {
      const hasUnverified = unverified.some(
        (u) =>
          sections.assessment.action === "accept" ||
          sections.plan.action === "accept",
      );
      if (hasUnverified && unverified.length > 0) {
        setApproveConfirm(true);
        return;
      }
    }
    mutation.mutate({ edits: buildEdits(), approve: true });
  }

  const update = (key: SectionKey) => (s: SectionState) =>
    setSections((p) => ({ ...p, [key]: s }));

  const anyEdited = Object.values(sections).some((s) => s.action !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          SOAP Note
        </h2>
        <div className="flex items-center gap-2">
          {risk !== "low" && <HallucinationBadge risk={risk} />}
          {isApproved && (
            <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
              Approved
            </span>
          )}
        </div>
      </div>

      <TextSection
        label="Subjective"
        value={note.subjective}
        state={sections.subjective}
        unverified={[]}
        onChange={update("subjective")}
        approved={isApproved}
      />
      <TextSection
        label="Objective"
        value={note.objective}
        state={sections.objective}
        unverified={[]}
        onChange={update("objective")}
        approved={isApproved}
      />
      <AssessmentSection
        note={note}
        state={sections.assessment}
        unverified={unverified}
        onChange={update("assessment")}
        approved={isApproved}
      />
      <PlanSection
        note={note}
        state={sections.plan}
        unverified={unverified}
        onChange={update("plan")}
        approved={isApproved}
      />

      {!isApproved && (
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border-faint)" }}>
          <div>
            {mutation.isError && (
              <p className="text-xs" style={{ color: "var(--danger-text)" }}>
                {(mutation.error as Error)?.message ?? "Save failed"}
              </p>
            )}
            {approveConfirm && (
              <p className="text-xs" style={{ color: "var(--warning)" }}>
                Note contains unverified items. Approve anyway?
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!anyEdited || mutation.isPending}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: anyEdited ? "var(--border-subtle)" : "var(--border-hairline)",
                color: anyEdited ? "var(--text-body)" : "var(--text-muted)",
                cursor: !anyEdited || mutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={handleApprove}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: approveConfirm
                  ? "var(--warning)"
                  : "var(--success)",
                color: "var(--text-on-accent)",
                cursor: mutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {approveConfirm ? "Confirm Approve" : "Approve & Lock"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
