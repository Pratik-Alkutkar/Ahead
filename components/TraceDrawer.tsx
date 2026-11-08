"use client";
import { BadgeCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Trace } from "@/lib/api";
import { Drawer } from "./ui";

const TOOL_NAMES: Record<string, string> = {
  forecast: "Ran the 60-day forecast (1,000 simulations)",
  find_leaks: "Checked every charge paid every month",
  what_if: "Compared a fix",
  health_score: "Checked the 4 health indicators",
  purchase_impact: "Tested the purchase against the forecast",
  save_for_goal: "Planned weekly savings",
  get_snapshot: "Looked at all accounts",
  debt_plan: "Compared payoff plans",
  budget_pace: "Checked budget pace",
  build_budget: "Built budget from the last 3 months",
  get_cashflow: "Checked income and bills",
};

/** "How I figured this out": the one place tool/vendor details appear. */
export function TraceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [t, setT] = useState<Trace | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setT(null);
    setErr(false);
    if (id) api.trace(id).then(setT).catch(() => setErr(true));
  }, [id]);
  return (
    <Drawer open={!!id} onClose={onClose} title="How I figured this out">
      {err && <p className="text-[15px] text-muted">This explanation isn&apos;t available anymore.</p>}
      {!t && !err && <p className="shimmer text-[15px]">Loading steps…</p>}
      {t && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-[15px] font-medium text-good">
            <BadgeCheck size={18} strokeWidth={1.5} />
            {t.critic.verified ? "Verified: every number checked against your data" : "Some numbers couldn't be verified"}
          </div>
          <ol className="space-y-3">
            {t.tool_calls.map((c, i) => (
              <li key={i} className="rounded-2xl bg-bg p-4">
                <div className="text-[15px] font-medium">
                  {i + 1}. {TOOL_NAMES[c.tool] ?? c.tool}
                  {typeof c.args === "string" && <span className="font-normal text-muted">: {c.args}</span>}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[13px] text-muted">See data</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted">
                    {JSON.stringify(c.result, null, 1).slice(0, 1500)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-muted">
            Planner: {t.planner === "nemotron" ? "NVIDIA Nemotron" : t.planner === "watcher" ? "Ahead Watcher (proactive)" : t.planner === "fast" ? "Ahead fast path (exact math, no AI needed)" : "Ahead rules (backup)"}
            {t.ms ? ` · ${(t.ms / 1000).toFixed(1)}s` : ""} · Math by Python, never the model.
          </p>
        </div>
      )}
    </Drawer>
  );
}
