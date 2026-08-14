import axe from 'axe-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  PaymentLinks,
  type PaymentLinkListData,
  type PaymentLinkListQuery,
  type PaymentLinksApi,
  type PaymentLinkView
} from './payment-links.js';

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
    list: listRows([active, paid]),
    detail: vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve(id === paid.id ? paid : active)),
    share: vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve({ publicToken: `token-${id}` })),
    create: vi.fn().mockResolvedValue({ ...active, id: 'link-3', publicToken: 'token-link-3' }),
    cancel: vi.fn().mockResolvedValue({ ...active, status: 'CANCELLED' }),
    sendEmail: vi.fn().mockResolvedValue({
      deliveryId: 'del-default',
      status: 'QUEUED',
      recipientMasked: 'c***@example.com'
    }),
    ...overrides
  };
}

function page(items: PaymentLinkView[], total = items.length): PaymentLinkListData {
  return {
    items,
    total,
    summary: {
      totalCount: total,
      activeCount: items.filter((link) => link.status === 'ACTIVE').length,
      paidCount: items.filter((link) => link.status === 'PAID').length,
      paidAmountCents: items
        .filter((link) => link.status === 'PAID')
        .reduce((sum, link) => sum + BigInt(link.amountCents), 0n)
        .toString()
    }
  };
}

function listRows(rows: PaymentLinkView[]) {
  return vi.fn().mockImplementation((query: PaymentLinkListQuery) => {
    const filtered = rows.filter((link) => {
      const text = `${link.description} ${link.reference}`.toLocaleLowerCase('pt-BR');
      return (
        (!query.search || text.includes(query.search.toLocaleLowerCase('pt-BR'))) &&
        (!query.status || link.status === query.status) &&
        (!query.method || link.methods === query.method) &&
        (!query.from || !link.createdAt || link.createdAt >= query.from) &&
        (!query.to || !link.createdAt || link.createdAt <= query.to)
      );
    });
    return Promise.resolve(
      page(filtered.slice(query.offset, query.offset + query.limit), filtered.length)
    );
  });
}

