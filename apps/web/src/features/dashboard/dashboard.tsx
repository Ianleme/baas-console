import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  QrCode,
  RefreshCw,
  Wallet
} from 'lucide-react';

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
  load(options?: {
    from?: string;
    to?: string;
    period?: { from?: string; to?: string };
  }): Promise<DashboardData>;
  refreshWallet?: () => Promise<DashboardData['wallet']>;
}

export function approvalRate(approved: number, denied: number) {
  const finalized = approved + denied;
  return finalized === 0 ? 0 : (approved / finalized) * 100;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const clock = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
  hour12: false
});
const dayMonth = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo'
});
const fullTimestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'UTC'
});
const periods = ['Hoje', '7 dias', '30 dias', '90 dias', 'Todo o período'] as const;

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
  const dateParts = saoPauloParts(date);
  const nowParts = saoPauloParts(now);
  const sameSaoPauloDay =
    dateParts.year === nowParts.year &&
    dateParts.month === nowParts.month &&
    dateParts.day === nowParts.day;
  const time = clock.format(date);
  if (sameSaoPauloDay) return `Hoje, ${time}`;
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);
  const yesterdayParts = saoPauloParts(yesterday);
  const isYesterday =
    dateParts.year === yesterdayParts.year &&
    dateParts.month === yesterdayParts.month &&
    dateParts.day === yesterdayParts.day;
  if (isYesterday) return `Ontem, ${time}`;
  return `${dayMonth.format(date).replace('.', '')}, ${time}`;
}

const saoPauloDateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function saoPauloParts(date: Date) {
  const parts = Object.fromEntries(
    saoPauloDateParts.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
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

function periodDays(period: (typeof periods)[number]) {
  if (period === 'Hoje') return 1;
  if (period === '7 dias') return 7;
  if (period === '30 dias') return 30;
  if (period === '90 dias') return 90;
  return Infinity;
}

function DashboardHeader({
  onRequestWithdrawal,
  onCreatePaymentLink
}: {
  onRequestWithdrawal?: (() => void) | undefined;
  onCreatePaymentLink?: (() => void) | undefined;
}) {
  return (
    <header className="dashboard__heading flex flex-wrap items-center justify-between gap-5">
      <div className="space-y-1">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">
          Visão geral
        </span>
        <h1 className="text-3xl font-bold leading-none text-brand-ink">Dashboard</h1>
        <p className="text-sm text-brand-muted">Acompanhe sua operação em tempo real.</p>
      </div>
      <div className="dashboard__actions flex items-center gap-3">
        <button
          type="button"
          onClick={onRequestWithdrawal}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-primary bg-brand-panel px-5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-primary-soft"
        >
          Solicitar saque
        </button>
        <button
          type="button"
          onClick={onCreatePaymentLink}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-dark"
        >
          <span className="mr-2 text-xl font-light leading-none" aria-hidden="true">
            +
          </span>
          Criar link de pagamento
        </button>
      </div>
    </header>
  );
}

function PeriodFilters({
  period,
  onChange
}: {
  period: (typeof periods)[number];
  onChange: (period: (typeof periods)[number]) => void;
}) {
  return (
    <div className="periods flex flex-wrap gap-2.5" aria-label="Período do painel">
      {periods.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={period === item}
          onClick={() => {
            onChange(item);
          }}
          className={`h-9 rounded-lg border px-4 text-sm font-medium transition-colors ${
            period === item
              ? 'border-brand-control-border bg-brand-control-active text-brand-primary-dark'
              : 'border-brand-line bg-brand-panel text-brand-ink hover:bg-brand-canvas'
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function KpiRail({ children }: { children: ReactNode }) {
  return (
    <section
      className="kpis grid grid-cols-1 overflow-hidden rounded-xl border border-brand-line bg-brand-panel sm:grid-cols-2 xl:h-32 xl:grid-cols-10"
      aria-label="Resumo financeiro"
    >
      {children}
    </section>
  );
}

function ReceiptCompositionCard({ children }: { children: ReactNode }) {
  return (
    <Card
      className={`${cardClass} flex h-full flex-col rounded-xl xl:col-span-4`}
      aria-labelledby="composition-title"
    >
      {children}
    </Card>
  );
}
function MovementChartCard({ children }: { children: ReactNode }) {
  return (
    <Card
      className={`${cardClass} flex h-full flex-col rounded-xl xl:col-span-6`}
      aria-labelledby="movement-title"
    >
      {children}
    </Card>
  );
}
function OperationCard({ children }: { children: ReactNode }) {
  return (
    <Card
      className={`${cardClass} flex h-full flex-col rounded-xl xl:col-span-3`}
      aria-labelledby="operation-title"
    >
      {children}
    </Card>
  );
}
function RecentTransactionsCard({ children }: { children: ReactNode }) {
  return (
    <Card data-recent-card className={`${cardClass} recent`}>
      {children}
    </Card>
  );
}

export function Dashboard({
  api,
  onRequestWithdrawal,
  onCreatePaymentLink
}: {
  api: DashboardApi;
  onRequestWithdrawal?: (() => void) | undefined;
  onCreatePaymentLink?: (() => void) | undefined;
}) {
  const [data, setData] = useState<DashboardData>();
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<(typeof periods)[number]>('Hoje');
  const [refreshingWallet, setRefreshingWallet] = useState(false);

  const periodOptions = (selected: (typeof periods)[number]) => {
    if (selected === 'Todo o período') return {};
    const days = periodDays(selected);
    const today = saoPauloParts(new Date());
    const endDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    const localIso = (date: Date, endOfDay = false) =>
      `${date.toISOString().slice(0, 10)}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`;
    return { from: localIso(startDate), to: localIso(endDate, true) };
  };

  useEffect(() => {
    void api
      .load(periodOptions(period))
      .then(setData)
      .catch(() => {
        setFailed(true);
      });
  }, [api, period]);

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

  const visibleData = data;
  const totalReceived =
    BigInt(visibleData.pixReceivedCents) + BigInt(visibleData.cardReceivedCents);
  const pixPercent =
    totalReceived === 0n
      ? 0
      : Number((BigInt(visibleData.pixReceivedCents) * 100n) / totalReceived);
  const cardPercent = totalReceived === 0n ? 0 : 100 - pixPercent;
  const rate = approvalRate(visibleData.approvedCount, visibleData.deniedCount);
  const transactionCount =
    visibleData.approvedCount + visibleData.deniedCount + visibleData.pendingCount;
  const lastOperation = visibleData.operations[0];
  const pendingEvents = data.pendingEvents ?? 0;
  const webhooksActive = data.webhooksActive ?? true;
  const movement = visibleData.movement ?? [];
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
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    label: currency.format((movementMax * ratio) / 100)
  }));

  return (
    <div className="dashboard space-y-5">
      <DashboardHeader
        onRequestWithdrawal={onRequestWithdrawal}
        onCreatePaymentLink={onCreatePaymentLink}
      />

      <PeriodFilters period={period} onChange={setPeriod} />

      <KpiRail>
        <div
          data-kpi
          className="flex min-w-0 items-center gap-5 bg-brand-primary-dark p-5 text-white sm:col-span-2 xl:col-span-3"
        >
          <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-full border border-brand-accent bg-white/5">
            <Wallet className="size-6 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-white">Saldo disponível</span>
            <strong className="mt-1 block text-3xl font-bold leading-none text-white">
              {money(visibleData.wallet.balanceCents)}
            </strong>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <small className="text-sm text-white/90">Disponível para saque</small>
              {visibleData.wallet.stale && (
                <b className="stale inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  Dados desatualizados
                </b>
              )}
              {visibleData.wallet.stale && api.refreshWallet && (
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md border border-white/60 text-white hover:bg-white/10 disabled:opacity-60"
                  aria-label="Atualizar saldo"
                  title="Atualizar saldo"
                  disabled={refreshingWallet}
                  onClick={() => {
                    if (!api.refreshWallet) return;
                    setRefreshingWallet(true);
                    void api
                      .refreshWallet()
                      .then((wallet) => {
                        setData((current) => (current ? { ...current, wallet } : current));
                      })
                      .finally(() => {
                        setRefreshingWallet(false);
                      });
                  }}
                >
                  <RefreshCw
                    className={refreshingWallet ? 'size-4 animate-spin' : 'size-4'}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            <span className="sr-only">
              Atualizado em{' '}
              {fullTimestamp.format(
                data.wallet.capturedAt && !isNaN(new Date(data.wallet.capturedAt).getTime())
                  ? new Date(data.wallet.capturedAt)
                  : new Date()
              )}
            </span>
          </div>
        </div>

        <div
          data-kpi
          className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-t-0 xl:col-span-2 xl:border-l"
        >
          <span className="text-sm font-medium text-brand-muted">Recebimentos</span>
          <strong className="mt-4 text-3xl font-bold leading-none text-brand-ink">
            {money(visibleData.receivedCents)}
          </strong>
          {typeof data.receivedChangePercent === 'number' ? (
            <small className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary">
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.75} />+
              {data.receivedChangePercent.toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1
              })}
              %
            </small>
          ) : (
            <small className="mt-2 text-sm text-brand-subtle">Total acumulado</small>
          )}
        </div>

        <div
          data-kpi
          className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-l sm:border-t-0 xl:col-span-2"
        >
          <span className="text-sm font-medium text-brand-muted">Transações</span>
          <strong
            className="mt-4 text-3xl font-bold leading-none text-brand-ink"
            data-testid="transaction-count"
          >
            {transactionCount}
          </strong>
          <small className="mt-2 text-sm text-brand-muted">{data.approvedCount} aprovadas</small>
        </div>

        <div
          data-kpi
          className="flex min-w-0 items-center justify-between gap-4 border-t border-brand-line p-5 sm:col-span-2 xl:col-span-3 xl:border-l xl:border-t-0"
        >
          <div className="flex min-w-0 flex-col justify-center">
            <span className="text-sm font-medium text-brand-muted">Taxa de aprovação</span>
            <strong className="mt-4 text-3xl font-bold leading-none text-brand-ink">
              {rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </strong>
            <span className="sr-only">
              Aprovadas ÷ (aprovadas + negadas); pendentes não entram no cálculo.
            </span>
          </div>
          <div className="size-14 shrink-0" aria-hidden="true">
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
        </div>
      </KpiRail>

      <div
        data-insight-grid
        className="dashboard__grid grid grid-cols-1 gap-4 xl:grid-cols-[repeat(13,minmax(0,1fr))]"
      >
        <ReceiptCompositionCard>
          <CardHeader className="gap-1 p-5 pb-4">
            <h2 id="composition-title" className="text-base font-bold text-brand-ink">
              Composição dos recebimentos
            </h2>
            <p className="sr-only">
              Pix representa {pixPercent}% e cartão {cardPercent}% do valor recebido.
            </p>
            <p className="text-sm text-brand-muted">Distribuição por método de pagamento</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-5 pt-0">
            <div
              className="flex h-10 w-full overflow-hidden rounded-lg bg-brand-canvas text-sm font-semibold"
              aria-label="Distribuição dos recebimentos"
            >
              {totalReceived === 0n ? (
                <span className="flex h-full w-full items-center justify-center bg-brand-line text-brand-muted">
                  Sem recebimentos
                </span>
              ) : (
                <>
                  <span
                    className="flex h-full items-center justify-center bg-brand-primary text-white"
                    style={{ width: `${String(pixPercent)}%` }}
                  >
                    {pixPercent}%
                  </span>
                  <span
                    className="flex h-full items-center justify-center bg-brand-accent text-brand-primary-dark"
                    style={{ width: `${String(cardPercent)}%` }}
                  >
                    {cardPercent}%
                  </span>
                </>
              )}
            </div>
            <div className="mt-5">
              <div
                data-receipt-row
                className="flex items-center gap-3 border-t border-brand-line py-4"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary">
                  <QrCode className="size-4" />
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-brand-ink">Pix</p>
                <p className="text-sm font-bold text-brand-ink">
                  {money(visibleData.pixReceivedCents)}
                </p>
                <p className="text-sm text-brand-muted">{pixPercent}% do volume</p>
              </div>
              <div
                data-receipt-row
                className="flex items-center gap-3 border-y border-brand-line py-4"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-soft text-brand-primary">
                  <CreditCard className="size-4" />
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-brand-ink">Cartão</p>
                <p className="text-sm font-bold text-brand-ink">
                  {money(visibleData.cardReceivedCents)}
                </p>
                <p className="text-sm text-brand-muted">{cardPercent}% do volume</p>
              </div>
            </div>
          </CardContent>
        </ReceiptCompositionCard>

        <MovementChartCard>
          <CardHeader className="gap-4 p-5 pb-0">
            <div className="space-y-1">
              <h2 id="movement-title" className="text-base font-bold text-brand-ink">
                Movimentação financeira
              </h2>
              <p className="text-sm text-brand-muted">Entradas e saídas por período</p>
            </div>
            <div
              className="flex items-center gap-5 text-sm text-brand-muted"
              aria-label="Legenda da movimentação"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 bg-brand-primary" /> Entradas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 bg-brand-subtle" /> Saídas
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 p-5 pt-4">
            {movement.length === 0 ? (
              <div className="flex min-h-48 w-full items-center justify-center rounded-lg bg-brand-canvas">
                <p className="text-sm text-brand-muted">Sem movimentação no período.</p>
              </div>
            ) : (
              <div className="grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-2">
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
                      className="text-brand-line"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d={outPath}
                    fill="none"
                    className="text-brand-subtle"
                    stroke="currentColor"
                    strokeWidth="2.25"
                  />
                  <path
                    d={inPath}
                    fill="none"
                    className="text-brand-primary"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                  {movement.map((point, index) => {
                    const x =
                      movement.length === 1
                        ? chartWidth / 2
                        : 4 + (index / (movement.length - 1)) * (chartWidth - 8);
                    const inValue = inValues[index] ?? 0;
                    const outValue = outValues[index] ?? 0;
                    const inY = 10 + (chartHeight - 20) * (1 - inValue / movementMax);
                    const outY = 10 + (chartHeight - 20) * (1 - outValue / movementMax);
                    return (
                      <g key={point.label}>
                        <circle
                          data-testid="movement-marker"
                          cx={x}
                          cy={inY}
                          r="2.5"
                          className="fill-brand-primary"
                        />
                        <circle cx={x} cy={outY} r="2.5" className="fill-brand-subtle" />
                      </g>
                    );
                  })}
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
        </MovementChartCard>

        <OperationCard>
          <CardHeader className="p-5 pb-4">
            <h2 id="operation-title" className="text-base font-bold text-brand-ink">
              Operação
            </h2>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-5 pt-0">
            <dl className="flex-1 border-t border-brand-line">
              <div className="flex items-center justify-between gap-3 border-b border-brand-line py-4">
                <dt className="text-sm text-brand-ink">Gateway Lera Box</dt>
                <dd className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                  <span className="size-1.5 rounded-full bg-brand-primary" aria-hidden="true" />
                  Conectado
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-brand-line py-4">
                <dt className="text-sm text-brand-ink">Webhooks</dt>
                <dd className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                  <span className="size-1.5 rounded-full bg-brand-primary" aria-hidden="true" />
                  {webhooksActive ? 'Ativos' : 'Inativos'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-brand-line py-4">
                <dt className="text-sm text-brand-ink">Último evento</dt>
                <dd className="text-sm font-semibold text-brand-primary">
                  {lastOperation ? relativeTime(lastOperation.occurredAt) : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-4">
                <dt className="text-sm text-brand-ink">Eventos pendentes</dt>
                <dd className="text-sm font-semibold text-brand-primary">{pendingEvents}</dd>
              </div>
            </dl>
            <a
              className="mt-auto inline-flex items-center justify-between border-t border-brand-line pt-5 text-sm font-semibold text-brand-primary hover:underline"
              href="#/webhooks"
            >
              Ver integrações <ChevronRight className="h-4 w-4" />
            </a>
          </CardContent>
        </OperationCard>
      </div>

      <RecentTransactionsCard>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
          <h2 className="text-[0.95rem] font-bold text-slate-900">Transações recentes</h2>
          <a
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-[#006b57] hover:underline"
            href="#/transactions"
          >
            Ver todas <ChevronRight className="h-4 w-4" />
          </a>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {visibleData.operations.length === 0 ? (
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
                {visibleData.operations.map((operation) => (
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
      </RecentTransactionsCard>
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
