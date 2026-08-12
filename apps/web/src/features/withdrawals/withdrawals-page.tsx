import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, AlertCircle, Plus, Wallet } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
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
  externalReference?: string;
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
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Aprovado</Badge>;
    case 'DENIED':
      return <Badge className="bg-red-50 text-red-700 border-red-200">Recusado</Badge>;
    case 'PROCESSING':
    case 'PENDING':
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200">Em Processamento</Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
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

  const handleRequestSubmit = async (e: React.FormEvent) => {
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
      await api.request({
        amountCents: String(requestedCents),
        pixKey: pixKey.trim(),
        pixKeyType,
        externalReference: reference.trim() || undefined
      });
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
      <div role="status" className="p-8 text-center text-slate-500 font-medium animate-pulse">
        Carregando informações de saques e carteira...
      </div>
    );
  }

  if (failed) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-6 text-center text-red-700">
          Não foi possível carregar os dados de saques. Tente novamente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with New Withdrawal Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Saques & Payouts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie transferências para conta bancária via Pix e histórico de solicitações.
          </p>
        </div>
        <Button
          onClick={() => {
            setOpenModal(true);
            setModalError(null);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          Solicitar Novo Saque
        </Button>
      </div>

      {/* Success Notice */}
      {successNotice && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-4 flex items-center justify-between text-emerald-800">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Solicitação de saque enviada com sucesso! O valor foi debitado da sua carteira.
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSuccessNotice(false);
              }}
              className="text-emerald-700 hover:bg-emerald-100/50 text-xs"
            >
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Balance Card */}
      <Card className="bg-slate-900 text-white border-slate-800">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              Saldo Disponível para Saque
            </span>
            <div className="text-3xl font-bold tracking-tight text-white">
              {money(balanceCents)}
            </div>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1">
            Disponível para Pix
          </Badge>
        </CardContent>
      </Card>

      {/* History Table Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            Histórico de Saques
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Data / Hora</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Destino (Pix)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                    Nenhum saque solicitado até o momento.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((wth) => (
                  <TableRow key={wth.id}>
                    <TableCell className="font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatDate(wth.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {wth.externalReference}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {wth.destinationMasked}
                    </TableCell>
                    <TableCell>{statusBadge(wth.status)}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {money(wth.amountCents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Withdrawal Request Modal */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRequestSubmit}>
            <DialogHeader>
              <DialogTitle>Solicitar Novo Saque</DialogTitle>
              <DialogDescription>
                Transfira valores da sua carteira BaaS diretamente para sua chave Pix.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Balance Banner inside Modal */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="text-slate-500 font-medium">Saldo disponível:</span>
                <span className="font-bold text-slate-900 text-sm">{money(balanceCents)}</span>
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
                <label className="text-xs font-semibold text-slate-700">Valor do Saque (R$)</label>
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
                <label className="text-xs font-semibold text-slate-700">Tipo de Chave Pix</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => {
                    setPixKeyType(e.target.value as WithdrawalRequestInput['pixKeyType']);
                  }}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  aria-label="Tipo de Chave Pix"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="PHONE">Telefone</option>
                  <option value="RANDOM">Chave Aleatória (EVP)</option>
                </select>
              </div>

              {/* Pix Key Value */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Chave Pix de Destino</label>
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
                <label className="text-xs font-semibold text-slate-700">
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
