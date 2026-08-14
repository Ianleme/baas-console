import axe from 'axe-core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AuthJourney,
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  formatUf,
  type AuthJourneyApi
} from './auth-journey.js';

function client(overrides: Partial<AuthJourneyApi> = {}): AuthJourneyApi {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue('AWAITING_CREDENTIALS'),
    connect: vi.fn().mockResolvedValue('ACTIVE'),
    ...overrides
  };
}

async function openRegistration(user = userEvent.setup()): Promise<typeof user> {
  await user.click(screen.getByRole('button', { name: 'Criar conta' }));
  return user;
}

async function reachConnection(user = userEvent.setup(), api = client()): Promise<typeof user> {
  render(<AuthJourney client={api} />);
  await openRegistration(user);
  fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
  await screen.findByText('Confira seu e-mail');
  await user.click(screen.getByRole('button', { name: 'Já recebi minhas credenciais' }));
  return user;
}

describe('AuthJourney', () => {
  it('starts on the approved login screen', () => {
    render(<AuthJourney client={client()} />);
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  });

  it('keeps the sandbox context visible', () => {
    render(<AuthJourney client={client()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ambiente Sandbox');
  });

  it('shows and hides the local password', async () => {
    const user = userEvent.setup();
    render(<AuthJourney client={client()} />);
    const password = screen.getByLabelText('Senha');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('submits normalized login intent including remember choice', async () => {
    const login = vi.fn<AuthJourneyApi['login']>().mockResolvedValue(undefined);
    const api = client({ login });
    const user = userEvent.setup();
    render(<AuthJourney client={api} />);
    await user.type(screen.getByLabelText('E-mail'), 'owner@example.test');
    await user.type(screen.getByLabelText('Senha'), 'StrongPassword123');
    await user.click(screen.getByLabelText('Manter conectado'));
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'owner@example.test',
        password: 'StrongPassword123',
        remember: true
      });
    });
  });

  it('moves a successful local login to the ready state', async () => {
    render(<AuthJourney client={client()} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Entrar' }));
    expect(await screen.findByText('Sua operação está pronta')).toBeVisible();
  });

  it('notifies the app when the user proceeds to the dashboard', async () => {
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(<AuthJourney client={client()} onAuthenticated={onAuthenticated} />);
    await openRegistration(user);
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    await user.click(await screen.findByRole('button', { name: 'Já recebi minhas credenciais' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Conectar gateway' }));
    await user.click(await screen.findByRole('link', { name: 'Ir para o dashboard' }));
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });

  it('shows a safe error when local login fails', async () => {
    render(
      <AuthJourney client={client({ login: vi.fn().mockRejectedValue(new Error('raw secret')) })} />
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir');
    expect(screen.queryByText('raw secret')).not.toBeInTheDocument();
  });

  it('opens registration from login', async () => {
    render(<AuthJourney client={client()} />);
    await openRegistration();
    expect(screen.getByRole('heading', { name: 'Abra sua conta' })).toBeVisible();
  });

  it('defaults registration to a PF owner', async () => {
    render(<AuthJourney client={client()} />);
    await openRegistration();
    expect(screen.getByLabelText('Pessoa física')).toBeChecked();
    expect(screen.getByLabelText('CPF')).toBeVisible();
  });

  it('switches registration semantics to PJ', async () => {
    const user = userEvent.setup();
    render(<AuthJourney client={client()} />);
    await openRegistration(user);
    await user.click(screen.getByLabelText('Pessoa jurídica'));
    expect(screen.getByLabelText('Razão social')).toBeVisible();
    expect(screen.getByLabelText('CNPJ')).toBeVisible();
  });

  it('submits the selected person type', async () => {
    const register = vi.fn<AuthJourneyApi['register']>().mockResolvedValue('AWAITING_CREDENTIALS');
    const api = client({ register });
    const user = userEvent.setup();
    render(<AuthJourney client={api} />);
    await openRegistration(user);
    await user.click(screen.getByLabelText('Pessoa jurídica'));
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ personType: 'PJ' }));
    });
  });

  it('returns from registration to login', async () => {
    const user = userEvent.setup();
    render(<AuthJourney client={client()} />);
    await openRegistration(user);
    await user.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  });

  it('explains the awaiting-credentials state after registration', async () => {
    render(<AuthJourney client={client()} />);
    await openRegistration();
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    expect(await screen.findByText('Confira seu e-mail')).toBeVisible();
    expect(screen.getByText(/Lera Box aceitou o cadastro/i)).toBeVisible();
  });

  it('keeps the local account successful when gateway onboarding fails', async () => {
    const onAuthenticated = vi.fn();
    render(
      <AuthJourney
        client={client({ register: vi.fn().mockResolvedValue('GATEWAY_REGISTRATION_FAILED') })}
        onAuthenticated={onAuthenticated}
      />
    );
    await openRegistration();
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));

    expect(await screen.findByText('Seu acesso ao BaaS está pronto')).toBeVisible();
    expect(screen.getByText(/conta local foi criada/i)).toBeVisible();
    expect(screen.queryByText(/Lera Box recusou/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Acessar painel' }));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(globalThis.location.hash).toBe('#/configuracoes');
  });

  it('does not fabricate gateway credentials while awaiting email', async () => {
    render(<AuthJourney client={client()} />);
    await openRegistration();
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    await screen.findByText('Confira seu e-mail');
    expect(screen.queryByLabelText('Senha temporária da Lera Box')).not.toBeInTheDocument();
  });

  it('opens the one-time gateway connection form', async () => {
    await reachConnection();
    expect(screen.getByRole('form', { name: 'Conectar gateway' })).toBeVisible();
  });

  it('clears the gateway password immediately on submission', async () => {
    const pendingConnect: AuthJourneyApi['connect'] = () => new Promise(() => undefined);
    const api = client({ connect: vi.fn(pendingConnect) });
    const user = await reachConnection(userEvent.setup(), api);
    const password = screen.getByLabelText('Senha temporária da Lera Box');
    await user.type(password, 'one-time-secret');
    await user.type(screen.getByLabelText('CPF ou CNPJ'), '12345678901');
    await user.click(screen.getByRole('button', { name: 'Verificar e conectar' }));
    expect(password).toHaveValue('');
  });

  it('explains profile mismatch without activating', async () => {
    const api = client({ connect: vi.fn().mockResolvedValue('PROFILE_MISMATCH') });
    const user = await reachConnection(userEvent.setup(), api);
    await user.type(screen.getByLabelText('CPF ou CNPJ'), '99988877766');
    await user.type(screen.getByLabelText('Senha temporária da Lera Box'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Verificar e conectar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outro perfil');
    expect(screen.queryByText('Sua operação está pronta')).not.toBeInTheDocument();
  });

  it('activates only after successful profile verification', async () => {
    const user = await reachConnection();
    await user.type(screen.getByLabelText('CPF ou CNPJ'), '123');
    await user.type(screen.getByLabelText('Senha temporária da Lera Box'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Verificar e conectar' }));
    expect(await screen.findByText('Sua operação está pronta')).toBeVisible();
  });

  it('has no automated axe violations on login', async () => {
    const { container } = render(<AuthJourney client={client()} />);
    expect(
      (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  });

  it('displays helper hint for password length requirement on registration', async () => {
    render(<AuthJourney client={client()} />);
    await openRegistration();
    expect(screen.getByText('Mínimo de 12 caracteres')).toBeVisible();
  });

  it('blocks registration and displays field error when password is under 12 characters', async () => {
    const register = vi.fn<AuthJourneyApi['register']>().mockResolvedValue('AWAITING_CREDENTIALS');
    const user = userEvent.setup();
    render(<AuthJourney client={client({ register })} />);
    await openRegistration(user);
    await user.type(screen.getByLabelText('Senha local'), 'short123');
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    expect(await screen.findByText('A senha deve ter no mínimo 12 caracteres.')).toBeVisible();
    expect(register).not.toHaveBeenCalled();
  });

  it('blocks registration when state UF is invalid', async () => {
    const register = vi.fn<AuthJourneyApi['register']>().mockResolvedValue('AWAITING_CREDENTIALS');
    const user = userEvent.setup();
    render(<AuthJourney client={client({ register })} />);
    await openRegistration(user);
    await user.type(screen.getByLabelText('UF'), 'XX');
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    expect(await screen.findByText(/UF inválida/i)).toBeVisible();
    expect(register).not.toHaveBeenCalled();
  });

  it('sanitizes state to uppercase when registering', async () => {
    const register = vi.fn<AuthJourneyApi['register']>().mockResolvedValue('AWAITING_CREDENTIALS');
    const user = userEvent.setup();
    render(<AuthJourney client={client({ register })} />);
    await openRegistration(user);
    await user.type(screen.getByLabelText('UF'), 'sp');
    fireEvent.submit(screen.getByRole('form', { name: 'Criar conta' }));
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ state: 'SP' }));
    });
  });

  describe('input formatting masks', () => {
    it('formats CPF correctly and truncates at 11 digits', () => {
      expect(formatCpf('11111111111999')).toBe('111.111.111-11');
    });

    it('formats CNPJ correctly and truncates at 14 digits', () => {
      expect(formatCnpj('11222333000199999')).toBe('11.222.333/0001-99');
    });

    it('formats CEP correctly and truncates at 8 digits', () => {
      expect(formatCep('0100100099')).toBe('01001-000');
    });

    it('formats phone numbers correctly and truncates at 11 digits', () => {
      expect(formatPhone('1198765432199')).toBe('(11) 98765-4321');
    });

    it('formats UF to uppercase 2 letters only', () => {
      expect(formatUf('sp12')).toBe('SP');
    });
  });
});
