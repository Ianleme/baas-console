import { useEffect, useState } from 'react';
import { ArrowUp, CheckCircle2, ChevronRight, CreditCard, QrCode, Wallet } from 'lucide-react';

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
  customerName?: string;
}

export interface DashboardMovementPoint {
  label: string;
  inCents: string;
  outCents: string;
}

export interface DashboardData {
  wallet: { balanceCents: string; capturedAt: string; stale: boolean };
  receivedCents: string;
  receivedChangePercent?: number;
  approvedCount: number;
  deniedCount: number;
  pendingCount: number;
  pixReceivedCents: string;
  cardReceivedCents: string;
  operations: DashboardOperation[];
  movement?: DashboardMovementPoint[];
  webhooksActive?: boolean;
  pendingEvents?: number;
}

export interface DashboardApi {
  load(): Promise<DashboardData>;
}

export function approvalRate(approved: number, denied: number) {
  const finalized = approved + denied;
  return finalized === 0 ? 0 : (approved / finalized) * 100;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const clock = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false
});
const dayMonth = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC'
});
const fullTimestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC'
});
const periods = [
  'Hoje',
  '7 dias',
  '30 dias',
  '90 dias',
  'Todo o período',
  'Personalizado'
] as const;

const cardClass = 'rounded-2xl border border-slate-200/90 bg-white shadow-none';

function money(cents: string) {
  return currency.format(Number(cents) / 100);
}

function relativeTime(iso: string, now = Date.now()) {
  const diffMs = now - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Agora';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `Há ${String(minutes)} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${String(hours)} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `Há ${String(days)} dia${days === 1 ? '' : 's'}`;
}

function formatOperationWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  const sameUtcDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();
  const time = clock.format(date);
  if (sameUtcDay) return `Hoje, ${time}`;
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);
  const isYesterday =
    date.getUTCFullYear() === yesterday.getUTCFullYear() &&
    date.getUTCMonth() === yesterday.getUTCMonth() &&
    date.getUTCDate() === yesterday.getUTCDate();
  if (isYesterday) return `Ontem, ${time}`;
  return `${dayMonth.format(date).replace('.', '')}, ${time}`;
}

function buildMovementPath(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
  paddingX = 4,
  paddingY = 10
) {
  if (values.length === 0 || maxValue <= 0) return '';
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : paddingX + (index / (values.length - 1)) * usableWidth;
      const y = paddingY + usableHeight - (value / maxValue) * usableHeight;
      return `${index === 0 ? 'M' : 'L'}${String(x)},${String(y)}`;
    })
    .join(' ');
}

function buildAreaPath(linePath: string, width: number, height: number) {
  if (!linePath) return '';
  return `${linePath} L${String(width - 4)},${String(height - 10)} L4,${String(height - 10)} Z`;
}

function DashboardHeader() {
  return (
    <header className="dashboard__heading flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#006b57]">Visão geral</span>
        <h1 className="text-[2rem] font-extrabold leading-none tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Acompanhe sua operação em tempo real.</p>
      </div>
      <div className="dashboard__actions flex items-center gap-2.5">
        <a className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50" href="#/saques" tabIndex={-1}>Solicitar saque</a>
        <a className="inline-flex items-center justify-center rounded-xl bg-[#006b57] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#005746]" href="#/links" tabIndex={-1}>+ Criar link de pagamento</a>
      </div>
    </header>
  );
}

