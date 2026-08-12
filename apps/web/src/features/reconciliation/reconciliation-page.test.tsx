import axe from 'axe-core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ReconciliationPage,
  type ReconciliationApi,
  type ReconciliationItem
} from './reconciliation-page.js';

const pending: ReconciliationItem = {
  id: 'payment-1',
  kind: 'PAYMENT',
  reference: 'REF-PAY',
  status: 'RECONCILIATION_PENDING',
  classification: 'LOCAL_ONLY',
  updatedAt: '2026-08-12T16:00:00.000Z'
};
const divergent: ReconciliationItem = {
  id: 'withdrawal-1',
  kind: 'WITHDRAWAL',
  reference: 'REF-WITHDRAW',
  status: 'MANUAL_REVIEW',
  classification: 'MISMATCH',
  updatedAt: '2026-08-12T16:10:00.000Z'
};
function client(overrides: Partial<ReconciliationApi> = {}): ReconciliationApi {
  return {
    list: vi.fn().mockResolvedValue([pending, divergent]),
    verify: vi.fn().mockResolvedValue({ classification: 'MATCHED' }),
    ...overrides
  };
}
async function ready(api = client()) {
  render(<ReconciliationPage api={api} />);
  await screen.findByText('REF-PAY');
  return api;
}
function firstVerifyButton() {
  const button = screen.getAllByRole('button', { name: 'Verificar no gateway' })[0];
  if (!button) throw new Error('VERIFY_ACTION_MISSING');
  return button;
}

describe('ReconciliationPage', () => {
  test('shows loading state', () => {
    render(<ReconciliationPage api={client({ list: () => new Promise(() => undefined) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando reconciliações');
  });
  test('shows safe list failure', async () => {
    render(
      <ReconciliationPage api={client({ list: vi.fn().mockRejectedValue(new Error('raw')) })} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.queryByText('raw')).not.toBeInTheDocument();
  });
  test('shows explicit empty state', () => {
    render(<ReconciliationPage api={client({ list: vi.fn().mockResolvedValue([]) })} />);
    return expect(
      screen.findByText('Nenhuma operação pendente ou divergente.')
    ).resolves.toBeVisible();
  });
  test('shows pending state and honest classification', async () => {
    await ready();
    expect(screen.getByText('RECONCILIATION PENDING')).toBeVisible();
    expect(screen.getByText('Somente local')).toBeVisible();
  });
  test('shows divergence without presenting it as success', async () => {
    await ready();
    expect(screen.getByText('Dados divergentes')).toBeVisible();
    expect(screen.getByText('MANUAL REVIEW')).toBeVisible();
  });
  test('shows payment and withdrawal kinds', async () => {
    await ready();
    expect(screen.getByText('Pagamento')).toBeVisible();
    expect(screen.getByText('Saque')).toBeVisible();
  });
  test('shows deterministic timestamps', async () => {
    await ready();
    expect(screen.getByText('Atualizado em 12/08/2026, 16:00')).toBeVisible();
    expect(screen.getByText('Atualizado em 12/08/2026, 16:10')).toBeVisible();
  });
  test('manual action sends only operation identity through the fixed API contract', async () => {
    const api = await ready();
    await userEvent.click(firstVerifyButton());
    await waitFor(() => {
      expect(api.verify).toHaveBeenCalledWith('payment-1');
    });
  });
  test('updates only the verified item classification', async () => {
    await ready();
    await userEvent.click(firstVerifyButton());
    expect(await screen.findByText('Conciliado')).toBeVisible();
    expect(screen.getByText('Dados divergentes')).toBeVisible();
  });
  test('shows completion notice based on gateway consultation', async () => {
    await ready();
    await userEvent.click(firstVerifyButton());
    expect(await screen.findByText(/Verificação concluída/u)).toBeVisible();
  });
  test('translates gateway outage and preserves local row', async () => {
    const error = Object.assign(new Error(), { code: 'GATEWAY_UNAVAILABLE' });
    await ready(client({ verify: vi.fn().mockRejectedValue(error) }));
    await userEvent.click(firstVerifyButton());
    expect(
      await screen.findByText('Gateway indisponível. Os dados locais foram preservados.')
    ).toBeVisible();
    expect(screen.getByText('Somente local')).toBeVisible();
  });
  test('translates generic failure and preserves local row', async () => {
    await ready(client({ verify: vi.fn().mockRejectedValue(new Error('raw')) }));
    await userEvent.click(firstVerifyButton());
    expect(await screen.findByText(/Não foi possível verificar agora/u)).toBeVisible();
    expect(screen.queryByText('raw')).not.toBeInTheDocument();
  });
  test('disables the operation action while verifying', async () => {
    await ready(client({ verify: () => new Promise(() => undefined) }));
    await userEvent.click(firstVerifyButton());
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
  });
  test('supports keyboard navigation to verify action', async () => {
    await ready();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getAllByRole('button', { name: 'Verificar no gateway' })[0]).toHaveFocus();
  });
  test('has no axe violations in populated state', async () => {
    const { container } = render(<ReconciliationPage api={client()} />);
    await screen.findByText('REF-PAY');
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
