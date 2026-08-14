import axe from 'axe-core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PixCheckout, type PixCheckoutApi, type PixCheckoutAttempt } from './pix-checkout.js';
const pending: PixCheckoutAttempt = {
  id: 'attempt-1',
  status: 'PENDING',
  amountCents: '32000',
  emv: '000201PIX-CODE',
  qrCodeBase64: 'cWItZml4dHVyZQ==',
  txid: 'txid-sandbox',
  expiresAt: new Date(Date.now() + 300000).toISOString()
};
function api(result = pending): PixCheckoutApi {
  return { status: vi.fn().mockResolvedValue(result) };
}
describe('PixCheckout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  test('shows the sandbox warning prominently', () => {
    render(<PixCheckout initial={pending} api={api()} />);
    expect(screen.getByRole('note')).toHaveTextContent('Ambiente de teste');
  });
  test('formats exact integer cents', () => {
    render(<PixCheckout initial={pending} api={api()} />);
    expect(screen.getByText('R$ 320,00')).toBeVisible();
  });
  test('provides textual QR alternative', () => {
    render(<PixCheckout initial={pending} api={api()} />);
    expect(screen.getByRole('img', { name: 'QR Code Pix para pagamento sandbox' })).toHaveAttribute(
      'src',
      'data:image/png;base64,cWItZml4dHVyZQ=='
    );
    expect(screen.getByText(/Escaneie o QR Code ou copie/)).toBeVisible();
  });
  test('does not duplicate a data URI prefix returned by the gateway', () => {
    const dataUri = 'data:image/png;base64,cWItZml4dHVyZQ==';
    render(<PixCheckout initial={{ ...pending, qrCodeBase64: dataUri }} api={api()} />);
    expect(screen.getByRole('img', { name: /QR Code Pix/ })).toHaveAttribute('src', dataUri);
  });
  test('renders EMV as read-only text', () => {
    render(<PixCheckout initial={pending} api={api()} />);
    expect(screen.getByLabelText('Código Pix copia e cola')).toHaveValue('000201PIX-CODE');
    expect(screen.getByLabelText('Código Pix copia e cola')).toHaveAttribute('readonly');
  });
  test('copies EMV and confirms accessibly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<PixCheckout initial={pending} api={api()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar código Pix' }));
    expect(writeText).toHaveBeenCalledWith('000201PIX-CODE');
    expect(screen.getByRole('status')).toHaveTextContent('Código copiado');
  });
  test('shows txid without relying on QR', () => {
    render(<PixCheckout initial={{ ...pending, qrCodeBase64: null }} api={api()} />);
    expect(screen.getByText('txid-sandbox')).toBeVisible();
  });
  test('shows an accessible countdown', () => {
    render(<PixCheckout initial={pending} api={api()} />);
    expect(screen.getByRole('timer')).toHaveTextContent(/Tempo restante: \d{2}:\d{2}/);
  });
  test('polls status without creating another Pix', async () => {
    vi.useFakeTimers();
    const client = api();
    render(<PixCheckout initial={pending} api={client} pollMs={1000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(client.status).toHaveBeenCalledWith('attempt-1');
    expect(client.status).toHaveBeenCalledTimes(1);
  });
  test('stops polling after approval', async () => {
    vi.useFakeTimers();
    const client = api({ ...pending, status: 'APPROVED' });
    render(<PixCheckout initial={pending} api={client} pollMs={1000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('heading', { name: 'Pix confirmado' })).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(client.status).toHaveBeenCalledTimes(1);
  });
  test('shows reconciliation without optimistic confirmation', () => {
    render(
      <PixCheckout
        initial={{ ...pending, status: 'RECONCILIATION_PENDING' }}
        api={api()}
        onRetry={vi.fn()}
        onChooseMethod={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Aguarde a conciliação');
    expect(screen.queryByText('Pagamento confirmado.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo Pix|outro método/ })).not.toBeInTheDocument();
  });
  test.each([
    ['APPROVED', 'Pix confirmado'],
    ['DENIED', 'Pagamento não aprovado'],
    ['EXPIRED', 'Código Pix expirado']
  ] as const)('shows honest %s outcome', (status, label) => {
    render(<PixCheckout initial={{ ...pending, status }} api={api()} />);
    expect(screen.getByRole('heading')).toHaveTextContent(label);
  });
  test('does not render QR or copy controls after a final outcome', () => {
    render(<PixCheckout initial={{ ...pending, status: 'APPROVED' }} api={api()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar código Pix' })).not.toBeInTheDocument();
  });
  test('renders approval as a terminal receipt', () => {
    render(
      <PixCheckout initial={{ ...pending, status: 'APPROVED' }} api={api()} onRetry={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Pix confirmado' })).toBeVisible();
    expect(screen.getByText('txid-sandbox')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  test.each(['DENIED', 'EXPIRED'] as const)(
    'offers a controlled retry after %s',
    async (status) => {
      const onRetry = vi.fn();
      const onChooseMethod = vi.fn();
      render(
        <PixCheckout
          initial={{ ...pending, status }}
          api={api()}
          onRetry={onRetry}
          onChooseMethod={onChooseMethod}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Gerar novo Pix' }));
      await userEvent.click(screen.getByRole('button', { name: 'Escolher outro método' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onChooseMethod).toHaveBeenCalledTimes(1);
    }
  );
  test('remains useful when gateway omits QR and EMV', () => {
    render(<PixCheckout initial={{ ...pending, qrCodeBase64: null, emv: null }} api={api()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Aguardando confirmação');
    expect(screen.getByText('txid-sandbox')).toBeVisible();
  });
  test('supports keyboard copy interaction', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    render(<PixCheckout initial={pending} api={api()} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('Código Pix copia e cola')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copiar código Pix' })).toHaveFocus();
  });
  test('has no automated axe violations', async () => {
    const { container } = render(<PixCheckout initial={pending} api={api()} />);
    await waitFor(() => {
      expect(container.querySelector('img')).not.toBeNull();
    });
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });
});
