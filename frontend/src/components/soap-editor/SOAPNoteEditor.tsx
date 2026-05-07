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
    low:    { text: "oklch(72% 0.18 155)", bg: "oklch(72% 0.18 155 / 0.1)" },
    medium: { text: "oklch(78% 0.19 75)",  bg: "oklch(78% 0.19 75 / 0.1)"  },
    high:   { text: "oklch(75% 0.18 25)",  bg: "oklch(75% 0.18 25 / 0.1)"  },
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
          background: "oklch(78% 0.19 75 / 0.18)",
          color: "oklch(85% 0.19 75)",
          textDecoration: "underline dotted",
        }}
      >
        {item}
      </button>
      {open && (
        <span
          className="absolute bottom-full left-0 mb-1.5 z-10 w-56 rounded-lg px-3 py-2 text-xs leading-relaxed shadow-lg"
          style={{
            background: "oklch(22% 0.01 250)",
            border: "1px solid oklch(78% 0.19 75 / 0.3)",
            color: "oklch(85% 0.01 250)",
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
            : "oklch(96% 0.005 250 / 0.06)",
        color:
          state.action === action
            ? "oklch(14% 0.01 250)"
            : "oklch(65% 0.01 250)",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {btn("Accept", "accept", "oklch(72% 0.18 155)")}
      {btn("Edit", "edit", "oklch(70% 0.18 195)")}
      {btn("Reject", "reject", "oklch(75% 0.18 25)")}
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
        background: "oklch(17% 0.01 250)",
        border: `1px solid ${locked && lockedColor ? lockedColor + " / 0.35" : "oklch(96% 0.005 250 / 0.06)"}`,
        transition: "border-color 0.2s",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "oklch(55% 0.01 250)" }}>
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
      lockedColor="oklch(72% 0.18 155)"
    >
      {state.action === "edit" ? (
        <textarea
          className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
          style={{
            background: "oklch(20% 0.01 250)",
            border: "1px solid oklch(70% 0.18 195 / 0.4)",
            color: "oklch(92% 0.005 250)",
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
              ? "oklch(55% 0.01 250)"
              : "oklch(80% 0.005 250)",
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
    <SectionShell title="Assessment" locked={isAccepted} lockedColor="oklch(72% 0.18 155)">
      <div
        className="text-sm leading-relaxed space-y-2"
        style={{
          color: isRejected ? "oklch(55% 0.01 250)" : "oklch(80% 0.005 250)",
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
                    style={{ background: "oklch(22% 0.01 250)", color: "oklch(70% 0.18 195)" }}
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
    <SectionShell title="Plan" locked={isAccepted} lockedColor="oklch(72% 0.18 155)">
      <div
        className="text-sm leading-relaxed space-y-2"
        style={{
          color: isRejected ? "oklch(55% 0.01 250)" : "oklch(80% 0.005 250)",
          textDecoration: isRejected ? "line-through" : "none",
        }}
      >
        {p.medications.length > 0 && (
          <div>
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "oklch(55% 0.01 250)" }}
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
                      <span style={{ color: "oklch(55% 0.01 250)" }}> — {detail}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {p.instructions && <p>{p.instructions}</p>}
        {p.follow_up && (
          <p style={{ color: "oklch(65% 0.01 250)" }}>Follow-up: {p.follow_up}</p>
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
        <h2 className="text-base font-semibold" style={{ color: "oklch(96% 0.005 250)" }}>
          SOAP Note
        </h2>
        <div className="flex items-center gap-2">
          {risk !== "low" && <HallucinationBadge risk={risk} />}
          {isApproved && (
            <span className="text-xs font-medium" style={{ color: "oklch(72% 0.18 155)" }}>
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
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "oklch(96% 0.005 250 / 0.06)" }}>
          <div>
            {mutation.isError && (
              <p className="text-xs" style={{ color: "oklch(75% 0.18 25)" }}>
                {(mutation.error as Error)?.message ?? "Save failed"}
              </p>
            )}
            {approveConfirm && (
              <p className="text-xs" style={{ color: "oklch(78% 0.19 75)" }}>
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
                background: anyEdited ? "oklch(96% 0.005 250 / 0.08)" : "oklch(96% 0.005 250 / 0.04)",
                color: anyEdited ? "oklch(80% 0.005 250)" : "oklch(45% 0.01 250)",
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
                  ? "oklch(78% 0.19 75)"
                  : "oklch(72% 0.18 155)",
                color: "oklch(14% 0.01 250)",
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
