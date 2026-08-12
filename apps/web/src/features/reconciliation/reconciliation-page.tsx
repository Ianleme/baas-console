import { useEffect, useState } from 'react';
import './reconciliation-page.css';

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
    <section className="reconciliation-page" aria-labelledby="reconciliation-title">
      <header>
        <div>
          <span className="eyebrow eyebrow--green">Operações</span>
          <h1 id="reconciliation-title">Reconciliação</h1>
          <p>Acompanhe resultados pendentes e divergências sem alterar estados manualmente.</p>
        </div>
        <span className="reconciliation-readonly">Consulta segura</span>
      </header>
      <div aria-live="polite" className="reconciliation-notice">
        {notice}
      </div>
      {state === 'loading' && <p role="status">Carregando reconciliações…</p>}
      {state === 'error' && <p role="alert">Não foi possível carregar as reconciliações.</p>}
      {state === 'ready' && items.length === 0 && (
        <p className="reconciliation-empty">Nenhuma operação pendente ou divergente.</p>
      )}
      {state === 'ready' && items.length > 0 && (
        <div className="reconciliation-list">
          {items.map((item) => (
            <article key={item.id} className="reconciliation-item">
              <div>
                <span className="reconciliation-kind">
                  {item.kind === 'PAYMENT' ? 'Pagamento' : 'Saque'}
                </span>
                <h2>{item.reference}</h2>
                <time dateTime={item.updatedAt}>Atualizado em {formatDate(item.updatedAt)}</time>
              </div>
              <div className="reconciliation-state">
                <span>{item.status.replaceAll('_', ' ')}</span>
                <strong
                  className={`reconciliation-classification reconciliation-classification--${item.classification.toLowerCase()}`}
                >
                  {labels[item.classification]}
                </strong>
              </div>
              <button type="button" disabled={busy === item.id} onClick={() => void verify(item)}>
                {busy === item.id ? 'Verificando…' : 'Verificar no gateway'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(new Date(value));
}
