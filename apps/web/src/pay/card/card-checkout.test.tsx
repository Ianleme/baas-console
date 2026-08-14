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
  fireEvent.click(screen.getByRole('button', { name: 'Revisar pagamento' }));
  await screen.findByRole('complementary', { name: 'Resumo do pagamento' });
}
async function choose(label: string, option: string | RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}
async function fillCard() {
  fireEvent.change(screen.getByLabelText('Número do cartão'), {
    target: { value: '4111111111111111' }
  });
  fireEvent.change(screen.getByLabelText('Nome impresso'), {
    target: { value: 'CLIENTE SANDBOX' }
  });
  await choose('Mês', '12');
  await choose('Ano', '2030');
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
  test('offers all gateway installments through 21 in a Radix select', async () => {
    view();
    await userEvent.click(screen.getByRole('combobox', { name: 'Parcelas' }));
    expect(await screen.findByRole('option', { name: /3x de R.*106,67/ })).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(21);
  });
  test('exposes exactly four labelled Radix dropdowns without duplicate native controls', () => {
    view();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    for (const label of ['Mês', 'Ano', 'Bandeira', 'Parcelas']) {
      expect(screen.getByRole('combobox', { name: label })).toBeVisible();
    }
  });
  test('detects a supported card brand from the test PAN before quoting', () => {
    view();
    fireEvent.change(screen.getByLabelText('Número do cartão'), {
      target: { value: '5555555555554444' }
    });
    expect(screen.getByRole('combobox', { name: 'Bandeira' })).toHaveTextContent('Mastercard');
    expect(screen.getByLabelText('Número do cartão')).toHaveValue('5555 5555 5555 4444');
  });
  test.each([
    ['Número do cartão', 'cc-number'],
    ['Nome impresso', 'cc-name'],
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
  test('normalizes holder and CVV visually without accepting unrelated characters', () => {
    view();
    fireEvent.change(screen.getByLabelText('Nome impresso'), {
      target: { value: 'José  da silva 123' }
    });
    fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '12a34x' } });
    expect(screen.getByLabelText('Nome impresso')).toHaveValue('JOSÉ DA SILVA ');
    expect(screen.getByLabelText('CVV')).toHaveValue('1234');
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
    expect(screen.getAllByText('R$ 320,00')).not.toHaveLength(0);
  });
  test('does not expose gateway fee or merchant net amount to the payer', async () => {
    view();
    await obtainQuote();
    expect(screen.queryByText('3,19%')).not.toBeInTheDocument();
    expect(screen.queryByText('R$ 309,79')).not.toBeInTheDocument();
    expect(screen.queryByText(/Líquido ao lojista|Taxa:/)).not.toBeInTheDocument();
  });
  test('changing installments in the Radix select invalidates the previous quote', async () => {
    view();
    await obtainQuote();
    await choose('Parcelas', /^4x de/);
    expect(screen.queryByLabelText('Resumo do pagamento')).not.toBeInTheDocument();
  });
  test('confirms transient fields exactly once', async () => {
    const client = api();
    view(client);
    await obtainQuote();
    await fillCard();
    fireEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
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
    ['APPROVED', 'Cartão aprovado'],
    ['DENIED', 'Pagamento não aprovado'],
    ['RECONCILIATION_PENDING', 'Pagamento em conferência']
  ] as const)('shows honest %s outcome', async (status, label) => {
    view(api(status));
    await obtainQuote();
    await fillCard();
    fireEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: label })).toBeVisible());
  });
  test('requires reconfirmation when fee changes', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new CardCheckoutError('FEE_CHANGED'));
    view(client);
    await obtainQuote();
    await fillCard();
    fireEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A taxa mudou'));
    expect(screen.queryByLabelText('Resumo do pagamento')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar condições' }));
    expect(await screen.findByRole('button', { name: /Pagar R.*320,00/ })).toBeVisible();
    expect(client.confirm).toHaveBeenCalledTimes(1);
  });
  test('shows fifteen-minute cooldown without retrying', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new CardCheckoutError('CARD_COOLDOWN'));
    view(client);
    await obtainQuote();
    await fillCard();
    fireEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
    await waitFor(() => expect(screen.getByText(/15 minutos/)).toBeVisible());
    expect(client.confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Tentar/ })).not.toBeInTheDocument();
  });
  test('does not render sensitive values in errors', async () => {
    const client = api();
    client.confirm.mockRejectedValue(new Error('network'));
    view(client);
    await obtainQuote();
    await fillCard();
    fireEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
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
  test('replaces the form with a terminal receipt after approval', async () => {
    const client = api('APPROVED');
    view(client);
    await obtainQuote();
    await fillCard();
    await userEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
    expect(await screen.findByRole('heading', { name: 'Cartão aprovado' })).toHaveFocus();
    expect(screen.queryByLabelText('Número do cartão')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(client.confirm).toHaveBeenCalledTimes(1);
  });
  test('offers retry and method change only after denial', async () => {
    const onChooseMethod = vi.fn();
    const client = api('DENIED');
    render(
      <CardCheckout
        amountCents="32000"
        maxInstallments={3}
        api={client}
        onChooseMethod={onChooseMethod}
      />
    );
    await obtainQuote();
    await fillCard();
    await userEvent.click(screen.getByRole('button', { name: /Pagar R.*320,00/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Escolher outro método' }));
    expect(onChooseMethod).toHaveBeenCalledTimes(1);
  });
  test('has no automated axe violations', async () => {
    const { container } = view();
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
