import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { createDeferred } from '../../test/test-utils.js';
import { WalletPage, type WalletApi } from './wallet-page.js';

describe('WalletPage', () => {
  test('shows loading accessibly before the snapshot resolves', async () => {
    const deferred = createDeferred<Awaited<ReturnType<WalletApi['load']>>>();
    render(<WalletPage api={{ load: () => deferred.promise }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando carteira');
    act(() => {
      deferred.resolve({ balanceCents: '0', capturedAt: null, stale: false });
    });
  });

  test('shows balance, availability, UTC capture, source and current state', async () => {
    const { container } = render(
      <WalletPage
        api={{
          load: () =>
            Promise.resolve({
              balanceCents: '12345',
              availableCents: '10000',
              capturedAt: '2026-08-13T12:30:00Z',
              stale: false,
              source: 'Lera Box'
            })
        }}
      />
    );
    expect(await screen.findByText('R$ 123,45')).toBeVisible();
    expect(screen.getByText('R$ 100,00')).toBeVisible();
    expect(screen.getByText(/13\/08\/2026, 09:30/)).toBeVisible();
    expect(screen.getByText('Lera Box')).toBeVisible();
    expect(screen.getByText('Atual')).toBeVisible();
    expect(container.querySelector('[data-wallet-summary]')).toHaveClass(
      'rounded-xl',
      'border-brand-line'
    );
    expect(
      container.querySelector('[data-wallet-summary] .bg-brand-primary-dark')
    ).toBeInTheDocument();
    expect(container.querySelector('[data-wallet-sync]')).toHaveClass(
      'rounded-xl',
      'border-brand-line',
      'bg-brand-panel'
    );
  });

  test('retains stale values and gives an explicit stale notice', async () => {
    const { container } = render(
      <WalletPage
        api={{
          load: () =>
            Promise.resolve({
              balanceCents: '9900',
              capturedAt: '2026-08-12T10:00:00Z',
              stale: true,
              source: 'cache'
            })
        }}
      />
    );
    expect((await screen.findAllByText('R$ 99,00')).length).toBe(2);
    expect(screen.getByText('Dados desatualizados')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('últimos valores retornados');
    expect(screen.getByText('Desatualizado')).toBeVisible();
    expect(screen.getByRole('status')).toHaveClass('border-amber-200', 'bg-amber-50');
    expect(container.querySelector('header h1')).toHaveTextContent('Carteira');
  });

  test('uses an explicit empty state when there is no snapshot, never confirmed zero', async () => {
    const { container } = render(
      <WalletPage
        api={{ load: () => Promise.resolve({ balanceCents: '0', capturedAt: null, stale: false }) }}
      />
    );
    expect(await screen.findByText('Ainda não há saldo sincronizado')).toBeVisible();
    expect(screen.getByText(/não representa saldo zero confirmado/i)).toBeVisible();
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
    expect(container.querySelector('header h1')).toHaveTextContent('Carteira');
    expect(container.querySelector('[data-wallet-empty]')).toHaveClass(
      'rounded-xl',
      'border-dashed',
      'border-brand-line'
    );
  });

  test('sanitizes failures into Portuguese UI copy', async () => {
    render(
      <WalletPage
        api={{
          load: () => Promise.reject(new Error('secret payload'))
        }}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a carteira'
    );
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
  });
});
