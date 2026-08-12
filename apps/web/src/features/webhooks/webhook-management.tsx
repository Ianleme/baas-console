import { useEffect, useState } from 'react';

import './webhook-management.css';

export type WebhookEvent = 'PAYMENT_PIX' | 'PAYMENT_CARD' | 'WITHDRAWAL';
export interface WebhookView {
  event: WebhookEvent;
  status: 'ACTIVE' | 'DISABLED';
  configuredAt: string;
  lastReceivedAt: string | null;
}
export interface WebhookManagementApi {
  list: () => Promise<WebhookView[]>;
  configure: (event: WebhookEvent) => Promise<WebhookView>;
  remove: (event: WebhookEvent) => Promise<void>;
}

const events = [
  { event: 'PAYMENT_PIX', title: 'Pagamentos Pix', detail: 'Confirmações e negativas de Pix.' },
  { event: 'PAYMENT_CARD', title: 'Pagamentos com cartão', detail: 'Resultados finais do cartão.' },
  { event: 'WITHDRAWAL', title: 'Saques', detail: 'Atualizações de solicitações de saque.' }
] as const;

export function WebhookManagement({ api }: { api: WebhookManagementApi }) {
  const [configured, setConfigured] = useState<WebhookView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<WebhookEvent | null>(null);
  const [confirm, setConfirm] = useState<{
    event: WebhookEvent;
    action: 'reconfigure' | 'remove';
  } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void api.list().then(
      (rows) => {
        if (active) {
          setConfigured(rows);
          setState('ready');
        }
      },
      () => {
        if (active) setState('error');
      }
    );
    return () => {
      active = false;
    };
  }, [api]);

  async function configure(event: WebhookEvent) {
    setBusy(event);
    setNotice('');
    try {
      const next = await api.configure(event);
      setConfigured((current) => [...current.filter((item) => item.event !== event), next]);
      setNotice('Webhook configurado com segurança. O segredo não será exibido.');
    } catch {
      setNotice('Não foi possível configurar o webhook. Tente novamente.');
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function remove(event: WebhookEvent) {
    setBusy(event);
    setNotice('');
    try {
      await api.remove(event);
      setConfigured((current) => current.filter((item) => item.event !== event));
      setNotice('Webhook removido.');
    } catch {
      setNotice('Não foi possível remover o webhook. A configuração foi preservada.');
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <section className="webhook-management" aria-labelledby="webhooks-title">
      <header className="webhook-management__heading">
        <div>
          <span className="eyebrow eyebrow--green">Integrações</span>
          <h1 id="webhooks-title">Webhooks</h1>
          <p>Receba atualizações conciliadas da Lera Box em endpoints protegidos.</p>
        </div>
        <span className="webhook-security">Segredos protegidos</span>
      </header>

      <div className="webhook-management__live" aria-live="polite">
        {notice}
      </div>
      {state === 'loading' && <p role="status">Carregando webhooks…</p>}
      {state === 'error' && <p role="alert">Não foi possível carregar os webhooks.</p>}
      {state === 'ready' && configured.length === 0 && (
        <p className="webhook-empty">
          Nenhum webhook configurado. Ative os eventos necessários abaixo.
        </p>
      )}

      {state === 'ready' && (
        <div className="webhook-grid">
          {events.map(({ event, title, detail }, index) => {
            const current = configured.find((item) => item.event === event);
            return (
              <article className="webhook-card" key={event}>
                <span className="webhook-card__number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{detail}</p>
                </div>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd className={current?.status === 'ACTIVE' ? 'status-active' : 'status-idle'}>
                      {current?.status === 'ACTIVE'
                        ? 'Ativo'
                        : current
                          ? 'Desativado'
                          : 'Não configurado'}
                    </dd>
                  </div>
                  <div>
                    <dt>Configurado em</dt>
                    <dd>{current ? formatDate(current.configuredAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Último evento</dt>
                    <dd>
                      {current?.lastReceivedAt
                        ? formatDate(current.lastReceivedAt)
                        : 'Nenhum recebido'}
                    </dd>
                  </div>
                </dl>
                <div className="webhook-card__actions">
                  {current ? (
                    <>
                      <button
                        type="button"
                        disabled={busy === event}
                        onClick={() => {
                          setConfirm({ event, action: 'reconfigure' });
                        }}
                      >
                        Reconfigurar
                      </button>
                      <button
                        className="webhook-remove"
                        type="button"
                        disabled={busy === event}
                        onClick={() => {
                          setConfirm({ event, action: 'remove' });
                        }}
                      >
                        Remover
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary-action"
                      type="button"
                      disabled={busy === event}
                      onClick={() => void configure(event)}
                    >
                      {busy === event ? 'Configurando…' : 'Configurar webhook'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="webhook-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="webhook-confirm-title"
            className="webhook-dialog"
          >
            <h2 id="webhook-confirm-title">
              {confirm.action === 'remove' ? 'Remover webhook?' : 'Reconfigurar webhook?'}
            </h2>
            <p>
              {confirm.action === 'remove'
                ? 'O recebimento deste evento será interrompido.'
                : 'O endpoint e o segredo atuais serão substituídos e não poderão ser recuperados.'}
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Cancelar
              </button>
              <button
                className={confirm.action === 'remove' ? 'danger-action' : 'primary-action'}
                type="button"
                onClick={() =>
                  void (confirm.action === 'remove'
                    ? remove(confirm.event)
                    : configure(confirm.event))
                }
              >
                {confirm.action === 'remove' ? 'Confirmar remoção' : 'Confirmar reconfiguração'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(new Date(value));
}
