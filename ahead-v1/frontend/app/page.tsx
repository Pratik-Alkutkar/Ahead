"use client";
import { ArrowRight, CreditCard, Landmark, Mic, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BudgetTile, CardTile, DebtTile, FutureYouCard } from "@/components/Tiles";
import { Card, CountUp, PrimaryButton, TextButton, Why } from "@/components/ui";
import { api, usd } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Home() {
  const { summary: s, overview: o, loading, error, refresh } = useStore();
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
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[14px] text-muted">{new Date(s.today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">Hi {s.name}</h1>
        </div>
        <Link href="/ask" className="flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90">
          <Mic size={18} strokeWidth={2} aria-hidden /> Ask Ahead
        </Link>
      </div>

      {/* 1. Balances */}
      <Card i={0}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Your money</h2>
          <p className="flex flex-wrap items-center text-[13px] text-muted">
            Cash&nbsp;<span className="font-semibold text-ink tabular-nums">{usd(cash)}</span>
            <span className="mx-2 text-faint">·</span>
            Net worth&nbsp;<span className="font-semibold text-ink tabular-nums">{usd(netWorth)}</span>
            <Why text="Net worth = cash + investments − everything you owe (card, auto loan, pay-later). The auto loan makes it negative for now, which is normal early on." />
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <BalanceTile icon={<Wallet size={18} strokeWidth={1.75} />} label="Checking" value={usd(s.balances.checking)} note="Ready to spend" />
          <BalanceTile icon={<Landmark size={18} strokeWidth={1.75} />} label="Savings" value={usd(s.balances.savings)} note="Your safety cushion" />
          <BalanceTile icon={<CreditCard size={18} strokeWidth={1.75} />} label="Card owed" value={usd(owed)} note={`Owed · ${Math.round(full * 100)}% full`}>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${full * 100}%`, background: full > 0.5 ? "var(--ring-watch)" : "var(--ring-good)" }} />
            </div>
          </BalanceTile>
          <BalanceTile icon={<TrendingUp size={18} strokeWidth={1.75} />} label="Investments" value={usd(o.investments.total)} note="401(k) and Roth IRA" />
        </div>
      </Card>

      {/* 2. Budget, dues, card */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <BudgetTile b={o.budget} i={1} more />
        <DebtTile d={o.debt} i={2} more />
        <CardTile c={o.card} i={3} more />
      </div>

      {/* 3. Investments: general guidance, not product advice */}
      <FutureYouCard v={o.investments} i={4} more />

      {/* 4. Money saved */}
      <Card i={5} className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-good-soft text-good" aria-hidden>
          <PiggyBank size={22} strokeWidth={1.75} />
        </span>
        <div className="flex-1">
          <p className="flex items-center gap-1 text-[14px] text-muted">Money saved <Why text={s.money_saved.why} /></p>
          <p className="text-[24px] font-bold tracking-tight tabular-nums">
            $<CountUp value={Math.round(s.money_saved.yearly)} /> <span className="text-[14px] font-normal text-muted">a year</span>
          </p>
        </div>
        <Link href="/plan#leaks" className="flex items-center gap-1 text-[14px] font-semibold text-accent">
          Find money leaks <ArrowRight size={15} aria-hidden />
        </Link>
      </Card>

      <div className="flex justify-center gap-2 pt-1">
        <TextButton onClick={simulate} disabled={simulating}>{simulating ? "Simulating…" : "Simulate next week"}</TextButton>
        <TextButton onClick={async () => { await api.reset(); await refresh(); }} className="!text-muted">Reset demo</TextButton>
      </div>
    </div>
  );
}

function BalanceTile({ icon, label, value, note, children }: { icon: React.ReactNode; label: string; value: string; note: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-bg p-3 sm:p-4">
      <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-muted sm:gap-2 sm:text-[13px]">
        <span className="hidden text-accent sm:inline" aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-[20px] font-bold leading-tight tracking-tight tabular-nums sm:mt-1.5 sm:text-[28px]">{value}</p>
      <p className="hidden truncate text-[13px] text-muted sm:block">{note}</p>
      {children}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your money">
      {[170, 280, 260].map((h, i) => (
        <div key={i} className="card animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );
}
