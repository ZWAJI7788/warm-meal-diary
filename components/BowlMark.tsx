export function BowlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 22h34c0 9.4-7.6 16-17 16S7 31.4 7 22Z"
        fill="#f3e2cf"
        stroke="#b96a4b"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M12 42h24" stroke="#b96a4b" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M18 16c-2.6-3.4 2.6-5 0-8M26 16c-2.6-3.4 2.6-5 0-8M34 16c-2.6-3.4 2.6-5 0-8"
        stroke="#8f4c32"
        strokeWidth="2"
        strokeLinecap="round"
        className="animate-steam-slow"
        style={{ transformOrigin: "center" }}
      />
      <circle cx="19" cy="27" r="1.6" fill="#b96a4b" opacity=".55" />
      <circle cx="27" cy="30" r="1.2" fill="#8e9b72" opacity=".8" />
      <circle cx="31" cy="25" r="1.4" fill="#e0a45e" opacity=".8" />
    </svg>
  );
}

export function SteamDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 20c-3.4-4.6 3.6-6.8 0-11M30 20c-3.4-4.6 3.6-6.8 0-11M47 20c-3.4-4.6 3.6-6.8 0-11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
