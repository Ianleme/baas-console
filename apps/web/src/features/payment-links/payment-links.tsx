import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';

import './payment-links.css';

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
}
export interface PaymentLinksApi {
  list: () => Promise<PaymentLinkView[]>;
  create: (input: Omit<PaymentLinkView, 'id' | 'status'>) => Promise<PaymentLinkView>;
  cancel: (id: string) => Promise<PaymentLinkView>;
}

const statusLabels: Record<PaymentLinkStatus, string> = {
  ACTIVE: 'Ativo',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado'
};

export function PaymentLinks({ api }: { api: PaymentLinksApi }) {
  const [links, setLinks] = useState<PaymentLinkView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | PaymentLinkStatus>('ALL');
  const [method, setMethod] = useState<'ALL' | PaymentLinkView['methods']>('ALL');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PaymentLinkView | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<PaymentLinkView | null>(null);
  const [notice, setNotice] = useState('');

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
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [api]);

  const visible = useMemo(
    () =>
      links.filter((link) => {
        const text = `${link.description} ${link.reference}`.toLocaleLowerCase('pt-BR');
        return (
          text.includes(query.trim().toLocaleLowerCase('pt-BR')) &&
          (status === 'ALL' || link.status === status) &&
          (method === 'ALL' || link.methods === method)
        );
      }),
    [links, method, query, status]
  );

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

  return (
    <section className="payment-links" aria-labelledby="links-title">
      <header className="payment-links__heading">
        <div>
          <span className="eyebrow eyebrow--green">Operações</span>
          <h1 id="links-title">Links de pagamento</h1>
          <p>Crie e acompanhe checkouts conciliados com suas vendas.</p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => {
            setCreating(true);
          }}
        >
          + Criar link de pagamento
        </button>
      </header>

      <div className="link-summary" role="region" aria-label="Resumo dos links">
        <Summary
          label="Links ativos"
          value={String(links.filter((link) => link.status === 'ACTIVE').length)}
        />
        <Summary
          label="Pagamentos concluídos"
          value={String(links.filter((link) => link.status === 'PAID').length)}
        />
        <Summary
          label="Valor recebido"
          value={money(
            links
              .filter((link) => link.status === 'PAID')
              .reduce((sum, link) => sum + BigInt(link.amountCents), 0n)
              .toString()
          )}
        />
      </div>

      <div className="link-filters" role="search">
        <label>
          <span className="sr-only">Buscar por descrição ou referência</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Buscar por descrição ou referência"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
            }}
          >
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="PAID">Pagos</option>
            <option value="EXPIRED">Expirados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por método</span>
          <select
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as typeof method);
            }}
          >
            <option value="ALL">Todos os métodos</option>
            <option value="PIX">Pix</option>
            <option value="CARD">Cartão</option>
            <option value="PIX_CARD">Pix e cartão</option>
          </select>
        </label>
      </div>

      <div className="payment-links__live" aria-live="polite">
        {notice}
      </div>
      {state === 'loading' && <p role="status">Carregando links…</p>}
      {state === 'error' && <p role="alert">Não foi possível carregar os links.</p>}
      {state === 'ready' && visible.length === 0 && (
        <p className="links-empty">Nenhum link encontrado.</p>
      )}
      {state === 'ready' && visible.length > 0 && (
        <div className="links-table-wrap">
          <table className="links-table">
            <thead>
              <tr>
                <th>Link</th>
                <th>Método</th>
                <th>Valor</th>
                <th>Expiração</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((link) => (
                <tr key={link.id}>
                  <td>
                    <strong>{link.description}</strong>
                    <small>{link.reference}</small>
                  </td>
                  <td>{methodLabel(link)}</td>
                  <td>{money(link.amountCents)}</td>
                  <td>{new Date(link.expiresAt).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <span className={`link-status link-status--${link.status.toLowerCase()}`}>
                      {statusLabels[link.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-action"
                      onClick={() => {
                        setSelected(link);
                      }}
                    >
                      Ver detalhes
                    </button>
                    {link.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="link-action link-action--danger"
                        onClick={() => {
                          setCancelCandidate(link);
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Dialog
          title="Criar link de pagamento"
          close={() => {
            setCreating(false);
          }}
        >
          <form
            aria-label="Criar link de pagamento"
            onSubmit={(event) => void submit(event)}
            className="link-form"
          >
            <label>
              Descrição
              <input name="description" required maxLength={255} />
            </label>
            <label>
              Referência
              <input name="reference" required maxLength={100} />
            </label>
            <label>
              Valor em centavos
              <input name="amountCents" required inputMode="numeric" pattern="[0-9]+" />
            </label>
            <label>
              Métodos
              <select name="methods">
                <option value="PIX">Pix</option>
                <option value="CARD">Cartão</option>
                <option value="PIX_CARD">Pix e cartão</option>
              </select>
            </label>
            <label>
              Parcelas
              <input name="maxInstallments" type="number" min="1" max="21" defaultValue="1" />
            </label>
            <label>
              Taxa selecionada (basis points)
              <input name="selectedFeeBps" type="number" min="0" max="10000" defaultValue="0" />
            </label>
            <label>
              Expiração
              <input name="expiresAt" type="datetime-local" required />
            </label>
            <button className="primary-action" type="submit">
              Criar link
            </button>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog
          title="Detalhes do link"
          close={() => {
            setSelected(null);
          }}
        >
          <dl className="link-detail">
            <div>
              <dt>Status</dt>
              <dd>{statusLabels[selected.status]}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{money(selected.amountCents)}</dd>
            </div>
            <div>
              <dt>Taxa selecionada</dt>
              <dd>
                {selected.selectedFeeBps === null
                  ? 'Não aplicável'
                  : `${(selected.selectedFeeBps / 100).toFixed(2)}%`}
              </dd>
            </div>
            <div>
              <dt>Parcelas</dt>
              <dd>Até {selected.maxInstallments}x</dd>
            </div>
          </dl>
        </Dialog>
      )}
      {cancelCandidate && (
        <Dialog
          title="Cancelar link?"
          close={() => {
            setCancelCandidate(null);
          }}
        >
          <p>Esta ação não pode ser desfeita. O checkout deixará de aceitar pagamentos.</p>
          <button className="danger-action" type="button" onClick={() => void confirmCancel()}>
            Confirmar cancelamento
          </button>
        </Dialog>
      )}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Dialog({
  title,
  close,
  children
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-link-dialog-title"
      >
        <header>
          <h2 id="payment-link-dialog-title">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={close}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function methodLabel(link: PaymentLinkView) {
  if (link.methods === 'PIX') return 'Pix';
  if (link.methods === 'CARD') return `Cartão · até ${String(link.maxInstallments)}x`;
  return `Pix ou cartão · até ${String(link.maxInstallments)}x`;
}
function money(cents: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(BigInt(cents)) / 100
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
