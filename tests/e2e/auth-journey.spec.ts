import { expect, test, type Page } from '@playwright/test';

async function mockApi(page: Page, connectStatus = 'ACTIVE'): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/connect')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: connectStatus })
      });
      return;
    }
    if (url.endsWith('/register')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          gatewayOnboarding: { status: 'AWAITING_CREDENTIALS' }
        })
      });
      return;
    }
    await route.fulfill({
      status: 204,
      contentType: 'application/json',
      body: ''
    });
  });
}

async function submitRegistration(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Criar conta' }).click();
  const values: Record<string, string> = {
    'Nome completo': 'Cliente Sandbox',
    'Nome da loja': 'Loja Aurora',
    'E-mail': 'owner@example.test',
    Telefone: '11999999999',
    CPF: '12345678909',
    CEP: '01001000',
    Endereço: 'Praça da Sé',
    Número: '100',
    Bairro: 'Centro',
    Cidade: 'São Paulo',
    UF: 'SP',
    'Senha local': 'StrongPassword123'
  };
  for (const [label, value] of Object.entries(values))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Criar conta segura' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
}

test('authenticates an existing merchant', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app.html');
  await page.getByLabel('E-mail').fill('owner@example.test');
  await page.getByLabel('Senha').fill('StrongPassword123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Sua operação está pronta' })).toBeVisible();
});

test('completes registration and one-time gateway connection', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app.html');
  await submitRegistration(page);
  await page.getByRole('button', { name: 'Já recebi minhas credenciais' }).click();
  await page.getByLabel('CPF ou CNPJ').fill('12345678909');
  await page.getByLabel('Senha temporária da Lera Box').fill('temporary-secret');
  await page.getByRole('button', { name: 'Verificar e conectar' }).click();
  await expect(page.getByRole('heading', { name: 'Sua operação está pronta' })).toBeVisible();
});

test('keeps a divergent gateway profile disconnected', async ({ page }) => {
  await mockApi(page, 'PROFILE_MISMATCH');
  await page.goto('/app.html');
  await submitRegistration(page);
  await page.getByRole('button', { name: 'Já recebi minhas credenciais' }).click();
  await page.getByLabel('CPF ou CNPJ').fill('00000000000');
  await page.getByLabel('Senha temporária da Lera Box').fill('temporary-secret');
  await page.getByRole('button', { name: 'Verificar e conectar' }).click();
  await expect(page.getByRole('alert')).toContainText('outro perfil');
  await expect(page.getByRole('heading', { name: 'Sua operação está pronta' })).toHaveCount(0);
});
