import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.js';

export type PixCheckoutState =
  | 'PENDING'
  | 'RECONCILIATION_PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'EXPIRED';
export interface PixCheckoutAttempt {
  id: string;
  status: PixCheckoutState;
  amountCents: string;
  emv: string | null;
  qrCodeBase64: string | null;
  txid: string | null;
  expiresAt: string;
}
export interface PixCheckoutApi {
  create?: (input: { payerDocument: string }) => Promise<PixCheckoutAttempt>;
  status: (attemptId: string) => Promise<PixCheckoutAttempt>;
}
export function PixCheckout({
  initial,
  api,
  pollMs = 5000,
  onRetry,
  onChooseMethod
}: {
  initial: PixCheckoutAttempt;
  api: PixCheckoutApi;
  pollMs?: number;
  onRetry?: () => void;
  onChooseMethod?: () => void;
}) {
  const [attempt, setAttempt] = useState(initial);
  const [remaining, setRemaining] = useState(secondsUntil(initial.expiresAt));
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);
  const outcomeHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(secondsUntil(attempt.expiresAt));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [attempt.expiresAt]);
  useEffect(() => {
    if (attempt.status !== 'PENDING' && attempt.status !== 'RECONCILIATION_PENDING') return;
    const interval = setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void api
        .status(attempt.id)
        .then(setAttempt)
        .finally(() => {
          polling.current = false;
        });
    }, pollMs);
    return () => {
      clearInterval(interval);
    };
  }, [api, attempt.id, attempt.status, pollMs]);
  useEffect(() => {
    if (
      attempt.status === 'APPROVED' ||
      attempt.status === 'DENIED' ||
      attempt.status === 'EXPIRED'
    ) {
      outcomeHeading.current?.focus();
    }
  }, [attempt.status]);
  async function copy() {
    if (!attempt.emv) return;
    await globalThis.navigator.clipboard.writeText(attempt.emv);
    setCopied(true);
  }
  if (attempt.status === 'APPROVED') {
    return (
      <section
        className="payment-result payment-result--approved"
        aria-labelledby="pix-result-title"
      >
        <span className="payment-result__icon" aria-hidden="true">
          ✓
        </span>
        <span className="eyebrow eyebrow--green">Pagamento concluído</span>
        <h1 id="pix-result-title" ref={outcomeHeading} tabIndex={-1}>
          Pix confirmado
        </h1>
        <strong className="payment-result__amount">{money(attempt.amountCents)}</strong>
        <p role="status" aria-live="polite">
          O pagamento foi aprovado e registrado com segurança.
        </p>
        {attempt.txid && <ReceiptItem label="Identificador Pix" value={attempt.txid} mono />}
        <p className="payment-result__hint">Você já pode fechar esta página.</p>
      </section>
    );
  }

  if (attempt.status === 'DENIED' || attempt.status === 'EXPIRED') {
    const denied = attempt.status === 'DENIED';
    return (
      <section
        className="payment-result payment-result--attention"
        aria-labelledby="pix-result-title"
      >
        <span className="payment-result__icon" aria-hidden="true">
          !
        </span>
        <span className="eyebrow">Pix não concluído</span>
        <h1 id="pix-result-title" ref={outcomeHeading} tabIndex={-1}>
          {denied ? 'Pagamento não aprovado' : 'Código Pix expirado'}
        </h1>
        <p role="alert">
          {denied
            ? 'Nenhum pagamento foi confirmado. Gere um novo código para tentar novamente.'
            : 'Este código não pode mais ser pago. Gere um novo Pix para continuar.'}
        </p>
        <div className="payment-result__actions">
          {onRetry && (
            <Button type="button" className="pay-primary w-full" onClick={onRetry}>
              Gerar novo Pix
            </Button>
          )}
          {onChooseMethod && (
            <Button type="button" variant="outline" className="w-full" onClick={onChooseMethod}>
              Escolher outro método
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="pix-checkout space-y-4" aria-labelledby="pix-title">
      <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
        Pix sandbox
      </span>
      <h1 id="pix-title" className="text-2xl font-bold text-slate-900">
        Pague com Pix
      </h1>
      <div
        className="pix-sandbox rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        role="note"
      >
        <strong className="font-bold">Ambiente de teste.</strong> Não use dados pessoais de
        terceiros.
      </div>
      <strong className="pix-value text-3xl font-extrabold text-slate-900 block">
        {money(attempt.amountCents)}
      </strong>
      {(attempt.status === 'PENDING' || attempt.status === 'RECONCILIATION_PENDING') && (
        <div className="space-y-4">
          {attempt.qrCodeBase64 && (
            <figure className="pix-qr flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 bg-slate-50">
              <img
                src={`data:image/png;base64,${attempt.qrCodeBase64}`}
                alt="QR Code Pix para pagamento sandbox"
                className="h-44 w-44 rounded-lg shadow-sm"
              />
              <figcaption className="text-xs text-slate-500 font-medium">
                Escaneie o QR Code ou copie o código Pix abaixo.
              </figcaption>
            </figure>
          )}
          {attempt.emv && (
            <div className="pix-copy flex flex-col gap-2">
              <label htmlFor="pix-emv" className="text-xs font-semibold text-slate-700">
                Código Pix copia e cola
              </label>
              <textarea
                id="pix-emv"
                readOnly
                value={attempt.emv}
                className="h-20 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-mono text-slate-800 outline-none"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void copy()}
              >
                Copiar código Pix
              </Button>
            </div>
          )}
          {attempt.txid && (
            <p className="text-xs text-slate-500">
              Identificador Pix:{' '}
              <span className="font-mono text-slate-800 font-semibold">{attempt.txid}</span>
            </p>
          )}
          <p
            className="pix-timer text-xs font-semibold text-amber-800 bg-amber-50 p-2 rounded-md"
            role="timer"
            aria-live="off"
          >
            Tempo restante: {clock(remaining)}
          </p>
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className={`pix-state pix-state--${attempt.status.toLowerCase()} text-xs font-semibold p-3 rounded-lg bg-slate-100 text-slate-700`}
      >
        {stateMessage(attempt.status)}
        {copied ? ' Código copiado.' : ''}
      </div>
    </section>
  );
}
function ReceiptItem({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="payment-result__receipt">
      <span>{label}</span>
      <strong className={mono ? 'payment-result__mono' : undefined}>{value}</strong>
    </div>
  );
}
function stateMessage(state: PixCheckoutState) {
  if (state === 'PENDING') return 'Aguardando confirmação do Pix.';
  if (state === 'RECONCILIATION_PENDING')
    return 'Pagamento recebido para conferência. Aguarde a conciliação.';
  if (state === 'APPROVED') return 'Pagamento confirmado.';
  if (state === 'DENIED')
    return 'Pagamento não aprovado. Você pode tentar novamente se o link continuar ativo.';
  return 'Este Pix expirou.';
}
function secondsUntil(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function money(cents: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(BigInt(cents)) / 100
  );
}
