/** The Second Key mark: two key-bows side by side. Outlined is the payer, solid is the person they trust. */
export function Mark({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 32 20" fill="none" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="9" cy="10" r="6.5" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="9" cy="10" r="2" fill="currentColor" />
      <circle cx="23" cy="10" r="7.7" fill="var(--brass, #8a5d0f)" />
      <circle cx="23" cy="10" r="2" fill="var(--paper, #f7f5f0)" />
    </svg>
  );
}
