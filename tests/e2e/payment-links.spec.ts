import { expect, test } from '@playwright/test';

test('manages payment links in the responsive merchant screen', async ({ page }) => {
  const link = {
    id: 'link-1',
    reference: 'REF-2026-01048',
    description: 'Pedido #1048',
    amountCents: '32000',
    methods: 'PIX',
    maxInstallments: 1,
    selectedFeeBps: null,
    feeSnapshot: [],
    status: 'ACTIVE',
    expiresAt: '2026-08-15T18:18:00.000Z'
  };
  await page.context().addCookies([
    {
      name: 'baas_csrf',
      value: 'e2e-csrf',
      domain: '127.0.0.1',
      path: '/'
    }
  ]);
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'e2e-token' })
    });
  });
  await page.route('**/api/v1/session/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        merchant: { legalName: 'Aurora Comércio Ltda', displayName: 'Aurora Store' },
        owner: { fullName: 'Cliente Aurora', email: 'owner@example.test' },
        gatewayConnectionStatus: 'ACTIVE'
      })
    });
  });
  await page.route('**/api/v1/checkout-links**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [link],
        total: 1,
        summary: {
          totalCount: 1,
          activeCount: 1,
          paidCount: 0,
          paidAmountCents: '0'
        }
      })
    });
  });
  await page.goto('/app.html#/links');
  await expect(page.getByRole('heading', { name: 'Links de pagamento' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'R$ 320,00' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '+ Criar link de pagamento' })).toBeVisible();
  await page.getByPlaceholder('Buscar por descrição ou referência').fill('1048');
  await expect(
    page.getByRole('region', { name: 'Links em cartões' }).getByText('Pedido #1048')
  ).toBeVisible();
});
