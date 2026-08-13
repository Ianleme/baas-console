import { expect, test } from '@playwright/test';

const profile = {
  merchant: { legalName: 'Aurora Comércio Ltda', displayName: 'Aurora Store' },
  owner: { fullName: 'Cliente Aurora', email: 'owner@example.test' },
  gatewayConnectionStatus: 'ACTIVE'
};

test.describe('dashboard reference layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname === '/api/v1/session/profile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(profile)
        });
        return;
      }

      if (pathname === '/api/v1/wallet') {
        // The current dashboard client intentionally exposes the authoritative wallet
        // only. Analytics remain the real empty projection until the API contract grows.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            balanceCents: '2485072',
            capturedAt: '2026-08-12T16:30:00.000Z',
            stale: false
          })
        });
        return;
      }

      if (pathname === '/api/v1/auth/logout') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      await route.fulfill({ status: 204, body: '' });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('baas_access_token', 'e2e-token');
    });
  });

  test('keeps the desktop rail and 4/6/3 insight order', async ({ page }) => {
    await page.setViewportSize({ width: 1488, height: 1026 });
    await page.goto('/app.html');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('R$ 24.850,72')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /notifica/i })).toHaveCount(0);
    await expect(page.getByText('Nenhuma transação no período.')).toBeVisible();

    const kpis = page.getByRole('region', { name: 'Resumo financeiro' });
    const cards = page.locator('[data-insight-grid] > [aria-labelledby]');
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute('aria-labelledby'), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    );
    expect(boxes).toHaveLength(3);
    const composition = boxes[0]!;
    const movement = boxes[1]!;
    const operation = boxes[2]!;
    const kpiBox = await kpis.boundingBox();
    expect(boxes.map((box) => box.label)).toEqual(['composition-title', 'movement-title', 'operation-title']);
    expect(composition.width).toBeLessThan(movement.width);
    expect(movement.width).toBeGreaterThan(operation.width);
    expect(composition.y).toBe(movement.y);
    expect(movement.y).toBe(operation.y);
    expect(kpiBox?.width).toBeGreaterThan(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    console.log({ viewport: [1488, 1026], kpiBox, insightBoxes: boxes });
    await page.screenshot({ path: 'artifacts/dashboard-reference/dashboard-desktop.png', fullPage: true });
  });

  test('stacks content on mobile without page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app.html');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const cards = page.locator('[data-insight-grid] > [aria-labelledby]');
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute('aria-labelledby'), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    );
    expect(boxes).toHaveLength(3);
    const composition = boxes[0]!;
    const movement = boxes[1]!;
    const operation = boxes[2]!;
    expect(composition.y).toBeLessThan(movement.y);
    expect(movement.y).toBeLessThan(operation.y);
    expect(boxes.every((box) => box.width <= 390 && box.x >= 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('table', { name: 'Transações recentes' })).toHaveCount(0);
    await expect(page.getByText('Nenhuma transação no período.')).toBeVisible();

    console.log({ viewport: [390, 844], insightBoxes: boxes, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
    await page.screenshot({ path: 'artifacts/dashboard-reference/dashboard-mobile.png', fullPage: true });
  });
});