async function renderReady(api = client()) {
  render(<PaymentLinks api={api} />);
  await screen.findAllByText('Pedido #1048');
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
    render(<PaymentLinks api={client({ list: vi.fn().mockResolvedValue(page([])) })} />);
    expect(await screen.findByText('Nenhum link encontrado.')).toBeVisible();
  });
  test('renders the dense financial table columns', async () => {
    await renderReady();
    for (const column of ['Link', 'Método', 'Valor', 'Expiração', 'Status', 'Ações'])
      expect(screen.getByRole('columnheader', { name: column })).toBeVisible();
  });
  test('renders explicit active and paid statuses', async () => {
    await renderReady();
    expect(screen.getAllByText('Ativo')[0]).toBeVisible();
    expect(screen.getAllByText('Pago')[0]).toBeVisible();
  });
  test('renders values as BRL from integer cents', async () => {
    await renderReady();
    expect(screen.getAllByText('R$ 320,00')[0]).toBeVisible();
    expect(screen.getAllByText('R$ 1.250,00')).toHaveLength(3);
  });
  test('summarizes active and paid links without pending inflation', async () => {
    await renderReady();
    const summary = screen.getByRole('region', { name: 'Resumo dos links' });
    expect(within(summary).getByText('Links ativos').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Pagamentos concluídos').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('100%')).toBeVisible();
    expect(within(summary).getByText(/Pagos ÷ links finalizados/iu)).toBeVisible();
  });
  test('searches by description', async () => {
    const api = await renderReady();
    await userEvent.type(
      screen.getByPlaceholderText('Buscar por descrição ou referência'),
      'consultoria'
    );
    expect(api.list).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'consultoria' }));
      expect(screen.queryByText('Pedido #1048')).not.toBeInTheDocument();
      expect(screen.getAllByText('Consultoria mensal')[0]).toBeVisible();
    });
  });
  test('searches by reference case-insensitively', async () => {
    const api = await renderReady();
    await userEvent.type(
      screen.getByPlaceholderText('Buscar por descrição ou referência'),
      'ref-2026-01048'
    );
    await waitFor(() => {
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ref-2026-01048' })
      );
      expect(screen.getAllByText('Pedido #1048')[0]).toBeVisible();
      expect(screen.queryByText('Consultoria mensal')).not.toBeInTheDocument();
    });
  });
  test('filters by status', async () => {
    const user = userEvent.setup();
    await renderReady();
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por status' });
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Pagos' });
    await user.click(option);
    await waitFor(() => {
      expect(screen.getAllByText('Consultoria mensal')[0]).toBeVisible();
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
      expect(screen.getAllByText('Pedido #1048')[0]).toBeVisible();
      expect(screen.queryByText('Consultoria mensal')).not.toBeInTheDocument();
    });
  });
  test('opens the creation form from the primary action', async () => {
    await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    expect(screen.getByRole('form', { name: 'Criar link de pagamento' })).toBeVisible();
  });
  test('CHK-03 converts a BRL amount to exact integer cents without exposing basis points', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    const form = screen.getByRole('form', { name: 'Criar link de pagamento' });
    fireEvent.change(within(form).getByLabelText('Descrição'), { target: { value: 'Pedido' } });
    fireEvent.change(within(form).getByLabelText('Referência'), { target: { value: 'REF-3' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /^Valor da cobrança/iu }), {
      target: { value: 'R$ 320,00' }
    });
    expect(within(form).queryByText(/basis points/iu)).not.toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: '32000',
          methods: 'PIX',
          maxInstallments: 1,
          selectedFeeBps: null
        })
      );
    });
  });
  test('CHK-05 shows installments and automatic gateway fee guidance only for card', async () => {
    await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    const form = screen.getByRole('form', { name: 'Criar link de pagamento' });
    expect(
      within(form).queryByRole('combobox', { name: 'Máximo de parcelas' })
    ).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: /CartãoCrédito parcelado/iu }));
    expect(within(form).getByRole('combobox', { name: 'Máximo de parcelas' })).toBeVisible();
    expect(
      within(form).getByText(/taxa correspondente será consultada no gateway/iu)
    ).toBeVisible();
  });
  test('CHK-08 offers expiration presets and a custom date', async () => {
    await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    const form = screen.getByRole('form', { name: 'Criar link de pagamento' });
    for (const name of ['24 horas', '3 dias', '7 dias', 'Personalizada']) {
      expect(within(form).getByRole('button', { name })).toBeVisible();
    }
    await userEvent.click(within(form).getByRole('button', { name: 'Personalizada' }));
    expect(within(form).getByLabelText('Data e hora de expiração')).toBeVisible();
  });
  test('opens detail with selected fee and installments', async () => {
    await renderReady();
    const buttons = screen.getAllByRole('button', { name: 'Ver detalhes' });
    const paidDetail = buttons.at(1);
    if (!paidDetail) throw new Error('PAID_DETAIL_ACTION_MISSING');
    await userEvent.click(paidDetail);
    expect(await screen.findByRole('dialog', { name: 'Detalhes do link' })).toHaveTextContent(
      '2.99%'
    );
    expect(screen.getByRole('dialog', { name: 'Detalhes do link' })).toHaveTextContent('Até 3x');
  });
  test('asks confirmation before destructive cancellation', async () => {
    const api = await renderReady();
    const [cancelBtn] = screen.getAllByRole('button', { name: 'Cancelar link' });
    expect(cancelBtn).toBeDefined();
    if (cancelBtn) await userEvent.click(cancelBtn as Element);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Cancelar link?' })).toHaveTextContent(
      'não poderá ser desfeita'
    );
  });
  test('cancels only after explicit confirmation', async () => {
    const api = await renderReady();
    const [cancelBtn] = screen.getAllByRole('button', { name: 'Cancelar link' });
    expect(cancelBtn).toBeDefined();
    if (cancelBtn) await userEvent.click(cancelBtn as Element);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => {
      expect(api.cancel).toHaveBeenCalledWith('link-1');
    });
    expect(await screen.findByText('Link cancelado. O histórico foi preservado.')).toBeVisible();
  });
  test('keeps the backend state when cancellation fails', async () => {
    await renderReady(client({ cancel: vi.fn().mockRejectedValue(new Error('raw secret')) }));
    const [cancelBtn] = screen.getAllByRole('button', { name: 'Cancelar link' });
    expect(cancelBtn).toBeDefined();
    if (cancelBtn) await userEvent.click(cancelBtn as Element);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    expect(await screen.findByText('Não foi possível cancelar o link.')).toBeVisible();
    expect(screen.getAllByText('Ativo')[0]).toBeVisible();
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
  test('CHK-10 presents the created checkout URL with copy, open and email actions', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: '+ Criar link de pagamento' }));
    const form = screen.getByRole('form', { name: 'Criar link de pagamento' });
    fireEvent.change(within(form).getByLabelText('Descrição'), { target: { value: 'Pedido' } });
    fireEvent.change(within(form).getByLabelText('Referência'), { target: { value: 'REF-3' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /^Valor da cobrança/iu }), {
      target: { value: '10,50' }
    });
    fireEvent.submit(form);

    const success = await screen.findByRole('dialog', { name: 'Link criado com sucesso' });
    expect(within(success).getByDisplayValue(/pay\.html#\/checkout\/token-link-3/u)).toBeVisible();
    expect(within(success).getByRole('button', { name: 'Copiar link' })).toBeVisible();
    expect(within(success).getByRole('button', { name: 'Abrir checkout' })).toBeVisible();
    expect(within(success).getByRole('button', { name: 'Enviar por e-mail' })).toBeVisible();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ amountCents: '1050' }));
  });
  test('CHK-10 issues a list item token through the authenticated share boundary before copying', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const api = await renderReady();
    const [copyBtn] = screen.getAllByRole('button', { name: 'Copiar link' });
    expect(copyBtn).toBeDefined();
    if (copyBtn) await userEvent.click(copyBtn as Element);

    await waitFor(() => {
      expect(api.share).toHaveBeenCalledWith('link-1');
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('token-link-1'));
    });
  });
  test('requests a fresh share boundary result every time instead of reusing a consumed token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const share = vi
      .fn()
      .mockResolvedValueOnce({ publicToken: 'first-token' })
      .mockResolvedValueOnce({ publicToken: 'rotated-token' });
    const api = await renderReady(client({ share }));
    const [copy] = screen.getAllByRole('button', { name: 'Copiar link' });
    expect(copy).toBeDefined();
    if (copy) await userEvent.click(copy as Element);
    await waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('first-token'));
    });
    if (copy) await userEvent.click(copy as Element);

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(2);
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('rotated-token'));
    });
    expect(api.share).toBe(share);
  });
  test('UI-07 renders a card-oriented mobile representation without horizontal table dependency', async () => {
    await renderReady();
    const cards = screen.getByRole('region', { name: 'Links em cartões' });
    expect(within(cards).getAllByText('Pedido #1048')[0]).toBeVisible();
    expect(within(cards).getAllByRole('button', { name: 'Copiar link' })[0]).toBeVisible();
  });
  test('filters the loaded links by the selected real creation period', async () => {
    const recent = { ...active, createdAt: new Date().toISOString() };
    const old = { ...paid, createdAt: '2020-01-01T00:00:00.000Z' };
    const list = listRows([recent, old]);
    await renderReady(client({ list }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por período' }));
    await user.click(await screen.findByRole('option', { name: 'Últimos 7 dias' }));
    await waitFor(() => {
      const lastQuery = list.mock.calls.at(-1)?.[0] as PaymentLinkListQuery | undefined;
      expect(typeof lastQuery?.from).toBe('string');
      expect(typeof lastQuery?.to).toBe('string');
      expect(screen.getAllByText('Pedido #1048')[0]).toBeVisible();
      expect(screen.queryByText('Consultoria mensal')).not.toBeInTheDocument();
    });
  });
  test('paginates the table server-side with ten links per page', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      ...active,
      id: `link-${String(index + 1)}`,
      reference: `REF-${String(index + 1)}`,
      description: `Pedido ${String(index + 1)}`
    }));
    const list = listRows(rows);
    render(<PaymentLinks api={client({ list })} />);
    await screen.findAllByText('Pedido 1');

    expect(screen.getByText('Página 1 de 3')).toBeVisible();
    expect(screen.getByText('Exibindo 1–10 de 21 links')).toBeVisible();
    expect(screen.getByRole('button', { name: /Anterior/iu })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Próxima/iu }));

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 10 }));
      expect(screen.getByText('Página 2 de 3')).toBeVisible();
    });
    await userEvent.click(screen.getByRole('button', { name: /Próxima/iu }));
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
      expect(screen.getByText('Página 3 de 3')).toBeVisible();
      expect(screen.getByText('Exibindo 21–21 de 21 links')).toBeVisible();
      expect(screen.getByRole('button', { name: /Próxima/iu })).toBeDisabled();
    });
  });
  test('has no automated axe violations in the populated state', async () => {
    const { container } = render(<PaymentLinks api={client()} />);
    await screen.findAllByText('Pedido #1048');
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
