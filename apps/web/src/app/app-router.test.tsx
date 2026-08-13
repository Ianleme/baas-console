import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { vi } from 'vitest';

import { createBaasMemorySession } from '@baas/api-client';
import { AppRouter } from './app-router.js';

describe('AppRouter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('/session/profile')) {
        return Promise.resolve(new Response(JSON.stringify({
          merchant: { legalName: 'Aurora Ltda', displayName: 'Aurora Store' },
          owner: { fullName: 'Owner Aurora', email: 'owner@example.test' },
          gatewayConnectionStatus: null
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            wallet: { balanceCents: '10000', capturedAt: new Date().toISOString(), stale: false },
            receivedCents: '5000',
            approvedCount: 2,
            deniedCount: 0,
            pendingCount: 0,
            pixReceivedCents: '3000',
            cardReceivedCents: '2000',
            operations: []
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reacts to hash navigation without a page reload', async () => {
    const session = createBaasMemorySession();
    session.setToken('access-token');
    globalThis.history.replaceState(null, '', '/app.html#/');
    render(<AppRouter session={session} />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();

    act(() => {
      globalThis.location.hash = '#/links';
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Links de pagamento' })).toBeVisible();
  });

  test('loads API identity and renders wallet and settings routes', async () => {
    const session = createBaasMemorySession();
    session.setToken('access-token');
    render(<AppRouter session={session} />);
    expect(await screen.findByText('Aurora Store')).toBeVisible();
    globalThis.location.hash = '#/carteira';
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Carteira' })).toBeVisible();
    globalThis.location.hash = '#/configuracoes';
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeVisible();
  });

  test('terminal profile 401 clears session and returns to authentication', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    const session = createBaasMemorySession();
    session.setToken('expired-token');
    render(<AppRouter session={session} />);
    await waitFor(() => expect(session.token()).toBe(''));
    expect(await screen.findByText('Entrar')).toBeVisible();
  });
});
