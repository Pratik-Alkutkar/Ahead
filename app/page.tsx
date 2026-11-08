"use client";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BudgetTile, CardTile, DebtTile, FutureYouCard } from "@/components/Tiles";
import { Card, CountMoney, CountUp, Flip, PrimaryButton, reveal, TextButton, Why } from "@/components/ui";
import { api, fmtDate, usd, type Forecast, type Summary } from "@/lib/api";
import { useStore } from "@/lib/store";

const VIEW = { once: true, amount: 0.2 } as const;

export default function Home() {
  const { summary: s, overview: o, forecast: f, loading, error, refresh } = useStore();
  const [simulating, setSimulating] = useState(false);

  if (loading) return <HomeSkeleton />;
  if (error || !s || !o)
    return (
      <Card className="text-center">
        <p className="text-[17px]">{error ?? "Something went wrong."}</p>
        <PrimaryButton className="mt-4" onClick={refresh}>Try again</PrimaryButton>
      </Card>
    );

  const owed = -s.balances.card;
  const full = Math.min(1, owed / s.card_limit);
  const cash = s.balances.checking + s.balances.savings;
  const total = cash + o.investments.total - owed;
  const netWorth = cash + o.investments.total - o.debt.total_owed;

  async function simulate() {
    setSimulating(true);
    try {
      await api.simulateWeek();
      await refresh();
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero: the whole picture (left) and the next 60 days (right) */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Card i={0} className="overflow-hidden lg:col-span-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] text-muted">
                {new Date(s.today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Good to see you, {s.name}</h1>
            </div>
            <Link href="/ask" className="flex shrink-0 items-center gap-2 rounded-full bg-dark px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-dark-2 active:scale-[0.97]">
              <Mic size={17} strokeWidth={2} aria-hidden /> <span className="hidden sm:inline">Ask Ahead</span>
            </Link>
          </div>

          <p className="mt-6 flex items-center gap-1 text-[13px] font-medium text-muted">
            All your money <Why text="Checking + savings + investments − what you owe on your card." />
          </p>
          <p className="text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-[56px]">
            <CountMoney value={total} cents />
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <Chip label="Cash" value={usd(cash)} />
            <Chip label="Net worth" value={usd(netWorth)} why="Cash + investments − everything you owe (card, auto loan, pay-later). The auto loan makes it negative for now, which is normal early on." />
            {s.money_saved.yearly > 0 && <Chip label="Saved" value={`${usd(s.money_saved.yearly)}/yr`} tone="good" />}
          </div>

          <Wallet s={s} invest={o.investments.total} owed={owed} full={full} />
        </Card>

        <NextDays f={f} s={s} onSimulate={simulate} simulating={simulating} />
      </div>

      {/* Bento: score, what needs you, what's due (similar heights, so nothing floats) */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreTile s={s} />
        <PopTile s={s} leaks={o.investments.moves.find((m) => m.id === "leaks")} />
        <div className="sm:col-span-2 [&>section]:h-full"><DebtTile d={o.debt} i={2} more /></div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <BudgetTile b={o.budget} i={0} more />
        <CardTile c={o.card} i={1} more />
      </div>

      <FutureYouCard v={o.investments} i={0} more />

      <div className="flex justify-center pt-1">
        <TextButton onClick={async () => { await api.reset(); await refresh(); }} className="!text-muted">Reset demo</TextButton>
      </div>
    </div>
  );
}

function Chip({ label, value, why, tone }: { label: string; value: string; why?: string; tone?: "good" }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${tone === "good" ? "bg-good-soft text-good" : "bg-bg text-muted"}`}>
      {label} <span className={`font-semibold tabular-nums ${tone === "good" ? "" : "text-ink"}`}>{value}</span>
      {why && <Why text={why} />}
    </span>
  );
}

/** Accounts as a fanned stack of cards. Hover (or focus) lifts one forward. */
function Wallet({ s, invest, owed, full }: { s: Summary; invest: number; owed: number; full: number }) {
  const cards = [
    { label: "Checking", note: "Ready to spend", value: s.balances.checking, cls: "bg-[linear-gradient(140deg,#2E3337,#15181B)] text-white", href: "/plan#budget" },
    { label: "Savings", note: "Safety cushion", value: s.balances.savings, cls: "bg-[linear-gradient(140deg,#7DB3A5,#4C897A)] text-white", href: "/plan#future" },
    { label: "Card owed", note: `${Math.round(full * 100)}% full`, value: owed, cls: "bg-white text-ink ring-1 ring-line", href: "/plan#card", bar: full },
    { label: "Investments", note: "401(k) + Roth IRA", value: invest, cls: "bg-[linear-gradient(140deg,#F6F7F6,#E3E8E5)] text-ink ring-1 ring-line", href: "/plan#future", cents: true },
  ];
  return (
    <div className="-mx-6 -mb-6 mt-6 overflow-x-auto px-6 pb-8 pt-3 sm:-mx-8 sm:-mb-8 sm:px-8">
      <ul className="flex" aria-label="Your accounts">
        {cards.map((c, k) => (
          <motion.li
            key={c.label}
            initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={VIEW}
            transition={{ duration: 0.55, delay: 0.15 + k * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
            className="shrink-0 first:!ml-0 -ml-10 sm:-ml-8"
            style={{ zIndex: k + 1 }}
          >
            <Link
              href={c.href}
              className={`group relative flex h-[148px] w-[150px] flex-col justify-between overflow-hidden rounded-[22px] p-4 shadow-[-10px_12px_28px_rgba(21,24,27,0.16)] transition duration-300 hover:-translate-y-2 focus-visible:-translate-y-2 sm:w-[150px] ${c.cls}`}
            >
              <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" aria-hidden />
              <span className="flex items-center justify-between text-[13px] font-medium opacity-80">
                {c.label} <ArrowUpRight size={15} className="opacity-0 transition group-hover:opacity-100" aria-hidden />
              </span>
              <span>
                <span className="block text-[22px] font-bold tracking-tight tabular-nums"><CountMoney value={c.value} /></span>
                <span className="text-[12px] opacity-70">{c.note}</span>
                {c.bar !== undefined && (
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${c.bar * 100}%`, background: c.bar > 0.5 ? "var(--ring-watch)" : "var(--ring-good)" }} />
                  </span>
                )}
              </span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Dark panel: the "safe until" answer, with the 60-day line drawn on scroll. */
function NextDays({ f, s, onSimulate, simulating }: { f: Forecast | null; s: Summary; onSimulate: () => void; simulating: boolean }) {
  const pts = f?.days.map((d) => d.p50) ?? [];
  const W = 320, H = 120;
  const lo = Math.min(0, ...pts), hi = Math.max(...pts, 1);
  const x = (k: number) => (k / Math.max(1, pts.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const line = pts.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const low = pts.length ? pts.indexOf(Math.min(...pts)) : -1;
  const below = low >= 0 && pts[low] < 0;
  return (
    <motion.section variants={reveal} initial="hidden" whileInView="show" viewport={VIEW} custom={1}
      className="card-dark flex flex-col p-6 sm:p-8 lg:col-span-5">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-white/60"><Sparkles size={14} aria-hidden /> Your next 60 days</p>
      <p className="mt-3 text-[13px] text-white/60">Safe until</p>
      <p className="text-[40px] font-bold leading-none tracking-[-0.03em] sm:text-[48px]">
        <Flip value={s.safe_until ? fmtDate(s.safe_until) : "60+ days"} />
      </p>
      <p className="mt-2 text-[13px] text-white/70">{s.safe_why}</p>

      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-5 w-full" role="img" aria-label={`Balance forecast. Lowest ${usd(pts[low])} on ${fmtDate(f!.days[low].date)}.`}>
          <defs>
            <linearGradient id="nd-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6FA597" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#6FA597" stopOpacity="0" />
            </linearGradient>
          </defs>
          {lo < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="white" strokeOpacity="0.25" strokeDasharray="3 4" />}
          <motion.path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#nd-fill)"
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={VIEW} transition={{ duration: 0.8, delay: 0.6 }} />
          <motion.path d={line} fill="none" stroke="#9FD3C4" strokeWidth="2.5" strokeLinecap="round"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={VIEW} transition={{ duration: 1.2, ease: "easeInOut", delay: 0.2 }} />
          <text x="0" y={H + 20} fill="white" fillOpacity="0.4" fontSize="11">Today</text>
          <text x={W} y={H + 20} fill="white" fillOpacity="0.4" fontSize="11" textAnchor="end">{fmtDate(f!.days[pts.length - 1].date)}</text>
          {low >= 0 && (
            <motion.g initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={VIEW} transition={{ delay: 1.2 }}
              style={{ transformOrigin: `${x(low)}px ${y(pts[low])}px` }}>
              <circle cx={x(low)} cy={y(pts[low])} r="5" fill={below ? "var(--pop)" : "#9FD3C4"} stroke="#17191C" strokeWidth="2" />
              <text x={x(low) > W - 90 ? x(low) - 10 : x(low) + 10} y={y(pts[low]) - 10} textAnchor={x(low) > W - 90 ? "end" : "start"} fill="white" fillOpacity="0.9" fontSize="12" fontWeight="600">
                {usd(pts[low])} · {fmtDate(f!.days[low].date)}
              </text>
            </motion.g>
          )}
        </svg>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <button onClick={onSimulate} disabled={simulating}
          className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-dark transition hover:bg-white/90 active:scale-[0.97] disabled:opacity-60">
          {simulating ? "Simulating…" : "Simulate next week"}
        </button>
        <Link href="/alerts" className="rounded-full px-4 py-2 text-[14px] font-medium text-white/80 ring-1 ring-white/20 transition hover:text-white hover:ring-white/40">
          See alerts
        </Link>
      </div>
    </motion.section>
  );
}

/** Dark tile with the health score as a single ring that fills on scroll. */
function ScoreTile({ s }: { s: Summary }) {
  const C = 2 * Math.PI * 44;
  const color = s.score >= 70 ? "var(--ring-good)" : s.score >= 50 ? "var(--ring-watch)" : "var(--ring-act)";
  const word = s.score >= 70 ? "Doing well" : s.score >= 50 ? "Getting there" : "Needs care";
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={VIEW} custom={0}
      className="card-dark flex flex-col items-center justify-center p-6 text-center">
      <div className="relative h-[120px] w-[120px]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="8" />
          <motion.circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }} whileInView={{ strokeDashoffset: C * (1 - s.score / 100) }} viewport={VIEW}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }} />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[34px] font-bold leading-none tabular-nums"><CountUp value={s.score} /></span>
          <span className="text-[11px] text-white/60">of 100</span>
        </span>
      </div>
      <p className="mt-3 text-[15px] font-semibold">Health score</p>
      <p className="text-[13px]" style={{ color }}>{word}</p>
    </motion.div>
  );
}

