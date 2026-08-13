import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, CheckCircle2, KeyRound, Mail, UserRound } from 'lucide-react';

import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';

export interface CurrentProfile {
  merchant: { legalName: string; displayName: string };
  owner: { fullName: string | null; email: string };
  gatewayConnectionStatus: 'AWAITING_CREDENTIALS' | 'ACTIVE' | 'PROFILE_MISMATCH' | null;
}

export interface CurrentProfileApi {
  load(): Promise<CurrentProfile>;
  connect(input: { document: string; password: string }): Promise<'ACTIVE' | 'PROFILE_MISMATCH'>;
}

function gatewayStatus(status: CurrentProfile['gatewayConnectionStatus']) {
  if (status === 'ACTIVE')
    return { label: 'Conectado', className: 'bg-emerald-50 text-emerald-700' };
  if (status === 'PROFILE_MISMATCH')
    return { label: 'Perfil divergente', className: 'bg-amber-50 text-amber-800' };
  if (status === 'AWAITING_CREDENTIALS')
    return { label: 'Aguardando credenciais', className: 'bg-slate-100 text-slate-700' };
  return { label: 'Indisponível', className: 'bg-slate-100 text-slate-700' };
}

export function SettingsPage({ api }: { api: CurrentProfileApi }) {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .load()
      .then(setProfile)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
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
  const canConnect = profile.gatewayConnectionStatus !== 'ACTIVE';

  function onConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const document = String(data.get('document') ?? '').trim();
    const password = String(data.get('password') ?? '');
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
      .finally(() => setConnecting(false));
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
                    <Button className="mt-4" type="button" onClick={() => setFormOpen(true)}>
                      Conectar gateway <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  Sua conexão está ativa. Webhooks e pagamentos podem ser usados por esta conta.
                </p>
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
