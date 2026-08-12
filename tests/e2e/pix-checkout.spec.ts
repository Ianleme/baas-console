import { expect, test } from '@playwright/test';
test('presents an accessible mobile Pix checkout without another creation call', async ({
  page
}) => {
  let exchangeCalls = 0;
  let creationCalls = 0;
  await page.route('**/api/v1/public/checkout-sessions', async (route) => {
    exchangeCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        checkout: {
          id: 'link',
          description: 'Pedido Pix',
          amountCents: '32000',
          methods: 'PIX',
          maxInstallments: 1,
          state: 'READY'
        },
        csrfToken: 'csrf',
        pixAttempt: {
          id: 'attempt',
          status: 'PENDING',
          amountCents: '32000',
          emv: 'PIX-CODE',
          qrCodeBase64: null,
          txid: 'txid',
          expiresAt: new Date(Date.now() + 300000).toISOString()
        }
      })
    });
  });
  await page.route('**/api/v1/public/payments/pix', async (route) => {
    creationCalls += 1;
    await route.fulfill({ status: 500 });
  });
  const token = Buffer.alloc(32, 7).toString('base64url');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pay.html#/checkout/${token}`);
  await expect(page.getByRole('heading', { name: 'Pague com Pix' })).toBeVisible();
  await expect(page.getByLabel('Código Pix copia e cola')).toHaveValue('PIX-CODE');
  expect(exchangeCalls).toBe(1);
  expect(creationCalls).toBe(0);
});
