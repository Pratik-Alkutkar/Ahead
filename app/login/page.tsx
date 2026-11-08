"use client";
import { Lock } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrimaryButton } from "@/components/ui";

/** Demo sign-in screen. Not real auth: any input (or none) signs in as Maya. */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("maya@example.com");
  const [busy, setBusy] = useState(false);

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      localStorage.removeItem("ahead_onboarded"); // replay the 3 intro cards after each demo sign-in
    } catch {}
    setTimeout(() => router.push("/"), 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={56} className="drop-shadow-[0_10px_24px_rgba(21,24,27,0.25)]" />
          <h1 className="mt-4 text-[28px] font-bold tracking-tight">Welcome to Ahead</h1>
          <p className="mt-1 text-[15px] text-muted">Banks show your past. Ahead shows what&apos;s next.</p>
        </div>
        <form onSubmit={signIn} className="card space-y-4 p-6 sm:p-8">
          <div>
            <label htmlFor="email" className="text-[13px] font-medium text-muted">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off"
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] outline-none focus:border-accent" />
          </div>
          <div>
            <label htmlFor="pw" className="text-[13px] font-medium text-muted">Password</label>
            <input id="pw" type="password" defaultValue="demo-password" autoComplete="off"
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] outline-none focus:border-accent" />
          </div>
          <PrimaryButton type="submit" disabled={busy} className="w-full justify-center">
            {busy ? "Signing in…" : "Sign in"}
          </PrimaryButton>
          <p className="text-center text-[12px] text-faint">Demo only. Any email works.</p>
        </form>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-muted">
          <Lock size={13} strokeWidth={1.75} aria-hidden /> Nothing moves without your OK
        </p>
      </div>
    </div>
  );
}
