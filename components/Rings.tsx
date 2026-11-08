"use client";
import { motion } from "framer-motion";
import type { Indicator } from "@/lib/api";
import { CountUp, Why } from "./ui";

export const LABELS: Record<string, string> = {
  safety_cushion: "Safety cushion",
  pay_to_debt: "Pay going to debt",
  savings_rate: "Money you keep",
  card_fullness: "How full your card is",
};
const ORDER = ["safety_cushion", "pay_to_debt", "savings_rate", "card_fullness"];

function tone(p: number) {
  return p >= 0.66
    ? { ring: "var(--ring-good)", word: "Good", cls: "text-good" }
    : p >= 0.33
      ? { ring: "var(--ring-watch)", word: "Watch", cls: "text-watch" }
      : { ring: "var(--ring-act)", word: "Needs care", cls: "text-act" };
}

export function scoreLevel(score: number) {
  return score >= 70
    ? { word: "Doing well", cls: "text-good" }
    : score >= 50
      ? { word: "Getting there", cls: "text-watch" }
      : { word: "Needs care", cls: "text-act" };
}

/** Score ring + 4 indicator tiles. Tiles never share a row with the ring on narrow widths, so nothing overlaps. */
export function Rings({ score, indicators }: { score: number; indicators: Record<string, Indicator> }) {
  const size = 168, stroke = 11, gap = 4;
  const lvl = scoreLevel(score);
  return (
    <div className="grid items-center gap-6 md:grid-cols-[auto_1fr] md:gap-8">
      <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Health score ${score} out of 100`}>
          {ORDER.map((k, i) => {
            const r = size / 2 - stroke / 2 - i * (stroke + gap);
            const c = 2 * Math.PI * r;
            const p = (indicators[k]?.points ?? 0) / 25;
            return (
              <g key={k} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
                <motion.circle
                  cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone(p).ring} strokeWidth={stroke}
                  strokeLinecap="round" strokeDasharray={c}
                  initial={{ strokeDashoffset: c }}
                  animate={{ strokeDashoffset: c * (1 - Math.max(p, 0.02)) }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[36px] font-bold leading-none tracking-tight tabular-nums"><CountUp value={score} /></span>
          <span className="mt-0.5 text-[11px] font-medium text-faint">of 100</span>
        </div>
      </div>
      <div>
        <p className={`mb-3 text-[15px] font-semibold ${lvl.cls}`}>{lvl.word}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ORDER.map((k) => {
            const ind = indicators[k];
            if (!ind) return null;
            const t = tone(ind.points / 25);
            return (
              <li key={k} className="flex items-center justify-between gap-2 rounded-2xl bg-bg px-3.5 py-3">
                <span className="flex min-w-0 items-center gap-2 text-[14px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.ring }} aria-hidden />
                  <span className="truncate">{LABELS[k]}</span>
                  <Why text={ind.why} label={`Why: ${LABELS[k]}`} />
                </span>
                <span className={`shrink-0 text-[13px] font-medium ${t.cls}`}>{t.word}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
