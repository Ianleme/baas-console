import axe from 'axe-core';
import { render, screen } from '@testing-library/react';

import { PayShell } from './pay-shell.js';

describe('PayShell', () => {
  test('renders an isolated public checkout main landmark', () => {
    render(<PayShell />);
    expect(screen.getByRole('main', { name: 'Checkout sandbox' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' })
    ).not.toBeInTheDocument();
  });

  test('makes the sandbox warning explicit and textual', () => {
    render(<PayShell />);
    expect(screen.getByText('Checkout de teste')).toBeVisible();
    expect(screen.getByText(/não use dados reais de cartão/i)).toBeVisible();
  });

  test('uses an accessible original brand mark', () => {
    render(<PayShell />);
    expect(screen.getByLabelText('BaaS Console')).toBeVisible();
    for (const mark of screen.getAllByTestId('brand-mark')) {
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('has no automated axe violations', async () => {
    const { container } = render(<PayShell />);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
