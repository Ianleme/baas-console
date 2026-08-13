interface SandboxNoticeProps {
  variant: 'banner' | 'badge';
}

export function SandboxNotice({ variant }: SandboxNoticeProps) {
  if (variant === 'banner') {
    return (
      <header className="fixed inset-x-0 top-0 z-30 flex h-11 items-center justify-between gap-4 bg-[#ff9f1c] px-6 text-sm text-slate-950 font-medium">
        <p className="min-w-0 flex-1 truncate font-semibold">
          <span className="mr-2 inline-flex rounded bg-slate-950 px-2 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">
            Sandbox
          </span>
          Você está operando em um Ambiente de teste
        </p>
        <a
          className="shrink-0 rounded-md border border-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-black/10 transition-colors"
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
        >
          Ver documentação
        </a>
      </header>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
      role="status"
    >
      <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden="true" />
      Ambiente Sandbox
    </div>
  );
}
