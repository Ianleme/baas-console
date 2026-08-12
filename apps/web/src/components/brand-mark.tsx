interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span className="brand" {...(compact ? { 'aria-label': 'BaaS Console', role: 'img' } : {})}>
      <svg data-testid="brand-mark" className="brand__mark" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 3.5 42 14v20L24 44.5 6 34V14L24 3.5Z" />
        <path d="m14 17 10-5.8L34 17 24 23 14 17Zm0 14 10 5.8L34 31l-10-6-10 6Z" />
      </svg>
      {!compact && <span className="brand__name">BaaS Console</span>}
    </span>
  );
}