/** The one coral tile: what needs you now (or what you've saved when nothing does). */
function PopTile({ s, leaks }: { s: Summary; leaks?: { do: string; outcome: string } }) {
  const a = s.top_alert;
  const saved = s.money_saved.yearly > 0;
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={VIEW} custom={1}>
      <Link href={a ? "/alerts" : "/plan#leaks"}
        className="group flex h-full min-h-[220px] flex-col justify-between rounded-[24px] bg-pop p-6 text-white shadow-[0_18px_40px_rgba(240,86,63,0.28)] transition hover:-translate-y-1">
        <span className="flex items-center justify-between text-[13px] font-medium text-white/85">
          {a ? (s.alert_count > 1 ? `${s.alert_count} things need you` : "Needs you") : saved ? "Money saved" : "Easy win"}
          <ArrowUpRight size={18} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
        </span>
        {a ? (
          <span>
            <span className="block text-[19px] font-bold leading-snug">{a.title}</span>
            <span className="mt-1 block text-[13px] text-white/85">{a.body}</span>
          </span>
        ) : saved || !leaks ? (
          <span>
            <span className="block text-[34px] font-bold leading-none tabular-nums">{usd(s.money_saved.yearly)}</span>
            <span className="mt-1 block text-[13px] text-white/85">a year back from charges you cancelled</span>
          </span>
        ) : (
          <span>
            <span className="block text-[34px] font-bold leading-none tabular-nums">{leaks.outcome}<span className="text-[16px] font-semibold">/yr</span></span>
            <span className="mt-1 block text-[13px] text-white/85">{leaks.do}</span>
          </span>
        )}
        <span className="flex items-center gap-1 text-[14px] font-semibold">
          {a ? "See the fixes" : saved ? "Find more leaks" : "Review them"} <ArrowRight size={15} aria-hidden />
        </span>
      </Link>
    </motion.div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your money">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="card animate-pulse lg:col-span-7" style={{ height: 380 }} />
        <div className="card-dark animate-pulse lg:col-span-5" style={{ height: 380 }} />
      </div>
      <div className="card animate-pulse" style={{ height: 240 }} />
    </div>
  );
}
