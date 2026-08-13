import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage, type CurrentProfile } from './settings-page.js';

const profile: CurrentProfile = {
  merchant: { displayName: 'Acme Store', legalName: 'Acme LTDA' },
  owner: { fullName: 'Joana Silva', email: 'joana@acme.test' },
  gatewayConnectionStatus: 'ACTIVE'
};

describe('SettingsPage', () => {
  const connect = async () => 'ACTIVE' as const;

  test('shows the allowlisted business, owner and gateway state', async () => {
    render(<SettingsPage api={{ load: async () => profile, connect }} />);
    expect(await screen.findByText('Acme Store')).toBeVisible();
    expect(screen.getByText('Acme LTDA')).toBeVisible();
    expect(screen.getByText('Joana Silva')).toBeVisible();
    expect(screen.getByText('joana@acme.test')).toBeVisible();
    expect(screen.getByText('Conectado')).toBeVisible();
  });

  test('is read-only and offers no mutation controls', async () => {
    render(<SettingsPage api={{ load: async () => profile, connect }} />);
    await screen.findByText('Acme Store');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/salvar|editar|senha/i)).not.toBeInTheDocument();
  });

  test('shows loading state', () => {
    render(<SettingsPage api={{ load: () => new Promise(() => undefined), connect }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando configurações');
  });

  test('guides an unavailable account through connection without retaining the password', async () => {
    const user = userEvent.setup();
    const connectSpy = vi.fn().mockResolvedValue('ACTIVE' as const);
    render(
      <SettingsPage
        api={{
          load: async () => ({ ...profile, gatewayConnectionStatus: 'AWAITING_CREDENTIALS' }),
          connect: connectSpy
        }}
      />
    );
    await user.click(await screen.findByRole('button', { name: 'Conectar gateway' }));
    await user.click(screen.getByRole('button', { name: 'Conectar gateway' }));
    expect(screen.getByText('Informe o CPF ou CNPJ usado na Lera Box.')).toBeVisible();
    await user.type(screen.getByLabelText('CPF ou CNPJ'), '123');
    await user.type(screen.getByLabelText(/Senha temporária/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Conectar gateway' }));
    expect(connectSpy).toHaveBeenCalledWith({ document: '123', password: 'secret' });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Webhooks e pagamentos estão liberados'
    );
  });

  test('sanitizes profile unavailability in Portuguese', async () => {
    render(
      <SettingsPage
        api={{
          connect,
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

  test('maps a specific non-401 profile failure to the safe Portuguese state', async () => {
    render(
      <SettingsPage
        api={{
          connect,
          load: async () => {
            const error = new Error('PROFILE_UNAVAILABLE') as Error & { status: number };
            error.status = 503;
            throw error;
          }
        }}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as configurações'
    );
  });
});
