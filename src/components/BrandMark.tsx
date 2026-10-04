/** Decorative brand mark: three connected nodes (a path through an atlas). */
export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#4F46A5" />
      <path d="M9 22 L16 10 L23 19" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="22" r="3" fill="#ffffff" />
      <circle cx="16" cy="10" r="3" fill="#7fd3cb" />
      <circle cx="23" cy="19" r="3" fill="#ffffff" />
    </svg>
  );
}
