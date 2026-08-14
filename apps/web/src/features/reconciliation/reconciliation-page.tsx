import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardContent } from '../../components/ui/card.js';

export interface ReconciliationItem {
  id: string;
  kind: 'PAYMENT' | 'WITHDRAWAL';
  reference: string;
  status: string;
  classification: 'MATCHED' | 'MISMATCH' | 'LOCAL_ONLY' | 'GATEWAY_ONLY' | 'MANUAL_REVIEW';
  updatedAt: string;
}
export interface ReconciliationApi {
  list: () => Promise<ReconciliationItem[]>;
  verify: (
    operationId: string
  ) => Promise<{ classification: ReconciliationItem['classification'] }>;
}
const labels = {
  MATCHED: 'Conciliado',
  MISMATCH: 'Dados divergentes',
  LOCAL_ONLY: 'Somente local',
  GATEWAY_ONLY: 'Somente no gateway',
  MANUAL_REVIEW: 'Revisão necessária'
} as const;

export function ReconciliationPage({ api }: { api: ReconciliationApi }) {
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void api.list().then(
      (rows) => {
        if (active) {
          setItems(rows);
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
  async function verify(item: ReconciliationItem) {
    setBusy(item.id);
    setNotice('');
    try {
      const result = await api.verify(item.id);
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, classification: result.classification } : row
        )
      );
      setNotice('Verificação concluída com dados consultados no gateway.');
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      setNotice(
        code === 'GATEWAY_UNAVAILABLE'
          ? 'Gateway indisponível. Os dados locais foram preservados.'
          : 'Não foi possível verificar agora. Os dados locais foram preservados.'
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="reconciliation-page space-y-6" aria-labelledby="reconciliation-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Operações
          </span>
          <h1 id="reconciliation-title" className="text-3xl font-extrabold text-slate-900 mt-1">
            Reconciliação
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe resultados pendentes e divergências sem alterar estados manualmente.
          </p>
        </div>
        <span className="reconciliation-readonly inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Consulta segura
        </span>
      </header>

      {notice && (
        <div
          aria-live="polite"
          className="reconciliation-notice bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-sm font-semibold"
        >
          {notice}
        </div>
      )}

      {state === 'loading' && (
        <p role="status" className="text-slate-500 p-4">
          Carregando reconciliações…
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="text-red-600 p-4">
          Não foi possível carregar as reconciliações.
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="reconciliation-empty text-slate-500 p-8 border-2 border-dashed border-slate-200 rounded-xl text-center">
          Nenhuma operação pendente ou divergente.
        </p>
      )}
      {state === 'ready' && items.length > 0 && (
        <div className="reconciliation-list space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="reconciliation-item p-4">
              <CardContent className="p-0 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="reconciliation-kind inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 uppercase">
                    {item.kind === 'PAYMENT' ? 'Pagamento' : 'Saque'}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">{item.reference}</h2>
                  <time dateTime={item.updatedAt} className="text-xs text-slate-400 block">
                    Atualizado em {formatDate(item.updatedAt)}
                  </time>
                </div>
                <div className="reconciliation-state flex flex-col items-end gap-1">
                  <span className="text-xs text-slate-500 font-medium">
                    {item.status.replaceAll('_', ' ')}
                  </span>
                  <ClassificationBadge classification={item.classification} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === item.id}
                  onClick={() => void verify(item)}
                >
                  {busy === item.id ? 'Verificando…' : 'Verificar no gateway'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function ClassificationBadge({
  classification
}: {
  classification: ReconciliationItem['classification'];
}) {
  switch (classification) {
    case 'MATCHED':
      return <Badge variant="active">{labels.MATCHED}</Badge>;
    case 'MISMATCH':
      return <Badge variant="destructive">{labels.MISMATCH}</Badge>;
    case 'LOCAL_ONLY':
      return <Badge variant="secondary">{labels.LOCAL_ONLY}</Badge>;
    case 'GATEWAY_ONLY':
      return <Badge variant="expired">{labels.GATEWAY_ONLY}</Badge>;
    case 'MANUAL_REVIEW':
      return <Badge variant="cancelled">{labels.MANUAL_REVIEW}</Badge>;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(value));
}
