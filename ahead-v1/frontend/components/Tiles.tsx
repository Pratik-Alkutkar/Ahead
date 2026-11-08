"use client";
import { ArrowRight, CalendarClock, CreditCard, PieChart, Sprout } from "lucide-react";
import Link from "next/link";
import type { Overview } from "@/lib/api";
import { fmtDate, usd } from "@/lib/api";
import { Card, Why } from "./ui";

const CAT: Record<string, string> = {
  groceries: "Groceries", dining: "Eating out", gas: "Gas", shopping: "Shopping",
  subscription: "Subscriptions", rent: "Rent", utilities: "Utilities", phone: "Phone",
};
const STATUS = {
  good: { bar: "var(--ring-good)", text: "text-good", word: "On pace" },
  watch: { bar: "var(--ring-watch)", text: "text-watch", word: "A bit fast" },
  act: { bar: "var(--ring-act)", text: "text-act", word: "Over pace" },
} as const;

function More({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-4 flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
      {label} <ArrowRight size={14} aria-hidden />
    </Link>
  );
}

function TileHead({ icon, title, why, right }: { icon: React.ReactNode; title: string; why: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <h2 className="flex items-center gap-1 whitespace-nowrap text-[15px] font-semibold">
          {title}
          <Why text={why} />
        </h2>
        {right && <div className="-mt-0.5 text-[12px] text-muted">{right}</div>}
      </div>
    </div>
  );
}

