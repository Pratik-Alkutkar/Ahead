"use client";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { AlertCard } from "@/components/AlertCard";
import { TraceDrawer } from "@/components/TraceDrawer";
import { Card, PrimaryButton } from "@/components/ui";
import { fmtDate } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function Alerts() {
  const { alerts, summary, loading, error, refresh } = useStore();
  const [trace, setTrace] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-[28px] font-semibold tracking-tight">Alerts</h1>
      {loading && <div className="card h-64 animate-pulse" aria-busy="true" />}
      {error && (
        <Card className="text-center">
          <p className="text-[17px]">{error}</p>
          <PrimaryButton className="mt-4" onClick={refresh}>Try again</PrimaryButton>
        </Card>
      )}
      {!loading && !error && alerts.length === 0 && (
        <Card className="flex flex-col items-center py-12 text-center">
          <CheckCircle2 size={36} strokeWidth={1.5} className="text-good" aria-hidden />
          <p className="mt-3 text-[19px] font-semibold">No alerts.</p>
          <p className="mt-1 text-[15px] text-muted">
            {summary?.safe_until ? `You're all clear until ${fmtDate(summary.safe_until)}.` : "You're all clear for the next 60 days."}
          </p>
        </Card>
      )}
      {alerts.map((a, i) => (
        <AlertCard key={a.id} alert={a} i={i} onTrace={setTrace} />
      ))}
      <TraceDrawer id={trace} onClose={() => setTrace(null)} />
    </div>
  );
}
