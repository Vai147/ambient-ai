"use client";

import { useCallback, useRef, useState } from "react";

export type RecordingState = "idle" | "recording" | "stopped";

export interface UseAudioRecorderReturn {
  state: RecordingState;
  blob: Blob | null;
  elapsed: number;
  analyserNode: AnalyserNode | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    setAnalyserNode(analyser);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: "audio/webm" });
      setBlob(recorded);
    };

    recorder.start(100);
    recorderRef.current = recorder;
    setState("recording");
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setState("stopped");
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setElapsed(0);
    setAnalyserNode(null);
    setState("idle");
  }, []);

  return { state, blob, elapsed, analyserNode, start, stop, reset };
}
