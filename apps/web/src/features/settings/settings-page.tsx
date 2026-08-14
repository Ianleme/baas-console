import { useEffect, useState, type SyntheticEvent, type InputHTMLAttributes } from 'react';
import { ArrowRight, Building2, CheckCircle2, KeyRound, Mail, UserRound } from 'lucide-react';

import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';

export interface CurrentProfile {
  merchant: { legalName: string; displayName: string };
  owner: { fullName: string | null; email: string };
  gatewayConnectionStatus:
    | 'REGISTRATION_PENDING'
    | 'GATEWAY_REGISTRATION_FAILED'
    | 'GATEWAY_REGISTRATION_UNKNOWN'
    | 'AWAITING_CREDENTIALS'
    | 'ACTIVE'
    | 'PROFILE_MISMATCH'
    | 'ERROR'
    | 'DISCONNECTED'
    | null;
}

export interface CurrentProfileApi {
  load(): Promise<CurrentProfile>;
  connect(input: { document: string; password: string }): Promise<'ACTIVE' | 'PROFILE_MISMATCH'>;
  registerGateway?: (input: Record<string, string>) => Promise<string>;
}

function gatewayStatus(status: CurrentProfile['gatewayConnectionStatus']) {
  if (status === 'ACTIVE')
    return { label: 'Conectado', className: 'bg-emerald-50 text-emerald-700' };
  if (status === 'PROFILE_MISMATCH')
    return { label: 'Perfil divergente', className: 'bg-amber-50 text-amber-800' };
  if (status === 'AWAITING_CREDENTIALS')
    return { label: 'Aguardando credenciais', className: 'bg-slate-100 text-slate-700' };
  if (status === 'GATEWAY_REGISTRATION_FAILED')
    return { label: 'Cadastro não concluído', className: 'bg-red-50 text-red-700' };
  if (status === 'GATEWAY_REGISTRATION_UNKNOWN' || status === 'REGISTRATION_PENDING')
    return { label: 'Cadastro em análise', className: 'bg-amber-50 text-amber-800' };
  return { label: 'Indisponível', className: 'bg-slate-100 text-slate-700' };
}

