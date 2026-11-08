"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export function Toast() {
  const { toast, showToast, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => showToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast, showToast]);

  async function undo() {
    if (!toast?.undoId) return;
    setBusy(true);
    try {
      await api.undo(toast.undoId);
      await refresh();
      showToast({ text: "Undone. Everything is back how it was." });
    } catch {
      showToast({ text: "Couldn't undo that. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto flex items-center gap-4 rounded-full bg-ink px-5 py-3 text-[15px] text-bg shadow-lg"
          >
            {toast.text}
            {toast.undoId && (
              <button onClick={undo} disabled={busy} className="font-semibold text-[#5EEAD4]">
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
