import axe from 'axe-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PaymentLinks, type PaymentLinksApi, type PaymentLinkView } from './payment-links.js';

const active: PaymentLinkView = {
  id: 'link-1',
  reference: 'REF-2026-01048',
  description: 'Pedido #1048',
  amountCents: '32000',
  methods: 'PIX',
  maxInstallments: 1,
  selectedFeeBps: null,
  status: 'ACTIVE',
  expiresAt: '2026-08-15T18:18:00.000Z'
};
const paid: PaymentLinkView = {
  ...active,
  id: 'link-2',
  reference: 'REF-2026-01047',
  description: 'Consultoria mensal',
  amountCents: '125000',
  methods: 'CARD',
  maxInstallments: 3,
  selectedFeeBps: 299,
  status: 'PAID'
};

function client(overrides: Partial<PaymentLinksApi> = {}): PaymentLinksApi {
  return {
    list: vi.fn().mockResolvedValue([active, paid]),
    create: vi.fn().mockResolvedValue({ ...active, id: 'link-3' }),
    cancel: vi.fn().mockResolvedValue({ ...active, status: 'CANCELLED' }),
    ...overrides
  };
}

async function renderReady(api = client()) {
  render(<PaymentLinks api={api} />);
  await screen.findByText('Pedido #1048');
  return api;
}

