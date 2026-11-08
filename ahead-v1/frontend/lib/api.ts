export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Indicator = { points: number; value: number; why: string };
export type Fix = {
  id: string;
  title: string;
  action: unknown;
  preview?: { score: number; safe_until: string | null; days: number[] };
};
export type Alert = {
  id: string;
  kind: string;
  level: "good" | "watch" | "act";
  title: string;
  body: string;
  fixes: Fix[];
  trace_id?: string;
  current?: { score: number; safe_until: string | null };
};
export type Summary = {
  name: string;
  today: string;
  safe_until: string | null;
  safe_why: string;
  lowest: { date: string; balance: number };
  score: number;
  indicators: Record<string, Indicator>;
  balances: Record<string, number>;
  card_limit: number;
  money_saved: { monthly: number; yearly: number; count: number; why: string };
  top_alert: Alert | null;
  alert_count: number;
};
export type Forecast = {
  safe_until: string | null;
  why: string;
  days: { date: string; p10: number; p50: number; p90: number }[];
  markers: { date: string; label: string; amount: number }[];
};
export type Overview = {
  budget: { month_passed: number; categories: { category: string; plan: number; spent: number; used: number; status: "good" | "watch" | "act" }[] };
  debt: { dues: { date: string; name: string; amount: number }[]; total_due: number; owed: { name: string; balance: number; apr: number }[]; total_owed: number };
  card: {
    owed: number; limit: number; used: number; available: number; apr: number;
    next_payment: { date: string; amount: number } | null;
    categories: { category: string; amount: number }[];
    top_merchants: { merchant: string; amount: number }[];
    why: string;
  };
  investments: {
    accounts: { name: string; balance: number; holding: string }[];
    total: number;
    steps: { id: string; title: string; done: boolean; why: string }[];
    next_step: string | null;
    moves: { id: string; do: string; cost: string; outcome: string; outcome_note: string }[];
    free_money_missed: number;
    projection: { age: number; assumed_return: number; today_plan: number; with_full_match: number; why: string };
    disclaimer: string;
  };
};
export type Leak = { bill_id: string; merchant: string; amount: number; yearly: number; type: string; why: string; date?: string; old?: number };
export type Payoff = { months: number; interest: number; debt_free: string; order: string[] };
export type BudgetData = {
  budget: { income: number; savings_first: number; lines: { category: string; monthly: number; fixed: boolean }[]; why: string };
  pace: Overview["budget"];
  debt: { avalanche: Payoff; snowball: Payoff; plus_100: Payoff; same_order: boolean; minimum_trap: { months: number; interest: number; why: string } };
};
export type AskAnswer = {
  answer: string;
  spoken_text: string;
  action: { kind: string; [k: string]: unknown } | null;
  verified: boolean;
  blocked?: boolean;
  trace_id: string;
};
export type Trace = {
  id: string;
  question: string;
  planner: string;
  steps?: string[];
  tool_calls: { tool: string; args?: unknown; result: unknown; ms?: number }[];
  critic: { verified: boolean; unverified: string[] };
  ms: number;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail ?? "Something went wrong. Try again.");
  }
  return r.json();
}

export const api = {
  summary: () => call<Summary>("/summary"),
  forecast: () => call<Forecast>("/forecast"),
  overview: () => call<Overview>("/overview"),
  budget: () => call<BudgetData>("/budget"),
  budgetBuild: (monthly_saving: number) =>
    call<BudgetData["budget"]>("/budget/build", { method: "POST", body: JSON.stringify({ monthly_saving }) }),
  leaks: () => call<{ leaks: Leak[]; monthly_total: number; yearly_total: number }>("/leaks"),
  cancelLeak: (bill_id: string) =>
    call<{ undo_id: string; email: string; money_saved: { yearly: number } }>("/leaks/cancel", { method: "POST", body: JSON.stringify({ bill_id }) }),
  alerts: () => call<{ alerts: Alert[] }>("/alerts"),
  trace: (id: string) => call<Trace>(`/trace/${id}`),
  simulateWeek: () => call<{ alerts: Alert[] }>("/simulate-week", { method: "POST" }),
  approve: (alert_id: string, fix_id: string) =>
    call<{ undo_id: string; summary: { score: number; safe_until: string | null } }>("/approve", {
      method: "POST",
      body: JSON.stringify({ alert_id, fix_id }),
    }),
  approveAction: (action: unknown) =>
    call<{ undo_id: string; summary: { score: number; safe_until: string | null } }>("/approve", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  undo: (undo_id: string) => call("/undo", { method: "POST", body: JSON.stringify({ undo_id }) }),
  reset: () => call("/reset", { method: "POST" }),
};

export function fmtDate(iso: string | null, long = false) {
  if (!iso) return "60+ days";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", long ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}

export function fmtMonth(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function usd(n: number, cents = false) {
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return `${n < 0 ? "-" : ""}$${s}`;
}
