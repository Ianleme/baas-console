import { useEffect, useState } from 'react';
import { Plus, ArrowUpRight, TrendingUp, Wallet, CheckCircle2 } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent, CardHeader } from '../../components/ui/card.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table.js';

export interface DashboardOperation {
  id: string;
  reference: string;
  method: 'PIX' | 'CARD' | 'WITHDRAWAL';
  amountCents: string;
  status: 'APPROVED' | 'DENIED' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
  occurredAt: string;
}

export interface DashboardData {
  wallet: { balanceCents: string; capturedAt: string; stale: boolean };
  receivedCents: string;
  approvedCount: number;
  deniedCount: number;
  pendingCount: number;
  pixReceivedCents: string;
  cardReceivedCents: string;
  operations: DashboardOperation[];
}

export interface DashboardApi {
  load(): Promise<DashboardData>;
}

export function approvalRate(approved: number, denied: number) {
  const finalized = approved + denied;
  return finalized === 0 ? 0 : (approved / finalized) * 100;
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

function statusLabel(status: DashboardOperation['status']) {
  return {
    APPROVED: 'Aprovada',
    DENIED: 'Negada',
    PENDING: 'Pendente',
    EXPIRED: 'Expirada',
    CANCELLED: 'Cancelada'
  }[status];
}

export function Dashboard({ api }: { api: DashboardApi }) {
  const [data, setData] = useState<DashboardData>();
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState('Hoje');

  useEffect(() => {
    void api
      .load()
      .then(setData)
      .catch(() => setFailed(true));
  }, [api]);

  if (failed)
    return (
      <p role="alert" className="text-red-600 p-4 font-semibold">
        Não foi possível carregar o painel. Tente novamente mais tarde.
      </p>
    );
  if (!data)
    return (
      <p role="status" className="text-slate-500 p-4">
        Carregando painel financeiro…
      </p>
    );

  const totalReceived = BigInt(data.pixReceivedCents) + BigInt(data.cardReceivedCents);
  const pixPercent =
    totalReceived === 0n ? 0 : Number((BigInt(data.pixReceivedCents) * 100n) / totalReceived);
  const rate = approvalRate(data.approvedCount, data.deniedCount);

  return (
    <div className="dashboard space-y-6">
      <header className="dashboard__heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Visão geral
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Acompanhe sua operação em tempo real.</p>
        </div>
        <div className="dashboard__actions flex items-center gap-3">
          <a
            className="secondary-action inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            href="#/saques"
            tabIndex={-1}
          >
            <ArrowUpRight className="h-4 w-4" />
            Solicitar saque
          </a>
          <a
            className="primary-action inline-flex items-center justify-center rounded-lg bg-[#007a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005c47] shadow-sm transition-colors"
            href="#/links"
            tabIndex={-1}
          >
            + Criar link de pagamento
          </a>
        </div>
      </header>

      <div
        className="periods flex gap-2 border-b border-slate-200 pb-3"
        aria-label="Período do painel"
      >
        {['Hoje', '7 dias', '30 dias', '90 dias'].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={period === item}
            onClick={() => setPeriod(item)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              period === item
                ? 'bg-[#007a5a] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <section
        className="kpis grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Resumo financeiro"
      >
        <Card className="kpi--balance bg-gradient-to-br from-[#005746] to-[#008f78] text-white p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="text-xs font-semibold text-emerald-100 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-emerald-200" /> Saldo disponível
            </span>
            <strong className="text-2xl font-extrabold text-white mt-1">
              {money(data.wallet.balanceCents)}
            </strong>
            <small className="text-xs text-emerald-100">
              Atualizado em {timestamp.format(new Date(data.wallet.capturedAt))}
            </small>
            {data.wallet.stale && (
              <b className="stale rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 w-fit mt-1">
                Dados desatualizados
              </b>
            )}
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="text-xs font-semibold text-slate-500">Recebimentos</span>
            <strong className="text-2xl font-extrabold text-slate-900 mt-1">
              {money(data.receivedCents)}
            </strong>
            <small className="text-xs text-slate-400">Total acumulado</small>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="text-xs font-semibold text-slate-500">Transações</span>
            <strong
              className="text-2xl font-extrabold text-slate-900 mt-1"
              data-testid="transaction-count"
            >
              {data.approvedCount + data.deniedCount + data.pendingCount}
            </strong>
            <small className="text-xs text-slate-500 font-semibold">
              {data.approvedCount} aprovadas
            </small>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="text-xs font-semibold text-slate-500">Taxa de aprovação</span>
            <strong className="text-2xl font-extrabold text-slate-900 mt-1">
              {rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </strong>
            <small className="text-[0.72rem] text-slate-400 leading-tight">
              Aprovadas ÷ (aprovadas + negadas); pendentes não entram no cálculo.
            </small>
          </CardContent>
        </Card>
      </section>

      <div className="dashboard__grid grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card aria-labelledby="composition-title">
          <CardHeader className="pb-3">
            <h2 id="composition-title" className="text-lg font-bold text-slate-900">
              Composição dos recebimentos
            </h2>
            <p className="text-xs text-slate-500">
              Pix representa {pixPercent}% e cartão {100 - pixPercent}% do valor recebido.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="composition h-3 w-full rounded-full bg-slate-100 overflow-hidden flex"
              aria-hidden="true"
            >
              <span
                className="h-full bg-[#00bdae] transition-all"
                style={{ width: `${pixPercent}%` }}
              />
              <span className="h-full bg-blue-500 flex-1" />
            </div>
            <dl className="grid grid-cols-2 gap-4 pt-2">
              <div className="border-l-2 border-[#00bdae] pl-3">
                <dt className="text-xs font-semibold text-slate-500">Pix</dt>
                <dd className="text-base font-bold text-slate-900">
                  {money(data.pixReceivedCents)}
                </dd>
              </div>
              <div className="border-l-2 border-blue-500 pl-3">
                <dt className="text-xs font-semibold text-slate-500">Cartão</dt>
                <dd className="text-base font-bold text-slate-900">
                  {money(data.cardReceivedCents)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card aria-labelledby="operation-title">
          <CardHeader className="pb-3">
            <h2 id="operation-title" className="text-lg font-bold text-slate-900">
              Operação
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="operation-summary space-y-3">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Gateway Lera Box</dt>
                <dd className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Conectado
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Dados da carteira</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {data.wallet.stale ? 'Desatualizados' : 'Atualizados'}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Período</dt>
                <dd className="text-sm font-semibold text-slate-900">{period}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="recent">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Transações recentes</h2>
          <a className="text-xs font-semibold text-[#007a5a] hover:underline" href="#/transacoes">
            Ver todas
          </a>
        </CardHeader>
        <CardContent>
          {data.operations.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">Nenhuma transação no período.</p>
          ) : (
            <Table aria-label="Transações recentes">
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operations.map((operation) => (
                  <TableRow key={operation.id}>
                    <TableCell className="font-semibold text-slate-900">
                      {operation.reference}
                    </TableCell>
                    <TableCell>
                      {operation.method === 'CARD'
                        ? 'Cartão'
                        : operation.method === 'PIX'
                          ? 'Pix'
                          : 'Saque'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {timestamp.format(new Date(operation.occurredAt))}
                    </TableCell>
                    <TableCell className="font-bold text-slate-900">
                      {money(operation.amountCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={operation.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: DashboardOperation['status'] }) {
  switch (status) {
    case 'APPROVED':
      return <Badge variant="active">Aprovada</Badge>;
    case 'DENIED':
      return <Badge variant="destructive">Negada</Badge>;
    case 'PENDING':
      return <Badge variant="expired">Pendente</Badge>;
    case 'EXPIRED':
      return <Badge variant="expired">Expirada</Badge>;
    case 'CANCELLED':
      return <Badge variant="cancelled">Cancelada</Badge>;
  }
}
