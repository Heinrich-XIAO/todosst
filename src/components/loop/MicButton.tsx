"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";

// Voice capture through the browser's built-in speech recognition (Chrome on
// Android has it; nothing is uploaded by us — the browser's speech service
// handles the audio). Hidden when the browser has none, so the keyboard
// dictation key remains the fallback there.

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function MicButton({
  onFinal,
  onInterim,
  onProblem,
  autoStart,
}: {
  /** the finished transcript, once per utterance */
  onFinal: (text: string) => void;
  /** live partial transcript while speaking ("" when it ends) */
  onInterim?: (text: string) => void;
  onProblem?: (message: string) => void;
  /** start listening as soon as it mounts (the home-screen "voice capture" shortcut) */
  autoStart?: boolean;
}) {
  // false on the server and during hydration, then the real answer
  const supported = useSyncExternalStore(
    () => () => {},
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const heardRef = useRef("");
  // keep the latest callbacks without restarting an in-flight recognition
  const cb = useRef({ onFinal, onInterim, onProblem });
  useEffect(() => {
    cb.current = { onFinal, onInterim, onProblem };
  });

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    heardRef.current = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      heardRef.current = text.trim();
      cb.current.onInterim?.(heardRef.current);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        cb.current.onProblem?.("microphone permission is blocked — allow it for this site, or use your keyboard's mic key");
      } else if (e.error === "network") {
        cb.current.onProblem?.("speech recognition needs a connection");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        cb.current.onProblem?.(`voice capture failed (${e.error})`);
      }
    };
    rec.onend = () => {
      const text = heardRef.current;
      heardRef.current = "";
      recRef.current = null;
      setListening(false);
      cb.current.onInterim?.("");
      if (text) cb.current.onFinal(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, []);

  const startedAuto = useRef(false);
  useEffect(() => {
    if (autoStart && supported && !startedAuto.current) {
      startedAuto.current = true;
      start();
    }
  }, [autoStart, supported, start]);

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => (listening ? recRef.current?.stop() : start())}
      aria-label={listening ? "stop listening" : "capture by voice"}
      title={listening ? "stop — what you said is captured" : "capture by voice"}
      className={`flex h-9 w-9 shrink-0 items-center justify-center border border-foreground ${
        listening ? "animate-pulse bg-foreground text-background" : "hover:bg-foreground hover:text-background"
      }`}
    >
      {listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
    </button>
  );
}
