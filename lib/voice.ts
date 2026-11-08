"use client";
import { API } from "./api";

/** Voice I/O. Uses Nemotron (server) when available, else the browser's own speech APIs. */

type SR = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void; onerror: () => void; start: () => void; stop: () => void;
};

let status: { asr: boolean; tts: boolean } | null = null;
export async function voiceStatus() {
  if (status) return status;
  try {
    status = await fetch(`${API}/voice/status`).then((r) => r.json());
  } catch {
    status = { asr: false, tts: false };
  }
  return status!;
}

function browserSR(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupported() {
  return typeof window !== "undefined" && (!!navigator.mediaDevices?.getUserMedia || !!browserSR());
}

/** Starts listening. Call the returned stop() to finish; resolves with the transcript. onPartial gets live text. */
export async function listen(onPartial: (t: string) => void): Promise<{ stop: () => void; result: Promise<string> }> {
  const s = await voiceStatus();
  if (s.asr && navigator.mediaDevices?.getUserMedia) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const result = new Promise<string>((resolve) => {
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onPartial("…");
        try {
          const fd = new FormData();
          fd.append("audio", new Blob(chunks, { type: rec.mimeType }), "speech.webm");
          const r = await fetch(`${API}/voice`, { method: "POST", body: fd });
          if (!r.ok) throw new Error("asr");
          const { transcript } = await r.json();
          onPartial(transcript);
          resolve(transcript);
        } catch {
          status = { ...s, asr: false }; // fall back for the rest of the session
          resolve("");
        }
      };
    });
    rec.start();
    return { stop: () => rec.state !== "inactive" && rec.stop(), result };
  }
  const Ctor = browserSR();
  if (!Ctor) throw new Error("no-voice");
  const sr = new Ctor();
  sr.lang = "en-US";
  sr.interimResults = true;
  sr.continuous = true;
  let text = "";
  const result = new Promise<string>((resolve) => {
    sr.onresult = (e) => {
      text = Array.from(e.results).map((r) => r[0].transcript).join("");
      onPartial(text);
    };
    sr.onend = () => resolve(text.trim());
    sr.onerror = () => resolve(text.trim());
  });
  sr.start();
  return { stop: () => sr.stop(), result };
}

let current: { stop: () => void } | null = null;

/** Speaks text; resolves when finished or stopped. */
export async function speak(text: string): Promise<void> {
  stopSpeaking();
  const s = await voiceStatus();
  if (s.tts) {
    try {
      const r = await fetch(`${API}/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error("tts");
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url);
      return await new Promise<void>((resolve) => {
        const done = () => { URL.revokeObjectURL(url); current = null; resolve(); };
        audio.onended = done;
        audio.onerror = done;
        current = { stop: () => { audio.pause(); done(); } };
        audio.play().catch(done);
      });
    } catch {
      status = { ...s, tts: false };
    }
  }
  if (!("speechSynthesis" in window)) return;
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => { current = null; resolve(); };
    u.onerror = () => { current = null; resolve(); };
    current = { stop: () => { speechSynthesis.cancel(); resolve(); } };
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  current?.stop();
  current = null;
}

// Only "yes" / "confirm" count; anything else cancels.
export const isYes = (t: string) => /^\s*(yes|confirm)\b/i.test(t);
