"use client";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Clock } from "lucide-react";
import { useState } from "react";
import { api, fmtDate, type Alert } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ForecastChart } from "./ForecastChart";
import { fadeUp, PrimaryButton, StatusPill, TextButton } from "./ui";

export function AlertCard({ alert, i = 0, onTrace }: { alert: Alert; i?: number; onTrace: (id: string) => void }) {
  const { forecast, refresh, showToast } = useStore();
  const [chosen, setChosen] = useState(alert.fixes[0]?.id);
  const [hover, setHover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fix = alert.fixes.find((f) => f.id === (hover ?? chosen));
  const Icon = alert.level === "act" ? AlertCircle : Clock;

  async function approve() {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.approve(alert.id, chosen);
      await refresh();
      showToast({ text: `Done. Score ${r.summary.score}, safe until ${fmtDate(r.summary.safe_until)}.`, undoId: r.undo_id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't go through. Nothing was moved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      variants={fadeUp}
      initial="hidden"
      animate="show"
      custom={i}
      className={`card overflow-hidden ${alert.level === "act" ? "border-t-4 !border-t-[var(--ring-act)]" : "border-t-4 !border-t-[var(--ring-watch)]"} p-6 sm:p-8`}
    >
      <div className="flex items-start gap-3">
        <Icon size={22} strokeWidth={1.5} className={alert.level === "act" ? "mt-0.5 text-act" : "mt-0.5 text-watch"} aria-hidden />
        <div className="flex-1">
          <StatusPill level={alert.level} />
          <h3 className="mt-1 text-[19px] font-semibold leading-snug">{alert.title}</h3>
          <p className="mt-1 text-[15px] text-muted">{alert.body}</p>
        </div>
      </div>

      {alert.fixes.length > 0 && (
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Choose a fix</legend>
          {alert.fixes.map((f, idx) => (
            <label
              key={f.id}
              onMouseEnter={() => setHover(f.id)}
              onMouseLeave={() => setHover(null)}
              className={`flex cursor-pointer flex-col gap-2 rounded-2xl p-4 transition sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${chosen === f.id ? "bg-accent-soft ring-2 ring-accent" : "bg-bg hover:bg-line"}`}
            >
              <span className="flex items-center gap-3">
                <input type="radio" name={`fix-${alert.id}`} checked={chosen === f.id} onChange={() => setChosen(f.id)} className="accent-[var(--accent)]" />
                <span className="text-[15px]">
                  {f.title}
                  {idx === 0 && alert.fixes.length > 1 && <span className="ml-2 text-[13px] font-medium text-good">Best fix</span>}
                </span>
              </span>
              {f.preview && alert.current && (
                <span className="shrink-0 pl-7 text-[13px] text-muted tabular-nums sm:pl-0 sm:text-right">
                  Score {alert.current.score} <ArrowRight size={12} className="inline" aria-label="to" /> {f.preview.score}
                  <span className="sm:hidden"> · </span>
                  <br className="hidden sm:block" />
                  Safe {fmtDate(f.preview.safe_until)}
                </span>
              )}
            </label>
          ))}
        </fieldset>
      )}

      {forecast && fix?.preview && (
        <div className="mt-5">
          <div className="mb-1 flex gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" aria-hidden /> Now</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[var(--ring-good)]" aria-hidden /> With this fix</span>
          </div>
          <ForecastChart forecast={forecast} whatIf={fix.preview.days} height={180} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {alert.fixes.length > 0 && (
          <PrimaryButton onClick={approve} disabled={busy || !chosen}>
            {busy ? "Working…" : "Approve"}
          </PrimaryButton>
        )}
        {alert.trace_id && <TextButton onClick={() => onTrace(alert.trace_id!)}>How I figured this out</TextButton>}
      </div>
      {err && <p role="alert" className="mt-3 text-[13px] text-act">{err}</p>}
    </motion.article>
  );
}
