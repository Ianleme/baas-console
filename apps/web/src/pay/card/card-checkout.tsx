import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';

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
    <section className="card-checkout space-y-4" aria-labelledby="card-title">
      <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">Cartão sandbox</span>
      <h1 id="card-title" className="text-2xl font-bold text-slate-900">Pague com cartão</h1>
      <div role="note" className="card-warning rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong className="font-bold">Use somente cartões de teste.</strong> Nunca informe dados de um cartão real.
      </div>
      <form
        onSubmit={(event) => {
          void confirm(event);
        }}
        autoComplete="on"
        className="space-y-4"
      >
        <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
          Número do cartão
          <Input name="cardNumber" inputMode="numeric" autoComplete="cc-number" required />
        </label>
        <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
          Nome impresso
          <Input name="cardHolder" autoComplete="cc-name" required />
        </label>
        <div className="card-row grid grid-cols-3 gap-3">
          <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
            Mês
            <Input name="expiryMonth" inputMode="numeric" autoComplete="cc-exp-month" required />
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
            Ano
            <Input name="expiryYear" inputMode="numeric" autoComplete="cc-exp-year" required />
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
            CVV
            <Input name="cvv" type="password" inputMode="numeric" autoComplete="cc-csc" required />
          </label>
        </div>
        <div className="card-row grid grid-cols-2 gap-3">
          <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
            Bandeira
            <select
              value={brand}
              onChange={(event) => {
                changeSelection(event.target.value as CardQuoteView['brand'], installments);
              }}
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option>VISA</option>
              <option>MASTERCARD</option>
              <option>ELO</option>
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-700 gap-1">
            Parcelas
            <select
              value={installments}
              onChange={(event) => {
                changeSelection(brand, Number(event.target.value));
              }}
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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
          <aside className="card-summary rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-xs text-slate-600" aria-label="Resumo do pagamento">
            <p className="flex justify-between">
              Valor: <strong className="text-slate-900 font-bold">{money(quote.grossAmountCents)}</strong>
            </p>
            <p className="flex justify-between">
              Taxa: <strong className="text-slate-900 font-bold">{bps(quote.feeBps)}</strong>
            </p>
            <p className="flex justify-between pt-1 border-t border-slate-200">
              Líquido ao lojista: <strong className="text-emerald-700 font-extrabold">{money(quote.netAmountCents)}</strong>
            </p>
          </aside>
        )}
        <Button
          type={quote ? 'submit' : 'button'}
          className="w-full bg-[#007a5a] hover:bg-[#005c47]"
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
        </Button>
      </form>
      <div role="status" aria-live="polite" className={`card-state card-state--${state} text-xs font-medium p-3 rounded-lg bg-slate-100 text-slate-700`}>
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
