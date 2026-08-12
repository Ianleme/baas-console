import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppShell } from './app-shell.js';

describe('AppShell', () => {
  test('renders the authenticated shell landmarks and sandbox banner', () => {
    render(<AppShell />);
    expect(screen.getByRole('banner')).toHaveTextContent('Ambiente de teste');
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    expect(screen.getByRole('main')).toBeVisible();
  });

  test('renders every approved primary navigation destination', () => {
    render(<AppShell />);
    for (const label of [
      'Visão geral',
      'Links de pagamento',
      'Transações',
      'Carteira',
      'Saques',
      'Webhooks',
      'Configurações'
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('opens and closes the responsive navigation from its labelled control', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const toggle = screen.getByRole('button', { name: 'Abrir navegação' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Fechar navegação' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fechar navegação' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('supports keyboard focus without a mouse', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.tab();
    expect(screen.getByText('Pular para o conteúdo')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Abrir navegação' })).toHaveFocus();
  });

  test('does not present invented financial values as real data', () => {
    render(<AppShell />);
    expect(screen.getByText('Sua operação começa aqui')).toBeVisible();
    expect(screen.getByText(/dados financeiros reais aparecerão/i)).toBeVisible();
    expect(screen.queryByText(/R\$\s?\d/u)).not.toBeInTheDocument();
  });

  test('has no automated axe violations', async () => {
    const { container } = render(<AppShell />);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
