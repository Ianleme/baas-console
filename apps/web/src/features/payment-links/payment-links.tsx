import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Mail,
  QrCode,
  RotateCw,
  Search,
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
import { useDebouncedValue } from '../../hooks/use-debounced-value.js';

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
  publicToken?: string;
}

export interface PaymentLinksApi {
  list: (query: PaymentLinkListQuery) => Promise<PaymentLinkListData>;
  detail: (id: string) => Promise<PaymentLinkView>;
  share: (id: string) => Promise<{ publicToken: string }>;
  create: (input: Omit<PaymentLinkView, 'id' | 'status'>) => Promise<PaymentLinkView>;
  cancel: (id: string) => Promise<PaymentLinkView>;
  sendEmail: (
    id: string,
    email: string
  ) => Promise<{ deliveryId: string; status: string; recipientMasked: string }>;
}

export interface PaymentLinkListQuery {
  search?: string;
  status?: PaymentLinkStatus;
  method?: PaymentLinkView['methods'];
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface PaymentLinkListData {
  items: PaymentLinkView[];
  total: number;
  summary: {
    totalCount: number;
    activeCount: number;
    paidCount: number;
    paidAmountCents: string;
  };
}

const emptySummary: PaymentLinkListData['summary'] = {
  totalCount: 0,
  activeCount: 0,
  paidCount: 0,
  paidAmountCents: '0'
};

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

export function PaymentLinks({
  api,
  createModalOpen,
  onCreateModalOpenChange
}: {
  api: PaymentLinksApi;
  createModalOpen?: boolean;
  onCreateModalOpenChange?: (open: boolean) => void;
}) {
  const [links, setLinks] = useState<PaymentLinkView[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(emptySummary);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | PaymentLinkStatus>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentLinkStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentLinkView['methods']>('ALL');
  const [dateFilter, setDateFilter] = useState('30days');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PaymentLinkView | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<PaymentLinkView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [emailTargetLink, setEmailTargetLink] = useState<PaymentLinkView | null>(null);
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [formMethods, setFormMethods] = useState<PaymentLinkView['methods']>('PIX');
  const [formInstallments, setFormInstallments] = useState(1);
  const [expiryPreset, setExpiryPreset] = useState<'24h' | '3d' | '7d' | 'custom'>('24h');
  const [customExpiry, setCustomExpiry] = useState('');
  const [createdLink, setCreatedLink] = useState<PaymentLinkView | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 350);
  const activeStatusFilter = statusTab !== 'ALL' ? statusTab : statusFilter;
  const pageSize = 10;
  useEffect(() => {
    if (createModalOpen !== undefined) setCreating(createModalOpen);
  }, [createModalOpen]);
  const setCreateModal = (open: boolean) => {
    setCreating(open);
    onCreateModalOpenChange?.(open);
  };

  async function submitEmail(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!emailTargetLink) return;
    const data = new FormData(event.currentTarget);
    const email = formText(data, 'email');
    try {
      setSendingEmail(true);
      const res = await api.sendEmail(emailTargetLink.id, email);
      const masked = res.recipientMasked;
      setNotice(`E-mail enfileirado com sucesso para ${masked}.`);
      setEmailTargetLink(null);
    } catch {
      setNotice('Não foi possível enviar o e-mail. Verifique o endereço digitado.');
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    let active = true;
    setState('loading');
    const period = listPeriod(dateFilter);
    void api
      .list({
        ...(debouncedQuery.trim() ? { search: debouncedQuery.trim() } : {}),
        ...(activeStatusFilter !== 'ALL' ? { status: activeStatusFilter } : {}),
        ...(methodFilter !== 'ALL' ? { method: methodFilter } : {}),
        ...period,
        limit: pageSize,
        offset: (page - 1) * pageSize
      })
      .then((result) => {
        if (active) {
          const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
          if (page > lastPage) {
            setPage(lastPage);
            return;
          }
          setLinks(result.items);
          setTotal(result.total);
          setSummary(result.summary);
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
  }, [activeStatusFilter, api, dateFilter, debouncedQuery, methodFilter, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const conversionRate =
    summary.totalCount === 0 ? 0 : Math.round((summary.paidCount / summary.totalCount) * 1000) / 10;

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amountCents = brlToCents(formText(data, 'amount'));
    const expiresAt = expirationFromPreset(expiryPreset, customExpiry);
    if (!amountCents) {
      setNotice('Informe um valor válido maior que zero.');
      return;
    }
    if (!expiresAt) {
      setNotice('Informe uma data de expiração futura.');
      return;
    }
    try {
      setCreatingLink(true);
      const created = await api.create({
        reference: formText(data, 'reference'),
        description: formText(data, 'description'),
        amountCents,
        methods: formMethods,
        maxInstallments: formMethods === 'PIX' ? 1 : formInstallments,
        selectedFeeBps: null,
        expiresAt
      });
      setPage(1);
      setReloadKey((current) => current + 1);
      setCreateModal(false);
      setCreatedLink(created);
      setNotice('Link criado com sucesso. Agora você pode compartilhá-lo.');
    } catch {
      setNotice('Não foi possível criar o link. Revise os dados e tente novamente.');
    } finally {
      setCreatingLink(false);
    }
  }

  async function confirmCancel() {
    if (!cancelCandidate) return;
    setCancelling(true);
    try {
      await api.cancel(cancelCandidate.id);
      setReloadKey((current) => current + 1);
      setNotice('Link cancelado. O histórico foi preservado.');
    } catch {
      setNotice('Não foi possível cancelar o link.');
    } finally {
      setCancelling(false);
      setCancelCandidate(null);
    }
  }

  async function resolvePublicLink(link: PaymentLinkView) {
    const shared = await api.share(link.id);
    const resolved = { ...link, publicToken: shared.publicToken };
    setLinks((current) => current.map((item) => (item.id === link.id ? resolved : item)));
    return resolved;
  }

  async function handleCopy(link: PaymentLinkView) {
    try {
      const detailed = await resolvePublicLink(link);
      if (!detailed.publicToken) throw new Error('PUBLIC_TOKEN_UNAVAILABLE');
      const url = checkoutUrl(detailed.publicToken);
      if (globalThis.navigator.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(url);
      } else {
        copyWithFallback(url);
      }
      setCopiedId(link.id);
      setNotice('Link copiado para a área de transferência!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setNotice('Não foi possível copiar o link.');
    }
  }

  async function handleOpen(link: PaymentLinkView) {
    try {
      const detailed = await resolvePublicLink(link);
      if (!detailed.publicToken) throw new Error('PUBLIC_TOKEN_UNAVAILABLE');
      globalThis.open(checkoutUrl(detailed.publicToken), '_blank', 'noopener,noreferrer');
    } catch {
      setNotice('Não foi possível abrir o checkout.');
    }
  }

  async function openDetail(link: PaymentLinkView) {
    try {
      setSelected(await api.detail(link.id));
    } catch {
      setNotice('Não foi possível carregar os detalhes do link.');
    }
  }

  function linkActions(link: PaymentLinkView) {
    return (
      <div className="actions-cell flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="action-btn text-[#007a5a]"
          onClick={() => void openDetail(link)}
        >
          Ver detalhes
        </Button>
        {link.status === 'ACTIVE' && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="action-btn"
              onClick={() => void handleCopy(link)}
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
            <Button
              variant="outline"
              size="sm"
              className="action-btn"
              onClick={() => void handleOpen(link)}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="action-btn text-[#007a5a]"
              onClick={() => setEmailTargetLink(link)}
            >
              <Mail className="h-3.5 w-3.5" /> Enviar por e-mail
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="action-btn action-btn--danger"
              onClick={() => setCancelCandidate(link)}
            >
              Cancelar link
            </Button>
          </>
        )}
      </div>
    );
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
              setCreateModal(true);
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
                {summary.activeCount}
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
                {summary.paidCount}
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
                {money(summary.paidAmountCents)}
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
              setPage(1);
            }}
            placeholder="Buscar por descrição ou referência"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as typeof statusFilter);
            setPage(1);
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
            setPage(1);
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
            setPage(1);
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

        <Button
          variant="outline"
          size="icon"
          className="refresh-btn"
          type="button"
          aria-label="Atualizar dados"
          onClick={() => {
            setReloadKey((current) => current + 1);
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
              setPage(1);
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
      {state === 'ready' && links.length === 0 && (
        <div className="empty-state-box border-2 border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <p>Nenhum link encontrado.</p>
        </div>
      )}
      {state === 'ready' && links.length > 0 && (
        <>
          <div className="hidden md:block">
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
                {links.map((link) => (
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
                    <TableCell className="td-actions">
                      <div className="flex justify-end">{linkActions(link)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden" role="region" aria-label="Links em cartões">
            {links.map((link) => (
              <Card key={link.id} className="overflow-hidden">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-slate-900">{link.description}</strong>
                      <span className="text-xs text-slate-500">{link.reference}</span>
                    </div>
                    <StatusBadge status={link.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="block text-xs text-slate-500">Valor</span>
                      <strong>{money(link.amountCents)}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">Expiração</span>
                      {formatExpiration(link.expiresAt)}
                    </div>
                    <div className="col-span-2">
                      <MethodBadge method={link.methods} installments={link.maxInstallments} />
                    </div>
                  </div>
                  {linkActions(link)}
                </CardContent>
              </Card>
            ))}
          </div>
          <nav
            className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"
            aria-label="Paginação dos links"
          >
            <p className="text-sm text-slate-500">
              Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}{' '}
              links
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </>
      )}

      {/* Official Radix UI Dialog Primitives */}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreateModal(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
              Valor da cobrança
              <Input
                name="amount"
                required
                inputMode="decimal"
                placeholder="R$ 0,00"
                aria-describedby="amount-help"
              />
              <span id="amount-help" className="text-xs font-normal text-slate-500">
                Digite o valor em reais. A conversão para centavos é automática.
              </span>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">Métodos de pagamento</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['PIX', 'Pix', 'Recebimento por QR Code'],
                    ['CARD', 'Cartão', 'Crédito parcelado'],
                    ['PIX_CARD', 'Pix e cartão', 'Cliente escolhe no checkout']
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl border p-3 text-left transition ${formMethods === value ? 'border-[#007a5a] bg-emerald-50 ring-1 ring-[#007a5a]' : 'border-slate-200 hover:border-emerald-300'}`}
                    aria-pressed={formMethods === value}
                    onClick={() => {
                      setFormMethods(value);
                      if (value === 'PIX') setFormInstallments(1);
                    }}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="block text-xs font-normal text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {formMethods !== 'PIX' && (
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Máximo de parcelas
                <Select
                  value={String(formInstallments)}
                  onValueChange={(value) => setFormInstallments(Number(value))}
                >
                  <SelectTrigger aria-label="Máximo de parcelas">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 21 }, (_, index) => index + 1).map((installments) => (
                      <SelectItem key={installments} value={String(installments)}>
                        {installments}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs font-normal text-slate-500">
                  A taxa correspondente será consultada no gateway e registrada automaticamente.
                </span>
              </label>
            )}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">Expiração do link</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ['24h', '24 horas'],
                    ['3d', '3 dias'],
                    ['7d', '7 dias'],
                    ['custom', 'Personalizada']
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={expiryPreset === value ? 'default' : 'outline'}
                    aria-pressed={expiryPreset === value}
                    onClick={() => setExpiryPreset(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {expiryPreset === 'custom' && (
                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                  Data e hora
                  <Input
                    aria-label="Data e hora de expiração"
                    type="datetime-local"
                    required
                    value={customExpiry}
                    onChange={(event) => setCustomExpiry(event.target.value)}
                  />
                </label>
              )}
            </fieldset>
            <Button
              className="w-full bg-[#007a5a] hover:bg-[#005c47]"
              type="submit"
              disabled={creatingLink}
            >
              {creatingLink ? 'Criando link…' : 'Criar link'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createdLink)}
        onOpenChange={(open) => {
          if (!open) setCreatedLink(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Link criado com sucesso</DialogTitle>
          </DialogHeader>
          {createdLink && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">{createdLink.description}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {money(createdLink.amountCents)}
                </p>
                {createdLink.selectedFeeBps !== null && (
                  <p className="mt-1 text-xs text-slate-600">
                    Até {createdLink.maxInstallments}x · taxa de{' '}
                    {(createdLink.selectedFeeBps / 100).toFixed(2)}% registrada pelo gateway
                  </p>
                )}
              </div>
              {createdLink.publicToken && (
                <label className="block text-sm font-semibold text-slate-700">
                  URL do checkout
                  <Input
                    readOnly
                    value={checkoutUrl(createdLink.publicToken)}
                    className="mt-1 font-mono text-xs"
                  />
                </label>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  className="bg-[#007a5a] hover:bg-[#005c47]"
                  onClick={() => void handleCopy(createdLink)}
                >
                  <Copy className="h-4 w-4" /> Copiar link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleOpen(createdLink)}
                >
                  <ExternalLink className="h-4 w-4" /> Abrir checkout
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:col-span-2"
                  onClick={() => {
                    setCreatedLink(null);
                    setEmailTargetLink(createdLink);
                  }}
                >
                  <Mail className="h-4 w-4" /> Enviar por e-mail
                </Button>
              </div>
            </div>
          )}
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
            O checkout deixará de aceitar novos pagamentos. O registro será preservado na aba
            Cancelados e esta ação não poderá ser desfeita.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            type="button"
            onClick={() => void confirmCancel()}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
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
              <Button
                className="w-full bg-[#007a5a] hover:bg-[#005c47]"
                type="submit"
                disabled={sendingEmail}
              >
                {sendingEmail ? 'Enviando…' : 'Enviar e-mail'}
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
  if (method === 'PIX_CARD') {
    return (
      <span className="method-badge inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <QrCode className="h-4 w-4 text-[#00bdae]" />
        Pix ou cartão · até {installments}x
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

function copyWithFallback(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('CLIPBOARD_COPY_FAILED');
}

function checkoutUrl(publicToken: string) {
  return `${globalThis.location.origin}/pay.html#/checkout/${publicToken}`;
}

function brlToCents(value: string): string | null {
  const raw = value.trim().replace(/R\$/giu, '').replace(/\s/gu, '');
  if (!raw || raw.startsWith('-')) return null;
  let whole: string;
  let fraction: string;
  if (raw.includes(',')) {
    const parts = raw.split(',');
    if (parts.length !== 2) return null;
    whole = (parts[0] ?? '').replace(/\./gu, '');
    fraction = parts[1] ?? '';
  } else {
    const parts = raw.split('.');
    const decimal = parts.length === 2 && (parts[1]?.length ?? 0) <= 2;
    whole = decimal ? (parts[0] ?? '') : raw.replace(/\./gu, '');
    fraction = decimal ? (parts[1] ?? '') : '';
  }
  if (!/^\d+$/u.test(whole) || !/^\d{0,2}$/u.test(fraction)) return null;
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return cents > 0n ? cents.toString() : null;
}

function expirationFromPreset(
  preset: '24h' | '3d' | '7d' | 'custom',
  customExpiry: string
): string | null {
  const now = new Date();
  const duration = preset === '24h' ? 24 : preset === '3d' ? 72 : preset === '7d' ? 168 : 0;
  const expiresAt =
    preset === 'custom'
      ? new Date(customExpiry)
      : new Date(now.getTime() + duration * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= now) return null;
  return expiresAt.toISOString();
}

function listPeriod(period: string): Pick<PaymentLinkListQuery, 'from' | 'to'> {
  if (period === 'all') return {};
  const now = new Date();
  if (period === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: now.toISOString()
    };
  }
  const days = period === '7days' ? 7 : 30;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString()
  };
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
