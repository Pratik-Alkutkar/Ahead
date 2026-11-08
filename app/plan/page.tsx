"use client";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, Copy, Droplets, Scale, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BudgetTile, CardTile, DebtTile, FutureYouCard } from "@/components/Tiles";
import { Card, Drawer, PrimaryButton, Reveal, RevealItem, TextButton, Why } from "@/components/ui";
import { api, fmtMonth, usd, type BudgetData, type Cancelled, type Leak, type Overview } from "@/lib/api";
import { useStore } from "@/lib/store";

const SECTIONS = [
  { id: "budget", label: "Budget" },
  { id: "leaks", label: "Money leaks" },
  { id: "debts", label: "Debts" },
  { id: "card", label: "Credit card" },
  { id: "future", label: "Future you" },
  { id: "autopilot", label: "Autopilot" },
];
const CAT: Record<string, string> = {
  groceries: "Groceries", dining: "Eating out", gas: "Gas", shopping: "Shopping", subscription: "Subscriptions",
  rent: "Rent", utilities: "Utilities", phone: "Phone", loan: "Auto loan", card_payment: "Card payment", bnpl: "Pay-later", car: "Car",
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
  const [cancelled, setCancelled] = useState<Cancelled[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [bd, lk] = await Promise.all([api.budget(), api.leaks()]);
      setB(bd);
      setLeaks(lk.leaks);
      setCancelled(lk.cancelled ?? []);
      setErr(null);
    } catch {
      setErr("We couldn't load your plan. Try again.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const ready = !!(b && leaks && o);
  const [active, setActive] = useState(SECTIONS[0].id);
  // scroll-spy: highlight the section whose top is nearest the middle band of the screen
  useEffect(() => {
    if (!ready) return;
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-35% 0px -55% 0px" },
    );
    SECTIONS.forEach((x) => { const el = document.getElementById(x.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ready]);
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
      <div>
        <div className="px-1">
          <h1 className="text-[28px] font-bold tracking-tight">Plan</h1>
          <p className="text-[14px] text-muted">Three numbers that matter this month. Details below.</p>
        </div>
        {/* Summary bento: dark = this month, sage = the long game, coral = the quick win */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Reveal i={0} className="card-dark flex flex-col justify-between p-5 sm:p-6">
            <p className="text-[13px] text-white/60">Free to save this month</p>
            <p className="mt-6 text-[36px] font-bold leading-none tracking-tight tabular-nums">{usd(b.budget.left_over ?? 0)}</p>
            <p className="mt-2 text-[13px] text-white/70">after bills and everyday spending · <a href="#budget" className="underline-offset-2 hover:underline">Budget</a></p>
          </Reveal>
          <Reveal i={1} className="flex flex-col justify-between rounded-[24px] bg-[linear-gradient(140deg,#7DB3A5,#4C897A)] p-5 text-white shadow-[0_18px_40px_rgba(76,137,122,0.28)] sm:p-6">
            <p className="text-[13px] text-white/80">Debt-free by</p>
            <p className="mt-6 text-[36px] font-bold leading-none tracking-tight">{fmtMonth(b.debt.avalanche.debt_free)}</p>
            <p className="mt-2 text-[13px] text-white/85">{fmtMonth(b.debt.plus_100.debt_free)} with $100 more a month · <a href="#debts" className="underline-offset-2 hover:underline">Debts</a></p>
          </Reveal>
          <Reveal i={2} className="flex flex-col justify-between rounded-[24px] bg-pop p-5 text-white shadow-[0_18px_40px_rgba(240,86,63,0.26)] sm:p-6">
            <p className="text-[13px] text-white/85">{leaks.length ? "Money leaking" : "No leaks"}</p>
            <p className="mt-6 text-[36px] font-bold leading-none tracking-tight tabular-nums">{usd(leaks.reduce((a, l) => a + l.yearly, 0))}<span className="text-[16px] font-semibold">/yr</span></p>
            <p className="mt-2 text-[13px] text-white/85">{leaks.length} charges to review · <a href="#leaks" className="underline-offset-2 hover:underline">Money leaks</a></p>
          </Reveal>
        </div>
      </div>
      <nav aria-label="Plan sections" className="sticky top-[57px] z-20 -mx-4 !mt-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2.5 shadow-[0_10px_14px_-12px_rgba(21,24,27,0.18)] sm:-mx-8 sm:px-8">
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`} aria-current={active === x.id ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
              active === x.id ? "border-dark bg-dark text-white" : "border-line bg-card text-muted hover:text-ink"}`}>
            {x.label}
          </a>
        ))}
      </nav>

      <Section id="budget" title="Budget" sub="Built from your typical month. Savings come first.">
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.2fr]">
          <BudgetTile b={o.budget} i={0} />
          <BudgetPlan data={b.budget} />
        </div>
      </Section>

      <Section id="leaks" title="Money leaks" sub="Charges you pay every month that may not be worth it.">
        <Leaks leaks={leaks} cancelled={cancelled} onChange={async () => { await Promise.all([load(), refresh()]); }} showToast={showToast} />
      </Section>

      <Section id="debts" title="Debts" sub="What's due soon, and the fastest way out.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <DebtTile d={o.debt} i={0} />
          <Payoff d={b.debt} owed={o.debt.owed} />
        </div>
      </Section>

      <Section id="card" title="Credit card" sub="How full it is and where the money goes.">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <CardTile c={o.card} i={0} />
            <CreditScore c={o.card.credit} />
          </div>
          <Card className="!p-5 sm:!p-6">
            <h3 className="text-[15px] font-semibold">All card spending (30 days)</h3>
            <ul className="mt-3 divide-y divide-line">
              {o.card.top_merchants.map((m) => (
                <RevealItem key={m.merchant} className="flex justify-between py-2.5 text-[14px]">
                  <span>{m.merchant}</span>
                  <span className="font-semibold tabular-nums">{usd(m.amount, true)}</span>
                </RevealItem>
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

      <Section id="autopilot" title="Autopilot" sub="Money moves that happen on their own. You can stop any of them.">
        <Autopilot />
      </Section>
    </div>
  );
}

function Autopilot() {
  const { refresh, showToast } = useStore();
  const [rules, setRules] = useState<{ id: string; kind: string; amount: number; start?: string }[] | null>(null);
  const load = useCallback(() => api.rules().then((r) => setRules(r.rules)).catch(() => setRules([])), []);
  useEffect(() => {
    load();
  }, [load]);
  async function add() {
    try {
      const r = await api.approveAction({ kind: "create_rule", rule: { kind: "save_weekly", amount: 50 } });
      showToast({ text: "Autopilot on: $50 to savings every week.", undoId: r.undo_id });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      showToast({ text: e instanceof Error ? e.message : "That didn't go through." });
    }
  }
  async function remove(id: string) {
    await api.deleteRule(id);
    showToast({ text: "Autopilot stopped." });
    await Promise.all([load(), refresh()]);
  }
  if (!rules) return <div className="card h-28 animate-pulse" />;
  return (
    <Card className="!p-5 sm:!p-6">
      {rules.length === 0 ? (
        <p className="text-[14px] text-muted">No autopilot yet. Ask “Can I afford a trip in March?” or start small below.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
              <span>
                {r.kind === "save_weekly" ? `Save ${usd(r.amount)} every week` : `Keep checking above ${usd(r.amount)}`}
                {r.start && <span className="block text-[12px] text-muted">Starts {r.start}</span>}
              </span>
              <TextButton onClick={() => remove(r.id)} className="!text-muted">Stop</TextButton>
            </li>
          ))}
        </ul>
      )}
      <PrimaryButton onClick={add} className="mt-4 !py-2 !text-[14px]">Save $50 every week</PrimaryButton>
    </Card>
  );
}

