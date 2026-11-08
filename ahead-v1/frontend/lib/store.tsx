"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Alert, type Forecast, type Overview, type Summary } from "./api";

type Store = {
  summary: Summary | null;
  forecast: Forecast | null;
  overview: Overview | null;
  alerts: Alert[];
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setAlerts: (a: Alert[]) => void;
  toast: { text: string; undoId?: string } | null;
  showToast: (t: { text: string; undoId?: string } | null) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, showToast] = useState<Store["toast"]>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, f, a, o] = await Promise.all([api.summary(), api.forecast(), api.alerts(), api.overview()]);
      setSummary(s);
      setForecast(f);
      setOverview(o);
      setAlerts(a.alerts);
      setError(null);
    } catch {
      setError("We couldn't reach your money right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ summary, forecast, overview, alerts, error, loading, refresh, setAlerts, toast, showToast }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
