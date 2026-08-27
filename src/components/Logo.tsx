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
      {/* todoist-style check — 45° strokes, 90° vertex, clear of the frame */}
      <path
        d="M7.5 12L10.5 15L15.5 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
