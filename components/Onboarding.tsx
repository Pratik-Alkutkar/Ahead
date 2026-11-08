"use client";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Eye, ShieldCheck } from "lucide-react";
import { LogoMark } from "./Logo";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PrimaryButton, TextButton } from "./ui";

const KEY = "ahead_onboarded";
const CARDS = [
  { Icon: Eye, title: "Ahead watches all your money in one place.", sub: "Checking, savings, cards, loans, pay-later and investments." },
  { Icon: BellRing, title: "It warns you before money gets tight.", sub: "Not after. You'll see trouble coming days or weeks early." },
  { Icon: ShieldCheck, title: "It suggests fixes. Nothing happens without your OK.", sub: "Every move waits for your yes, and you can undo it." },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const path = usePathname();

  useEffect(() => {
    if (path === "/login") return setOpen(false); // the login screen shows first; cards follow sign-in
    try {
      if (!localStorage.getItem(KEY)) {
        setI(0);
        setOpen(true);
      }
    } catch {
      /* storage blocked: skip onboarding rather than nag every load */
    }
  }, [path]);

  function finish() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(CARDS.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  if (!open) return null;
  const last = i === CARDS.length - 1;
  const { Icon, title, sub } = CARDS[i];

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Ahead" className="fixed inset-0 z-[60] flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-10 flex items-center justify-center gap-2 text-[20px] font-bold tracking-tight">
          <LogoMark size={32} />
          Ahead
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) setI((x) => Math.min(CARDS.length - 1, x + 1));
              if (info.offset.x > 60) setI((x) => Math.max(0, x - 1));
            }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="card cursor-grab p-8 active:cursor-grabbing"
          >
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
              <Icon size={30} strokeWidth={1.75} />
            </span>
            <h2 className="mt-6 text-[22px] font-bold leading-snug tracking-tight">{title}</h2>
            <p className="mt-2 text-[15px] text-muted">{sub}</p>
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex justify-center gap-2" aria-hidden>
          {CARDS.map((_, k) => (
            <span key={k} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-accent" : "w-2 bg-line"}`} />
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2">
          {last ? (
            <PrimaryButton onClick={finish} className="!px-7 !py-3 !text-[16px]">Show me my money</PrimaryButton>
          ) : (
            <>
              <TextButton onClick={finish} className="!text-muted">Skip</TextButton>
              <PrimaryButton onClick={() => setI(i + 1)} className="!px-7">Next</PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