const LEVEL_TEXT = { good: "text-good", watch: "text-watch", act: "text-act" };

function CreditScore({ c }: { c: Overview["card"]["credit"] }) {
  const pct = ((c.score - c.min) / (c.max - c.min)) * 100;
  return (
    <Card className="!p-5 sm:!p-6">
      <h3 className="flex items-center gap-1 text-[15px] font-semibold">Credit score <Why text={c.why} /></h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[40px] font-bold leading-none tracking-tight tabular-nums">{c.score}</span>
        <span className={`text-[15px] font-semibold ${LEVEL_TEXT[c.level]}`}>{c.band}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-[var(--ring-act)] via-[var(--ring-watch)] to-[var(--ring-good)]" aria-hidden>
        <span className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-card bg-ink shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint"><span>{c.min}</span><span>{c.max}</span></div>
      <ul className="mt-3 divide-y divide-line">
        {c.factors.map((f) => (
          <RevealItem key={f.name} className="py-2.5 text-[14px]">
            <div className="flex justify-between gap-3">
              <span>{f.name}</span>
              <span className={`font-semibold ${LEVEL_TEXT[f.level]}`}>{f.value}</span>
            </div>
            <p className="text-[12px] text-muted">{f.tip}</p>
          </RevealItem>
        ))}
      </ul>
    </Card>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32" aria-labelledby={`${id}-h`}>
      <Reveal className="mb-3 px-1">
        <h2 id={`${id}-h`} className="text-[20px] font-bold tracking-tight">{title}</h2>
        <p className="text-[14px] text-muted">{sub}</p>
      </Reveal>
      {children}
    </section>
  );
}

