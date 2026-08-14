import { expect, test } from '@playwright/test';

test('covers authenticated console identity, stale wallet, settings, and logout', async ({
  page
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/auth/login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'e2e-token' })
      });
      return;
    }
    if (url.pathname === '/api/v1/auth/logout') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.pathname === '/api/v1/session/profile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          merchant: { legalName: 'Aurora Comércio Ltda', displayName: 'Aurora Store' },
          owner: { fullName: 'Cliente Aurora', email: 'owner@example.test' },
          gatewayConnectionStatus: 'ACTIVE'
        })
      });
      return;
    }
    if (url.pathname === '/api/v1/wallet') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          balanceCents: '123450',
          capturedAt: '2026-08-13T12:00:00.000Z',
          stale: true
        })
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('baas_access_token', 'e2e-token');
  });
  await page.goto('/app.html');

  await expect(page.locator('.merchant-name')).toHaveText('Aurora Store');
  await expect(page.locator('.user-info strong')).toHaveText('Cliente Aurora');

  await page.goto('/app.html#/carteira');
  await expect(page.getByRole('heading', { name: 'Carteira' })).toBeVisible();
  await expect(page.getByText('R$ 1.234,50').first()).toBeVisible();
  await expect(page.getByText('Dados desatualizados')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('últimos valores retornados');
  await expect(page.getByText('R$ 0,00')).toHaveCount(0);

  await page.goto('/app.html#/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.locator('#main-content').getByText('Aurora Store')).toBeVisible();
  await expect(page.locator('#main-content').getByText('Cliente Aurora')).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
