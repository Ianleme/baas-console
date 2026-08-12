import axe from 'axe-core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  WebhookManagement,
  type WebhookManagementApi,
  type WebhookView
} from './webhook-management.js';

const active: WebhookView = {
  event: 'PAYMENT_PIX',
  status: 'ACTIVE',
  configuredAt: '2026-08-12T14:00:00.000Z',
  lastReceivedAt: '2026-08-12T14:10:00.000Z'
};

function client(overrides: Partial<WebhookManagementApi> = {}): WebhookManagementApi {
  return {
    list: vi.fn().mockResolvedValue([active]),
    configure: vi
      .fn()
      .mockImplementation((event: WebhookView['event']) => Promise.resolve({ ...active, event })),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

async function renderReady(api = client()) {
  render(<WebhookManagement api={api} />);
  await screen.findByRole('heading', { name: 'Pagamentos Pix' });
  return api;
}

describe('WebhookManagement', () => {
  test('shows a deterministic loading state', () => {
    render(<WebhookManagement api={client({ list: () => new Promise(() => undefined) })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando webhooks');
  });

  test('shows a safe loading failure without raw error detail', async () => {
    render(
      <WebhookManagement api={client({ list: vi.fn().mockRejectedValue(new Error('secret')) })} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  test('shows explicit empty guidance', async () => {
    await renderReady(client({ list: vi.fn().mockResolvedValue([]) }));
    expect(screen.getByText(/Nenhum webhook configurado/u)).toBeVisible();
  });

  test.each([
    ['Pagamentos Pix', 'Confirmações e negativas de Pix.'],
    ['Pagamentos com cartão', 'Resultados finais do cartão.'],
    ['Saques', 'Atualizações de solicitações de saque.']
  ])('renders mandatory event %s', async (title, detail) => {
    await renderReady();
    const card = screen.getByRole('heading', { name: title }).closest('article');
    if (!card) throw new Error('WEBHOOK_CARD_MISSING');
    expect(within(card).getByText(detail)).toBeVisible();
  });

  test('renders active and not-configured statuses honestly', async () => {
    await renderReady();
    expect(screen.getByText('Ativo')).toBeVisible();
    expect(screen.getAllByText('Não configurado')).toHaveLength(2);
  });

  test('renders configuration and last-event timestamps', async () => {
    await renderReady();
    expect(screen.getByText('12/08/2026, 14:00')).toBeVisible();
    expect(screen.getByText('12/08/2026, 14:10')).toBeVisible();
  });

  test('never renders a secret returned accidentally by the API', async () => {
    await renderReady(
      client({ list: vi.fn().mockResolvedValue([{ ...active, secret: 'must-not-render' }]) })
    );
    expect(document.body.textContent).not.toContain('must-not-render');
  });

  test('configures a missing event directly', async () => {
    const api = await renderReady();
    const buttons = screen.getAllByRole('button', { name: 'Configurar webhook' });
    const cardButton = buttons[0];
    if (!cardButton) throw new Error('CONFIGURE_ACTION_MISSING');
    await userEvent.click(cardButton);
    await waitFor(() => {
      expect(api.configure).toHaveBeenCalledWith('PAYMENT_CARD');
    });
    expect(await screen.findByText(/segredo não será exibido/u)).toBeVisible();
  });

  test('shows a safe configuration failure', async () => {
    await renderReady(client({ configure: vi.fn().mockRejectedValue(new Error('raw')) }));
    const button = screen.getAllByRole('button', { name: 'Configurar webhook' })[0];
    if (!button) throw new Error('CONFIGURE_ACTION_MISSING');
    await userEvent.click(button);
    expect(
      await screen.findByText('Não foi possível configurar o webhook. Tente novamente.')
    ).toBeVisible();
    expect(screen.queryByText('raw')).not.toBeInTheDocument();
  });

  test('asks confirmation before reconfiguration', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
    expect(api.configure).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Reconfigurar webhook?' })).toHaveTextContent(
      'segredo atuais serão substituídos'
    );
  });

  test('reconfigures only after explicit confirmation', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Reconfigurar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reconfiguração' }));
    await waitFor(() => {
      expect(api.configure).toHaveBeenCalledWith('PAYMENT_PIX');
    });
  });

  test('asks confirmation before removal', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Remover webhook?' })).toBeVisible();
  });

  test('removes only after explicit confirmation', async () => {
    const api = await renderReady();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => {
      expect(api.remove).toHaveBeenCalledWith('PAYMENT_PIX');
    });
    expect(await screen.findByText('Webhook removido.')).toBeVisible();
  });

  test('preserves the active view when removal fails', async () => {
    await renderReady(client({ remove: vi.fn().mockRejectedValue(new Error('raw')) }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText(/configuração foi preservada/u)).toBeVisible();
    expect(screen.getByText('Ativo')).toBeVisible();
  });

  test('supports keyboard navigation to card actions', async () => {
    await renderReady();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Reconfigurar' })).toHaveFocus();
  });

  test('has no automated axe violations in populated state', async () => {
    const { container } = render(<WebhookManagement api={client()} />);
    await screen.findByRole('heading', { name: 'Pagamentos Pix' });
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
