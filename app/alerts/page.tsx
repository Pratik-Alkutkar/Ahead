"use client";
import { ArrowRight, CalendarCheck, Repeat, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCard } from "@/components/AlertCard";
import { TraceDrawer } from "@/components/TraceDrawer";
import { Card, PrimaryButton, Why } from "@/components/ui";
import { api, type Brief, type BriefCard } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Alerts() {
  const { alerts, summary, loading, error, refresh } = useStore();
  const [trace, setTrace] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  useEffect(() => {
    api.brief().then(setBrief).catch(() => setBrief(null));
  }, [alerts, summary]);

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-[28px] font-semibold tracking-tight">Alerts</h1>
      {brief && (
        <section aria-label="Today" className="grid gap-3 sm:grid-cols-3">
          <BriefTile icon={Repeat} label="Subscriptions" c={brief.cards.subscriptions} i={0} />
          <BriefTile icon={Wallet} label="Daily update" c={brief.cards.update} i={1} tone="dark" />
          <BriefTile icon={CalendarCheck} label="Today's spend limit" c={brief.cards.limit} i={2} tone={brief.cards.limit.level === "act" ? "pop" : undefined} />
        </section>
      )}
      {loading && <div className="card h-64 animate-pulse" aria-busy="true" />}
      {error && (
        <Card className="text-center">
          <p className="text-[17px]">{error}</p>
          <PrimaryButton className="mt-4" onClick={refresh}>Try again</PrimaryButton>
        </Card>
      )}
      {alerts.map((a, i) => (
        <AlertCard key={a.id} alert={a} i={i} onTrace={setTrace} />
      ))}
      <TraceDrawer id={trace} onClose={() => setTrace(null)} />
    </div>
  );
}

const DOT = { good: "bg-good", watch: "bg-watch", act: "bg-act" };
const WORD = { good: "On track", watch: "Check", act: "Act now" };

/** One short daily card: label, one big line, one small line, a link to details. */
function BriefTile({ icon: Icon, label, c, i = 0, tone }: { icon: React.ElementType; label: string; c: BriefCard; i?: number; tone?: "dark" | "pop" }) {
  const skin = tone === "dark" ? "card-dark !border-0 [&_*]:!text-inherit text-white" : tone === "pop" ? "!bg-pop !border-0 text-white [&_*]:!text-inherit" : "";
  return (
    <Card i={i} className={`lift flex flex-col !p-5 ${skin}`}>
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Icon size={16} strokeWidth={1.5} aria-hidden /> {label}
        <span className="ml-auto flex items-center gap-1.5 text-[12px]"><span className={`h-2 w-2 rounded-full ${DOT[c.level]}`} aria-hidden />{WORD[c.level]}</span>
      </p>
      <p className="mt-2 text-[17px] font-semibold leading-snug">{c.title}</p>
      <p className="mt-0.5 text-[13px] text-muted">{c.line}{c.why && <> <Why text={c.why} /></>}</p>
      <Link href={c.link} className="mt-auto flex items-center gap-1 pt-3 text-[13px] font-medium text-accent hover:underline">
        See details <ArrowRight size={14} aria-hidden />
      </Link>
    </Card>
  );
}
