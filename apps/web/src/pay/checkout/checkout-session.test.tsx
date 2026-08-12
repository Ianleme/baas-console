import { render, screen, waitFor } from '@testing-library/react';
import type { PublicCheckoutView } from '@baas/api-client';

import { CheckoutSession, type CheckoutExchangeApi } from './checkout-session.js';

const ready: PublicCheckoutView = {
  id: 'link-1',
  description: 'Pedido sandbox',
  amountCents: '32000',
  methods: 'PIX_CARD' as const,
  maxInstallments: 3,
  state: 'READY' as const
};
function client(checkout = ready): CheckoutExchangeApi {
  return { exchange: vi.fn().mockResolvedValue({ checkout, csrfToken: 'memory-only' }) };
}
const token = Buffer.alloc(32, 7).toString('base64url');

describe('CheckoutSession', () => {
  test('removes the fragment token before exchange resolves', async () => {
    const api = { exchange: vi.fn(() => new Promise<never>(() => undefined)) };
    globalThis.history.replaceState(null, '', `/pay.html#/checkout/${token}`);
    render(<CheckoutSession api={api} fragment={`#/checkout/${token}`} />);
    expect(globalThis.location.hash).toBe('');
    await waitFor(() => {
      expect(api.exchange).toHaveBeenCalledWith(token);
    });
  });
  test('exchanges the public token only once across rerenders', async () => {
    const api = client();
    const { rerender } = render(<CheckoutSession api={api} fragment={`#/checkout/${token}`} />);
    rerender(<CheckoutSession api={api} fragment={`#/checkout/${token}`} />);
    await waitFor(() => {
      expect(api.exchange).toHaveBeenCalledTimes(1);
    });
  });
  test('shows integer cents as BRL and allowed methods', async () => {
    render(<CheckoutSession api={client()} fragment={`#/checkout/${token}`} />);
    expect(await screen.findByText('R$ 320,00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pagar com Pix' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Pagar com cartão · até 3x/ })).toBeVisible();
  });
  test('maps an invalid token to a generic unavailable view', async () => {
    render(<CheckoutSession api={client()} fragment="#/checkout/short" />);
    expect(await screen.findByRole('heading', { name: 'Link indisponível' })).toBeVisible();
  });
  test.each([
    ['EXPIRED', 'Link expirado'],
    ['PAID', 'Pagamento já concluído'],
    ['CANCELLED', 'Link cancelado']
  ] as const)('maps %s without internal identifiers', async (state, label) => {
    render(<CheckoutSession api={client({ ...ready, state })} fragment={`#/checkout/${token}`} />);
    expect(await screen.findByRole('heading', { name: label })).toBeVisible();
    expect(screen.queryByText('link-1')).not.toBeInTheDocument();
  });
  test('never renders raw exchange errors', async () => {
    const api = { exchange: vi.fn().mockRejectedValue(new Error('database row secret')) };
    render(<CheckoutSession api={api} fragment={`#/checkout/${token}`} />);
    expect(await screen.findByText('Link indisponível')).toBeVisible();
    expect(screen.queryByText('database row secret')).not.toBeInTheDocument();
  });
});
