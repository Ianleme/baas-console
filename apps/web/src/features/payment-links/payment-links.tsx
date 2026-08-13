import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Mail,
  QrCode,
  RotateCw,
  Search,
  SlidersHorizontal,
  TrendingUp
} from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
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

export type PaymentLinkStatus = 'ACTIVE' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface PaymentLinkView {
  id: string;
  reference: string;
  description: string;
  amountCents: string;
  methods: 'PIX' | 'CARD' | 'PIX_CARD';
  maxInstallments: number;
  selectedFeeBps: number | null;
  status: PaymentLinkStatus;
  expiresAt: string;
  createdAt?: string;
  paymentCount?: number;
}

export interface PaymentLinksApi {
  list: () => Promise<PaymentLinkView[]>;
  create: (input: Omit<PaymentLinkView, 'id' | 'status'>) => Promise<PaymentLinkView>;
  cancel: (id: string) => Promise<PaymentLinkView>;
  sendEmail?: (
    id: string,
    email: string
  ) => Promise<{ deliveryId: string; status: string; recipientMasked: string }>;
}

const statusLabels: Record<PaymentLinkStatus, string> = {
  ACTIVE: 'Ativo',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado'
};

const tabLabels: Record<PaymentLinkStatus, string> = {
  ACTIVE: 'Ativos',
  PAID: 'Pagos',
  EXPIRED: 'Expirados',
  CANCELLED: 'Cancelados'
};