describe('PaymentLinks', () => {
  test('shows a deterministic loading state', () => {
    render(<PaymentLinks api={client({ list: () => new Promise(() => undefined) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando links');
  });
  test('shows a safe list failure', async () => {
    render(<PaymentLinks api={client({ list: vi.fn().mockRejectedValue(new Error('raw')) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.queryByText('raw')).not.toBeInTheDocument();
  });
  test('shows an explicit empty state', async () => {
    render(<PaymentLinks api={client({ list: vi.fn().mockResolvedValue([]) })} />);
    expect(await screen.findByText('Nenhum link encontrado.')).toBeVisible();
  });
  test('renders the dense financial table columns', async () => {
    await renderReady();
    for (const column of ['Link', 'Método', 'Valor', 'Expiração', 'Status', 'Ações'])
      expect(screen.getByRole('columnheader', { name: column })).toBeVisible();
  });
  test('renders explicit active and paid statuses', async () => {
    await renderReady();
    expect(screen.getByText('Ativo')).toBeVisible();
    expect(screen.getByText('Pago')).toBeVisible();
  });
  test('renders values as BRL from integer cents', async () => {
    await renderReady();
    expect(screen.getByText('R$ 320,00')).toBeVisible();
    expect(screen.getAllByText('R$ 1.250,00')).toHaveLength(2);
  });
  test('summarizes active and paid links without pending inflation', async () => {
    await renderReady();
    const summary = screen.getByRole('region', { name: 'Resumo dos links' });
    expect(within(summary).getByText('Links ativos').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Pagamentos concluídos').nextSibling).toHaveTextContent('1');
  });
  test('searches by description', async () => {
    await renderReady();
    await userEvent.type(
      screen.getByPlaceholderText('Buscar por descrição ou referência'),
      'consultoria'
    );
    expect(screen.queryByText('Pedido #1048')).not.toBeInTheDocument();
    expect(screen.getByText('Consultoria mensal')).toBeVisible();
  });
  test('searches by reference case-insensitively', async () => {
    await renderReady();
    await userEvent.type(
      screen.getByPlaceholderText('Buscar por descrição ou referência'),
      'ref-2026-01048'
    );
    expect(screen.getByText('Pedido #1048')).toBeVisible();
    expect(screen.queryByText('Consultoria mensal')).not.toBeInTheDocument();
  });
  test('filters by status', async () => {
    const user = userEvent.setup();
    await renderReady();
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por status' });
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Pagos' });
    await user.click(option);
    await waitFor(() => {
      expect(screen.getByText('Consultoria mensal')).toBeVisible();
      expect(screen.queryByText('Pedido #1048')).not.toBeInTheDocument();
    });
  });
  test('filters by method', async () => {
    const user = userEvent.setup();
    await renderReady();
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por método' });
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Pix' });
    await user.click(option);
    await waitFor(() => {
      expect(screen.getByText('Pedido #1048')).toBeVisible();
      expect(screen.queryByText('Consultoria mensal')).not.toBeInTheDocument();
    });
  });
  test('opens the creation form from the primary action', async () => {
    await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    expect(screen.getByRole('form', { name: 'Criar link de pagamento' })).toBeVisible();
  });
  test('submits exact integer cents and selected fee', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    const form = screen.getByRole('form', { name: 'Criar link de pagamento' });
    fireEvent.change(within(form).getByLabelText('Descrição'), { target: { value: 'Pedido' } });
    fireEvent.change(within(form).getByLabelText('Referência'), { target: { value: 'REF-3' } });
    fireEvent.change(within(form).getByLabelText('Valor em centavos'), {
      target: { value: '32000' }
    });
    fireEvent.change(within(form).getByLabelText('Taxa selecionada (basis points)'), {
      target: { value: '299' }
    });
    fireEvent.change(within(form).getByLabelText('Expiração'), {
      target: { value: '2026-08-20T10:00' }
    });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: '32000', selectedFeeBps: 299 })
      );
    });
  });
  test('opens detail with selected fee and installments', async () => {
    await renderReady();
    const buttons = screen.getAllByRole('button', { name: 'Ver detalhes' });
    const paidDetail = buttons.at(1);
    if (!paidDetail) throw new Error('PAID_DETAIL_ACTION_MISSING');
    await userEvent.click(paidDetail);
    expect(screen.getByRole('dialog', { name: 'Detalhes do link' })).toHaveTextContent('2.99%');
    expect(screen.getByRole('dialog', { name: 'Detalhes do link' })).toHaveTextContent('Até 3x');
  });
  test('asks confirmation before destructive cancellation', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Cancelar link?' })).toHaveTextContent(
      'não pode ser desfeita'
    );
  });
  test('cancels only after explicit confirmation', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => {
      expect(api.cancel).toHaveBeenCalledWith('link-1');
    });
    expect(await screen.findByText('Link cancelado.')).toBeVisible();
  });
  test('keeps the backend state when cancellation fails', async () => {
    await renderReady(client({ cancel: vi.fn().mockRejectedValue(new Error('raw secret')) }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    expect(await screen.findByText('Não foi possível cancelar o link.')).toBeVisible();
    expect(screen.getByText('Ativo')).toBeVisible();
  });
  test('supports keyboard access to filters and primary action', async () => {
    await renderReady();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: '+ Criar link de pagamento' })).toHaveFocus();
    await user.tab();
    expect(screen.getByPlaceholderText('Buscar por descrição ou referência')).toHaveFocus();
  });
  test('opens email modal and submits recipient email', async () => {
    const sendEmailMock = vi.fn().mockResolvedValue({
      deliveryId: 'del-1',
      status: 'QUEUED',
      recipientMasked: 'c***@loja.com'
    });
    const api = client({ sendEmail: sendEmailMock });
    await renderReady(api);
    const buttons = screen.getAllByRole('button', { name: 'Enviar por e-mail' });
    const firstBtn = buttons[0];
    if (!firstBtn) throw new Error('EMAIL_BTN_MISSING');
    await userEvent.click(firstBtn);
    expect(screen.getByRole('dialog', { name: 'Enviar link por e-mail' })).toBeVisible();
    const form = screen.getByRole('form', { name: 'Enviar link por e-mail' });
    fireEvent.change(within(form).getByLabelText('E-mail do destinatário'), {
      target: { value: 'cliente@loja.com' }
    });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(sendEmailMock).toHaveBeenCalledWith('link-1', 'cliente@loja.com');
    });
    expect(
      await screen.findByText('E-mail enfileirado com sucesso para c***@loja.com.')
    ).toBeVisible();
  });
  test('has no automated axe violations in the populated state', async () => {
    const { container } = render(<PaymentLinks api={client()} />);
    await screen.findByText('Pedido #1048');
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
