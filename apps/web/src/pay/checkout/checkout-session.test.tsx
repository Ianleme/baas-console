import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  test('creates Pix once with the payer document before showing the attempt', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'attempt-1',
      status: 'PENDING',
      amountCents: '32000',
      emv: 'PIX-CODE',
      qrCodeBase64: null,
      txid: 'txid',
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    render(
      <CheckoutSession
        api={client()}
        pixApi={{ create, status: vi.fn() }}
        fragment={`#/checkout/${token}`}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar com Pix' }));
    await userEvent.type(screen.getByLabelText('CPF ou CNPJ do pagador'), '12345678901');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar Pix' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ payerDocument: '12345678901' });
    });
    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('PIX-CODE');
  });
  test('lets the payer recover from a denied Pix without reusing the failed attempt', async () => {
    const deniedAttempt = {
      id: 'attempt-denied',
      status: 'DENIED' as const,
      amountCents: '32000',
      emv: null,
      qrCodeBase64: null,
      txid: 'txid-denied',
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    };
    const api = {
      exchange: vi.fn().mockResolvedValue({
        checkout: ready,
        csrfToken: 'memory-only',
        pixAttempt: deniedAttempt
      })
    };
    render(
      <CheckoutSession
        api={api}
        pixApi={{ create: vi.fn(), status: vi.fn() }}
        fragment={`#/checkout/${token}`}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar novo Pix' }));
    expect(screen.getByLabelText('CPF ou CNPJ do pagador')).toHaveFocus();
    expect(screen.queryByText('txid-denied')).not.toBeInTheDocument();
  });
  test('returns to method choice from a failed Pix when both methods are allowed', async () => {
    const api = {
      exchange: vi.fn().mockResolvedValue({
        checkout: ready,
        csrfToken: 'memory-only',
        pixAttempt: {
          id: 'attempt-expired',
          status: 'EXPIRED' as const,
          amountCents: '32000',
          emv: null,
          qrCodeBase64: null,
          txid: null,
          expiresAt: new Date(Date.now() - 1_000).toISOString()
        }
      })
    };
    render(
      <CheckoutSession
        api={api}
        pixApi={{ create: vi.fn(), status: vi.fn() }}
        cardApi={{ quote: vi.fn(), confirm: vi.fn() }}
        fragment={`#/checkout/${token}`}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Escolher outro método' }));
    expect(screen.getByRole('button', { name: 'Pagar com Pix' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Pagar com cartão/ })).toBeVisible();
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
