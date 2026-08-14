import { expect, test } from '@playwright/test';

test('opens the deterministic demo without a password and blocks mutations', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname === '/api/v1/demo/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'demo-e2e-token' })
      });
      return;
    }
    if (url.pathname === '/api/v1/demo/view') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          merchant: { displayName: 'Demo Aurora Store' },
          balanceCents: '125000',
          mode: 'READ_ONLY'
        })
      });
      return;
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 403, code: 'DEMO_READ_ONLY' })
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/demo.html');
  await expect(page.getByRole('heading', { name: 'Demo Aurora Store' })).toBeVisible();
  await expect(page.getByText('Somente leitura')).toBeVisible();
  await expect(page.getByText('R$ 1.250,00')).toBeVisible();
  await expect(page.getByText(/senha/i)).toHaveCount(0);
  const response = (await page.evaluate(async () =>
    fetch('/api/v1/payments', { method: 'POST', body: '{}' }).then(
      (result) => result.json() as Promise<unknown>
    )
  )) as { status: number; code: string };
  expect(response).toEqual({ status: 403, code: 'DEMO_READ_ONLY' });
  expect(requests).toContain('POST /api/v1/demo/session');
  expect(requests).toContain('GET /api/v1/demo/view');
});
