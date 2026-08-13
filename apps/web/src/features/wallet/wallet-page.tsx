import { useEffect, useState } from 'react';
import { Clock3, Database, Wallet } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';

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
  timeZone: 'UTC'
});

function money(cents: string) {
  return currency.format(Number(cents) / 100);
}

function formatTimestamp(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Não informado';
  return `${timestamp.format(new Date(value))} UTC`;
}

function connectionLabel(source: string | null | undefined) {
  return source?.trim() || 'Fonte não informada';
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
      <p role="status" className="p-4 font-medium text-slate-500">
        Carregando carteira…
      </p>
    );
  }

  if (failed) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-6 text-red-700" role="alert">
          Não foi possível carregar a carteira. Tente novamente mais tarde.
        </CardContent>
      </Card>
    );
  }

  if (!snapshot || snapshot.capturedAt === null) {
    return (
      <section className="space-y-5" aria-labelledby="wallet-empty-title">
        <header className="space-y-1">
          <span className="eyebrow eyebrow--green">Financeiro</span>
          <h1 id="wallet-empty-title" className="text-[2rem] font-extrabold text-slate-900">
            Carteira
          </h1>
          <p className="text-sm text-slate-500">Acompanhe o saldo sincronizado da sua operação.</p>
        </header>
        <Card className="max-w-2xl border-dashed">
          <CardContent className="flex items-start gap-4 p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8fbd1] text-[#005c47]">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Ainda não há saldo sincronizado</h2>
              <p className="mt-1 text-sm text-slate-500">
                A carteira ainda não possui um snapshot disponível. Isso não representa saldo zero
                confirmado.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const available = snapshot.availableCents ?? snapshot.balanceCents;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="eyebrow eyebrow--green">Financeiro</span>
          <h1 className="text-[2rem] font-extrabold text-slate-900">Carteira</h1>
          <p className="text-sm text-slate-500">Saldo e disponibilidade da sua operação.</p>
        </div>
        {snapshot.stale && (
          <Badge className="border border-amber-200 bg-amber-50 text-amber-800">
            Dados desatualizados
          </Badge>
        )}
      </header>

      {snapshot.stale && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Estes são os últimos valores retornados e podem estar desatualizados.
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Resumo da carteira">
        <Card className="border-0 bg-[#005746] text-white">
          <CardContent className="min-h-[10rem] p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-50/90">
              <Wallet className="h-4 w-4" aria-hidden="true" /> Saldo total
            </div>
            <strong className="mt-6 block text-[2rem] font-extrabold tracking-tight">
              {money(snapshot.balanceCents)}
            </strong>
            <span className="mt-2 block text-xs text-emerald-100/85">
              Valor informado pelo servidor.
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="min-h-[10rem] p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Database className="h-4 w-4 text-[#006b57]" aria-hidden="true" /> Disponível
            </div>
            <strong className="mt-6 block text-[2rem] font-extrabold tracking-tight text-slate-900">
              {money(available)}
            </strong>
            <span className="mt-2 block text-xs text-slate-500">
              Disponibilidade retornada pelo servidor.
            </span>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-[#006b57]" aria-hidden="true" /> Estado da sincronização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Última atualização</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatTimestamp(snapshot.capturedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Origem</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {connectionLabel(snapshot.source)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Estado</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {snapshot.stale ? 'Desatualizado' : 'Atual'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
