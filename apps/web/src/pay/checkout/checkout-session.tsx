import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import type { PublicCheckoutView } from '@baas/api-client';
import { CardCheckout, type CardCheckoutApi } from '../card/card-checkout.js';
import { PixCheckout, type PixCheckoutApi, type PixCheckoutAttempt } from '../pix/pix-checkout.js';

export interface CheckoutExchangeApi {
  exchange: (token: string) => Promise<{
    checkout: PublicCheckoutView;
    csrfToken: string;
    pixAttempt?: PixCheckoutAttempt;
    startMethod?: 'CARD';
  }>;
}
export function CheckoutSession({
  api,
  pixApi,
  cardApi,
  fragment = globalThis.location.hash
}: {
  api: CheckoutExchangeApi;
  pixApi?: PixCheckoutApi;
  cardApi?: CardCheckoutApi;
  fragment?: string;
}) {
  const started = useRef(false);
  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [checkout, setCheckout] = useState<PublicCheckoutView | null>(null);
  const [pixAttempt, setPixAttempt] = useState<PixCheckoutAttempt | null>(null);
  const [pixSelected, setPixSelected] = useState(false);
  const [pixBusy, setPixBusy] = useState(false);
  const [cardSelected, setCardSelected] = useState(false);
  const [pixError, setPixError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const match = /^#\/checkout\/([A-Za-z0-9_-]+)$/u.exec(fragment);
    globalThis.history.replaceState(
      null,
      '',
      `${globalThis.location.pathname}${globalThis.location.search}`
    );
    if (!match?.[1] || match[1].length < 36) {
      setState('invalid');
      return;
    }
    void api
      .exchange(match[1])
      .then((result) => {
        setCheckout(result.checkout);
        setPixAttempt(result.pixAttempt ?? null);
        setCardSelected(result.startMethod === 'CARD');
        setState('ready');
      })
      .catch(() => {
        setState('invalid');
      });
  }, [api, fragment]);

  if (pixAttempt && pixApi && checkout)
    return (
      <PixCheckout
        initial={pixAttempt}
        api={pixApi}
        onRetry={() => {
          setPixAttempt(null);
          setPixSelected(true);
          setCardSelected(false);
        }}
        {...(checkout.methods === 'PIX_CARD'
          ? {
              onChooseMethod: () => {
                setPixAttempt(null);
                setPixSelected(false);
                setCardSelected(false);
              }
            }
          : {})}
      />
    );
  if (cardSelected && cardApi && checkout)
    return (
      <CardCheckout
        amountCents={checkout.amountCents}
        maxInstallments={checkout.maxInstallments}
        api={cardApi}
        {...(checkout.methods === 'PIX_CARD'
          ? {
              onChooseMethod: () => {
                setCardSelected(false);
                setPixSelected(false);
              }
            }
          : {})}
      />
    );
  if (state === 'loading') return <p role="status">Preparando checkout seguro…</p>;
  if (state === 'invalid' || !checkout) return <CheckoutUnavailable label="Link indisponível" />;
  if (checkout.state !== 'READY') return <CheckoutUnavailable label={stateLabel(checkout.state)} />;
  async function createPix(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!pixApi?.create || pixBusy) return;
    const payerDocument = new FormData(event.currentTarget).get('payerDocument');
    if (typeof payerDocument !== 'string') return;
    const normalizedDocument = payerDocument.replace(/\D/gu, '');
    if (normalizedDocument.length !== 11 && normalizedDocument.length !== 14) {
      setPixError('Informe um CPF ou CNPJ com 11 ou 14 números.');
      return;
    }
    setPixBusy(true);
    try {
      setPixAttempt(await pixApi.create({ payerDocument: normalizedDocument }));
      setPixError('');
    } catch {
      setPixError('Não foi possível gerar o Pix. Revise o documento e tente novamente.');
    } finally {
      setPixBusy(false);
    }
  }
  return (
    <section className="checkout-content" aria-labelledby="public-checkout-title">
      <span className="eyebrow eyebrow--green">Pagamento seguro</span>
      <h1 id="public-checkout-title">{checkout.description}</h1>
      <strong className="checkout-amount">{money(checkout.amountCents)}</strong>
      <p>Escolha como pagar neste ambiente controlado.</p>
      <div className="checkout-methods">
        {checkout.methods !== 'CARD' && !pixSelected && (
          <button
            className={pixSelected ? 'is-selected' : ''}
            type="button"
            onClick={() => {
              setPixSelected(true);
              setCardSelected(false);
            }}
          >
            Pagar com Pix
          </button>
        )}
        {checkout.methods !== 'PIX' && (
          <button
            className={cardSelected ? 'is-selected' : ''}
            type="button"
            onClick={() => {
              setCardSelected(true);
              setPixSelected(false);
            }}
          >
            Pagar com cartão · até {checkout.maxInstallments}x
          </button>
        )}
      </div>
      {pixSelected && pixApi?.create && (
        <form
          className="pix-create-form space-y-4"
          aria-label="Gerar pagamento Pix"
          onSubmit={(event) => void createPix(event)}
        >
          <div className="pay-field">
            <label htmlFor="payer-document">CPF ou CNPJ do pagador</label>
            <input
              id="payer-document"
              className="w-full"
              name="payerDocument"
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              aria-describedby="payer-document-hint"
              autoFocus
              required
            />
            <span id="payer-document-hint" className="pay-field__hint">
              Somente dados fictícios de sandbox.
            </span>
          </div>
          <button className="pay-primary w-full" type="submit" disabled={pixBusy}>
            {pixBusy ? 'Gerando Pix…' : 'Gerar Pix'}
          </button>
          {pixError && (
            <p className="pay-status bg-red-50 text-xs font-semibold text-red-700" role="alert">
              {pixError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
function CheckoutUnavailable({ label }: { label: string }) {
  return (
    <section className="checkout-content">
      <span className="eyebrow">Checkout</span>
      <h1>{label}</h1>
      <p>Este checkout não pode receber pagamentos. Solicite um novo link ao lojista.</p>
    </section>
  );
}
function stateLabel(state: PublicCheckoutView['state']) {
  if (state === 'EXPIRED') return 'Link expirado';
  if (state === 'PAID') return 'Pagamento já concluído';
  return 'Link cancelado';
}
function money(cents: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(BigInt(cents)) / 100
  );
}
