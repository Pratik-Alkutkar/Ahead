"use client";
import { BellRing, Check, Copy, Droplets, Scale, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BudgetTile, CardTile, DebtTile, FutureYouCard } from "@/components/Tiles";
import { Card, Drawer, PrimaryButton, TextButton, Why } from "@/components/ui";
import { api, fmtMonth, usd, type BudgetData, type Leak } from "@/lib/api";
import { useStore } from "@/lib/store";

const SECTIONS = [
  { id: "budget", label: "Budget" },
  { id: "leaks", label: "Money leaks" },
  { id: "debts", label: "Debts" },
  { id: "card", label: "Credit card" },
  { id: "future", label: "Future you" },
];
const CAT: Record<string, string> = {
  groceries: "Groceries", dining: "Eating out", gas: "Gas", shopping: "Shopping", subscription: "Subscriptions",
  rent: "Rent", utilities: "Utilities", phone: "Phone", loan: "Auto loan", card_payment: "Card payment", bnpl: "Pay-later",
};
const LEAK_TAG: Record<string, [string, string]> = {
  trial_converting: ["Trial ending", "bg-watch-soft text-watch"],
  unused: ["Not used", "bg-act-soft text-act"],
  price_jump: ["Price went up", "bg-watch-soft text-watch"],
};

