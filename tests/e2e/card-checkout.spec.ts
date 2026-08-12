import { expect, test } from '@playwright/test';

test('quotes and submits a sandbox card without browser persistence', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/public/checkout-sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        checkout: {
          id: 'link',
          description: 'Pedido sandbox',
          amountCents: '32000',
          methods: 'CARD',
          maxInstallments: 21,
          state: 'READY'
        },
        csrfToken: 'csrf',
        startMethod: 'CARD'
      })
    })
  );
  await page.route('**/api/v1/public/payments/card/quote', async (route) => {
    requests.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'quote',
        brand: 'VISA',
        installments: 1,
        feeBps: 319,
        grossAmountCents: '32000',
        feeAmountCents: '1021',
        netAmountCents: '30979'
      })
    });
  });
  await page.route('**/api/v1/public/payments/card/confirm', async (route) => {
    requests.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'APPROVED' })
    });
  });
  await page.goto('/pay.html#/checkout/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
  await expect(page.getByRole('heading', { name: 'Pague com cartão' })).toBeVisible();
  await page.getByRole('button', { name: 'Calcular parcelas e taxa' }).click();
  await page.getByLabel('Número do cartão').fill('4111111111111111');
  await page.getByLabel('Nome impresso').fill('CLIENTE SANDBOX');
  await page.getByLabel('Mês').fill('12');
  await page.getByLabel('Ano').fill('2030');
  await page.getByLabel('CVV').fill('123');
  await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pagamento confirmado' })).toBeVisible();
  expect(requests[0]).not.toContain('411111');
  expect(requests[1]).toContain('4111111111111111');
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: localStorage, session: sessionStorage, history: location.href })
    )
  ).not.toContain('4111111111111111');
});
