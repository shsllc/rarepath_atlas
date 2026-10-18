/** Brand mark: three communities joined by a research path. Decorative; the name is always written beside it. */
export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="#182033" />
      <path d="M8.5 22.5 L15.5 9.5 L23.5 18.5" stroke="#8f88f2" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="22.5" r="3.2" fill="#f0917c" />
      <circle cx="15.5" cy="9.5" r="3.6" fill="#ffffff" />
      <circle cx="23.5" cy="18.5" r="3.2" fill="#7fd3cb" />
    </svg>
  );
}