export default function Plan() {
  const { overview: o, refresh, showToast } = useStore();
  const [b, setB] = useState<BudgetData | null>(null);
  const [leaks, setLeaks] = useState<Leak[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [bd, lk] = await Promise.all([api.budget(), api.leaks()]);
      setB(bd);
      setLeaks(lk.leaks);
      setErr(null);
    } catch {
      setErr("We couldn't load your plan. Try again.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const ready = !!(b && leaks && o);
  // Sections only exist after data loads, so the browser's own #hash jump misses; do it once ready.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (ready && id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready]);

  if (err)
    return (
      <Card className="text-center">
        <p className="text-[17px]">{err}</p>
        <PrimaryButton className="mt-4" onClick={load}>Try again</PrimaryButton>
      </Card>
    );
  if (!b || !leaks || !o)
    return (
      <div className="space-y-5" aria-busy="true">
        {[220, 260, 240].map((h, i) => <div key={i} className="card animate-pulse" style={{ height: h }} />)}
      </div>
    );

  return (
    <div className="space-y-8">
      <div className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight">Plan</h1>
        <nav aria-label="Plan sections" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {SECTIONS.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="shrink-0 rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-medium text-muted hover:text-ink">
              {x.label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="budget" title="Budget" sub="Built from your typical month. Savings come first.">
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.2fr]">
          <BudgetTile b={o.budget} i={0} />
          <BudgetPlan data={b.budget} />
        </div>
      </Section>

      <Section id="leaks" title="Money leaks" sub="Charges you pay every month that may not be worth it.">
        <Leaks leaks={leaks} onChange={async () => { await Promise.all([load(), refresh()]); }} showToast={showToast} />
      </Section>

      <Section id="debts" title="Debts" sub="What's due soon, and the fastest way out.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <DebtTile d={o.debt} i={0} />
          <Payoff d={b.debt} owed={o.debt.owed} />
        </div>
      </Section>

      <Section id="card" title="Credit card" sub="How full it is and where the money goes.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <CardTile c={o.card} i={0} />
          <Card className="!p-5 sm:!p-6">
            <h3 className="text-[15px] font-semibold">All card spending (30 days)</h3>
            <ul className="mt-3 divide-y divide-line">
              {o.card.top_merchants.map((m) => (
                <li key={m.merchant} className="flex justify-between py-2.5 text-[14px]">
                  <span>{m.merchant}</span>
                  <span className="font-semibold tabular-nums">{usd(m.amount, true)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-2xl bg-bg p-4 text-[14px]">
              <p className="font-semibold">To get under 30% full</p>
              <p className="mt-1 text-muted">
                Pay down <span className="font-semibold text-ink tabular-nums">{usd(Math.max(0, o.card.owed - o.card.limit * 0.3))}</span>. That usually helps your credit score.
              </p>
            </div>
          </Card>
        </div>
      </Section>

      <Section id="future" title="Future you" sub="Small moves today, big difference later.">
        <FutureYouCard v={o.investments} i={0} />
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <Card className="!p-5 sm:!p-6">
            <h3 className="text-[15px] font-semibold">The usual order</h3>
            <ol className="mt-3 space-y-2">
              {o.investments.steps.map((s, k) => (
                <li key={s.id} className={`flex gap-3 rounded-2xl p-3 ${s.id === o.investments.next_step ? "bg-accent-soft" : "bg-bg"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${s.done ? "bg-good text-white" : "bg-card text-muted"}`}>
                    {s.done ? <Check size={14} aria-label="Done" /> : k + 1}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold">{s.title}</p>
                    <p className="text-[13px] text-muted">{s.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="!p-5 sm:!p-6">
            <h3 className="text-[15px] font-semibold">Your accounts</h3>
            <ul className="mt-3 divide-y divide-line">
              {o.investments.accounts.map((a) => (
                <li key={a.name} className="flex justify-between gap-3 py-2.5 text-[14px]">
                  <span>{a.name}<span className="block text-[12px] text-muted">{a.holding}</span></span>
                  <span className="font-semibold tabular-nums">{usd(a.balance)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-bg p-3">
                <p className="text-[12px] text-muted">By {o.investments.projection.age}, today&apos;s plan</p>
                <p className="text-[20px] font-bold tabular-nums">~{usd(o.investments.projection.today_plan)}</p>
              </div>
              <div className="rounded-2xl bg-good-soft p-3">
                <p className="text-[12px] text-muted">With full match</p>
                <p className="text-[20px] font-bold text-good tabular-nums">~{usd(o.investments.projection.with_full_match)}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-faint">{o.investments.projection.why}</p>
          </Card>
        </div>
      </Section>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-h`}>
      <div className="mb-3 px-1">
        <h2 id={`${id}-h`} className="text-[20px] font-bold tracking-tight">{title}</h2>
        <p className="text-[14px] text-muted">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function BudgetPlan({ data }: { data: BudgetData["budget"] }) {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState(data);
  const [busy, setBusy] = useState(false);
  const fixed = plan.lines.filter((l) => l.fixed && l.monthly >= 1);
  const flex = plan.lines.filter((l) => !l.fixed && l.monthly >= 1);
  const base = Object.fromEntries(data.lines.map((l) => [l.category, l.monthly]));
  const total = plan.lines.reduce((a, l) => a + l.monthly, 0);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(goal);
    if (!(n >= 0)) return;
    setBusy(true);
    try {
      setPlan(await api.budgetBuild(n));
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ c, m }: { c: string; m: number }) => (
    <li className="flex justify-between py-2 text-[14px]">
      <span>{CAT[c] ?? c}</span>
      <span className="tabular-nums">
        {base[c] !== undefined && Math.abs(base[c] - m) > 0.5 && <span className="mr-2 text-[12px] text-faint line-through">{usd(base[c])}</span>}
        <span className="font-semibold">{usd(m)}</span>
      </span>
    </li>
  );

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-[15px] font-semibold">Monthly plan <Why text={plan.why} /></h3>
        <span className="text-[13px] text-muted">Income <span className="font-semibold text-ink">{usd(plan.income)}</span></span>
      </div>
      <form onSubmit={apply} className="mt-4 flex items-center gap-2 rounded-2xl bg-accent-soft p-3">
        <label htmlFor="goal" className="text-[14px] font-medium">Save first</label>
        <span className="text-[14px] text-muted">$</span>
        <input
          id="goal" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="200" className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-[14px]"
        />
        <span className="text-[14px] text-muted">a month</span>
        <PrimaryButton type="submit" disabled={busy} className="ml-auto !px-4 !py-1.5 !text-[13px]">{busy ? "…" : "Update"}</PrimaryButton>
      </form>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Flexible</p>
          <ul className="divide-y divide-line">{flex.map((l) => <Row key={l.category} c={l.category} m={l.monthly} />)}</ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Fixed bills</p>
          <ul className="divide-y divide-line">{fixed.map((l) => <Row key={l.category} c={l.category} m={l.monthly} />)}</ul>
        </div>
      </div>
      <div className="mt-3 flex justify-between rounded-2xl bg-bg px-3.5 py-2.5 text-[14px]">
        <span className="text-muted">Spending + savings</span>
        <span className="font-semibold tabular-nums">{usd(total + plan.savings_first)} of {usd(plan.income)}</span>
      </div>
    </Card>
  );
}

function Leaks({ leaks, onChange, showToast }: { leaks: Leak[]; onChange: () => Promise<void>; showToast: (t: { text: string; undoId?: string } | null) => void }) {
  const [kept, setKept] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState<{ merchant: string; text: string } | null>(null);
  const shown = leaks.filter((l) => !kept.includes(l.bill_id));
  const yearly = shown.reduce((a, l) => a + l.yearly, 0);

  async function cancel(l: Leak) {
    setBusy(l.bill_id);
    try {
      const r = await api.cancelLeak(l.bill_id);
      await onChange();
      setEmail({ merchant: l.merchant, text: r.email });
      showToast({ text: `${l.merchant} cancelled. +${usd(l.yearly)} a year.`, undoId: r.undo_id });
    } catch {
      showToast({ text: "That didn't go through. Nothing changed." });
    } finally {
      setBusy(null);
    }
  }

  if (!shown.length)
    return (
      <Card className="flex items-center gap-3">
        <Check className="text-good" aria-hidden /> <p className="text-[15px]">No leaks right now. Nice.</p>
      </Card>
    );

  return (
    <Card className="!p-5 sm:!p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden><Droplets size={16} strokeWidth={1.75} /></span>
        <p className="text-[15px]">
          <span className="font-semibold">{shown.length} leaks</span> worth <span className="font-semibold text-good tabular-nums">{usd(yearly)}</span> a year
        </p>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((l) => {
          const [tag, cls] = LEAK_TAG[l.type] ?? [l.type, "bg-bg text-muted"];
          return (
            <li key={l.bill_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{l.merchant}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{tag}</span>
                </div>
                <p className="text-[13px] text-muted">{l.why}</p>
              </div>
              <div className="flex items-center gap-1 sm:shrink-0">
                <span className="mr-2 text-[14px] font-semibold tabular-nums">{usd(l.amount, true)}/mo</span>
                <TextButton onClick={() => setKept([...kept, l.bill_id])} className="!px-2.5 !text-muted">Keep</TextButton>
                <TextButton onClick={() => showToast({ text: `We'll remind you before ${l.merchant} charges again.` })} className="!px-2.5" aria-label={`Remind me about ${l.merchant}`}>
                  <BellRing size={16} aria-hidden />
                </TextButton>
                <PrimaryButton onClick={() => cancel(l)} disabled={busy === l.bill_id} className="!px-4 !py-1.5 !text-[13px]">
                  {busy === l.bill_id ? "…" : "Cancel"}
                </PrimaryButton>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-faint">Cancel stops the bill and blocks the merchant. In a real bank this connects to virtual card controls.</p>
      <Drawer open={!!email} onClose={() => setEmail(null)} title="Cancel email, ready to send">
        <p className="text-[14px] text-muted">Some services need you to ask. Copy this and send it to {email?.merchant}.</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-bg p-4 font-sans text-[14px]">{email?.text}</pre>
        <PrimaryButton className="mt-4 flex items-center gap-2" onClick={() => { navigator.clipboard?.writeText(email?.text ?? ""); showToast({ text: "Copied." }); }}>
          <Copy size={15} aria-hidden /> Copy email
        </PrimaryButton>
      </Drawer>
    </Card>
  );
}

function Payoff({ d, owed }: { d: BudgetData["debt"]; owed: { name: string; balance: number; apr: number }[] }) {
  const opt = [
    { id: "now", name: "Your payments today", sub: "Minimums plus your $300 card payment", p: d.avalanche, best: false },
    { id: "plus", name: "Add $100 a month", sub: "Extra goes to the highest interest first", p: d.plus_100, best: true },
  ];
  const saved = d.avalanche.interest - d.plus_100.interest;
  return (
    <Card className="!p-5 sm:!p-6">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <Scale size={16} className="text-accent" aria-hidden /> When you&apos;ll be debt-free
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {opt.map((x) => (
          <div key={x.id} className={`rounded-2xl p-4 ${x.best ? "bg-accent-soft ring-1 ring-accent/30" : "bg-bg"}`}>
            <p className="text-[14px] font-semibold">{x.name}</p>
            <p className="text-[12px] text-muted">{x.sub}</p>
            <p className="mt-3 text-[22px] font-bold leading-none tabular-nums">{fmtMonth(x.p.debt_free)}</p>
            <p className="mt-1 text-[12px] text-muted">{usd(x.p.interest)} total interest</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px]">
        <span className="font-semibold text-good">{d.avalanche.months - d.plus_100.months} months sooner</span> and{" "}
        <span className="font-semibold text-good tabular-nums">{usd(saved)}</span> less interest with $100 more a month.
      </p>
      {d.same_order && (
        <p className="mt-1 text-[12px] text-muted">Your card is both your smallest and costliest debt, so pay it off first either way.</p>
      )}
      <div className="mt-4 flex gap-3 rounded-2xl bg-act-soft p-4">
        <X size={18} className="mt-0.5 shrink-0 text-act" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold text-act">The minimum-payment trap</p>
          <p className="text-[13px]">{d.minimum_trap.why}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {owed.map((x) => (
          <li key={x.name} className="flex justify-between py-2 text-[14px]">
            <span>{x.name} <span className="text-[12px] text-muted">· {x.apr}% yearly interest</span></span>
            <span className="font-semibold tabular-nums">{usd(x.balance)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
