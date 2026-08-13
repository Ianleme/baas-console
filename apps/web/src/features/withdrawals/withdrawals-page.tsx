import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, AlertCircle, Plus, Wallet } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table.js';

export interface WithdrawalItem {
  id: string;
  externalReference: string;
  amountCents: string;
  status: 'PROCESSING' | 'PENDING' | 'APPROVED' | 'DENIED' | 'MANUAL_REVIEW';
  destinationType: string;
  destinationMasked: string;
  gatewayWithdrawalId: string | null;
  createdAt: string;
}

export interface WithdrawalRequestInput {
  amountCents: string;
  pixKey: string;
  pixKeyType: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
  externalReference?: string | undefined;
}

export interface WithdrawalsApi {
  list(): Promise<WithdrawalItem[]>;
  request(input: WithdrawalRequestInput): Promise<WithdrawalItem>;
  getBalance(): Promise<{ balanceCents: string }>;
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

function formatDate(iso: string) {
  return timestamp.format(new Date(iso));
}

function statusBadge(status: WithdrawalItem['status']) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="rounded-md border-brand-line bg-brand-primary-soft px-2 py-0.5 text-brand-primary-dark">
          Aprovado
        </Badge>
      );
    case 'DENIED':
      return (
        <Badge className="rounded-md border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
          Recusado
        </Badge>
      );
    case 'PROCESSING':
    case 'PENDING':
      return (
        <Badge className="rounded-md border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
          Em Processamento
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function WithdrawalsHeader({ onRequest }: { onRequest: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-5">
      <div className="space-y-1">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-primary">
          Financeiro
        </span>
        <h1 className="text-3xl font-bold leading-none text-brand-ink">Saques</h1>
        <p className="text-sm text-brand-muted">
          Gerencie seus saques via Pix e acompanhe cada solicitação.
        </p>
      </div>
      <Button
        onClick={onRequest}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-dark"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Solicitar Novo Saque
      </Button>
    </header>
  );
}

function SummaryRail({ balanceCents, items }: { balanceCents: string; items: WithdrawalItem[] }) {
  const processing = items.filter(
    (item) => item.status === 'PROCESSING' || item.status === 'PENDING'
  ).length;
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  return (
    <section
      aria-label="Resumo de saques"
      data-withdrawal-summary
      className="grid grid-cols-1 overflow-hidden rounded-xl border border-brand-line bg-brand-panel sm:grid-cols-2 xl:grid-cols-10"
    >
      <div className="flex min-w-0 items-center gap-5 bg-brand-primary-dark p-5 text-white sm:col-span-2 xl:col-span-4">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-brand-accent bg-white/5">
          <Wallet className="size-6 text-white" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className="text-sm font-semibold">Saldo disponível</span>
          <strong className="mt-1 block text-3xl font-bold leading-none">
            {money(balanceCents)}
          </strong>
          <small className="mt-2 block text-sm text-white/90">Disponível para Pix</small>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-t-0 xl:col-span-2 xl:border-l">
        <span className="text-sm font-medium text-brand-muted">Solicitações</span>
        <strong className="mt-3 text-3xl font-bold leading-none text-brand-ink">
          {items.length}
        </strong>
        <small className="mt-2 text-sm text-brand-muted">Total no histórico</small>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:border-l sm:border-t-0 xl:col-span-2">
        <span className="text-sm font-medium text-brand-muted">Em andamento</span>
        <strong className="mt-3 text-3xl font-bold leading-none text-brand-ink">
          {processing}
        </strong>
        <small className="mt-2 text-sm text-brand-muted">Pendentes ou processando</small>
      </div>
      <div className="flex min-w-0 flex-col justify-center border-t border-brand-line p-5 sm:col-span-2 xl:col-span-2 xl:border-l">
        <span className="text-sm font-medium text-brand-muted">Aprovadas</span>
        <strong className="mt-3 text-3xl font-bold leading-none text-brand-ink">{approved}</strong>
        <small className="mt-2 text-sm text-brand-muted">Solicitações concluídas</small>
      </div>
    </section>
  );
}

export function WithdrawalsPage({ api }: { api: WithdrawalsApi }) {
  const [items, setItems] = useState<WithdrawalItem[]>([]);
  const [balanceCents, setBalanceCents] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Modal state
  const [openModal, setOpenModal] = useState(false);
  const [amountBrl, setAmountBrl] = useState('');
  const [pixKeyType, setPixKeyType] = useState<WithdrawalRequestInput['pixKeyType']>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  const loadData = () => {
    setLoading(true);
    setFailed(false);
    Promise.all([api.list(), api.getBalance()])
      .then(([listRes, balanceRes]) => {
        setItems(listRes);
        setBalanceCents(balanceRes.balanceCents);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [api]);

  const handleRequestSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setModalError(null);

    const numericAmount = Number(amountBrl.replace(',', '.'));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setModalError('Informe um valor de saque válido maior que zero.');
      return;
    }

    const requestedCents = Math.round(numericAmount * 100);
    const availableCents = Number(balanceCents);

    if (requestedCents > availableCents) {
      setModalError(
        `Saldo insuficiente para saque. Disponível: ${money(balanceCents)} | Solicitado: ${money(String(requestedCents))}`
      );
      return;
    }

    if (!pixKey.trim()) {
      setModalError('Informe a chave Pix de destino.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: WithdrawalRequestInput = {
        amountCents: String(requestedCents),
        pixKey: pixKey.trim(),
        pixKeyType
      };
      if (reference.trim()) {
        payload.externalReference = reference.trim();
      }

      await api.request(payload);
      setSubmitting(false);
      setOpenModal(false);
      setSuccessNotice(true);
      setAmountBrl('');
      setPixKey('');
      setReference('');
      loadData();
    } catch (err: unknown) {
      setSubmitting(false);
      const errObj = (err ?? {}) as { code?: string; message?: string };
      if (errObj.code === 'INSUFFICIENT_FUNDS') {
        setModalError('Saldo insuficiente para realizar esta transferência de saque.');
      } else {
        setModalError('Falha ao processar solicitação de saque. Tente novamente.');
      }
    }
  };

  if (loading && items.length === 0) {
    return (
      <div role="status" className="p-8 text-center font-medium text-brand-muted animate-pulse">
        Carregando informações de saques e carteira...
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center text-red-700">
        Não foi possível carregar os dados de saques. Tente novamente.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with New Withdrawal Button */}
      <WithdrawalsHeader
        onRequest={() => {
          setOpenModal(true);
          setModalError(null);
        }}
      />
      <SummaryRail balanceCents={balanceCents} items={items} />

      {/* Success Notice */}
      {successNotice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-brand-line bg-brand-primary-soft p-4 text-brand-primary-dark"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-brand-primary" />
            Solicitação de saque enviada com sucesso! O valor foi debitado da sua carteira.
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSuccessNotice(false);
            }}
            className="text-brand-primary-dark hover:bg-brand-panel text-xs"
          >
            Fechar
          </Button>
        </div>
      )}

      {/* History Table Card */}
      <div
        data-withdrawal-history
        className="overflow-hidden rounded-xl border border-brand-line bg-brand-panel"
      >
        <CardHeader className="gap-1 p-5 pb-3">
          <CardTitle className="text-base font-bold text-brand-ink">
            <ArrowUpRight className="h-4 w-4 text-brand-primary" />
            Histórico de Saques
          </CardTitle>
          <p className="text-sm text-brand-muted">
            Acompanhe suas solicitações de retirada via Pix.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pb-2">
          <Table aria-label="Histórico de saques" framed={false}>
            <TableHeader>
              <TableRow className="border-brand-line hover:bg-transparent">
                <TableHead className="h-11 px-5 text-xs font-semibold uppercase tracking-wider text-brand-subtle">
                  Data / Hora
                </TableHead>
                <TableHead className="h-11 px-5 text-xs font-semibold uppercase tracking-wider text-brand-subtle">
                  Referência
                </TableHead>
                <TableHead className="h-11 px-5 text-xs font-semibold uppercase tracking-wider text-brand-subtle">
                  Destino (Pix)
                </TableHead>
                <TableHead className="h-11 px-5 text-xs font-semibold uppercase tracking-wider text-brand-subtle">
                  Status
                </TableHead>
                <TableHead className="h-11 px-5 text-right text-xs font-semibold uppercase tracking-wider text-brand-subtle">
                  Valor
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-brand-muted">
                    Nenhum saque solicitado até o momento.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((wth) => (
                  <TableRow key={wth.id} className="border-brand-line">
                    <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm text-brand-muted">
                      {formatDate(wth.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-3.5 font-semibold text-brand-ink">
                      {wth.externalReference}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-3.5 text-sm text-brand-muted">
                      {wth.destinationMasked}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-3.5">
                      {statusBadge(wth.status)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-5 py-3.5 text-right font-semibold text-brand-ink">
                      {money(wth.amountCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </div>

      {/* Withdrawal Request Modal */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              void handleRequestSubmit(e);
            }}
          >
            <DialogHeader>
              <DialogTitle>Solicitar Novo Saque</DialogTitle>
              <DialogDescription>
                Transfira valores da sua carteira BaaS diretamente para sua chave Pix.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Balance Banner inside Modal */}
              <div className="flex items-center justify-between rounded-lg border border-brand-line bg-brand-canvas p-3 text-xs">
                <span className="font-medium text-brand-muted">Saldo disponível:</span>
                <span className="text-sm font-bold text-brand-ink">{money(balanceCents)}</span>
              </div>

              {/* Error Notice */}
              {modalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>{modalError}</div>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-ink">Valor do Saque (R$)</label>
                <Input
                  type="text"
                  placeholder="0,00"
                  value={amountBrl}
                  onChange={(e) => {
                    setAmountBrl(e.target.value);
                  }}
                  required
                  aria-label="Valor do Saque"
                />
              </div>

              {/* Pix Key Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-ink">Tipo de Chave Pix</label>
                <Select
                  value={pixKeyType}
                  onValueChange={(value) => {
                    setPixKeyType(value as WithdrawalRequestInput['pixKeyType']);
                  }}
                >
                  <SelectTrigger aria-label="Tipo de Chave Pix">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                    <SelectItem value="RANDOM">Chave Aleatória (EVP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pix Key Value */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-ink">Chave Pix de Destino</label>
                <Input
                  type="text"
                  placeholder="Digite sua chave Pix..."
                  value={pixKey}
                  onChange={(e) => {
                    setPixKey(e.target.value);
                  }}
                  required
                  aria-label="Chave Pix de Destino"
                />
              </div>

              {/* External Reference */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-ink">
                  Referência Interna (Opcional)
                </label>
                <Input
                  type="text"
                  placeholder="Ex: SAQUE-MES-08"
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value);
                  }}
                  aria-label="Referência Interna"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenModal(false);
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-brand-primary text-white hover:bg-brand-primary-dark"
              >
                {submitting ? 'Processando...' : 'Confirmar Saque'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