function BudgetPlan({ data }: { data: BudgetData["budget"] }) {
  const [goal, setGoal] = useState(String(data.savings_first || 200));
  const [plan, setPlan] = useState(data);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    // the box starts at $200, so show that plan right away instead of a $0 one
    if (!data.savings_first) api.budgetBuild(200).then(setPlan).catch(() => {});
  }, [data.savings_first]);
  const fixed = plan.lines.filter((l) => l.fixed && l.monthly >= 1);
  const flex = plan.lines.filter((l) => !l.fixed && l.monthly >= 1);
  const base = Object.fromEntries(data.lines.map((l) => [l.category, l.monthly]));
  const total = plan.lines.reduce((a, l) => a + l.monthly, 0);
  const trimmed = plan.lines.some((l) => !l.fixed && Math.abs((base[l.category] ?? l.monthly) - l.monthly) > 0.5);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(goal);
    if (!goal || !(n >= 0) || n > plan.income) return setErr(`Enter an amount from $0 to ${usd(plan.income)}.`);
    setBusy(true);
    setErr(null);
    try {
      setPlan(await api.budgetBuild(n));
    } catch {
      setErr("Couldn't update the plan. Try again.");
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
      {err && <p role="alert" className="mt-2 text-[13px] text-act">{err}</p>}
      {!err && plan.savings_first > 0 && plan.left_over !== undefined && (
        <p className={`mt-2 text-[13px] ${trimmed ? "text-watch" : "text-good"}`}>
          {trimmed
            ? `To save ${usd(plan.savings_first)}, everyday spending is trimmed (crossed-out amounts show the old plan).`
            : `Saving ${usd(plan.savings_first)} fits. ${usd(plan.left_over)} a month is still free.`}
        </p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Flexible</p>
          <ul className="divide-y divide-line">{flex.map((l) => <Row key={l.category} c={l.category} m={l.monthly} />)}</ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Fixed bills</p>
          <ul className="divide-y divide-line">
            {plan.savings_first > 0 && (
              <li className="flex justify-between py-2 text-[14px] text-good">
                <span>Savings (first)</span><span className="font-semibold tabular-nums">{usd(plan.savings_first)}</span>
              </li>
            )}
            {fixed.map((l) => <Row key={l.category} c={l.category} m={l.monthly} />)}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex justify-between rounded-2xl bg-bg px-3.5 py-2.5 text-[14px]">
        <span className="text-muted">Spending + savings</span>
        <span className="font-semibold tabular-nums">{usd(total + plan.savings_first)} of {usd(plan.income)}</span>
      </div>
    </Card>
  );
}

function Leaks({ leaks, cancelled, onChange, showToast }: { leaks: Leak[]; cancelled: Cancelled[]; onChange: () => Promise<void>; showToast: (t: { text: string; undoId?: string } | null) => void }) {
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

  async function restore(c: Cancelled) {
    setBusy(c.bill_id);
    try {
      await api.restoreLeak(c.bill_id);
      await onChange();
      showToast({ text: `${c.merchant} is back.` });
    } catch {
      showToast({ text: "That didn't go through. Nothing changed." });
    } finally {
      setBusy(null);
    }
  }

  const cancelledList = cancelled.length > 0 && (
    <div className="mt-4 rounded-2xl bg-bg p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Cancelled · saving {usd(cancelled.reduce((a, c) => a + c.yearly, 0))} a year</p>
      <ul className="mt-1 divide-y divide-line">
        {cancelled.map((c) => (
          <li key={c.bill_id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
            <span><span className="font-medium">{c.merchant}</span> <span className="text-muted">· {usd(c.amount, true)}/mo</span></span>
            <TextButton onClick={() => restore(c)} disabled={busy === c.bill_id} className="!px-2.5 !text-[13px]">
              {busy === c.bill_id ? "…" : "Restore"}
            </TextButton>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!shown.length)
    return (
      <Card className="!p-5 sm:!p-6">
        <p className="flex items-center gap-3 text-[15px]"><Check className="text-good" aria-hidden /> No leaks right now. Nice.</p>
        {cancelledList}
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
        <AnimatePresence initial={false}>
        {shown.map((l) => {
          const [tag, cls] = LEAK_TAG[l.type] ?? [l.type, "bg-bg text-muted"];
          return (
            <motion.li key={l.bill_id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
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
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>
      {cancelledList}
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
