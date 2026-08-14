import { expect, test } from '@playwright/test';

test('shows honest reconciliation state and safe responsive verification', async ({ page }) => {
  const row = {
    id: 'payment-1',
    kind: 'PAYMENT',
    reference: 'REF-PAY',
    status: 'RECONCILIATION_PENDING',
    classification: 'LOCAL_ONLY',
    updatedAt: '2026-08-12T16:00:00.000Z'
  };
  await page.context().addCookies([
    { name: 'baas_csrf', value: 'e2e-csrf', domain: '127.0.0.1', path: '/' }
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/reconciliation', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) })
  );
  await page.route('**/api/v1/reconciliation/payment-1/verify', async (route) => {
    expect(route.request().postData()).toBeNull();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ classification: 'MATCHED' })
    });
  });
  await page.goto('/app.html#/reconciliation');
  await expect(page.getByRole('heading', { name: 'Reconciliação' })).toBeVisible();
  await expect(page.getByText('Somente local')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Verificar no gateway' }).click();
  await expect(page.getByText('Conciliado')).toBeVisible();
});
