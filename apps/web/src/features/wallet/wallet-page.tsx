import { useEffect, useState } from 'react';
import { Clock3, Wallet } from 'lucide-react';

export interface WalletSnapshot {
  balanceCents: string;
  capturedAt: string | null;
  stale: boolean;
  availableCents?: string | null;
  source?: string | null;
}

export interface WalletApi {
  load(): Promise<WalletSnapshot>;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const timestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
});

function money(cents: string) {
  return currency.format(Number(cents) / 100);
}

function formatTimestamp(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Não informado';
  return timestamp.format(new Date(value));
}

function connectionLabel(source: string | null | undefined) {
  const trimmed = source?.trim();
  return trimmed ?? 'Fonte não informada';
}

function WalletHeader({ empty = false }: { empty?: boolean }) {
  return (
    <header className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">
        Financeiro
      </span>
      <h1
        id={empty ? 'wallet-empty-title' : undefined}
        className="text-3xl font-bold leading-none text-brand-ink"
      >
        Carteira
      </h1>
      <p className="text-sm text-brand-muted">Acompanhe o saldo sincronizado da sua operação.</p>
    </header>
  );
}

function WalletSummaryRail({ snapshot }: { snapshot: WalletSnapshot }) {
  const available = snapshot.availableCents ?? snapshot.balanceCents;
  return (
    <section
      data-wallet-summary
      aria-label="Resumo da carteira"
      className="grid grid-cols-1 overflow-hidden rounded-xl border border-brand-line bg-brand-panel sm:grid-cols-2 xl:grid-cols-10"
    >
      <div className="flex min-w-0 items-center gap-5 bg-brand-primary-dark p-5 text-white sm:col-span-2 xl:col-span-4">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-brand-accent bg-white/5">
          <Wallet className="size-6 text-white" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className="text-sm font-semibold">Saldo total</span>
          <strong className="mt-1 block text-3xl font-bold leading-none">
            {money(snapshot.balanceCents)}
          </strong>
          <small className="mt-2 block text-sm text-white/90">Valor informado pelo servidor</small>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-t-0 xl:col-span-2 xl:border-l">
        <span className="text-sm font-medium text-brand-muted">Disponível</span>
        <strong className="mt-3 text-3xl font-bold leading-none text-brand-ink">
          {money(available)}
        </strong>
        <small className="mt-2 text-sm text-brand-muted">
          Disponibilidade retornada pelo servidor
        </small>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-l sm:border-t-0 xl:col-span-4">
        <span className="text-sm font-medium text-brand-muted">Sincronização</span>
        <strong className="mt-3 text-lg font-bold text-brand-ink">
          {snapshot.stale ? 'Requer atenção' : 'Snapshot disponível'}
        </strong>
        <small className="mt-2 text-sm text-brand-muted">Resumo dos dados retornados</small>
      </div>
    </section>
  );
}

function SynchronizationCard({ snapshot }: { snapshot: WalletSnapshot }) {
  return (
    <section
      data-wallet-sync
      aria-labelledby="wallet-sync-title"
      className="rounded-xl border border-brand-line bg-brand-panel"
    >
      <div className="space-y-1 p-5 pb-3">
        <h2
          id="wallet-sync-title"
          className="flex items-center gap-2 text-base font-bold text-brand-ink"
        >
          <Clock3 className="size-4 text-brand-primary" aria-hidden="true" />
          Estado da sincronização
        </h2>
        <p className="text-sm text-brand-muted">Detalhes do snapshot usado nesta carteira.</p>
      </div>
      <dl className="divide-y divide-brand-line px-5 pb-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <dt className="text-brand-muted">Última atualização</dt>
          <dd className="font-semibold text-brand-ink">{formatTimestamp(snapshot.capturedAt)}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <dt className="text-brand-muted">Origem</dt>
          <dd className="font-semibold text-brand-ink">{connectionLabel(snapshot.source)}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <dt className="text-brand-muted">Estado</dt>
          <dd className="font-semibold text-brand-ink">
            {snapshot.stale ? 'Desatualizado' : 'Atual'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function EmptyWallet() {
  return (
    <section className="space-y-5" aria-labelledby="wallet-empty-title">
      <WalletHeader empty />
      <div
        data-wallet-empty
        className="flex max-w-2xl items-start gap-4 rounded-xl border border-dashed border-brand-line bg-brand-panel p-6"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-accent-soft text-brand-primary-dark">
          <Wallet className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-bold text-brand-ink">Ainda não há saldo sincronizado</h2>
          <p className="mt-1 text-sm text-brand-muted">
            A carteira ainda não possui um snapshot disponível. Isso não representa saldo zero
            confirmado.
          </p>
        </div>
      </div>
    </section>
  );
}

export function WalletPage({ api }: { api: WalletApi }) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    void api
      .load()
      .then(setSnapshot)
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api]);

  if (loading) {
    return (
      <p role="status" className="p-4 font-medium text-brand-muted">
        Carregando carteira…
      </p>
    );
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert">
        Não foi possível carregar a carteira. Tente novamente mais tarde.
      </div>
    );
  }

  if (!snapshot?.capturedAt) return <EmptyWallet />;

  return (
    <div className="space-y-5">
      <WalletHeader />
      {snapshot.stale && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <strong className="mr-1 font-semibold">Dados desatualizados</strong>
          Estes são os últimos valores retornados e podem estar desatualizados.
        </div>
      )}
      <WalletSummaryRail snapshot={snapshot} />
      <SynchronizationCard snapshot={snapshot} />
    </div>
  );
}