export function BudgetTile({ b, i, more }: { b: Overview["budget"]; i: number; more?: boolean }) {
  const passed = Math.round(b.month_passed * 100);
  return (
    <Card i={i} className="!p-5 sm:!p-6">
      <TileHead
        icon={<PieChart size={16} strokeWidth={1.75} />}
        title="Budget this month"
        why="Your plan is your typical month from the last 3. The thin line on each bar shows how much of the month has passed."
        right={<span>{passed}% of month gone</span>}
      />
      <ul className="space-y-3.5">
        {b.categories.map((c) => {
          const st = STATUS[c.status];
          return (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="font-medium">{CAT[c.category] ?? c.category}</span>
                <span className="tabular-nums text-muted">
                  <span className="font-semibold text-ink">{usd(c.spent)}</span> of {usd(c.plan)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-line" role="img" aria-label={`${CAT[c.category]}: ${Math.round(c.used * 100)}% used, ${st.word}`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.used * 100)}%`, background: st.bar }} />
                <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/40" style={{ left: `${passed}%` }} aria-hidden />
              </div>
              <p className={`mt-1 text-[12px] font-medium ${st.text}`}>{st.word}</p>
            </li>
          );
        })}
      </ul>
      {more && <More href="/plan#budget" label="Full budget" />}
    </Card>
  );
}

export function DebtTile({ d, i, more }: { d: Overview["debt"]; i: number; more?: boolean }) {
  return (
    <Card i={i} className="!p-5 sm:!p-6">
      <TileHead
        icon={<CalendarClock size={16} strokeWidth={1.75} />}
        title="Upcoming dues"
        why="Loan, card and pay-later payments due in the next 30 days, on their exact dates."
        right={<span>Next 30 days</span>}
      />
      <ul className="divide-y divide-line">
        {d.dues.map((x, k) => (
          <li key={k} className="flex items-center gap-3 py-2.5">
            <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-bg py-1 leading-tight">
              <span className="text-[10px] font-semibold uppercase text-muted">{fmtDate(x.date).split(" ")[0]}</span>
              <span className="text-[16px] font-bold tabular-nums">{fmtDate(x.date).split(" ")[1]}</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{x.name}</span>
            <span className="text-[14px] font-semibold tabular-nums">{usd(x.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-bg px-3.5 py-2.5 text-[13px]">
        <span className="text-muted">Due this month</span>
        <span className="font-semibold tabular-nums">{usd(d.total_due)}</span>
      </div>
      <p className="mt-2 px-1 text-[12px] text-muted">
        Total owed across all debts: <span className="font-semibold text-ink tabular-nums">{usd(d.total_owed)}</span>
      </p>
      {more && <More href="/plan#debts" label="Payoff plan" />}
    </Card>
  );
}

export function CardTile({ c, i, more }: { c: Overview["card"]; i: number; more?: boolean }) {
  const pct = Math.round(c.used * 100);
  const color = c.used > 0.5 ? "var(--ring-act)" : c.used > 0.3 ? "var(--ring-watch)" : "var(--ring-good)";
  const word = c.used > 0.5 ? "High" : c.used > 0.3 ? "A bit high" : "Healthy";
  const max = Math.max(...c.categories.map((x) => x.amount), 1);
  return (
    <Card i={i} className="!p-5 sm:!p-6">
      <TileHead icon={<CreditCard size={16} strokeWidth={1.75} />} title="Credit card" why={c.why} right={<span>{c.apr}% yearly interest</span>} />
      <div className="flex items-baseline justify-between">
        <span className="text-[28px] font-bold tracking-tight tabular-nums">{pct}%<span className="ml-1 text-[13px] font-medium text-muted">full</span></span>
        <span className="text-[13px] font-medium" style={{ color }}>{word}</span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-line" role="img" aria-label={`Card ${pct}% full`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink/40" style={{ left: "30%" }} aria-hidden />
      </div>
      <p className="mt-1.5 text-[12px] text-muted tabular-nums">
        {usd(c.owed)} of {usd(c.limit)} · {usd(c.available)} available · aim under 30%
      </p>
      <h3 className="mt-4 text-[13px] font-semibold text-muted">Where it went (30 days)</h3>
      <ul className="mt-2 space-y-2">
        {c.categories.map((x) => (
          <li key={x.category} className="text-[14px]">
            <div className="flex justify-between"><span>{CAT[x.category] ?? x.category}</span><span className="font-semibold tabular-nums">{usd(x.amount)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-accent/70" style={{ width: `${(x.amount / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">Top: {c.top_merchants.slice(0, 3).map((m) => `${m.merchant} ${usd(m.amount)}`).join(" · ")}</p>
      {c.next_payment && (
        <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-bg px-3.5 py-2.5 text-[13px]">
          <span className="text-muted">Next payment {fmtDate(c.next_payment.date)}</span>
          <span className="font-semibold tabular-nums">{usd(c.next_payment.amount)}</span>
        </div>
      )}
      {more && <More href="/plan#card" label="Card details" />}
    </Card>
  );
}

export function FutureYouCard({ v, i, more }: { v: Overview["investments"]; i: number; more?: boolean }) {
  return (
    <Card i={i}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
            <Sprout size={16} strokeWidth={1.75} />
          </span>
          <h2 className="text-[15px] font-semibold">Future you</h2>
        </div>
        <p className="text-[13px] text-muted">
          Invested now <span className="font-semibold text-ink tabular-nums">{usd(v.total)}</span>
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {v.moves.map((m) => (
          <li key={m.id} className="flex flex-col gap-4 rounded-2xl bg-bg p-5">
            <p className="text-[15px] font-semibold leading-snug">{m.do}</p>
            <span className="-mt-2 w-fit rounded-full bg-card px-2.5 py-0.5 text-[12px] font-medium text-muted">{m.cost}</span>
            <div className="mt-auto border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">You get</p>
              <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-good tabular-nums">{m.outcome}</p>
              <p className="mt-1.5 text-[13px] text-muted">{m.outcome_note}</p>
            </div>
          </li>
        ))}
      </ul>
      {more && <More href="/plan#future" label="See the details" />}
      <p className="mt-4 text-[11px] text-faint">Estimates. Growth assumes 4% a year after inflation, in today&apos;s dollars. {v.disclaimer}</p>
    </Card>
  );
}
