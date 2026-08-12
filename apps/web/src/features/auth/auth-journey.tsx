import { createAuthJourneyClient } from '@baas/api-client';
import { useRef, useState, type InputHTMLAttributes, type SyntheticEvent } from 'react';

import { BrandMark } from '../../components/brand-mark.js';
import { SandboxNotice } from '../../components/sandbox-notice.js';
import '../../styles/tokens.css';
import './auth-journey.css';

type Screen = 'login' | 'register' | 'awaiting' | 'connect' | 'active';
type PersonType = 'PF' | 'PJ';

export interface RegistrationData {
  personType: PersonType;
  name: string;
  tradingName: string;
  email: string;
  phone: string;
  document: string;
  zipCode: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  password: string;
}

export interface AuthJourneyApi {
  login(input: { email: string; password: string; remember: boolean }): Promise<void>;
  register(input: RegistrationData): Promise<void>;
  connect(input: { document: string; password: string }): Promise<'ACTIVE' | 'PROFILE_MISMATCH'>;
}

const api: AuthJourneyApi = createAuthJourneyClient({ baseUrl: '' });
type FormSubmitEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

export function AuthJourney({
  client = api,
  onAuthenticated
}: {
  client?: AuthJourneyApi;
  onAuthenticated?: () => void;
}) {
  const [screen, setScreen] = useState<Screen>('login');
  const [personType, setPersonType] = useState<PersonType>('PF');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gatewayForm = useRef<HTMLFormElement>(null);

  async function submit(operation: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch {
      setError('Não foi possível concluir. Revise os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function onLogin(event: FormSubmitEvent): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit(async () => {
      await client.login({
        email: formText(data, 'email'),
        password: formText(data, 'password'),
        remember: data.get('remember') === 'on'
      });
      setScreen('active');
      onAuthenticated?.();
    });
  }

  function onRegister(event: FormSubmitEvent): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit(async () => {
      await client.register(Object.fromEntries(data) as unknown as RegistrationData);
      setScreen('awaiting');
    });
  }

  function onConnect(event: FormSubmitEvent): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const document = formText(data, 'document');
    const password = formText(data, 'gatewayPassword');
    event.currentTarget.reset();
    void submit(async () => {
      const result = await client.connect({ document, password });
      if (result === 'PROFILE_MISMATCH') {
        setError('As credenciais pertencem a outro perfil. A conexão não foi ativada.');
        return;
      }
      setScreen('active');
    });
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <BrandMark />
        <SandboxNotice variant="badge" />
      </header>
      <div className="auth-glow" aria-hidden="true" />
      {screen === 'login' && (
        <AuthCard
          title="Bem-vindo de volta"
          subtitle="Acesse sua conta para gerenciar suas operações financeiras."
        >
          <form onSubmit={onLogin} aria-label="Entrar">
            <Field
              label="E-mail"
              name="email"
              type="email"
              placeholder="nome@empresa.com.br"
              autoComplete="email"
            />
            <div className="password-field">
              <Field
                label="Senha"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
              />
              <button
                className="show-password"
                type="button"
                onClick={() => {
                  setShowPassword((value) => !value);
                }}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <div className="form-row">
              <label className="check">
                <input name="remember" type="checkbox" /> Manter conectado
              </label>
              <span className="quiet-link">Recuperação em breve</span>
            </div>
            <ErrorMessage message={error} />
            <SubmitButton busy={busy}>Entrar</SubmitButton>
          </form>
          <p className="switch-copy">
            Não possui uma conta?{' '}
            <button
              type="button"
              onClick={() => {
                setScreen('register');
              }}
            >
              Criar conta
            </button>
          </p>
        </AuthCard>
      )}

      {screen === 'register' && (
        <AuthCard
          wide
          title="Abra sua conta"
          subtitle="Cadastre o proprietário e os dados usados para conectar a Lera Box."
        >
          <form onSubmit={onRegister} aria-label="Criar conta">
            <fieldset className="person-switch">
              <legend>Tipo de pessoa</legend>
              {(['PF', 'PJ'] as const).map((type) => (
                <label key={type} className={personType === type ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="personType"
                    value={type}
                    checked={personType === type}
                    onChange={() => {
                      setPersonType(type);
                    }}
                  />
                  {type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <Field label={personType === 'PF' ? 'Nome completo' : 'Razão social'} name="name" />
              <Field label="Nome da loja" name="tradingName" />
              <Field label="E-mail" name="email" type="email" />
              <Field label="Telefone" name="phone" />
              <Field label={personType === 'PF' ? 'CPF' : 'CNPJ'} name="document" />
              <Field label="CEP" name="zipCode" />
              <Field label="Endereço" name="address" />
              <Field label="Número" name="number" />
              <Field label="Bairro" name="neighborhood" />
              <Field label="Cidade" name="city" />
              <Field label="UF" name="state" maxLength={2} />
              <Field
                label="Senha local"
                name="password"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <ErrorMessage message={error} />
            <SubmitButton busy={busy}>Criar conta segura</SubmitButton>
          </form>
          <p className="switch-copy">
            Já possui conta?{' '}
            <button
              type="button"
              onClick={() => {
                setScreen('login');
              }}
            >
              Voltar ao login
            </button>
          </p>
        </AuthCard>
      )}

      {screen === 'awaiting' && (
        <StatusCard
          icon="✉"
          eyebrow="Cadastro enviado"
          title="Confira seu e-mail"
          description="A Lera Box enviará as credenciais do ambiente sandbox. Não criamos nem armazenamos essa senha por você."
        >
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setScreen('connect');
            }}
          >
            Já recebi minhas credenciais
          </button>
        </StatusCard>
      )}

      {screen === 'connect' && (
        <AuthCard
          title="Conectar Lera Box"
          subtitle="Informe uma única vez as credenciais recebidas por e-mail."
        >
          <div className="security-note">
            A senha será enviada diretamente ao gateway e descartada da memória após esta
            solicitação.
          </div>
          <form ref={gatewayForm} onSubmit={onConnect} aria-label="Conectar gateway">
            <Field label="CPF ou CNPJ" name="document" />
            <Field
              label="Senha temporária da Lera Box"
              name="gatewayPassword"
              type="password"
              autoComplete="off"
            />
            <ErrorMessage message={error} />
            <SubmitButton busy={busy}>Verificar e conectar</SubmitButton>
          </form>
        </AuthCard>
      )}

      {screen === 'active' && (
        <StatusCard
          icon="✓"
          eyebrow="Conexão verificada"
          title="Sua operação está pronta"
          description="O perfil da Lera Box foi confirmado e os dados de acesso foram protegidos."
        >
          <a className="primary-button" href="#/">
            Ir para o dashboard
          </a>
        </StatusCard>
      )}
      <footer className="auth-footer">
        Privacidade <span>•</span> Termos de uso
      </footer>
    </main>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
  wide = false
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
      <div className="card-mark">
        <BrandMark compact />
      </div>
      <h1>{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </section>
  );
}
function Field({
  label,
  name,
  type = 'text',
  ...props
}: { label: string; name: string; type?: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'name' | 'type'
>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input required name={name} type={type} {...props} />
    </label>
  );
}
function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button className="primary-button" type="submit" disabled={busy}>
      {busy ? 'Processando…' : children}
    </button>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="form-error" role="alert">
      {message}
    </div>
  ) : null;
}
function StatusCard({
  icon,
  eyebrow,
  title,
  description,
  children
}: {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="auth-card status-card">
      <div className="status-icon" aria-hidden="true">
        {icon}
      </div>
      <span className="eyebrow eyebrow--green">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="auth-subtitle">{description}</p>
      {children}
    </section>
  );
}
