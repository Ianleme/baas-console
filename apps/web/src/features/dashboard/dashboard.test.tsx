import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dashboard, approvalRate, type DashboardApi, type DashboardData } from './dashboard.js';

const populated: DashboardData = {
  wallet: { balanceCents: '2485072', capturedAt: '2026-08-12T16:30:00.000Z', stale: false },
  receivedCents: '342000',
  approvedCount: 18,
  deniedCount: 1,
  pendingCount: 2,
  pixReceivedCents: '212040',
  cardReceivedCents: '129960',
  operations: [
    {
      id: '1',
      reference: 'PED-1048',
      method: 'PIX',
      amountCents: '32000',
      status: 'APPROVED',
      occurredAt: '2026-08-12T14:32:00.000Z'
    },
    {
      id: '2',
      reference: 'PED-1047',
      method: 'CARD',
      amountCents: '125000',
      status: 'DENIED',
      occurredAt: '2026-08-12T13:18:00.000Z'
    }
  ]
};

function api(value: DashboardData = populated): DashboardApi {
  return { load: vi.fn().mockResolvedValue(value) };
}

async function ready(value: DashboardData = populated) {
  const client = api(value);
  render(<Dashboard api={client} />);
  await screen.findByText('R$ 24.850,72');
  return client;
}

describe('Dashboard', () => {
  test('calculates approval rate excluding pending operations', () =>
    expect(approvalRate(18, 1)).toBeCloseTo(94.7368, 3));
  test('returns zero approval rate without finalized operations', () =>
    expect(approvalRate(0, 0)).toBe(0));
  test('shows loading state', () => {
    render(<Dashboard api={{ load: () => new Promise(() => undefined) }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando painel financeiro');
  });
  test('loads the real dashboard projection once', async () => {
    const client = await ready();
    expect(client.load).toHaveBeenCalledTimes(1);
  });
  test('shows authoritative wallet balance in BRL', async () => {
    await ready();
    expect(screen.getByText('R$ 24.850,72')).toBeVisible();
  });
  test('shows received amount in BRL', async () => {
    await ready();
    expect(screen.getByText('R$ 3.420,00')).toBeVisible();
  });
  test('shows total transaction count including pending', async () => {
    await ready();
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('21');
  });
  test('shows approval rate', async () => {
    await ready();
    expect(screen.getByText('94,7%')).toBeVisible();
  });
  test('documents approval denominator accessibly', async () => {
    await ready();
    expect(
      screen.getByText('Aprovadas ÷ (aprovadas + negadas); pendentes não entram no cálculo.')
    ).toBeVisible();
  });
  test('shows wallet refresh timestamp', async () => {
    await ready();
    expect(screen.getByText('Atualizado em 12/08/2026, 16:30')).toBeVisible();
  });
  test('shows stale state without replacing balance', async () => {
    await ready({ ...populated, wallet: { ...populated.wallet, stale: true } });
    expect(screen.getByText('Dados desatualizados')).toBeVisible();
    expect(screen.getByText('R$ 24.850,72')).toBeVisible();
  });
  test('does not show stale warning for fresh snapshot', async () => {
    await ready();
    expect(screen.queryByText('Dados desatualizados')).not.toBeInTheDocument();
  });
  test('shows Pix composition amount', async () => {
    await ready();
    expect(screen.getByText('R$ 2.120,40')).toBeVisible();
  });
  test('shows card composition amount', async () => {
    await ready();
    expect(screen.getByText('R$ 1.299,60')).toBeVisible();
  });
  test('provides a textual composition summary', async () => {
    await ready();
    expect(screen.getByText(/Pix representa 62% e cartão 38%/u)).toBeVisible();
  });
  test('provides a transaction table alternative', async () => {
    await ready();
    expect(screen.getByRole('table', { name: 'Transações recentes' })).toBeVisible();
  });
  test('uses text labels in addition to status colors', async () => {
    await ready();
    expect(screen.getByText('Aprovada')).toBeVisible();
    expect(screen.getByText('Negada')).toBeVisible();
  });
  test('shows explicit empty operation state', async () => {
    await ready({ ...populated, operations: [] });
    expect(screen.getByText('Nenhuma transação no período.')).toBeVisible();
  });
  test('shows a safe translated load failure', async () => {
    render(
      <Dashboard api={{ load: vi.fn().mockRejectedValue(new Error('raw gateway payload')) }} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o painel'
    );
    expect(screen.queryByText('raw gateway payload')).not.toBeInTheDocument();
  });
  test('offers keyboard-accessible period controls', async () => {
    await ready();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveFocus();
  });
  test('changes the selected period without optimistic financial changes', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '30 dias' }));
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('R$ 24.850,72')).toBeVisible();
  });
  test('has no axe violations in populated state', async () => {
    const { container } = render(<Dashboard api={api()} />);
    await screen.findByText('PED-1048');
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
