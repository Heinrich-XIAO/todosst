export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* checkbox frame */}
      <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="2" />
      {/* prompt chevron */}
      <path d="M7.5 8l4.5 4-4.5 4" stroke="currentColor" strokeWidth="2" />
      {/* block cursor */}
      <rect x="14" y="14.5" width="4" height="3.5" fill="currentColor" />
    </svg>
  );
}
