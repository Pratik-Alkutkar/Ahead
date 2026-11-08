/** Ahead mark: a forecast line that dips (money gets tight) then rises to a coral point ahead (what's next). */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#17191C" />
      <path d="M6.5 17.5c2.2 0 3-3 5.2-3 2.5 0 2.6 5.5 5.6 5.5 3.4 0 4.2-6.6 6.7-9.2" stroke="#9FD3C4" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.6" cy="9.6" r="3.6" fill="#17191C" />
      <circle cx="24.6" cy="9.6" r="2.5" fill="#F0563F" />
    </svg>
  );
}

export function Logo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      {word && <span className="font-bold tracking-[-0.02em]" style={{ fontSize: size * 0.68 }}>Ahead</span>}
    </span>
  );
}
