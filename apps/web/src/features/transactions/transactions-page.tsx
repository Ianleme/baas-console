import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Search
} from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
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
import { useDebouncedValue } from '../../hooks/use-debounced-value.js';

export interface TransactionItem {
  id: string;
  originType: 'PAYMENT' | 'WITHDRAWAL';
  originId: string;
  externalReference: string;
  gatewayTransactionId: string | null;
  type: 'CREDIT' | 'DEBIT';
  status: 'APPROVED' | 'DENIED' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
  occurredAt: string;
}

export interface TransactionStatementData {
  items: TransactionItem[];
  total: number;
  stale: boolean;
  capturedAt: string;
}

export interface TransactionQueryFilters {
  status?: TransactionItem['status'];
  type?: TransactionItem['type'];
  originType?: TransactionItem['originType'];
  reference?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionStatementApi {
  list(query?: TransactionQueryFilters): Promise<TransactionStatementData>;
  downloadReceiptPdf?(id: string): Promise<Blob>;
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

function formatDate(iso: string) {
  return timestamp.format(new Date(iso));
}

function statusBadge(status: TransactionItem['status']) {
  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Aprovada</Badge>;
    case 'DENIED':
      return <Badge className="bg-red-50 text-red-700 border-red-200">Negada</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>;
    case 'EXPIRED':
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Expirada</Badge>;
    case 'CANCELLED':
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function TransactionsPage({ api }: { api: TransactionStatementApi }) {
  const [data, setData] = useState<TransactionStatementData>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [referenceSearch, setReferenceSearch] = useState('');
  const debouncedReferenceSearch = useDebouncedValue(referenceSearch, 350);
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const limit = 10;

  const handleDownloadPdf = async (id: string, ref: string) => {
    setDownloadingId(id);
    try {
      let blob: Blob;
      if (api.downloadReceiptPdf) {
        blob = await api.downloadReceiptPdf(id);
      } else {
        const res = await fetch(
          `/api/v1/transactions/${encodeURIComponent(id)}/receipt?format=pdf`,
          {
            credentials: 'include'
          }
        );
        if (!res.ok) throw new Error('Download failed');
        blob = await res.blob();
      }
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `comprovante-${ref}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Não foi possível gerar o comprovante em PDF no momento.');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);

    const query: TransactionQueryFilters = {
      limit,
      offset: (page - 1) * limit
    };

    if (statusFilter !== 'ALL') {
      query.status = statusFilter as TransactionItem['status'];
    }
    if (typeFilter !== 'ALL') {
      query.type = typeFilter as TransactionItem['type'];
    }
    if (originFilter !== 'ALL') {
      query.originType = originFilter as TransactionItem['originType'];
    }
    if (debouncedReferenceSearch.trim()) {
      query.reference = debouncedReferenceSearch.trim();
    }

    api
      .list(query)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, statusFilter, typeFilter, originFilter, debouncedReferenceSearch, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  if (loading && !data) {
    return (
      <div role="status" className="p-8 text-center text-slate-500 font-medium animate-pulse">
        Carregando extrato de transações...
      </div>
    );
  }

  if (failed) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-6 text-center text-red-700">
          Não foi possível carregar o extrato de transações. Tente novamente mais tarde.
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Extrato de Transações</h1>
        <p className="text-sm text-slate-500 mt-1">
          Consolidado de movimentações financeiras, recebimentos Pix, Cartão e saques.
        </p>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            Filtros do Extrato
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Reference Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Buscar por referência..."
              value={referenceSearch}
              onChange={(e) => {
                setReferenceSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              aria-label="Buscar por referência"
            />
          </div>

          {/* Status Filter */}
          <div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrar por status">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os status</SelectItem>
                <SelectItem value="APPROVED">Aprovadas</SelectItem>
                <SelectItem value="DENIED">Negadas</SelectItem>
                <SelectItem value="PENDING">Pendentes</SelectItem>
                <SelectItem value="EXPIRED">Expiradas</SelectItem>
                <SelectItem value="CANCELLED">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type Filter */}
          <div>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrar por tipo">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os tipos (Crédito/Débito)</SelectItem>
                <SelectItem value="CREDIT">Crédito (Entrada)</SelectItem>
                <SelectItem value="DEBIT">Débito (Saída)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Origin Filter */}
          <div>
            <Select
              value={originFilter}
              onValueChange={(value) => {
                setOriginFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrar por origem">
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as origens</SelectItem>
                <SelectItem value="PAYMENT">Pagamentos</SelectItem>
                <SelectItem value="WITHDRAWAL">Saques</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table Card */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Data / Hora</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor Bruto</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Valor Líquido</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                    Nenhuma transação encontrada com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatDate(tx.occurredAt)}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {tx.externalReference}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {tx.originType === 'PAYMENT' ? 'Pagamento' : 'Saque'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        {tx.type === 'CREDIT' ? (
                          <>
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Crédito</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-amber-700">Débito</span>
                          </>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{statusBadge(tx.status)}</TableCell>
                    <TableCell className="text-right font-medium text-slate-900">
                      {money(tx.grossAmountCents)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {money(tx.feeAmountCents)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {money(tx.netAmountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingId === tx.id}
                        className="h-8 gap-1.5 text-xs text-[#007a5a] hover:bg-emerald-50"
                        onClick={() => {
                          void handleDownloadPdf(tx.id, tx.externalReference);
                        }}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {downloadingId === tx.id ? 'Baixando...' : 'Comprovante PDF'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {data && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                Exibindo <span className="font-medium text-slate-900">{items.length}</span> de{' '}
                <span className="font-medium text-slate-900">{data.total}</span> registros
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  className="h-8 gap-1 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <span className="text-xs text-slate-600 font-medium px-2">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  className="h-8 gap-1 text-xs"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
