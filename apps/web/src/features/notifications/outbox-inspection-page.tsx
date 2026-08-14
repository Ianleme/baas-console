import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Filter, Mail, RefreshCw, XCircle } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
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

export interface EmailDeliveryItem {
  id: string;
  kind: string;
  idempotencyKey: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
}

export interface EmailDeliveriesData {
  items: EmailDeliveryItem[];
  total: number;
}

export interface EmailDeliveriesApi {
  listDeliveries(query?: { status?: string; limit?: number; offset?: number }): Promise<unknown>;
  retryDelivery(id: string): Promise<unknown>;
}

const timestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
});

function formatDate(iso: string) {
  try {
    return timestamp.format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'SENT':
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 w-max">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Enviado
        </Badge>
      );
    case 'QUEUED':
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 w-max">
          <Clock className="w-3 h-3 text-blue-600" />
          Na Fila
        </Badge>
      );
    case 'SENDING':
      return (
        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1 w-max">
          <RefreshCw className="w-3 h-3 text-indigo-600 animate-spin" />
          Enviando
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 w-max">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          Falhou (Retentando)
        </Badge>
      );
    case 'DEAD_LETTER':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300 font-bold flex items-center gap-1 w-max">
          <XCircle className="w-3 h-3 text-red-600" />
          Dead Letter (DLQ)
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function OutboxInspectionPage({ api }: { api: EmailDeliveriesApi }) {
  const [data, setData] = useState<EmailDeliveriesData>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setFailed(false);
    api
      .listDeliveries({ status: statusFilter })
      .then((res) => {
        setData(res as EmailDeliveriesData);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await api.retryDelivery(id);
      loadData();
    } catch {
      // Ignored
    } finally {
      setRetryingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div role="status" className="p-8 text-center text-slate-500 font-medium animate-pulse">
        Carregando entregas do Outbox de e-mails...
      </div>
    );
  }

  if (failed) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-6 text-center text-red-700">
          Não foi possível carregar a lista de e-mails do outbox.
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-[#007a5a]" />
          Outbox & Inspeção de E-mails (DLQ)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitoramento de entregas de e-mail, acompanhamento de tentativas e reprocessamento de
          mensagens retidas (DLQ).
        </p>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            Filtro de Entregas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
              }}
            >
              <SelectTrigger aria-label="Filtrar status outbox">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os status</SelectItem>
                <SelectItem value="QUEUED">Na Fila (QUEUED)</SelectItem>
                <SelectItem value="SENDING">Enviando (SENDING)</SelectItem>
                <SelectItem value="SENT">Enviados (SENT)</SelectItem>
                <SelectItem value="FAILED">Falhas com Retentativa (FAILED)</SelectItem>
                <SelectItem value="DEAD_LETTER">Dead Letter (DLQ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Deliveries Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Data</TableHead>
                <TableHead>Tipo / Assunto</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Tentativas</TableHead>
                <TableHead>Último Erro</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    Nenhum registro de e-mail no outbox encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{item.kind}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">
                      {item.recipientMasked}
                    </TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell className="text-center font-semibold text-slate-800">
                      {item.attempts} / 5
                    </TableCell>
                    <TableCell className="font-mono text-xs text-red-600 truncate max-w-[180px]">
                      {item.lastErrorCode ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {['DEAD_LETTER', 'FAILED'].includes(item.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === item.id}
                          onClick={() => {
                            void handleRetry(item.id);
                          }}
                          className="h-8 gap-1 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${retryingId === item.id ? 'animate-spin' : ''}`}
                          />
                          Re-enfileirar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
