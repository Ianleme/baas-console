import axe from 'axe-core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CardCheckout,
  CardCheckoutError,
  type CardCheckoutApi,
  type CardQuoteView
} from './card-checkout.js';

const quote: CardQuoteView = {
  quoteId: 'quote-1',
  brand: 'VISA',
  installments: 3,
  feeBps: 319,
  grossAmountCents: '32000',
  feeAmountCents: '1021',
  netAmountCents: '30979'
};
function api(
  status: 'APPROVED' | 'DENIED' | 'RECONCILIATION_PENDING' = 'APPROVED'
): CardCheckoutApi & { quote: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> } {
  return {
    quote: vi.fn().mockResolvedValue(quote),
    confirm: vi.fn().mockResolvedValue({ status })
  };
}
function view(client = api()) {
  return render(<CardCheckout amountCents="32000" maxInstallments={21} api={client} />);
}
async function obtainQuote() {
  fireEvent.click(screen.getByRole('button', { name: 'Calcular parcelas e taxa' }));
  await screen.findByRole('complementary', { name: 'Resumo do pagamento' });
}
function fillCard() {
  fireEvent.change(screen.getByLabelText('Número do cartão'), {
    target: { value: '4111111111111111' }
  });
  fireEvent.change(screen.getByLabelText('Nome impresso'), {
    target: { value: 'CLIENTE SANDBOX' }
  });
  fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2030' } });
  fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } });
}
describe('CardCheckout', () => {
  test('warns prominently against real cards', () => {
    view();
    expect(screen.getByRole('note')).toHaveTextContent('Nunca informe dados de um cartão real');
  });
  test('starts with an honest editing state', () => {
    view();
    expect(screen.getByRole('status')).toHaveTextContent('Preencha os dados de teste');
  });
  test('offers all gateway installments through 21', () => {
    view();
    expect(screen.getByLabelText('Parcelas').querySelectorAll('option')).toHaveLength(21);
  });
  test.each([
    ['Número do cartão', 'cc-number'],
    ['Nome impresso', 'cc-name'],
    ['Mês', 'cc-exp-month'],
    ['Ano', 'cc-exp-year'],
    ['CVV', 'cc-csc']
  ])('uses browser autocomplete for %s', (label, autocomplete) => {
    view();
    expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', autocomplete);
  });
  test('masks CVV input', () => {
    view();
    expect(screen.getByLabelText('CVV')).toHaveAttribute('type', 'password');
  });
  test('allows paste into card number', () => {
    view();
    const input = screen.getByLabelText('Número do cartão');
    fireEvent.paste(input, { clipboardData: { getData: () => '4111111111111111' } });
    expect(input).not.toHaveAttribute('readonly');
  });
  test('requests a quote without card values', async () => {
    const client = api();
    view(client);
    await obtainQuote();
    expect(client.quote).toHaveBeenCalledWith({
      amountCents: '32000',
      brand: 'VISA',
      installments: 1
    });
    expect(JSON.stringify(client.quote.mock.calls)).not.toContain('411111');
  });
  test('shows exact gross amount', async () => {
    view();
    await obtainQuote();
    expect(screen.getByText('R$ 320,00')).toBeVisible();
  });
  test('shows fee in percent', async () => {
    view();
    await obtainQuote();
    expect(screen.getByText('3,19%')).toBeVisible();
  });
  test('shows exact net amount', async () => {
    view();
    await obtainQuote();
    expect(screen.getByText('R$ 309,79')).toBeVisible();
  });
  test('changing installments invalidates the previous quote', async () => {
    view();
    await obtainQuote();
    fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '4' } });
    expect(screen.queryByLabelText('Resumo do pagamento')).not.toBeInTheDocument();
  });
  test('confirms transient fields exactly once', async () => {
    const client = api();
    view(client);
    await obtainQuote();
    fillCard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => {
      expect(client.confirm).toHaveBeenCalledTimes(1);
    });
    expect(client.confirm).toHaveBeenCalledWith({
      quoteId: 'quote-1',
      cardNumber: '4111111111111111',
      cardHolder: 'CLIENTE SANDBOX',
      expiryMonth: 12,
      expiryYear: 2030,
      cvv: '123'
    });
  });
  test.each([
    ['APPROVED', 'Pagamento confirmado.'],
    ['DENIED', 'Pagamento não aprovado.'],
    ['RECONCILIATION_PENDING', 'Aguarde a conciliação.']
  ] as const)('shows honest %s outcome', async (status, label) => {
    view(api(status));
    await obtainQuote();
    fillCard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(label));
  });
  test('requires reconfirmation when fee changes', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new CardCheckoutError('FEE_CHANGED'));
    view(client);
    await obtainQuote();
    fillCard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A taxa mudou'));
    expect(screen.queryByLabelText('Resumo do pagamento')).not.toBeInTheDocument();
  });
  test('shows fifteen-minute cooldown without retrying', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new CardCheckoutError('CARD_COOLDOWN'));
    view(client);
    await obtainQuote();
    fillCard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('15 minutos'));
    expect(client.confirm).toHaveBeenCalledTimes(1);
  });
  test('does not render sensitive values in errors', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new Error('network'));
    view(client);
    await obtainQuote();
    fillCard();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Não foi possível'));
    expect(document.body.textContent).not.toContain('4111111111111111');
    expect(document.body.textContent).not.toContain('123');
  });
  test('is fully keyboard reachable', async () => {
    view();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('Número do cartão')).toHaveFocus();
  });
  test('has no automated axe violations', async () => {
    const { container } = view();
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
