"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut", delay: i * 0.05 } }),
};

/** Scroll reveal: a card fades and rises the first time it enters the screen; its RevealItem rows follow one by one. */
export const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.06, when: "beforeChildren", staggerChildren: 0.05 },
  }),
};
const item = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } };
const VIEW = { once: true, amount: 0.15 } as const;

export function Card({ children, className = "", i = 0 }: { children: React.ReactNode; className?: string; i?: number }) {
  return (
    <motion.section variants={reveal} initial="hidden" whileInView="show" viewport={VIEW} custom={i} className={`card p-6 sm:p-8 ${className}`}>
      {children}
    </motion.section>
  );
}

/** A list row that appears after its card, in order. */
export function RevealItem({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <motion.li variants={item} className={className}>{children}</motion.li>;
}

/** Any block that should reveal on scroll on its own (outside a Card). */
export function Reveal({ className = "", children, i = 0 }: { className?: string; children: React.ReactNode; i?: number }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={VIEW} custom={i} className={className}>
      {children}
    </motion.div>
  );
}

/** Progress bar fill that grows from the left when it scrolls into view. */
export function Bar({ pct, color, className = "" }: { pct: number; color?: string; className?: string }) {
  return (
    <motion.div
      className={`h-full origin-left rounded-full ${className}`}
      style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
    />
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:opacity-90 active:scale-[0.97] disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

export function TextButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full px-3 py-2 text-[15px] font-medium text-accent transition hover:bg-line active:scale-[0.97] disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

/** "?" next to a number: one-sentence why, on tap. */
export function Why({ text, label = "Why?" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="rounded-full p-1 text-muted hover:text-ink"
      >
        <HelpCircle size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="card absolute left-1/2 top-8 z-20 w-64 -translate-x-1/2 p-4 text-left text-[13px] font-normal leading-snug text-ink"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Money that counts up to its value (from 0 on first show, then from the old value). */
export function CountMoney({ value, cents = false }: { value: number; cents?: boolean }) {
  const [shown, setShown] = useState(0);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  useEffect(() => {
    if (reduce) return setShown(value);
    if (!seen) return;
    const from = shown;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 800);
      setShown(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, seen]);
  const s = Math.abs(shown).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return <span ref={ref}>{shown < 0 ? "-" : ""}${s}</span>;
}

/** Animated count-up for numbers like the score. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return setShown(value);
    const from = shown;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <>{shown}</>;
}

/** Text that flips when it changes (safe-until date). */
export function Flip({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`} style={{ perspective: 400 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={value}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function StatusPill({ level }: { level: "good" | "watch" | "act" }) {
  const map = { good: ["text-good", "All good"], watch: ["text-watch", "Watch"], act: ["text-act", "Act now"] } as const;
  const [cls, text] = map[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${cls}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      {text}
    </span>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-card p-6 sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-line">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
