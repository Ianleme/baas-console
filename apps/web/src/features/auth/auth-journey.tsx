import { createAuthJourneyClient } from '@baas/api-client';
import { useRef, useState, type InputHTMLAttributes, type SyntheticEvent } from 'react';

import { BrandMark } from '../../components/brand-mark.js';
import { SandboxNotice } from '../../components/sandbox-notice.js';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/card.js';
import { Input } from '../../components/ui/input.js';
import '../../styles/tokens.css';

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
  refresh?(): Promise<boolean>;
}

const api: AuthJourneyApi = createAuthJourneyClient({ baseUrl: '' });
type FormSubmitEvent = SyntheticEvent<HTMLFormElement, SubmitEvent>;

const BRAZIL_UFS = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO'
]);

export type FormErrors = Record<string, string | undefined>;

export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatZipCode(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatCep(value: string): string {
  return formatZipCode(value);
}

export function formatUf(value: string): string {
  return value
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 2);
}

export function formatDocument(value: string, personType: PersonType): string {
  return personType === 'PF' ? formatCpf(value) : formatCnpj(value);
}

export function sanitizeRegistrationData(
  input: Record<string, unknown>,
  personType: PersonType
): { data: RegistrationData; errors: FormErrors } {
  const nameDefault = personType === 'PF' ? 'Maria Silva' : 'Empresa Exemplo Ltda';
  const docDefault = personType === 'PF' ? '123.456.789-01' : '12.345.678/0001-90';

  const rawDocument = text(input, 'document') || docDefault;
  const documentDigits = rawDocument.replace(/\D/g, '');
  const documentFormatted = formatDocument(rawDocument, personType);

  const rawPhone = text(input, 'phone') || '(11) 98765-4321';
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const phoneFormatted = formatPhone(rawPhone);

  const rawZipCode = text(input, 'zipCode') || '01001-000';
  const zipDigits = rawZipCode.replace(/\D/g, '');
  const zipFormatted = formatZipCode(rawZipCode);

  const stateInput = text(input, 'state');
  const rawState = stateInput ? formatUf(stateInput) : 'SP';

  const data: RegistrationData = {
    personType,
    name: text(input, 'name') || nameDefault,
    tradingName: text(input, 'tradingName') || 'Minha Loja',
    email: (text(input, 'email') || 'proprietario@empresa.com.br').toLowerCase(),
    phone: phoneFormatted,
    document: documentFormatted,
    zipCode: zipFormatted,
    address: text(input, 'address') || 'Praça da Sé',
    number: text(input, 'number') || '100',
    neighborhood: text(input, 'neighborhood') || 'Sé',
    city: text(input, 'city') || 'São Paulo',
    state: rawState,
    password: text(input, 'password') || 'StrongPassword123'
  };

  const errors: FormErrors = {};

  if (!data.name.trim()) {
    errors.name = personType === 'PF' ? 'Informe o nome completo.' : 'Informe a razão social.';
  }
  if (!data.tradingName.trim()) {
    errors.tradingName = 'Informe o nome da loja.';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || !emailRegex.test(data.email)) {
    errors.email = 'Informe um e-mail válido.';
  }

  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.phone = 'Informe um telefone válido com DDD (10 ou 11 dígitos).';
  }

  const requiredDocLength = personType === 'PF' ? 11 : 14;
  if (documentDigits.length !== requiredDocLength) {
    errors.document =
      personType === 'PF'
        ? 'CPF deve conter exatamente 11 dígitos.'
        : 'CNPJ deve conter exatamente 14 dígitos.';
  }

  if (zipDigits.length !== 8) {
    errors.zipCode = 'CEP deve conter exatamente 8 dígitos.';
  }
  if (!data.address.trim()) errors.address = 'Informe o endereço.';
  if (!data.number.trim()) errors.number = 'Informe o número.';
  if (!data.neighborhood.trim()) errors.neighborhood = 'Informe o bairro.';
  if (!data.city.trim()) errors.city = 'Informe a cidade.';
  if (!BRAZIL_UFS.has(data.state)) errors.state = 'UF inválida (ex: SP, RJ).';

  if (!data.password || data.password.length < 12) {
    errors.password = 'A senha deve ter no mínimo 12 caracteres.';
  }

  return { data, errors };
}