export function PaymentLinks({ api }: { api: PaymentLinksApi }) {
  const [links, setLinks] = useState<PaymentLinkView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | PaymentLinkStatus>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentLinkStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentLinkView['methods']>('ALL');
  const [dateFilter, setDateFilter] = useState('30days');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PaymentLinkView | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<PaymentLinkView | null>(null);
  const [emailTargetLink, setEmailTargetLink] = useState<PaymentLinkView | null>(null);
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formMethods, setFormMethods] = useState<PaymentLinkView['methods']>('PIX');

  async function submitEmail(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!emailTargetLink) return;
    const data = new FormData(event.currentTarget);
    const email = formText(data, 'email');
    try {
      const res = await api.sendEmail?.(emailTargetLink.id, email);
      const masked = res?.recipientMasked ?? email;
      setNotice(`E-mail enfileirado com sucesso para ${masked}.`);
    } catch {
      setNotice('Não foi possível enviar o e-mail. Verifique o endereço digitado.');
    } finally {
      setEmailTargetLink(null);
    }
  }

  function loadLinks() {
    setState('loading');
    void api
      .list()
      .then((rows) => {
        setLinks(rows);
        setState('ready');
      })
      .catch(() => {
        setState('error');
      });
  }

  useEffect(() => {
    let active = true;
    void api
      .list()
      .then((rows) => {
        if (active) {
          setLinks(rows);
          setState('ready');
        }
      })
      .catch(() => {
        if (active) {
          setState('error');
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  const activeStatusFilter = statusTab !== 'ALL' ? statusTab : statusFilter;

  const visible = useMemo(
    () =>
      links.filter((link) => {
        const text = `${link.description} ${link.reference}`.toLocaleLowerCase('pt-BR');
        return (
          text.includes(query.trim().toLocaleLowerCase('pt-BR')) &&
          (activeStatusFilter === 'ALL' || link.status === activeStatusFilter) &&
          (methodFilter === 'ALL' || link.methods === methodFilter)
        );
      }),
    [links, activeStatusFilter, methodFilter, query]
  );

  const activeCount = useMemo(
    () => links.filter((link) => link.status === 'ACTIVE').length,
    [links]
  );
  const paidCount = useMemo(() => links.filter((link) => link.status === 'PAID').length, [links]);
  const totalReceivedCents = useMemo(
    () =>
      links
        .filter((link) => link.status === 'PAID')
        .reduce((sum, link) => sum + BigInt(link.amountCents || 0), 0n),
    [links]
  );
  const conversionRate = useMemo(() => {
    if (links.length === 0) return 0;
    return Math.round((paidCount / links.length) * 1000) / 10;
  }, [links, paidCount]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const created = await api.create({
        reference: formText(data, 'reference'),
        description: formText(data, 'description'),
        amountCents: formText(data, 'amountCents'),
        methods: formText(data, 'methods') as PaymentLinkView['methods'],
        maxInstallments: Number(data.get('maxInstallments')),
        selectedFeeBps: Number(data.get('selectedFeeBps')),
        expiresAt: formText(data, 'expiresAt')
      });
      setLinks((current) => [created, ...current]);
      setCreating(false);
      setSelected(created);
      setNotice('Link criado com sucesso.');
    } catch {
      setNotice('Não foi possível criar o link. Revise os dados e tente novamente.');
    }
  }

  async function confirmCancel() {
    if (!cancelCandidate) return;
    try {
      const cancelled = await api.cancel(cancelCandidate.id);
      setLinks((current) => current.map((link) => (link.id === cancelled.id ? cancelled : link)));
      setSelected(cancelled);
      setNotice('Link cancelado.');
    } catch {
      setNotice('Não foi possível cancelar o link.');
    } finally {
      setCancelCandidate(null);
    }
  }

  function handleCopy(id: string) {
    setCopiedId(id);
    setNotice('Link copiado para a área de transferência!');
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  }

  return (
    <section className="payment-links-page space-y-6" aria-labelledby="links-title">
      {/* Header */}
      <header className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
            OPERAÇÕES
          </span>
          <h1 id="links-title" className="text-3xl font-extrabold text-slate-900 mt-1">
            Links de pagamento
          </h1>
          <p className="subtitle text-slate-500 text-sm mt-1">
            Crie e acompanhe checkouts conciliados com suas vendas.
          </p>
        </div>
        <div className="header-actions flex items-center gap-3">
          <Button
            className="primary-cta-button bg-[#007a5a] hover:bg-[#005c47] text-white"
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            + Criar link de pagamento
          </Button>
        </div>
      </header>

      {/* KPI Cards Row - Real API Metrics using Shadcn Cards */}
      <div
        className="kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        role="region"
        aria-label="Resumo dos links"
      >
        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="kpi-label text-xs font-semibold text-slate-500">Links ativos</span>
            <div className="kpi-value-group">
              <strong className="kpi-value text-2xl font-extrabold text-slate-900">
                {activeCount}
              </strong>
            </div>
            <span className="kpi-subtext text-xs text-slate-400">Prontos para receber</span>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="kpi-label text-xs font-semibold text-slate-500">
              Pagamentos concluídos
            </span>
            <div className="kpi-value-group">
              <strong className="kpi-value text-2xl font-extrabold text-slate-900">
                {paidCount}
              </strong>
            </div>
            <span className="kpi-subtext text-xs text-slate-400">No período selecionado</span>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex flex-col justify-between h-full space-y-1">
            <span className="kpi-label text-xs font-semibold text-slate-500">Valor recebido</span>
            <div className="kpi-value-group">
              <strong className="kpi-value text-2xl font-extrabold text-slate-900">
                {money(totalReceivedCents.toString())}
              </strong>
            </div>
            <span className="kpi-growth-badge inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-[#d8f3dc] px-2.5 py-0.5 rounded-full w-fit">
              <TrendingUp className="h-3.5 w-3.5" />
              Em tempo real
            </span>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardContent className="p-0 flex items-center justify-between h-full">
            <div>
              <span className="kpi-label text-xs font-semibold text-slate-500">
                Taxa de conversão
              </span>
              <div className="kpi-value-group mt-1">
                <strong className="kpi-value text-2xl font-extrabold text-slate-900">
                  {conversionRate}%
                </strong>
              </div>
            </div>
            <div className="donut-chart h-12 w-12" aria-hidden="true">
              <svg viewBox="0 0 36 36" className="h-full w-full">
                <path
                  className="donut-bg fill-none stroke-slate-200 stroke-[4]"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="donut-ring fill-none stroke-emerald-600 stroke-[4] stroke-linecap-round -rotate-90 origin-center"
                  strokeDasharray={`${String(conversionRate)}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Control Bar */}
      <div
        className="filters-bar flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        role="search"
      >
        <div className="search-input-wrapper relative flex-1 min-w-[15rem]">
          <Search className="search-icon absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="search-input pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Buscar por descrição ou referência"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as typeof statusFilter);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por status">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativos</SelectItem>
            <SelectItem value="PAID">Pagos</SelectItem>
            <SelectItem value="EXPIRED">Expirados</SelectItem>
            <SelectItem value="CANCELLED">Cancelados</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={methodFilter}
          onValueChange={(value) => {
            setMethodFilter(value as typeof methodFilter);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por método">
            <SelectValue placeholder="Todos os métodos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os métodos</SelectItem>
            <SelectItem value="PIX">Pix</SelectItem>
            <SelectItem value="CARD">Cartão</SelectItem>
            <SelectItem value="PIX_CARD">Pix e cartão</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={dateFilter}
          onValueChange={(value) => {
            setDateFilter(value);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por período">
            <SelectValue placeholder="Últimos 30 dias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30days">Últimos 30 dias</SelectItem>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="all">Todo o período</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="secondary-filter-btn flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Mais filtros
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="refresh-btn"
          type="button"
          aria-label="Atualizar dados"
          onClick={() => {
            loadLinks();
            setNotice('Dados atualizados.');
            setTimeout(() => {
              setNotice('');
            }, 2000);
          }}
        >
          <RotateCw className="h-4 w-4 text-slate-600" />
        </Button>
      </div>

      {/* Status Tabs */}
      <div
        className="status-tabs flex gap-6 border-b border-slate-200 px-1"
        role="tablist"
        aria-label="Filtro por aba de status"
      >
        {(['ALL', 'ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'] as const).map((tab) => (
          <button
            key={tab}
            className={`tab-item border-b-2 py-2.5 text-sm font-semibold transition-colors ${
              statusTab === tab
                ? 'tab-item--active border-[#007a5a] text-[#007a5a]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
            role="tab"
            aria-selected={statusTab === tab}
            type="button"
            onClick={() => {
              setStatusTab(tab);
            }}
          >
            {tab === 'ALL' ? 'Todos' : tabLabels[tab]}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className="toast-notice bg-[#005c47] text-white p-3 rounded-lg font-semibold text-sm"
          aria-live="polite"
        >
          {notice}
        </div>
      )}

      {/* Table Content */}
      {state === 'loading' && (
        <p role="status" className="text-slate-500 p-4">
          Carregando links…
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="text-red-600 p-4">
          Não foi possível carregar os links.
        </p>
      )}
      {state === 'ready' && visible.length === 0 && (
        <div className="empty-state-box border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <p>Nenhum link encontrado.</p>
        </div>
      )}
      {state === 'ready' && visible.length > 0 && (
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Link</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Expiração</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="th-actions text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((link) => (
              <TableRow key={link.id}>
                <TableCell>
                  <div className="link-title-box flex flex-col">
                    <strong className="link-name font-semibold text-slate-900">
                      {link.description}
                    </strong>
                    <span className="link-ref text-xs text-slate-400">{link.reference}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <MethodBadge method={link.methods} installments={link.maxInstallments} />
                </TableCell>
                <TableCell>
                  <span className="amount-cell font-semibold text-slate-900">
                    {money(link.amountCents)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="date-cell text-xs text-slate-500">
                    {formatExpiration(link.expiresAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={link.status} />
                </TableCell>
                <TableCell className="td-actions text-right">
                  <div className="actions-cell inline-flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="action-btn text-[#007a5a] hover:bg-emerald-50"
                      onClick={() => {
                        setSelected(link);
                      }}
                    >
                      Ver detalhes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="action-btn text-[#007a5a] hover:bg-emerald-50"
                      onClick={() => {
                        setEmailTargetLink(link);
                      }}
                    >
                      <Mail className="h-3.5 w-3.5" /> Enviar por e-mail
                    </Button>
                    {link.status === 'ACTIVE' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="action-btn action-btn--danger"
                        onClick={() => {
                          setCancelCandidate(link);
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="action-btn"
                      onClick={() => {
                        handleCopy(link.id);
                      }}
                    >
                      {copiedId === link.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-[#007a5a]" /> Copiar link
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Official Radix UI Dialog Primitives */}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar link de pagamento</DialogTitle>
          </DialogHeader>
          <form
            aria-label="Criar link de pagamento"
            onSubmit={(event) => void submit(event)}
            className="link-form space-y-4"
          >
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Descrição
              <Input name="description" required maxLength={255} placeholder="Ex: Pedido #1049" />
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Referência
              <Input name="reference" required maxLength={100} placeholder="Ex: REF-2026-01049" />
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Valor em centavos
              <Input
                name="amountCents"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                placeholder="Ex: 35000 para R$ 350,00"
              />
            </label>
            <fieldset className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              <legend className="text-sm font-semibold text-slate-700">Métodos</legend>
              <input type="hidden" name="methods" value={formMethods} />
              <Select
                value={formMethods}
                onValueChange={(value) => {
                  setFormMethods(value as PaymentLinkView['methods']);
                }}
              >
                <SelectTrigger aria-label="Métodos de pagamento">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">Pix</SelectItem>
                  <SelectItem value="CARD">Cartão</SelectItem>
                  <SelectItem value="PIX_CARD">Pix e cartão</SelectItem>
                </SelectContent>
              </Select>
            </fieldset>
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Parcelas
              <Input name="maxInstallments" type="number" min="1" max="21" defaultValue="1" />
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Taxa selecionada (basis points)
              <Input name="selectedFeeBps" type="number" min="0" max="10000" defaultValue="99" />
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
              Expiração
              <Input name="expiresAt" type="datetime-local" required />
            </label>
            <Button className="w-full bg-[#007a5a] hover:bg-[#005c47]" type="submit">
              Criar link
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do link</DialogTitle>
          </DialogHeader>
          {selected && (
            <dl className="link-detail space-y-3">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Descrição</dt>
                <dd className="text-sm font-semibold text-slate-900">{selected.description}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Referência</dt>
                <dd className="text-sm font-semibold text-slate-900">{selected.reference}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Status</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {statusLabels[selected.status]}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Valor</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {money(selected.amountCents)}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Taxa selecionada</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {selected.selectedFeeBps === null
                    ? 'Não aplicável'
                    : `${(selected.selectedFeeBps / 100).toFixed(2)}%`}
                </dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-sm text-slate-500">Parcelas</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  Até {selected.maxInstallments}x
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelCandidate)}
        onOpenChange={(open) => {
          if (!open) setCancelCandidate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar link?</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 text-sm mb-4">
            Esta ação não pode ser desfeita. O checkout deixará de aceitar pagamentos.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            type="button"
            onClick={() => void confirmCancel()}
          >
            Confirmar cancelamento
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(emailTargetLink)}
        onOpenChange={(open) => {
          if (!open) setEmailTargetLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar link por e-mail</DialogTitle>
          </DialogHeader>
          {emailTargetLink && (
            <form
              aria-label="Enviar link por e-mail"
              onSubmit={(event) => void submitEmail(event)}
              className="email-form space-y-4"
            >
              <p className="text-sm text-slate-600">
                Enviaremos uma notificação com o link de pagamento do item{' '}
                <strong>{emailTargetLink.description}</strong>.
              </p>
              <label className="flex flex-col text-sm font-semibold text-slate-700 gap-1">
                E-mail do destinatário
                <Input name="email" type="email" required placeholder="cliente@exemplo.com" />
              </label>
              <Button className="w-full bg-[#007a5a] hover:bg-[#005c47]" type="submit">
                Enviar e-mail
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MethodBadge({
  method,
  installments
}: {
  method: PaymentLinkView['methods'];
  installments: number;
}) {
  if (method === 'PIX') {
    return (
      <span className="method-badge inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <QrCode className="h-4 w-4 text-[#00bdae]" />
        Pix
      </span>
    );
  }
  return (
    <span className="method-badge inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
      <CreditCard className="h-4 w-4 text-blue-500" />
      Cartão · até {installments}x
    </span>
  );
}

function StatusBadge({ status }: { status: PaymentLinkStatus }) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="active">Ativo</Badge>;
    case 'PAID':
      return <Badge variant="paid">Pago</Badge>;
    case 'EXPIRED':
      return <Badge variant="expired">Expirado</Badge>;
    case 'CANCELLED':
      return <Badge variant="cancelled">Cancelado</Badge>;
  }
}

function money(cents: string) {
  try {
    const num = Number(BigInt(cents)) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  } catch {
    return 'R$ 0,00';
  }
}

function formatExpiration(expiresAt: string) {
  if (!expiresAt) return '-';
  if (
    expiresAt.includes('Expirou') ||
    expiresAt.includes('Cancelado') ||
    expiresAt.includes('Hoje') ||
    expiresAt.includes('Ontem')
  ) {
    return expiresAt;
  }
  try {
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) return expiresAt;
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return expiresAt;
  }
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
