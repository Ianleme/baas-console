import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { vi } from 'vitest';

import { createBaasMemorySession } from '@baas/api-client';
import { AppRouter } from './app-router.js';

describe('AppRouter', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
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
});
