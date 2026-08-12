import { useEffect, useRef, useState } from 'react';

import './pix-checkout.css';

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
  pollMs = 5000
}: {
  initial: PixCheckoutAttempt;
  api: PixCheckoutApi;
  pollMs?: number;
}) {
  const [attempt, setAttempt] = useState(initial);
  const [remaining, setRemaining] = useState(secondsUntil(initial.expiresAt));
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);
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
  async function copy() {
    if (!attempt.emv) return;
    await globalThis.navigator.clipboard.writeText(attempt.emv);
    setCopied(true);
  }
  return (
    <section className="pix-checkout" aria-labelledby="pix-title">
      <span className="eyebrow eyebrow--green">Pix sandbox</span>
      <h1 id="pix-title">Pague com Pix</h1>
      <div className="pix-sandbox" role="note">
        <strong>Ambiente de teste.</strong> Não use dados pessoais de terceiros.
      </div>
      <strong className="pix-value">{money(attempt.amountCents)}</strong>
      {(attempt.status === 'PENDING' || attempt.status === 'RECONCILIATION_PENDING') && (
        <>
          {attempt.qrCodeBase64 && (
            <figure className="pix-qr">
              <img
                src={`data:image/png;base64,${attempt.qrCodeBase64}`}
                alt="QR Code Pix para pagamento sandbox"
              />
              <figcaption>Escaneie o QR Code ou copie o código Pix abaixo.</figcaption>
            </figure>
          )}
          {attempt.emv && (
            <div className="pix-copy">
              <label htmlFor="pix-emv">Código Pix copia e cola</label>
              <textarea id="pix-emv" readOnly value={attempt.emv} />
              <button type="button" onClick={() => void copy()}>
                Copiar código Pix
              </button>
            </div>
          )}
          {attempt.txid && (
            <p>
              Identificador Pix: <span>{attempt.txid}</span>
            </p>
          )}
          <p className="pix-timer" role="timer" aria-live="off">
            Tempo restante: {clock(remaining)}
          </p>
        </>
      )}
      <div
        role="status"
        aria-live="polite"
        className={`pix-state pix-state--${attempt.status.toLowerCase()}`}
      >
        {stateMessage(attempt.status)}
        {copied ? ' Código copiado.' : ''}
      </div>
    </section>
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
