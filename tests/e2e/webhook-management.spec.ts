import { expect, test } from '@playwright/test';

test('manages callbacks in the responsive webhook screen', async ({ page }) => {
  const configured = {
    event: 'PAYMENT_PIX',
    status: 'ACTIVE',
    configuredAt: '2026-08-12T14:00:00.000Z',
    lastReceivedAt: null
  };
  await page.context().addCookies([
    { name: 'baas_csrf', value: 'e2e-csrf', domain: '127.0.0.1', path: '/' }
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/webhooks', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { event: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...configured, event: body.event })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([configured])
    });
  });
  await page.goto('/app.html#/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
  await expect(page.getByText('Ativo')).toBeVisible();
  await expect(page.getByText('Não configurado')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const configure = page.getByRole('button', { name: 'Configurar webhook' }).first();
  await expect(configure).toBeVisible();
  await configure.click();
  await expect(page.getByText(/segredo não será exibido/u)).toBeVisible();
});
