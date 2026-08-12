interface SandboxNoticeProps {
  variant: 'banner' | 'badge';
}

export function SandboxNotice({ variant }: SandboxNoticeProps) {
  if (variant === 'banner') {
    return (
      <header className="sandbox-banner">
        <strong>Sandbox</strong>
        <span>Ambiente de teste — nenhuma operação usa dinheiro real</span>
        <span className="sandbox-banner__signal" aria-hidden="true" />
      </header>
    );
  }

  return (
    <div className="sandbox-badge" role="status">
      <span className="sandbox-badge__dot" aria-hidden="true" />
      Ambiente Sandbox
    </div>
  );
}
