"use client";
import { Lock, LogOut } from "lucide-react";
import { LogoMark } from "./Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/alerts", label: "Alerts" },
  { href: "/plan", label: "Plan" },
  { href: "/ask", label: "Ask" },
];

export function Nav() {
  const path = usePathname();
  const { alerts } = useStore();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`sticky top-0 z-30 border-b border-line bg-glass backdrop-blur-xl transition-shadow duration-300 ${scrolled ? "shadow-[0_6px_20px_rgba(20,23,28,0.07)]" : ""}`}>
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <LogoMark size={30} />
          <span className="hidden sm:inline">Ahead</span>
        </Link>
        <nav aria-label="Main" className="mx-auto min-w-0">
          <ul className="flex gap-1 rounded-full bg-bg p-1">
            {TABS.map(({ href, label }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium transition sm:px-5 ${
                      active ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                    {href === "/alerts" && alerts.length > 0 && (
                      <span className="rounded-full bg-act px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                        {alerts.length}
                        <span className="sr-only"> new</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <span className="hidden items-center gap-1.5 text-[13px] text-muted md:flex">
          <Lock size={13} strokeWidth={1.75} aria-hidden /> Nothing moves without your OK
        </span>
        <Link href="/login" aria-label="Sign out" title="Sign out" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
          <LogOut size={16} strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}
