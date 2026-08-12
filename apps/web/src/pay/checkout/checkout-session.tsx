import { useEffect, useRef, useState } from 'react';

import type { PublicCheckoutView } from '@baas/api-client';

export interface CheckoutExchangeApi {
  exchange: (token: string) => Promise<{ checkout: PublicCheckoutView; csrfToken: string }>;
}
export function CheckoutSession({
  api,
  fragment = globalThis.location.hash
}: {
  api: CheckoutExchangeApi;
  fragment?: string;
}) {
  const started = useRef(false);
  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [checkout, setCheckout] = useState<PublicCheckoutView | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const match = /^#\/checkout\/([A-Za-z0-9_-]+)$/u.exec(fragment);
    globalThis.history.replaceState(
      null,
      '',
      `${globalThis.location.pathname}${globalThis.location.search}`
    );
    if (!match?.[1] || match[1].length < 43) {
      setState('invalid');
      return;
    }
    void api
      .exchange(match[1])
      .then((result) => {
        setCheckout(result.checkout);
        setState('ready');
      })
      .catch(() => {
        setState('invalid');
      });
  }, [api, fragment]);

  if (state === 'loading') return <p role="status">Preparando checkout seguro…</p>;
  if (state === 'invalid' || !checkout) return <CheckoutUnavailable label="Link indisponível" />;
  if (checkout.state !== 'READY') return <CheckoutUnavailable label={stateLabel(checkout.state)} />;
  return (
    <section className="checkout-content" aria-labelledby="public-checkout-title">
      <span className="eyebrow eyebrow--green">Pagamento seguro</span>
      <h1 id="public-checkout-title">{checkout.description}</h1>
      <strong className="checkout-amount">{money(checkout.amountCents)}</strong>
      <p>Escolha como pagar neste ambiente controlado.</p>
      <div className="checkout-methods">
        {checkout.methods !== 'CARD' && <button type="button">Pagar com Pix</button>}
        {checkout.methods !== 'PIX' && (
          <button type="button">Pagar com cartão · até {checkout.maxInstallments}x</button>
        )}
      </div>
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