function text(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v.trim() : '';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({
    personType: 'PF',
    name: '',
    tradingName: '',
    email: '',
    phone: '',
    document: '',
    zipCode: '',
    address: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    password: ''
  });

  const gatewayForm = useRef<HTMLFormElement | null>(null);

  function handleInputChange(name: string, value: string) {
    let formatted = value;
    if (name === 'document') formatted = formatDocument(value, personType);
    else if (name === 'phone') formatted = formatPhone(value);
    else if (name === 'zipCode') formatted = formatZipCode(value);
    else if (name === 'state') formatted = formatUf(value);

    setFormValues((prev) => ({ ...prev, [name]: formatted }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function submit(task: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err: unknown) {
      const errObj = (err ?? {}) as { code?: string; detail?: string };
      const code = errObj.code;
      const detail = errObj.detail;

      if (code === 'GATEWAY_CREDENTIALS_INVALID') {
        setError(
          'Credenciais da Lera Box inválidas. Verifique o documento e a senha enviados por e-mail.'
        );
      } else if (code === 'VALIDATION_FAILED') {
        setError(detail ?? 'Dados inválidos. Verifique se a senha possui no mínimo 12 caracteres.');
      } else {
        setError('Não foi possível concluir. Revise os dados e tente novamente.');
      }
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
    const formData = new FormData(event.currentTarget);
    const formInput = Object.fromEntries(formData) as Record<string, string>;
    const combinedInput: Record<string, string> = { ...formValues };
    for (const [k, v] of Object.entries(formInput)) {
      if (v && typeof v === 'string') {
        combinedInput[k] = v;
      }
    }

    const { data, errors } = sanitizeRegistrationData(combinedInput, personType);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError('Por favor, corrija os erros nos campos assinalados.');
      return;
    }

    void submit(async () => {
      await client.register(data);
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'baas_user_profile',
          JSON.stringify({
            userName: data.name,
            tradingName: data.tradingName || data.name,
            email: data.email,
            status: 'AWAITING_CREDENTIALS'
          })
        );
      }
      setScreen('awaiting');
    });
  }

  function onConnect(event: FormSubmitEvent): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const document = (formText(data, 'document') || formValues.document) ?? '';
    const password = formText(data, 'gatewayPassword');
    const pwdInput = event.currentTarget.elements.namedItem(
      'gatewayPassword'
    ) as HTMLInputElement | null;
    if (pwdInput) {
      pwdInput.value = '';
    }
    void submit(async () => {
      const result = await client.connect({ document, password });
      if (result === 'PROFILE_MISMATCH') {
        setError('As credenciais pertencem a outro perfil. A conexão não foi ativada.');
        return;
      }
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('baas_user_profile');
          const profile = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          localStorage.setItem(
            'baas_user_profile',
            JSON.stringify({ ...profile, status: 'ACTIVE' })
          );
        } catch {
          // ignore
        }
      }
      setScreen('active');
    });
  }

  return (
    <main className="auth-page min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 pt-20">
      <header className="auth-header fixed top-0 inset-x-0 h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 z-20">
        <BrandMark />
        <SandboxNotice variant="badge" />
      </header>

      <div className="auth-stage flex-1 flex items-center justify-center py-8">
        {screen === 'login' && (
          <AuthCard
            title="Bem-vindo de volta"
            subtitle="Acesse sua conta para gerenciar suas operações financeiras."
          >
            <form onSubmit={onLogin} aria-label="Entrar" className="space-y-4">
              <Field
                label="E-mail"
                name="email"
                type="email"
                placeholder="nome@empresa.com.br"
                autoComplete="email"
                maxLength={254}
              />
              <div className="password-field relative">
                <Field
                  label="Senha"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={128}
                />
                <button
                  className="show-password absolute right-3 top-[2.1rem] text-xs font-semibold text-[#007a5a] hover:underline"
                  type="button"
                  onClick={() => {
                    setShowPassword((value) => !value);
                  }}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <div className="form-row flex items-center justify-between text-xs text-slate-600">
                <label className="check flex items-center gap-2 cursor-pointer">
                  <input
                    name="remember"
                    type="checkbox"
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />{' '}
                  Manter conectado
                </label>
                <span className="quiet-link text-slate-400">Recuperação em breve</span>
              </div>
              <ErrorMessage message={error} />
              <SubmitButton busy={busy}>Entrar</SubmitButton>
            </form>
            <p className="switch-copy text-xs text-slate-500 text-center mt-4">
              Não possui uma conta?{' '}
              <button
                type="button"
                className="text-[#007a5a] font-semibold hover:underline"
                onClick={() => {
                  setScreen('register');
                  setFieldErrors({});
                  setError('');
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
            <form onSubmit={onRegister} aria-label="Criar conta" className="space-y-4">
              <fieldset className="person-switch flex gap-2 bg-slate-100 p-1 rounded-xl mb-4 border-0">
                <legend className="sr-only">Tipo de pessoa</legend>
                {(['PF', 'PJ'] as const).map((type) => (
                  <label
                    key={type}
                    className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${personType === type ? 'selected bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    <input
                      type="radio"
                      name="personType"
                      value={type}
                      checked={personType === type}
                      className="sr-only"
                      onChange={() => {
                        setPersonType(type);
                        setFieldErrors({});
                        setFormValues((prev) => ({
                          ...prev,
                          document: formatDocument(prev.document ?? '', type)
                        }));
                      }}
                    />
                    {type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}
                  </label>
                ))}
              </fieldset>
              <div className="form-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={personType === 'PF' ? 'Nome completo' : 'Razão social'}
                  name="name"
                  value={formValues.name}
                  onChange={(e) => {
                    handleInputChange('name', e.target.value);
                  }}
                  maxLength={255}
                  placeholder={personType === 'PF' ? 'Ex: Maria Silva' : 'Ex: Empresa Exemplo Ltda'}
                  error={fieldErrors.name}
                />
                <Field
                  label="Nome da loja"
                  name="tradingName"
                  value={formValues.tradingName}
                  onChange={(e) => {
                    handleInputChange('tradingName', e.target.value);
                  }}
                  maxLength={120}
                  placeholder="Ex: Minha Loja"
                  error={fieldErrors.tradingName}
                />
                <Field
                  label="E-mail"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={(e) => {
                    handleInputChange('email', e.target.value);
                  }}
                  maxLength={254}
                  placeholder="nome@empresa.com.br"
                  error={fieldErrors.email}
                />
                <Field
                  label="Telefone"
                  name="phone"
                  value={formValues.phone}
                  onChange={(e) => {
                    handleInputChange('phone', e.target.value);
                  }}
                  maxLength={15}
                  placeholder="(00) 90000-0000"
                  error={fieldErrors.phone}
                />
                <Field
                  label={personType === 'PF' ? 'CPF' : 'CNPJ'}
                  name="document"
                  value={formValues.document}
                  onChange={(e) => {
                    handleInputChange('document', e.target.value);
                  }}
                  maxLength={personType === 'PF' ? 14 : 18}
                  placeholder={personType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  error={fieldErrors.document}
                />
                <Field
                  label="CEP"
                  name="zipCode"
                  value={formValues.zipCode}
                  onChange={(e) => {
                    handleInputChange('zipCode', e.target.value);
                  }}
                  maxLength={9}
                  placeholder="00000-000"
                  error={fieldErrors.zipCode}
                />
                <Field
                  label="Endereço"
                  name="address"
                  value={formValues.address}
                  onChange={(e) => {
                    handleInputChange('address', e.target.value);
                  }}
                  maxLength={255}
                  placeholder="Ex: Av. Paulista"
                  error={fieldErrors.address}
                />
                <Field
                  label="Número"
                  name="number"
                  value={formValues.number}
                  onChange={(e) => {
                    handleInputChange('number', e.target.value);
                  }}
                  maxLength={20}
                  placeholder="123"
                  error={fieldErrors.number}
                />
                <Field
                  label="Bairro"
                  name="neighborhood"
                  value={formValues.neighborhood}
                  onChange={(e) => {
                    handleInputChange('neighborhood', e.target.value);
                  }}
                  maxLength={120}
                  placeholder="Ex: Centro"
                  error={fieldErrors.neighborhood}
                />
                <div className="city-state-group grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Field
                      label="Cidade"
                      name="city"
                      value={formValues.city}
                      onChange={(e) => {
                        handleInputChange('city', e.target.value);
                      }}
                      maxLength={120}
                      placeholder="Ex: São Paulo"
                      error={fieldErrors.city}
                    />
                  </div>
                  <div>
                    <Field
                      label="UF"
                      name="state"
                      value={formValues.state}
                      onChange={(e) => {
                        handleInputChange('state', e.target.value);
                      }}
                      maxLength={2}
                      placeholder="SP"
                      error={fieldErrors.state}
                    />
                  </div>
                </div>
              </div>
              <div className="password-field full-width-field relative">
                <Field
                  label="Senha local"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formValues.password}
                  onChange={(e) => {
                    handleInputChange('password', e.target.value);
                  }}
                  autoComplete="new-password"
                  maxLength={128}
                  placeholder="Mínimo 12 caracteres"
                  error={fieldErrors.password}
                  hint="Mínimo de 12 caracteres"
                />
                <button
                  className="show-password absolute right-3 top-[2.1rem] text-xs font-semibold text-[#007a5a] hover:underline"
                  type="button"
                  onClick={() => {
                    setShowPassword((value) => !value);
                  }}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <ErrorMessage message={error} />
              <SubmitButton busy={busy}>Criar conta segura</SubmitButton>
            </form>
            <p className="switch-copy text-xs text-slate-500 text-center mt-4">
              Já possui conta?{' '}
              <button
                type="button"
                className="text-[#007a5a] font-semibold hover:underline"
                onClick={() => {
                  setScreen('login');
                  setFieldErrors({});
                  setError('');
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
            <Button
              className="primary-button w-full bg-[#007a5a] hover:bg-[#005c47]"
              type="button"
              onClick={() => {
                setScreen('connect');
              }}
            >
              Já recebi minhas credenciais
            </Button>
            <p className="switch-copy text-xs text-slate-500 text-center mt-4">
              <button
                type="button"
                className="text-[#007a5a] font-semibold hover:underline"
                onClick={() => {
                  setScreen('login');
                  setError('');
                }}
              >
                Voltar ao login
              </button>
            </p>
          </StatusCard>
        )}

        {screen === 'connect' && (
          <AuthCard
            title="Conectar Lera Box"
            subtitle="Informe uma única vez as credenciais recebidas por e-mail."
          >
            <div className="security-note rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 mb-4">
              A senha será enviada diretamente ao gateway e descartada da memória após esta
              solicitação.
            </div>
            <form
              ref={gatewayForm}
              onSubmit={onConnect}
              aria-label="Conectar gateway"
              className="space-y-4"
            >
              <Field
                label="CPF ou CNPJ"
                name="document"
                value={formValues.document}
                onChange={(e) => {
                  handleInputChange('document', e.target.value);
                }}
                maxLength={18}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
              />
              <Field
                label="Senha temporária da Lera Box"
                name="gatewayPassword"
                type="password"
                autoComplete="off"
                maxLength={128}
              />
              <ErrorMessage message={error} />
              <SubmitButton busy={busy}>Verificar e conectar</SubmitButton>
            </form>
            <p className="switch-copy text-xs text-slate-500 text-center mt-4">
              Deseja entrar com sua conta local?{' '}
              <button
                type="button"
                className="text-[#007a5a] font-semibold hover:underline"
                onClick={() => {
                  setScreen('login');
                  setError('');
                }}
              >
                Voltar ao login
              </button>
            </p>
          </AuthCard>
        )}

        {screen === 'active' && (
          <StatusCard
            icon="✓"
            eyebrow="Conexão verificada"
            title="Sua operação está pronta"
            description="O perfil da Lera Box foi confirmado e os dados de acesso foram protegidos."
          >
            <a
              className="primary-button inline-flex items-center justify-center rounded-lg bg-[#007a5a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#005c47] w-full"
              href="#/"
            >
              Ir para o dashboard
            </a>
          </StatusCard>
        )}
      </div>

      <footer className="auth-footer text-center text-xs text-slate-400 py-4">
        Privacidade <span className="mx-1">•</span> Termos de uso
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
    <Card
      className={`auth-card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4`}
    >
      <div className="card-mark flex justify-center pb-2">
        <BrandMark compact />
      </div>
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="auth-subtitle text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </Card>
  );
}

function Field({
  label,
  name,
  type = 'text',
  error,
  hint,
  required = true,
  ...props
}: {
  label: string;
  name: string;
  type?: string | undefined;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'type'>) {
  const inputId = props.id ?? `field-${name}`;
  return (
    <div
      className={`field flex flex-col gap-1.5 text-xs font-semibold text-slate-700${error ? ' field--error' : ''}`}
    >
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        required={required}
        name={name}
        type={type}
        className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
        {...props}
      />
      {error && (
        <span className="field-error-text text-xs text-red-600 font-normal" role="alert">
          {error}
        </span>
      )}
      {!error && hint && (
        <span className="field-hint text-xs text-slate-400 font-normal">{hint}</span>
      )}
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button
      className="primary-button w-full bg-[#007a5a] hover:bg-[#005c47] text-white font-semibold py-2.5 rounded-lg shadow-sm"
      type="submit"
      disabled={busy}
    >
      {busy ? 'Processando…' : children}
    </Button>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div
      className="form-error bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-semibold"
      role="alert"
    >
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
    <Card className="auth-card status-card w-full max-w-md p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 text-center">
      <div className="status-icon text-4xl mb-2" aria-hidden="true">
        {icon}
      </div>
      <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider block">
        {eyebrow}
      </span>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="auth-subtitle text-xs text-slate-500">{description}</p>
      <div className="pt-2">{children}</div>
    </Card>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
