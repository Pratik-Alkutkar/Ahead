"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, BadgeCheck, Mic, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TraceDrawer } from "@/components/TraceDrawer";
import { PrimaryButton, TextButton } from "@/components/ui";
import { API, api, type AskAnswer } from "@/lib/api";
import { useStore } from "@/lib/store";

const EXAMPLES = ["Can I afford a $300 concert?", "Why is my score low?", "What if I lose my job?", "Move $200 to savings", "Can I afford a trip in March?"];

type Msg = { id: number; role: "user" | "ahead"; text: string; answer?: AskAnswer; steps?: string[]; error?: boolean; done?: "approved" | "declined" };

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
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  function patch(id: number, p: Partial<Msg>) {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  function ask(q: string) {
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
    };
  }

  async function approve(m: Msg) {
    if (!m.answer?.action) return;
    try {
      const r = await api.approveAction(m.answer.action);
      patch(m.id, { done: "approved" });
      await refresh();
      showToast({ text: "Done. Nothing else moved.", undoId: r.undo_id });
    } catch (e) {
      showToast({ text: e instanceof Error ? e.message : "That didn't go through. Nothing moved." });
    }
  }

  // Browser speech as a stand-in until Nemotron voice (step 8).
  function listen() {
    type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void };
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return showToast({ text: "Voice isn't available in this browser. Type your question instead." });
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      finalText = Array.from(e.results).map((r) => r[0].transcript).join("");
      setText(finalText);
    };
    rec.onend = () => {
      setListening(false);
      if (finalText) ask(finalText);
    };
    setListening(true);
    rec.start();
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col">
      {msgs.length === 0 && (
        <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
          <button
            onClick={listen}
            aria-label={listening ? "Listening" : "Ask by voice"}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:opacity-90 ${listening ? "scale-105" : ""}`}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" aria-hidden />}
            <Mic size={36} strokeWidth={1.75} />
          </button>
          <h1 className="mt-6 text-[26px] font-bold tracking-tight">{listening ? "Listening…" : "Ask about your money"}</h1>
          <p className="mt-1 text-[15px] text-muted">Tap the mic or type. I&apos;ll check your real numbers.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full border border-line bg-card px-4 py-2 text-[14px] text-ink shadow-sm transition hover:border-accent hover:text-accent">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={m.role === "user" ? "flex justify-end" : "flex"}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-3xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-white">{m.text}</p>
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

      <form
        onSubmit={(e) => { e.preventDefault(); ask(text); }}
        className="sticky bottom-4 mt-6 flex items-center gap-2 rounded-full border border-line bg-card p-1.5 pl-2 shadow-[0_8px_24px_rgba(20,23,28,0.08)]"
      >
        <button type="button" onClick={listen} aria-label="Ask by voice" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${listening ? "bg-accent text-white" : "text-accent hover:bg-accent-soft"}`}>
          <Mic size={20} strokeWidth={1.75} />
        </button>
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
