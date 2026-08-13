import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Mail, UserRound } from 'lucide-react';

import { Badge } from '../../components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';

export interface CurrentProfile {
  merchant: { legalName: string; displayName: string };
  owner: { fullName: string | null; email: string };
  gatewayConnectionStatus: 'AWAITING_CREDENTIALS' | 'ACTIVE' | 'PROFILE_MISMATCH' | null;
}

export interface CurrentProfileApi {
  load(): Promise<CurrentProfile>;
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
          <Badge className={gateway.className}>{gateway.label}</Badge>
          <p className="mt-3 text-sm text-slate-500">Estado informado pelo perfil atual.</p>
        </CardContent>
      </Card>
    </div>
  );
}
