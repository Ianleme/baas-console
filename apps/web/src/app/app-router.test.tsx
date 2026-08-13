import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      if (String(input).includes('/auth/refresh'))
        return Promise.resolve(new Response('{}', { status: 401 }));
      if (
        String(input).includes('/checkout-links') ||
        String(input).includes('/transactions') ||
        String(input).includes('/withdrawals') ||
        String(input).includes('/webhooks')
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
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
    cleanup();
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
    expect(localStorage.getItem('baas_access_token')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument());
    expect(screen.getByRole('form', { name: 'Entrar' })).toBeVisible();
  });

  test('logout calls the endpoint, clears profile/token, and returns to auth', async () => {
    const session = createBaasMemorySession();
    session.setToken('logout-token');
    render(<AppRouter session={session} />);
    expect((await screen.findAllByText('Owner Aurora')).length).toBeGreaterThan(0);
    await act(async () => {
      screen.getByRole('button', { name: 'Sair' }).click();
    });
    await waitFor(() => expect(session.token()).toBe(''));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument());
    expect(screen.getByRole('form', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryAllByText('Owner Aurora')).toHaveLength(0);
  });

  test('remote logout failure still clears local state and prevents token reuse', async () => {
    vi.restoreAllMocks();
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/session/profile')) {
        return Promise.resolve(new Response(JSON.stringify({
          merchant: { legalName: 'Aurora Ltda', displayName: 'Aurora Store' },
          owner: { fullName: 'Owner Aurora', email: 'owner@example.test' },
          gatewayConnectionStatus: null
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/auth/logout')) return Promise.resolve(new Response('server unavailable', { status: 503 }));
      if (url.includes('/auth/refresh')) return Promise.resolve(new Response('{}', { status: 401 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const session = createBaasMemorySession();
    session.setToken('old-token');
    render(<AppRouter session={session} />);
    expect((await screen.findAllByText('Owner Aurora')).length).toBeGreaterThan(0);
    await act(async () => {
      screen.getByRole('button', { name: 'Sair' }).click();
    });
    await waitFor(() => expect(session.token()).toBe(''));
    expect(calls).toContain('/api/v1/auth/logout');
    expect(await screen.findByRole('form', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryAllByText('Owner Aurora')).toHaveLength(0);
    expect(session.token()).not.toBe('old-token');
  });
});
