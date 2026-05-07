"use client";

import { useQuery } from "@tanstack/react-query";
import { audioApi, notesApi, sessionsApi } from "@/lib/api";

const POLLING_STATUSES = new Set(["transcribing", "generating"]);

export function useSession(id: string) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => sessionsApi.get(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && POLLING_STATUSES.has(status) ? 3000 : false;
    },
    enabled: !!id,
  });
}

export function useTranscript(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["transcript", sessionId],
    queryFn: () => audioApi.getTranscript(sessionId),
    enabled,
  });
}

export function useNote(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["note", sessionId],
    queryFn: () => notesApi.getNote(sessionId),
    enabled,
  });
}
