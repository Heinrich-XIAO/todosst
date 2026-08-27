export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* git-style diamond container — 45° edges */}
      <path
        d="M12 1.5L22.5 12L12 22.5L1.5 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* check — 45° strokes, 90° vertex, tip meets the frame edge */}
      <path
        d="M7.5 12L10.5 15L17.29 8.21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
    </svg>
  );
}
