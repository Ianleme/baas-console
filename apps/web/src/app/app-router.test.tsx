import { render, screen } from '@testing-library/react';
import { act } from 'react';

import { createBaasMemorySession } from '@baas/api-client';
import { AppRouter } from './app-router.js';

describe('AppRouter', () => {
  test('reacts to hash navigation without a page reload', async () => {
    const session = createBaasMemorySession();
    session.setToken('access-token');
    globalThis.history.replaceState(null, '', '/app.html#/');
    render(<AppRouter session={session} />);
    expect(screen.getByText('Sua operação começa aqui')).toBeVisible();

    act(() => {
      globalThis.location.hash = '#/links';
      globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Links de pagamento' })).toBeVisible();
  });
});