export function SettingsPage({ api }: { api: CurrentProfileApi }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .load()
      .then(setProfile)
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api]);

  if (loading)
    return (
      <p role="status" className="p-4 text-slate-500">
        Carregando configurações…
      </p>
    );
  if (failed || !profile) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
        Não foi possível carregar as configurações. Tente novamente mais tarde.
      </p>
    );
  }

  const gateway = gatewayStatus(profile.gatewayConnectionStatus);
  const canConnect = profile.gatewayConnectionStatus === 'AWAITING_CREDENTIALS';
  const registrationFailed = profile.gatewayConnectionStatus === 'GATEWAY_REGISTRATION_FAILED';
  const registrationPending = ['GATEWAY_REGISTRATION_UNKNOWN', 'REGISTRATION_PENDING'].includes(
    profile.gatewayConnectionStatus ?? ''
  );

  function onConnect(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const documentVal = data.get('document');
    const passwordVal = data.get('password');
    const document = (typeof documentVal === 'string' ? documentVal : '').trim();
    const password = typeof passwordVal === 'string' ? passwordVal : '';
    const errors: Record<string, string> = {};
    if (!document) errors.document = 'Informe o CPF ou CNPJ usado na Lera Box.';
    if (!password) errors.password = 'Informe a senha temporária da Lera Box.';
    setFieldErrors(errors);
    setConnectionMessage(null);
    setConnectionError(null);
    if (Object.keys(errors).length > 0) return;

    // Clear the password field before handing it to the client; it must not remain in the UI.
    const passwordInput = form.elements.namedItem('password');
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
    setConnecting(true);
    void api
      .connect({ document, password })
      .then((result) => {
        if (result === 'PROFILE_MISMATCH') {
          setConnectionError(
            'As credenciais não pertencem a este perfil. Verifique o documento e tente novamente.'
          );
          return;
        }
        setProfile((current) =>
          current ? { ...current, gatewayConnectionStatus: 'ACTIVE' } : current
        );
        setFormOpen(false);
        setConnectionMessage(
          'Gateway conectado. Webhooks e pagamentos estão liberados para esta conta.'
        );
      })
      .catch(() => {
        setConnectionError(
          'Não foi possível conectar agora. Verifique os dados e tente novamente.'
        );
      })
      .finally(() => {
        setConnecting(false);
      });
  }

  function onRegisterGateway(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.registerGateway) return;
    const data = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      Array.from(data.entries(), ([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : ''
      ])
    );
    setConnectionError(null);
    setConnectionMessage(null);
    setRegistering(true);
    void api
      .registerGateway(input)
      .then((status) => {
        setProfile((current) =>
          current
            ? {
                ...current,
                gatewayConnectionStatus: status as CurrentProfile['gatewayConnectionStatus']
              }
            : current
        );
        if (status === 'AWAITING_CREDENTIALS') {
          setRegistrationOpen(false);
          setConnectionMessage(
            'Cadastro enviado à Lera Box. Aguarde a senha temporária no e-mail informado.'
          );
        } else {
          setConnectionError(
            'A Lera Box ainda não confirmou o cadastro. Revise os dados e tente novamente mais tarde.'
          );
        }
      })
      .catch(() => {
        setConnectionError(
          'Não foi possível cadastrar na Lera Box. Revise os dados e tente novamente.'
        );
      })
      .finally(() => {
        setRegistering(false);
      });
  }
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <span className="eyebrow eyebrow--green">Conta</span>
        <h1 className="text-[2rem] font-extrabold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">Consulte os dados da conta e da conexão.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-[#006b57]" /> Negócio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Nome de exibição</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {profile.merchant.displayName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Razão social</dt>
                <dd className="mt-1 font-semibold text-slate-900">{profile.merchant.legalName}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-[#006b57]" /> Titular
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Nome</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {profile.owner.fullName ?? profile.owner.email}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-slate-500">
                  <Mail className="h-3.5 w-3.5" /> E-mail
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">{profile.owner.email}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-[#006b57]" /> Conexão do gateway
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className={gateway.className}>{gateway.label}</Badge>
              {canConnect ? (
                <>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    A conta ainda não está conectada à Lera Box. Conecte-a com as credenciais
                    temporárias recebidas por e-mail para liberar webhooks e pagamentos.
                  </p>
                  {!formOpen && (
                    <Button
                      className="mt-4"
                      type="button"
                      onClick={() => {
                        setFormOpen(true);
                      }}
                    >
                      Conectar gateway <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </>
              ) : registrationFailed ? (
                <>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    O cadastro na Lera Box não foi concluído. Cadastre novamente usando os dados do
                    titular. Depois da aprovação, a Lera Box enviará a senha temporária por e-mail.
                  </p>
                  {!registrationOpen && (
                    <Button
                      className="mt-4"
                      type="button"
                      onClick={() => {
                        setRegistrationOpen(true);
                      }}
                    >
                      Cadastrar na Lera Box <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </>
              ) : registrationPending ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Ainda não foi possível confirmar o cadastro na Lera Box. Aguarde a confirmação do
                  gateway antes de informar credenciais.
                </p>
              ) : (
                <div>
                  <p className="mt-3 text-sm text-slate-600">
                    {profile.gatewayConnectionStatus === 'ACTIVE'
                      ? 'Sua conexão está ativa. Webhooks e pagamentos podem ser usados por esta conta.'
                      : 'A conexão com a Lera Box ainda não está disponível.'}
                  </p>
                </div>
              )}
            </div>
          </div>
          {connectionMessage && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
            >
              {connectionMessage}
            </p>
          )}
          {connectionError && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800"
            >
              {connectionError}
            </p>
          )}
          {registrationOpen && registrationFailed && (
            <form
              aria-label="Cadastrar na Lera Box"
              onSubmit={onRegisterGateway}
              className="mt-5 max-w-4xl border-t border-slate-100 pt-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-semibold text-slate-800">
                  Tipo de pessoa
                  <select
                    name="personType"
                    className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                    defaultValue="PF"
                  >
                    <option value="PF">Pessoa física</option>
                    <option value="PJ">Pessoa jurídica</option>
                  </select>
                </label>
                <GatewayField
                  name="name"
                  label="Nome ou razão social"
                  defaultValue={profile.merchant.legalName}
                />
                <GatewayField
                  name="tradingName"
                  label="Nome da loja"
                  defaultValue={profile.merchant.displayName}
                />
                <GatewayField
                  name="email"
                  label="E-mail"
                  type="email"
                  defaultValue={profile.owner.email}
                />
                <GatewayField name="phone" label="Telefone com DDD" placeholder="(11) 99999-9999" />
                <GatewayField name="document" label="CPF ou CNPJ" />
                <GatewayField name="zipCode" label="CEP" placeholder="00000-000" />
                <GatewayField name="address" label="Endereço" />
                <GatewayField name="number" label="Número" />
                <GatewayField name="complement" label="Complemento" required={false} />
                <GatewayField name="neighborhood" label="Bairro" />
                <GatewayField name="city" label="Cidade" />
                <GatewayField name="state" label="UF" maxLength={2} />
              </div>
              <div className="mt-5 flex gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRegistrationOpen(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={registering}>
                  {registering ? 'Cadastrando…' : 'Enviar cadastro à Lera Box'}
                </Button>
              </div>
            </form>
          )}
          {formOpen && canConnect && (
            <form
              aria-label="Conectar gateway"
              onSubmit={onConnect}
              className="mt-5 max-w-xl border-t border-slate-100 pt-5"
            >
              <p className="mb-4 text-sm text-slate-600">
                Use somente os dados da Lera Box. A senha é usada uma única vez e descartada após o
                envio.
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="gateway-document"
                    className="mb-1.5 block text-sm font-semibold text-slate-800"
                  >
                    CPF ou CNPJ
                  </label>
                  <input
                    id="gateway-document"
                    name="document"
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.document)}
                    aria-describedby={fieldErrors.document ? 'gateway-document-error' : undefined}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                  {fieldErrors.document && (
                    <p id="gateway-document-error" className="mt-1.5 text-sm text-red-700">
                      {fieldErrors.document}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="gateway-password"
                    className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                    Senha temporária
                  </label>
                  <input
                    id="gateway-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'gateway-password-error' : undefined}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                  {fieldErrors.password && (
                    <p id="gateway-password-error" className="mt-1.5 text-sm text-red-700">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setFieldErrors({});
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={connecting}>
                  {connecting ? 'Conectando…' : 'Conectar gateway'}
                </Button>
              </div>
              {connecting && (
                <p role="status" className="mt-3 text-sm text-slate-500">
                  Validando sua conexão com a Lera Box…
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GatewayField({
  name,
  label,
  required = true,
  ...props
}: {
  name: string;
  label: string;
  required?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      <input
        {...props}
        name={name}
        required={required}
        className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
    </label>
  );
}
