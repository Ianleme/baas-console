import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';

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
    <section className="webhook-management space-y-6" aria-labelledby="webhooks-title">
      <header className="webhook-management__heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Integrações
          </span>
          <h1 id="webhooks-title" className="text-3xl font-extrabold text-slate-900 mt-1">
            Webhooks
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Receba atualizações conciliadas da Lera Box em endpoints protegidos.
          </p>
        </div>
        <span className="webhook-security inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Segredos protegidos
        </span>
      </header>

      {notice && (
        <div
          className="webhook-management__live bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-sm font-semibold"
          aria-live="polite"
        >
          {notice}
        </div>
      )}

      {state === 'loading' && (
        <p role="status" className="text-slate-500 p-4">
          Carregando webhooks…
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="text-red-600 p-4">
          Não foi possível carregar os webhooks.
        </p>
      )}
      {state === 'ready' && configured.length === 0 && (
        <p className="webhook-empty text-slate-500 p-8 border-2 border-dashed border-slate-200 rounded-xl text-center">
          Nenhum webhook configurado. Ative os eventos necessários abaixo.
        </p>
      )}

      {state === 'ready' && (
        <div className="webhook-grid grid grid-cols-1 md:grid-cols-3 gap-4">
          {events.map(({ event, title, detail }, index) => {
            const current = configured.find((item) => item.event === event);
            return (
              <article
                className="webhook-card rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm p-5 flex flex-col justify-between"
                key={event}
              >
                <CardContent className="p-0 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="webhook-card__number text-xs font-bold text-slate-400"
                      aria-hidden="true"
                    >
                      0{index + 1}
                    </span>
                    <Badge variant={current?.status === 'ACTIVE' ? 'active' : 'secondary'}>
                      {current?.status === 'ACTIVE'
                        ? 'Ativo'
                        : current
                          ? 'Desativado'
                          : 'Não configurado'}
                    </Badge>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                    <p className="text-xs text-slate-500 mt-1">{detail}</p>
                  </div>
                  <dl className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Configurado em</dt>
                      <dd className="font-semibold text-slate-700">
                        {current ? formatDate(current.configuredAt) : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Último evento</dt>
                      <dd className="font-semibold text-slate-700">
                        {current?.lastReceivedAt
                          ? formatDate(current.lastReceivedAt)
                          : 'Nenhum recebido'}
                      </dd>
                    </div>
                  </dl>
                  <div className="webhook-card__actions flex items-center gap-2 pt-2">
                    {current ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={busy === event}
                          onClick={() => {
                            setConfirm({ event, action: 'reconfigure' });
                          }}
                        >
                          Reconfigurar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="webhook-remove flex-1"
                          disabled={busy === event}
                          onClick={() => {
                            setConfirm({ event, action: 'remove' });
                          }}
                        >
                          Remover
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="primary-action w-full bg-[#007a5a] hover:bg-[#005c47]"
                        size="sm"
                        disabled={busy === event}
                        onClick={() => void configure(event)}
                      >
                        {busy === event ? 'Configurando…' : 'Configurar webhook'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent aria-describedby="webhook-confirm-desc">
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === 'remove' ? 'Remover webhook?' : 'Reconfigurar webhook?'}
            </DialogTitle>
          </DialogHeader>
          <p id="webhook-confirm-desc" className="text-slate-600 text-sm mb-4">
            {confirm?.action === 'remove'
              ? 'O recebimento deste evento será interrompido.'
              : 'O endpoint e o segredo atuais serão substituídos e não poderão ser recuperados.'}
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setConfirm(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant={confirm?.action === 'remove' ? 'destructive' : 'default'}
              className={
                confirm?.action === 'remove'
                  ? 'danger-action'
                  : 'primary-action bg-[#007a5a] hover:bg-[#005c47]'
              }
              type="button"
              onClick={() =>
                confirm &&
                void (confirm.action === 'remove'
                  ? remove(confirm.event)
                  : configure(confirm.event))
              }
            >
              {confirm?.action === 'remove' ? 'Confirmar remoção' : 'Confirmar reconfiguração'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
