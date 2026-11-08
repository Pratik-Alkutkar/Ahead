"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, BadgeCheck, Camera, Mic, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TraceDrawer } from "@/components/TraceDrawer";
import { PrimaryButton, TextButton } from "@/components/ui";
import { API, api, fmtDate, type AskAnswer, type UploadResult } from "@/lib/api";
import { isYes, listen, speak, stopSpeaking, voiceSupported } from "@/lib/voice";
import { useStore } from "@/lib/store";

const EXAMPLES = ["Can I afford a $300 concert?", "Why is my score low?", "What if I lose my job?", "Move $200 to savings", "Can I afford a trip in March?"];

type Msg = { id: number; role: "user" | "ahead"; text: string; answer?: AskAnswer; steps?: string[]; error?: boolean; done?: "approved" | "declined"; upload?: UploadResult };

function actionLabel(a: AskAnswer["action"]) {
  if (!a) return "";
  if (a.kind === "transfer") return `Move $${Number(a.amount).toLocaleString()} to ${a.to}`;
  if (a.kind === "create_rule") {
    const r = a.rule as { amount: number };
    return `Save $${r.amount} every week`;
  }
  return "Do it";
}

export default function Ask() {
  const { refresh, showToast } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [live, setLive] = useState("");
  const rec = useRef<{ stop: () => void } | null>(null);
  const pressAt = useRef(0);
  const listening = mode === "listening";
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  function patch(id: number, p: Partial<Msg>) {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  function ask(q: string, viaVoice = false) {
    q = q.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const uid = ++idRef.current, aid = ++idRef.current;
    setMsgs((m) => [...m, { id: uid, role: "user", text: q }, { id: aid, role: "ahead", text: "", steps: [] }]);
    const es = new EventSource(`${API}/ask/stream?q=${encodeURIComponent(q)}`);
    const steps: string[] = [];
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      if (e.type === "step") {
        steps.push(e.label);
        patch(aid, { steps: [...steps] });
      } else if (e.type === "answer") {
        patch(aid, { text: e.answer, answer: e });
        es.close();
        setBusy(false);
        if (viaVoice) voiceReply({ id: aid, role: "ahead", text: e.answer, answer: e });
      } else if (e.type === "error") {
        patch(aid, { text: e.message, error: true });
        es.close();
        setBusy(false);
      }
    };
    es.onerror = () => {
      es.close();
      patch(aid, { text: "I couldn't reach your money right now. Try again in a moment.", error: true });
      setBusy(false);
      setMode("idle");
    };
    if (viaVoice) setMode("thinking");
  }

  /** Photo/PDF (or sample) -> what I read + before/after. Saving needs a tap. */
  async function upload(file: File | null) {
    if (busy) return;
    setBusy(true);
    const uid = ++idRef.current, aid = ++idRef.current;
    setMsgs((m) => [...m, { id: uid, role: "user", text: file ? `📎 ${file.name}` : "📎 Sample pay-later screenshot" },
      { id: aid, role: "ahead", text: "", steps: ["Reading your file"] }]);
    try {
      const u = await api.upload(file);
      const text = !u.ok ? u.why! : u.type === "price"
        ? `${u.found}. ${u.impact!.why}`
        : `I found: ${u.found}. Add it to your money?`;
      patch(aid, { text, upload: u, error: !u.ok });
    } catch (e) {
      patch(aid, { text: e instanceof Error ? e.message : "I couldn't read that.", error: true });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function approve(m: Msg) {
    const action = m.answer?.action ?? m.upload?.action;
    if (!action) return;
    try {
      const r = await api.approveAction(action);
      patch(m.id, { done: "approved" });
      await refresh();
      showToast({ text: "Done. Nothing else moved.", undoId: r.undo_id });
    } catch (e) {
      showToast({ text: e instanceof Error ? e.message : "That didn't go through. Nothing moved." });
    }
  }

  /** Speak the answer (max 2 sentences). If it proposes a move, ask for a spoken yes; anything else cancels. */
  async function voiceReply(m: Msg) {
    const a = m.answer!;
    setMode("speaking");
    await speak(a.action ? `${a.spoken_text} Say yes to confirm.` : a.spoken_text);
    if (!a.action) return setMode("idle");
    setLive("");
    setMode("listening");
    try {
      const h = await listen(setLive);
      setTimeout(h.stop, 4000);
      const said = await h.result;
      if (isYes(said)) {
        await approve(m);
        setMode("speaking");
        await speak("Done.");
      } else {
        patch(m.id, { done: "declined" });
        setMode("speaking");
        await speak("Okay, nothing moved.");
      }
    } catch {
      patch(m.id, { done: "declined" });
    }
    setMode("idle");
  }

  // Hold to talk (or tap to start, tap again to stop). Tapping while speaking stops the voice.
  async function micDown() {
    pressAt.current = Date.now();
    if (mode === "speaking") return stopSpeaking();
    if (mode === "listening") return rec.current?.stop();
    if (mode === "thinking" || busy) return;
    if (!voiceSupported()) return showToast({ text: "Voice isn't available in this browser. Type your question instead." });
    setLive("");
    try {
      const h = await listen(setLive);
      rec.current = h;
      setMode("listening");
      h.result.then((t) => {
        rec.current = null;
        setMode("idle");
        if (t && t !== "…") ask(t, true);
        else showToast({ text: "I didn't catch that. Try again or type it." });
      });
    } catch {
      showToast({ text: "I need microphone access to listen. You can type instead." });
    }
  }
  function micUp() {
    if (rec.current && Date.now() - pressAt.current > 350) rec.current.stop();
  }
  const micProps = { onPointerDown: micDown, onPointerUp: micUp, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) micDown(); } } };
  const modeLabel = { idle: "", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking… tap to stop" }[mode];

  return (
    <div className="mx-auto flex max-w-[720px] flex-col">
      {msgs.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="card-dark relative mt-2 flex flex-col items-center overflow-hidden px-5 pb-8 pt-10 text-center sm:mt-6 sm:px-10">
          <span className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sage/30 blur-3xl" aria-hidden />
          <button
            {...micProps}
            aria-label={listening ? "Stop listening" : "Hold to talk"}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-sage text-dark shadow-[0_0_0_10px_rgba(111,165,151,0.15),0_0_0_22px_rgba(111,165,151,0.07)] transition hover:brightness-110 active:scale-[0.97] ${listening ? "scale-105" : ""}`}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-sage/50" aria-hidden />}
            <Mic size={36} strokeWidth={1.75} />
          </button>
          <h1 className="relative mt-7 text-[26px] font-bold tracking-tight sm:text-[30px]">{modeLabel || "Ask about your money"}</h1>
          {listening && live ? (
            <p className="mt-2 max-w-md text-[20px] font-medium leading-snug text-white">{live}</p>
          ) : (
            <p className="mt-1 text-[15px] text-white/65">Hold the mic and talk, or type. I&apos;ll check your real numbers.</p>
          )}
          <div className="relative mt-7 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full bg-white/10 px-4 py-2 text-[14px] text-white ring-1 ring-white/10 transition hover:bg-white/20">
                {q}
              </button>
            ))}
            <button onClick={() => upload(null)} className="rounded-full border border-dashed border-sage px-4 py-2 text-[14px] text-sage transition hover:bg-sage/10">
              Try: upload a pay-later screenshot
            </button>
          </div>
          <p className="mt-4 text-[13px] text-white/50">Tap the camera to add a bill, receipt, pay-later plan, or a price tag (“Should I buy this?”).</p>
        </motion.div>
      )}

      <ul className="space-y-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={m.role === "user" ? "flex justify-end" : "flex"}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-3xl rounded-br-md bg-dark px-4 py-2.5 text-[15px] text-white">{m.text}</p>
              ) : (
                <div className="card max-w-[92%] p-4 sm:p-5">
                  {!m.text && (
                    <p className="shimmer text-[14px]">{m.steps?.at(-1) ?? "Thinking"}…</p>
                  )}
                  {m.text && (
                    <>
                      {m.answer?.blocked && (
                        <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-watch"><ShieldAlert size={14} aria-hidden /> Safety check</p>
                      )}
                      <p className={`text-[15px] leading-relaxed ${m.error ? "text-act" : ""}`}>{m.text}</p>
                      {m.upload?.ok && m.upload.after && (
                        <p className="mt-2 text-[13px] text-muted">
                          Score {m.upload.before!.score} → <b className="text-ink">{m.upload.after.score}</b> · Safe until {fmtDate(m.upload.before!.safe_until)} → <b className="text-ink">{fmtDate(m.upload.after.safe_until)}</b>
                        </p>
                      )}
                      {m.upload?.type === "price" && (
                        <p className={`mt-2 text-[13px] font-semibold ${m.upload.impact!.fits ? "text-good" : "text-watch"}`}>
                          {m.upload.impact!.fits ? "Fits" : "Wait"} · Safe until {fmtDate(m.upload.impact!.safe_until_now)} → {fmtDate(m.upload.impact!.safe_until_after)}
                        </p>
                      )}
                      {m.upload?.action && !m.done && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <PrimaryButton onClick={() => approve(m)} className="!py-2 !text-[14px]">Yes, add it</PrimaryButton>
                          <TextButton onClick={() => patch(m.id, { done: "declined" })} className="!text-muted">Not now</TextButton>
                        </div>
                      )}
                      {m.answer?.action && !m.done && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <PrimaryButton onClick={() => approve(m)} className="!py-2 !text-[14px]">Yes, {actionLabel(m.answer.action).toLowerCase()}</PrimaryButton>
                          <TextButton onClick={() => patch(m.id, { done: "declined" })} className="!text-muted">Not now</TextButton>
                        </div>
                      )}
                      {m.done === "approved" && <p className="mt-2 text-[13px] font-semibold text-good">Done. You can undo from the message below.</p>}
                      {m.done === "declined" && <p className="mt-2 text-[13px] text-muted">Okay, nothing moved.</p>}
                      {m.answer && !m.answer.blocked && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[12px]">
                          {m.answer.verified && (
                            <span className="flex items-center gap-1 font-medium text-good"><BadgeCheck size={14} aria-hidden /> Verified</span>
                          )}
                          <button onClick={() => setTrace(m.answer!.trace_id)} className="font-medium text-accent hover:underline">How I figured this out</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div ref={endRef} />

      {msgs.length > 0 && mode !== "idle" && (
        <div role="status" className="sticky bottom-24 mx-auto mt-4 flex items-center gap-3 rounded-full bg-ink px-4 py-2 text-[14px] text-bg shadow-lg">
          <Waves active={mode === "listening" || mode === "speaking"} />
          <span>{modeLabel}</span>
          {listening && live && <span className="max-w-[40ch] truncate text-white/70">“{live}”</span>}
          {mode === "speaking" && <button onClick={stopSpeaking} className="font-semibold text-[#5EEAD4]">Stop</button>}
        </div>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(text); }}
        className="sticky bottom-4 mt-6 flex items-center gap-2 rounded-full border border-line bg-card p-1.5 pl-2 shadow-[0_8px_24px_rgba(20,23,28,0.08)]"
      >
        <button type="button" {...micProps} aria-label={listening ? "Stop listening" : "Hold to talk"} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${listening ? "bg-accent text-white" : "text-accent hover:bg-accent-soft"}`}>
          <Mic size={20} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add a photo or PDF: bill, receipt, pay-later plan or price tag" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-soft disabled:opacity-40">
          <Camera size={20} strokeWidth={1.75} />
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <label htmlFor="q" className="sr-only">Ask a question</label>
        <input
          id="q" value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder={msgs.length ? "Ask a follow-up" : "Can I afford…"} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40">
          <ArrowUp size={20} strokeWidth={2} />
        </button>
      </form>
      {msgs.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {EXAMPLES.slice(0, 3).map((q) => (
            <button key={q} onClick={() => ask(q)} disabled={busy} className="rounded-full bg-card px-3 py-1.5 text-[12px] text-muted hover:text-accent disabled:opacity-50">{q}</button>
          ))}
        </div>
      )}
      <TraceDrawer id={trace} onClose={() => setTrace(null)} />
    </div>
  );
}

/** Soft waveform: 4 bars that breathe while listening or speaking. */
function Waves({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((k) => (
        <span key={k} className="w-1 rounded-full bg-[#5EEAD4]" style={{ height: active ? undefined : 4, animation: active ? `wave 0.9s ease-in-out ${k * 0.12}s infinite` : "none" }} />
      ))}
    </span>
  );
}
