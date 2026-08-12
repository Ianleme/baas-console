import { expect, test } from '@playwright/test';

test('exchanges and removes a public checkout token', async ({ page }) => {
  const token = Buffer.alloc(32, 7).toString('base64url');
  let requests = 0;
  await page.route('**/api/v1/public/checkout-sessions', async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        checkout: {
          id: 'link-1',
          description: 'Pedido sandbox',
          amountCents: '32000',
          methods: 'PIX',
          maxInstallments: 1,
          state: 'READY'
        },
        csrfToken: 'memory-only'
      })
    });
  });
  await page.goto(`/pay.html#/checkout/${token}`);
  await expect(page.getByRole('heading', { name: 'Pedido sandbox' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(requests).toBe(1);
  await expect(page.getByText(/não use dados reais de cartão/i)).toBeVisible();
});
