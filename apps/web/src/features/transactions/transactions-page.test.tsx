import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  TransactionsPage,
  type TransactionItem,
  type TransactionStatementApi,
  type TransactionStatementData
} from './transactions-page.js';

const mockItems: TransactionItem[] = [
  {
    id: 'tx_1',
    originType: 'PAYMENT',
    originId: 'pay_1',
    externalReference: 'REF-001',
    gatewayTransactionId: 'gw_1',
    type: 'CREDIT',
    status: 'APPROVED',
    grossAmountCents: '15000',
    feeAmountCents: '450',
    netAmountCents: '14550',
    occurredAt: '2026-08-12T10:00:00.000Z'
  },
  {
    id: 'tx_2',
    originType: 'WITHDRAWAL',
    originId: 'wth_1',
    externalReference: 'REF-002',
    gatewayTransactionId: 'gw_2',
    type: 'DEBIT',
    status: 'DENIED',
    grossAmountCents: '5000',
    feeAmountCents: '150',
    netAmountCents: '4850',
    occurredAt: '2026-08-12T11:00:00.000Z'
  },
  {
    id: 'tx_3',
    originType: 'PAYMENT',
    originId: 'pay_3',
    externalReference: 'REF-003',
    gatewayTransactionId: 'gw_3',
    type: 'CREDIT',
    status: 'PENDING',
    grossAmountCents: '20000',
    feeAmountCents: '600',
    netAmountCents: '19400',
    occurredAt: '2026-08-12T12:00:00.000Z'
  },
  {
    id: 'tx_4',
    originType: 'PAYMENT',
    originId: 'pay_4',
    externalReference: 'REF-004',
    gatewayTransactionId: 'gw_4',
    type: 'CREDIT',
    status: 'EXPIRED',
    grossAmountCents: '10000',
    feeAmountCents: '300',
    netAmountCents: '9700',
    occurredAt: '2026-08-12T13:00:00.000Z'
  },
  {
    id: 'tx_5',
    originType: 'PAYMENT',
    originId: 'pay_5',
    externalReference: 'REF-005',
    gatewayTransactionId: 'gw_5',
    type: 'CREDIT',
    status: 'CANCELLED',
    grossAmountCents: '8000',
    feeAmountCents: '240',
    netAmountCents: '7760',
    occurredAt: '2026-08-12T14:00:00.000Z'
  }
];

const mockData: TransactionStatementData = {
  items: mockItems,
  total: 5,
  stale: false,
  capturedAt: '2026-08-12T14:30:00.000Z'
};

function createMockApi(data: TransactionStatementData = mockData): TransactionStatementApi {
  return {
    list: vi.fn().mockResolvedValue(data)
  };
}

describe('TransactionsPage', () => {
  it('renders loading state initially', () => {
    const api: TransactionStatementApi = { list: () => new Promise(() => undefined) };
    render(<TransactionsPage api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando extrato de transações');
  });

  it('renders error message on API failure', async () => {
    const api: TransactionStatementApi = {
      list: vi.fn().mockRejectedValue(new Error('API Error'))
    };
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText(/Não foi possível carregar o extrato/i)).toBeInTheDocument();
  });

  it('renders table columns and rows when API resolves', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('REF-001')).toBeInTheDocument();
    expect(screen.getByText('REF-002')).toBeInTheDocument();
  });

  it('maps APPROVED status to Aprovada badge', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('Aprovada')).toBeInTheDocument();
  });

  it('maps DENIED status to Negada badge', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('Negada')).toBeInTheDocument();
  });

  it('maps PENDING status to Pendente badge', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('Pendente')).toBeInTheDocument();
  });

  it('maps EXPIRED status to Expirada badge', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('Expirada')).toBeInTheDocument();
  });

  it('maps CANCELLED status to Cancelada badge', async () => {
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  });

  it('filters by reference search input', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    await screen.findByText('REF-001');

    const input = screen.getByLabelText('Buscar por referência');
    await user.type(input, '001');

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ reference: '001' }));
  });

  it('filters by status select dropdown', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    await screen.findByText('REF-001');

    const select = screen.getByLabelText('Filtrar por status');
    await user.selectOptions(select, 'APPROVED');

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }));
  });

  it('filters by type select dropdown', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    await screen.findByText('REF-001');

    const select = screen.getByLabelText('Filtrar por tipo');
    await user.selectOptions(select, 'CREDIT');

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'CREDIT' }));
  });

  it('filters by origin select dropdown', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    render(<TransactionsPage api={api} />);
    await screen.findByText('REF-001');

    const select = screen.getByLabelText('Filtrar por origem');
    await user.selectOptions(select, 'PAYMENT');

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ originType: 'PAYMENT' }));
  });

  it('has no automated axe-core accessibility violations', async () => {
    const api = createMockApi();
    const { container } = render(<TransactionsPage api={api} />);
    await screen.findByText('REF-001');
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
