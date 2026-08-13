import { render, screen } from '@testing-library/react';
import { SettingsPage, type CurrentProfile } from './settings-page.js';

const profile: CurrentProfile = {
  merchant: { displayName: 'Acme Store', legalName: 'Acme LTDA' },
  owner: { fullName: 'Joana Silva', email: 'joana@acme.test' },
  gatewayConnectionStatus: 'ACTIVE'
};

describe('SettingsPage', () => {
  test('shows the allowlisted business, owner and gateway state', async () => {
    render(<SettingsPage api={{ load: async () => profile }} />);
    expect(await screen.findByText('Acme Store')).toBeVisible();
    expect(screen.getByText('Acme LTDA')).toBeVisible();
    expect(screen.getByText('Joana Silva')).toBeVisible();
    expect(screen.getByText('joana@acme.test')).toBeVisible();
    expect(screen.getByText('Conectado')).toBeVisible();
  });

  test('is read-only and offers no mutation controls', async () => {
    render(<SettingsPage api={{ load: async () => profile }} />);
    await screen.findByText('Acme Store');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/salvar|editar|senha/i)).not.toBeInTheDocument();
  });

  test('shows loading state', () => {
    render(<SettingsPage api={{ load: () => new Promise(() => undefined) }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando configurações');
  });

  test('sanitizes profile unavailability in Portuguese', async () => {
    render(
      <SettingsPage
        api={{
          load: async () => {
            throw new Error('internal payload');
          }
        }}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as configurações'
    );
    expect(screen.queryByText('internal payload')).not.toBeInTheDocument();
  });
});