function PeriodFilters({ period, onChange }: { period: (typeof periods)[number]; onChange: (period: (typeof periods)[number]) => void }) {
  return (
    <div className="periods flex flex-wrap gap-2" aria-label="Período do painel">
      {periods.map((item) => (
        <button key={item} type="button" aria-pressed={period === item} onClick={() => onChange(item)} className={`rounded-lg border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors ${period === item ? 'border-[#b8d873] bg-[#dff5a8] text-[#24513b]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
          {item}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({ api }: { api: DashboardApi }) {
  const [data, setData] = useState<DashboardData>();
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<(typeof periods)[number]>('Hoje');

  useEffect(() => {
    void api
      .load()
      .then(setData)
      .catch(() => {
        setFailed(true);
      });
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
  const cardPercent = totalReceived === 0n ? 0 : 100 - pixPercent;
  const rate = approvalRate(data.approvedCount, data.deniedCount);
  const transactionCount = data.approvedCount + data.deniedCount + data.pendingCount;
  const lastOperation = data.operations[0];
  const pendingEvents = data.pendingEvents ?? 0;
  const webhooksActive = data.webhooksActive ?? true;
  const movement = data.movement ?? [];
  const movementMax = Math.max(
    500_000,
    ...movement.flatMap((point) => [Number(point.inCents), Number(point.outCents)])
  );
  const chartWidth = 420;
  const chartHeight = 168;
  const inValues = movement.map((point) => Number(point.inCents));
  const outValues = movement.map((point) => Number(point.outCents));
  const inPath = buildMovementPath(inValues, chartWidth, chartHeight, movementMax);
  const outPath = buildMovementPath(outValues, chartWidth, chartHeight, movementMax);
  const inArea = buildAreaPath(inPath, chartWidth, chartHeight);
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    label: currency.format((movementMax * ratio) / 100)
  }));

  return (
    <div className="dashboard space-y-5">
      <DashboardHeader />

      <PeriodFilters period={period} onChange={setPeriod} />

      <section
        className="kpis grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        aria-label="Resumo financeiro"
      >
        <Card className={`${cardClass} border-0 bg-[#005746] text-white`}>
          <CardContent className="p-5 flex flex-col justify-between min-h-[8.25rem]">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <Wallet className="h-4 w-4 text-white" />
              </span>
              <span className="text-sm font-medium text-emerald-50/90">Saldo disponível</span>
            </div>
            <strong className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-white">
              {money(data.wallet.balanceCents)}
            </strong>
            <small className="mt-2 text-xs text-emerald-100/85">Disponível para saque.</small>
            {data.wallet.stale && (
              <b className="stale mt-3 w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.7rem] font-bold text-amber-800">
                Dados desatualizados
              </b>
            )}
            <span className="sr-only">
              Atualizado em{' '}
              {fullTimestamp.format(
                data.wallet.capturedAt && !isNaN(new Date(data.wallet.capturedAt).getTime())
                  ? new Date(data.wallet.capturedAt)
                  : new Date()
              )}
            </span>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-5 flex flex-col justify-between min-h-[8.25rem]">
            <span className="text-sm font-medium text-slate-500">Recebimentos</span>
            <strong className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-slate-900">
              {money(data.receivedCents)}
            </strong>
            {typeof data.receivedChangePercent === 'number' ? (
              <small className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#0f8a5f]">
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.75} />+
                {data.receivedChangePercent.toLocaleString('pt-BR', {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1
                })}
                %
              </small>
            ) : (
              <small className="mt-2 text-xs text-slate-400">Total acumulado</small>
            )}
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-5 flex flex-col justify-between min-h-[8.25rem]">
            <span className="text-sm font-medium text-slate-500">Transações</span>
            <strong
              className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-slate-900"
              data-testid="transaction-count"
            >
              {transactionCount}
            </strong>
            <small className="mt-2 text-sm font-medium text-slate-500">
              {data.approvedCount} aprovadas
            </small>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardContent className="p-5 flex items-center justify-between gap-4 min-h-[8.25rem]">
            <div className="flex flex-col justify-between self-stretch">
              <span className="text-sm font-medium text-slate-500">Taxa de aprovação</span>
              <strong className="mt-4 text-[1.75rem] font-extrabold tracking-tight text-slate-900">
                {rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </strong>
              <span className="sr-only">
                Aprovadas ÷ (aprovadas + negadas); pendentes não entram no cálculo.
              </span>
            </div>
            <div className="h-16 w-16 shrink-0" aria-hidden="true">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#e8eeeb" strokeWidth="3.25" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#006b57"
                  strokeWidth="3.25"
                  strokeLinecap="round"
                  strokeDasharray={`${String((Math.max(0, Math.min(100, rate)) / 100) * 87.96)} 87.96`}
                />
              </svg>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="dashboard__grid grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card className={`${cardClass} xl:col-span-3`} aria-labelledby="composition-title">
          <CardHeader className="space-y-0 p-5 pb-3">
            <h2 id="composition-title" className="text-[0.95rem] font-bold text-slate-900">
              Composição dos recebimentos
            </h2>
            <p className="sr-only">
              Pix representa {pixPercent}% e cartão {cardPercent}% do valor recebido.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 p-5 pt-0">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
              aria-hidden="true"
            >
              {totalReceived === 0n ? (
                <span className="h-full w-full bg-slate-200" />
              ) : (
                <>
                  <span
                    className="h-full bg-[#006b57]"
                    style={{ width: `${String(pixPercent)}%` }}
                  />
                  <span
                    className="h-full bg-[#b8f073]"
                    style={{ width: `${String(cardPercent)}%` }}
                  />
                </>
              )}
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7f6ef] text-[#006b57]">
                  <QrCode className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">Pix</p>
                    <p className="text-sm font-bold text-slate-900">
                      {money(data.pixReceivedCents)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{pixPercent}% do volume</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f8e4] text-[#6a7f2f]">
                  <CreditCard className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">Cartão</p>
                    <p className="text-sm font-bold text-slate-900">
                      {money(data.cardReceivedCents)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{cardPercent}% do volume</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`${cardClass} xl:col-span-6`} aria-labelledby="movement-title">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-5 pb-2">
            <h2 id="movement-title" className="text-[0.95rem] font-bold text-slate-900">
              Movimentação financeira
            </h2>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#006b57]" /> Entradas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-300" /> Saídas
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            {movement.length === 0 ? (
              <div className="flex h-44 items-center justify-center rounded-xl bg-slate-50/70">
                <p className="text-sm text-slate-500">Sem movimentação no período.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <div
                  className="flex flex-col justify-between py-1 text-[0.65rem] font-medium text-slate-400"
                  aria-hidden="true"
                >
                  {yTicks.map((tick) => (
                    <span key={tick.ratio}>{tick.label}</span>
                  ))}
                </div>
                <svg
                  viewBox={`0 0 ${String(chartWidth)} ${String(chartHeight)}`}
                  className="h-44 w-full"
                  role="img"
                  aria-label="Gráfico de entradas e saídas"
                >
                  {yTicks.slice(1, -1).map((tick) => (
                    <line
                      key={tick.ratio}
                      x1="0"
                      x2={chartWidth}
                      y1={10 + (1 - tick.ratio) * (chartHeight - 20)}
                      y2={10 + (1 - tick.ratio) * (chartHeight - 20)}
                      stroke="#edf1ef"
                      strokeWidth="1"
                    />
                  ))}
                  <path d={inArea} fill="rgba(0, 107, 87, 0.08)" />
                  <path d={outPath} fill="none" stroke="#c5ced6" strokeWidth="2.25" />
                  <path d={inPath} fill="none" stroke="#006b57" strokeWidth="2.5" />
                </svg>
                <div />
                <div
                  className="flex justify-between text-[0.65rem] font-medium text-slate-400"
                  aria-hidden="true"
                >
                  {movement.map((point) => (
                    <span key={point.label}>{point.label}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${cardClass} xl:col-span-3`} aria-labelledby="operation-title">
          <CardHeader className="space-y-0 p-5 pb-3">
            <h2 id="operation-title" className="text-[0.95rem] font-bold text-slate-900">
              Operação
            </h2>
          </CardHeader>
          <CardContent className="flex h-full flex-col p-5 pt-0">
            <dl className="space-y-4 flex-1">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Gateway Lera Box</dt>
                <dd className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0f8a5f]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0f8a5f]" aria-hidden="true" />
                  Conectado
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Webhooks</dt>
                <dd className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0f8a5f]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0f8a5f]" aria-hidden="true" />
                  {webhooksActive ? 'Ativos' : 'Inativos'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Último evento</dt>
                <dd className="text-sm font-semibold text-slate-800">
                  {lastOperation ? relativeTime(lastOperation.occurredAt) : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Eventos pendentes</dt>
                <dd className="text-sm font-semibold text-slate-800">{pendingEvents}</dd>
              </div>
            </dl>
            <a
              className="mt-6 inline-flex items-center gap-0.5 text-sm font-semibold text-[#006b57] hover:underline"
              href="#/webhooks"
            >
              Ver integrações <ChevronRight className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>

      <Card className={`${cardClass} recent`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
          <h2 className="text-[0.95rem] font-bold text-slate-900">Transações recentes</h2>
          <a
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-[#006b57] hover:underline"
            href="#/transacoes"
          >
            Ver todas <ChevronRight className="h-4 w-4" />
          </a>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {data.operations.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhuma transação no período.
            </p>
          ) : (
            <Table aria-label="Transações recentes" framed={false}>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Referência
                  </TableHead>
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Método
                  </TableHead>
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Cliente
                  </TableHead>
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Data
                  </TableHead>
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Valor
                  </TableHead>
                  <TableHead className="h-11 bg-transparent px-5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operations.map((operation) => (
                  <TableRow key={operation.id} className="border-slate-100">
                    <TableCell className="px-5 py-3.5 font-semibold text-slate-900">
                      {operation.reference}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <MethodLabel method={operation.method} />
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-slate-600">
                      {operation.customerName ?? '—'}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-slate-500">
                      {formatOperationWhen(operation.occurredAt)}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-semibold text-slate-900">
                      {money(operation.amountCents)}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
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

function MethodLabel({ method }: { method: DashboardOperation['method'] }) {
  if (method === 'PIX') {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e7f6ef] text-[#006b57]">
          <QrCode className="h-3.5 w-3.5" />
        </span>
        Pix
      </span>
    );
  }
  if (method === 'CARD') {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <CreditCard className="h-3.5 w-3.5" />
        </span>
        Cartão
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      Saque
    </span>
  );
}

function StatusBadge({ status }: { status: DashboardOperation['status'] }) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="rounded-md bg-[#e4f6ea] px-2 py-0.5 text-[#0f8a5f] hover:bg-[#e4f6ea]">
          Aprovado
        </Badge>
      );
    case 'DENIED':
      return (
        <Badge className="rounded-md bg-[#fde8e8] px-2 py-0.5 text-[#c23b3b] hover:bg-[#fde8e8]">
          Negado
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge className="rounded-md bg-[#fff1df] px-2 py-0.5 text-[#c47a1a] hover:bg-[#fff1df]">
          Pendente
        </Badge>
      );
    case 'EXPIRED':
      return <Badge variant="expired">Expirada</Badge>;
    case 'CANCELLED':
      return <Badge variant="cancelled">Cancelada</Badge>;
  }
}
