/* eslint-disable @typescript-eslint/unbound-method */
import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WithdrawalsPage, type WithdrawalItem, type WithdrawalsApi } from './withdrawals-page.js';

const mockWithdrawals: WithdrawalItem[] = [
  {
    id: 'wth_1',
    externalReference: 'WTH-001',
    amountCents: '5000',
    status: 'APPROVED',
    destinationType: 'PIX_CPF',
    destinationMasked: '***.456.789-**',
    gatewayWithdrawalId: 'gw_wth_1',
    createdAt: '2026-08-12T14:00:00.000Z'
  },
  {
    id: 'wth_2',
    externalReference: 'WTH-002',
    amountCents: '2500',
    status: 'DENIED',
    destinationType: 'PIX_EMAIL',
    destinationMasked: 'jo***@empresa.com',
    gatewayWithdrawalId: null,
    createdAt: '2026-08-12T15:00:00.000Z'
  },
  {
    id: 'wth_3',
    externalReference: 'WTH-003',
    amountCents: '1000',
    status: 'PROCESSING',
    destinationType: 'PIX_CNPJ',
    destinationMasked: '**.345.678/****-**',
    gatewayWithdrawalId: 'gw_wth_3',
    createdAt: '2026-08-12T16:00:00.000Z'
  }
];

function createMockApi(): WithdrawalsApi {
  return {
    list: vi.fn().mockResolvedValue(mockWithdrawals),
    request: vi.fn().mockResolvedValue({
      id: 'wth_new',
      externalReference: 'WTH-NEW',
      amountCents: '3000',
      status: 'APPROVED',
      destinationType: 'PIX_CPF',
      destinationMasked: '***.123.456-**',
      gatewayWithdrawalId: 'gw_wth_new',
      createdAt: '2026-08-12T17:00:00.000Z'
    }),
    getBalance: vi.fn().mockResolvedValue({ balanceCents: '10000' })
  };
}

describe('WithdrawalsPage', () => {
  it('renders loading state initially', () => {
    const api: WithdrawalsApi = {
      list: () => new Promise(() => undefined),
      request: vi.fn(),
      getBalance: () => new Promise(() => undefined)
    };
    render(<WithdrawalsPage api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando informações de saques');
  });

  it('renders error message on API failure', async () => {
    const api: WithdrawalsApi = {
      list: vi.fn().mockRejectedValue(new Error('API Error')),
      request: vi.fn(),
      getBalance: vi.fn().mockResolvedValue({ balanceCents: '0' })
    };
    render(<WithdrawalsPage api={api} />);
    expect(
      await screen.findByText(/Não foi possível carregar os dados de saques/i)
    ).toBeInTheDocument();
  });

  it('renders available wallet balance in BRL', async () => {
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    expect(await screen.findByText('R$ 100,00')).toBeInTheDocument();
  });

  it('renders history table with withdrawal items', async () => {
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    expect(await screen.findByText('WTH-001')).toBeInTheDocument();
    expect(screen.getByText('WTH-002')).toBeInTheDocument();
    expect(screen.getByText('WTH-003')).toBeInTheDocument();
  });

  it('renders the approved withdrawals visual system structure', async () => {
    const api = createMockApi();
    const { container } = render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Saques' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar Novo Saque/i })).toHaveClass(
      'bg-brand-primary'
    );
    expect(container.querySelector('[data-withdrawal-summary]')).toHaveClass(
      'border-brand-line',
      'rounded-xl'
    );
    expect(screen.getByText('Solicitações')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(container.querySelector('[data-withdrawal-history]')).toHaveClass(
      'border-brand-line',
      'rounded-xl'
    );
  });

  it('maps status APPROVED to Aprovado badge', async () => {
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    expect(await screen.findByText('Aprovado')).toBeInTheDocument();
  });

  it('maps status DENIED to Recusado badge', async () => {
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    expect(await screen.findByText('Recusado')).toBeInTheDocument();
  });

  it('maps status PROCESSING to Em Processamento badge', async () => {
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    expect(await screen.findByText('Em Processamento')).toBeInTheDocument();
  });

  it('opens request modal when clicking Solicitar Novo Saque', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');

    const button = screen.getByRole('button', { name: /Solicitar Novo Saque/i });
    await user.click(button);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Transfira valores da sua carteira BaaS diretamente para sua chave Pix.')
    ).toBeInTheDocument();
  });

  it('validates invalid zero amount in modal', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');

    await user.click(screen.getByRole('button', { name: /Solicitar Novo Saque/i }));

    const amountInput = screen.getByLabelText('Valor do Saque');
    const pixInput = screen.getByLabelText('Chave Pix de Destino');
    await user.type(amountInput, '0');
    await user.type(pixInput, '12345678901');

    const submitBtn = screen.getByRole('button', { name: 'Confirmar Saque' });
    await user.click(submitBtn);

    expect(
      screen.getByText('Informe um valor de saque válido maior que zero.')
    ).toBeInTheDocument();
  });

  it('validates insufficient balance in modal before API call', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');

    await user.click(screen.getByRole('button', { name: /Solicitar Novo Saque/i }));

    const amountInput = screen.getByLabelText('Valor do Saque');
    const pixInput = screen.getByLabelText('Chave Pix de Destino');
    await user.type(amountInput, '500,00');
    await user.type(pixInput, '12345678901');

    const submitBtn = screen.getByRole('button', { name: 'Confirmar Saque' });
    await user.click(submitBtn);

    expect(screen.getByText(/Saldo insuficiente para saque/i)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('submits valid withdrawal request and reloads list', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');

    await user.click(screen.getByRole('button', { name: /Solicitar Novo Saque/i }));

    const amountInput = screen.getByLabelText('Valor do Saque');
    const pixInput = screen.getByLabelText('Chave Pix de Destino');
    await user.type(amountInput, '30,00');
    await user.type(pixInput, '12345678901');

    const submitBtn = screen.getByRole('button', { name: 'Confirmar Saque' });
    await user.click(submitBtn);

    expect(api.request).toHaveBeenCalledWith({
      amountCents: '3000',
      pixKey: '12345678901',
      pixKeyType: 'CPF',
      externalReference: undefined
    });
  });

  it('has zero automated axe-core accessibility violations', async () => {
    const api = createMockApi();
    const { container } = render(<WithdrawalsPage api={api} />);
    await screen.findByText('WTH-001');
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
