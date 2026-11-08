"use client";
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast } from "@/lib/api";
import { fmtDate, usd } from "@/lib/api";

/** Thin median line, soft band (10th-90th), dots for bills, optional dashed what-if line. */
export function ForecastChart({ forecast, whatIf, height = 220 }: { forecast: Forecast; whatIf?: number[] | null; height?: number }) {
  const data = forecast.days.map((d, i) => ({ date: d.date, p50: d.p50, band: [d.p10, d.p90], whatIf: whatIf?.[i] ?? null }));
  const bills = forecast.markers.filter((m) => m.amount <= -200);
  const byDate = new Map(data.map((d) => [d.date, d.p50]));
  return (
    <div style={{ height }} role="img" aria-label={`Balance forecast for the next 60 days. ${forecast.why}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickMargin={8} tickFormatter={(d) => fmtDate(d)} interval={14} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tickFormatter={(v) => usd(v)} width={56} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--line)" strokeWidth={1.5} />
          <Area dataKey="band" stroke="none" fill="url(#band)" isAnimationActive={false} />
          <Line dataKey="p50" stroke="var(--accent)" strokeWidth={2} dot={false} type="monotone" animationDuration={500} />
          {whatIf && (
            <Line dataKey="whatIf" stroke="var(--ring-good)" strokeWidth={2} strokeDasharray="5 4" dot={false} type="monotone" animationDuration={400} />
          )}
          {bills.map((b) => (
            <ReferenceDot key={b.date + b.label} x={b.date} y={byDate.get(b.date) ?? 0} r={4} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.5} />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--line)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              const bill = forecast.markers.filter((m) => m.date === label);
              return (
                <div className="card px-3 py-2 text-[13px]">
                  <div className="font-medium">{fmtDate(label as string, true)}</div>
                  <div>Likely balance: {usd(row.p50)}</div>
                  {row.whatIf != null && <div className="text-good">With fix: {usd(row.whatIf)}</div>}
                  {bill.map((b) => (
                    <div key={b.label} className="text-muted">
                      {b.label} {usd(b.amount)}
                    </div>
                  ))}
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
