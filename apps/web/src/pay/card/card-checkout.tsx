import { useState, type SyntheticEvent } from 'react';

import './card-checkout.css';

export interface CardQuoteView {
  quoteId: string;
  brand: 'VISA' | 'MASTERCARD' | 'ELO';
  installments: number;
  feeBps: number;
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
}
export type CardOutcome = 'APPROVED' | 'DENIED' | 'RECONCILIATION_PENDING' | 'CARD_COOLDOWN';
export interface CardCheckoutApi {
  quote(input: {
    amountCents: string;
    brand: CardQuoteView['brand'];
    installments: number;
  }): Promise<CardQuoteView>;
  confirm(input: {
    quoteId: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: number;
    expiryYear: number;
    cvv: string;
  }): Promise<{ status: CardOutcome }>;
}
export class CardCheckoutError extends Error {
  constructor(readonly code: 'FEE_CHANGED' | 'CARD_COOLDOWN' | 'REQUEST_FAILED') {
    super(code);
    this.name = 'CardCheckoutError';
  }
}
export function CardCheckout({
  amountCents,
  maxInstallments,
  api
}: {
  amountCents: string;
  maxInstallments: number;
  api: CardCheckoutApi;
}) {
  const [brand, setBrand] = useState<CardQuoteView['brand']>('VISA');
  const [installments, setInstallments] = useState(1);
  const [quote, setQuote] = useState<CardQuoteView | null>(null);
  const [state, setState] = useState<
    'editing' | 'quoting' | 'confirming' | CardOutcome | 'fee-changed' | 'error'
  >('editing');

  async function refreshQuote() {
    setState('quoting');
    try {
      setQuote(await api.quote({ amountCents, brand, installments }));
      setState('editing');
    } catch {
      setState('error');
    }
  }
  async function confirm(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!quote) {
      await refreshQuote();
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setState('confirming');
    try {
      const result = await api.confirm({
        quoteId: quote.quoteId,
        cardNumber: field(form, 'cardNumber'),
        cardHolder: field(form, 'cardHolder'),
        expiryMonth: Number(field(form, 'expiryMonth')),
        expiryYear: Number(field(form, 'expiryYear')),
        cvv: field(form, 'cvv')
      });
      formElement.reset();
      setState(result.status);
    } catch (error) {
      const code =
        error instanceof CardCheckoutError ||
        (error && typeof error === 'object' && 'code' in error)
          ? String(error.code)
          : 'REQUEST_FAILED';
      if (code === 'FEE_CHANGED') {
        setQuote(null);
        setState('fee-changed');
        return;
      }
      if (code === 'CARD_COOLDOWN') {
        setState('CARD_COOLDOWN');
        return;
      }
      setState('error');
    }
  }
  function changeSelection(nextBrand: CardQuoteView['brand'], nextInstallments: number) {
    setBrand(nextBrand);
    setInstallments(nextInstallments);
    setQuote(null);
    setState('editing');
  }
  return (
    <section className="card-checkout" aria-labelledby="card-title">
      <span className="eyebrow eyebrow--green">Cartão sandbox</span>
      <h1 id="card-title">Pague com cartão</h1>
      <div role="note" className="card-warning">
        <strong>Use somente cartões de teste.</strong> Nunca informe dados de um cartão real.
      </div>
      <form
        onSubmit={(event) => {
          void confirm(event);
        }}
        autoComplete="on"
      >
        <label>
          Número do cartão
          <input name="cardNumber" inputMode="numeric" autoComplete="cc-number" required />
        </label>
        <label>
          Nome impresso
          <input name="cardHolder" autoComplete="cc-name" required />
        </label>
        <div className="card-row">
          <label>
            Mês
            <input name="expiryMonth" inputMode="numeric" autoComplete="cc-exp-month" required />
          </label>
          <label>
            Ano
            <input name="expiryYear" inputMode="numeric" autoComplete="cc-exp-year" required />
          </label>
          <label>
            CVV
            <input name="cvv" type="password" inputMode="numeric" autoComplete="cc-csc" required />
          </label>
        </div>
        <div className="card-row">
          <label>
            Bandeira
            <select
              value={brand}
              onChange={(event) => {
                changeSelection(event.target.value as CardQuoteView['brand'], installments);
              }}
            >
              <option>VISA</option>
              <option>MASTERCARD</option>
              <option>ELO</option>
            </select>
          </label>
          <label>
            Parcelas
            <select
              value={installments}
              onChange={(event) => {
                changeSelection(brand, Number(event.target.value));
              }}
            >
              {Array.from({ length: maxInstallments }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}x
                </option>
              ))}
            </select>
          </label>
        </div>
        {quote && (
          <aside className="card-summary" aria-label="Resumo do pagamento">
            <p>
              Valor: <strong>{money(quote.grossAmountCents)}</strong>
            </p>
            <p>
              Taxa: <strong>{bps(quote.feeBps)}</strong>
            </p>
            <p>
              Líquido ao lojista: <strong>{money(quote.netAmountCents)}</strong>
            </p>
          </aside>
        )}
        <button
          type={quote ? 'submit' : 'button'}
          onClick={
            quote
              ? undefined
              : () => {
                  void refreshQuote();
                }
          }
          disabled={state === 'quoting' || state === 'confirming'}
        >
          {quote ? 'Confirmar pagamento' : 'Calcular parcelas e taxa'}
        </button>
      </form>
      <div role="status" aria-live="polite" className={`card-state card-state--${state}`}>
        {message(state)}
      </div>
    </section>
  );
}
function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
function money(cents: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(BigInt(cents)) / 100
  );
}
function bps(value: number) {
  return `${(value / 100).toFixed(2).replace('.', ',')}%`;
}
function message(
  state: 'editing' | 'quoting' | 'confirming' | CardOutcome | 'fee-changed' | 'error'
) {
  if (state === 'quoting') return 'Calculando taxa atualizada…';
  if (state === 'confirming') return 'Processando uma única tentativa…';
  if (state === 'APPROVED') return 'Pagamento confirmado.';
  if (state === 'DENIED') return 'Pagamento não aprovado.';
  if (state === 'RECONCILIATION_PENDING') return 'Resposta inconclusiva. Aguarde a conciliação.';
  if (state === 'CARD_COOLDOWN') return 'Muitas tentativas negadas. Aguarde 15 minutos.';
  if (state === 'fee-changed') return 'A taxa mudou. Revise o novo resumo antes de confirmar.';
  if (state === 'error') return 'Não foi possível continuar agora.';
  return 'Preencha os dados de teste e calcule a taxa.';
}
