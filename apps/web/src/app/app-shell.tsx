import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Wallet,
  Webhook,
  X
} from 'lucide-react';

import { BrandMark } from '../components/brand-mark.js';
import { SandboxNotice } from '../components/sandbox-notice.js';
import '../styles/tokens.css';

export interface AppShellProps {
  content?: ReactNode;
  activePath?: string;
  profile?: {
    merchant: { displayName: string };
    owner: { fullName: string | null; email: string };
    gatewayConnectionStatus: string | null;
  } | null;
  profileState?: 'loading' | 'ready' | 'unavailable';
  onLogout?: () => Promise<void> | void;
}

const navSections = [
  {
    title: 'OPERAÇÕES',
    items: [
      { label: 'Visão geral', href: '#/', icon: LayoutDashboard },
      { label: 'Links de pagamento', href: '#/links', icon: LinkIcon },
      { label: 'Transações', href: '#/transactions', icon: Receipt }
    ]
  },
  {
    title: 'FINANCEIRO',
    items: [
      { label: 'Carteira', href: '#/carteira', icon: Wallet },
      { label: 'Saques', href: '#/saques', icon: ArrowUpRight }
    ]
  },
  {
    title: 'INTEGRAÇÕES',
    items: [
      { label: 'Webhooks', href: '#/webhooks', icon: Webhook },
      { label: 'Configurações', href: '#/configuracoes', icon: Settings }
    ]
  }
] as const;

function useUserProfile() {
  if (typeof window === 'undefined') {
    return {
      merchantName: 'Seu negócio',
      userName: 'Conta do lojista',
      initials: 'CL',
      verified: false,
      statusText: 'Aguardando conexão'
    };
  }
  try {
    const raw = localStorage.getItem('baas_user_profile');
    if (raw) {
      const data = JSON.parse(raw) as {
        userName?: string;
        tradingName?: string;
        email?: string;
        status?: string;
      };
      const rawName =
        typeof data.userName === 'string' && data.userName.length > 0
          ? data.userName
          : typeof data.email === 'string'
            ? data.email.split('@')[0]
            : undefined;
      const userName = rawName ?? 'Conta do lojista';
      const merchantName =
        typeof data.tradingName === 'string' && data.tradingName.length > 0
          ? data.tradingName
          : userName;
      const initials =
        userName
          .split(' ')
          .filter((part): part is string => part.length > 0)
          .map((part) => part[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'CL';
      const verified = data.status === 'ACTIVE';
      return {
        merchantName,
        userName,
        initials,
        verified,
        statusText: verified ? 'Conta verificada' : 'Aguardando conexão'
      };
    }
  } catch {
    // fallback
  }
  return {
    merchantName: 'Seu negócio',
    userName: 'Conta do lojista',
    initials: 'CL',
    verified: false,
    statusText: 'Aguardando conexão'
  };
}

export function AppShell({
  content,
  activePath,
  profile,
  profileState = 'unavailable',
  onLogout
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const identityAvailable = profileState === 'ready' && profile !== null && profile !== undefined;
  const merchantName = identityAvailable ? profile.merchant.displayName : 'Identidade indisponível';
  const userName = identityAvailable
    ? (profile.owner.fullName ?? profile.owner.email)
    : 'Identidade indisponível';
  const initials = identityAvailable
    ? userName
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '—';
  const gatewayConnected = identityAvailable && profile.gatewayConnectionStatus === 'ACTIVE';
  const gatewayStatusText = gatewayConnected
    ? 'Gateway conectado'
    : profile?.gatewayConnectionStatus === 'AWAITING_CREDENTIALS'
      ? 'Aguardando credenciais'
      : 'Gateway não conectado';

  const currentHash =
    activePath ?? (typeof window !== 'undefined' ? window.location.hash || '#/' : '#/');

  return (
    <div className="app-surface bg-slate-50 min-h-screen pt-11">
      <a
        className="skip-link fixed left-4 top-[-5rem] z-[100] bg-slate-900 px-4 py-2 text-white focus:top-2"
        href="#main-content"
      >
        Pular para o conteúdo
      </a>
      <SandboxNotice variant="banner" />
      <button
        className="mobile-nav-toggle fixed left-4 top-14 z-20 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-md md:hidden"
        type="button"
        aria-controls="primary-navigation"
        aria-expanded={navigationOpen}
        aria-label="Abrir navegação"
        onClick={() => {
          setNavigationOpen(true);
        }}
      >
        <Menu className="h-5 w-5 text-slate-700" aria-hidden="true" />
      </button>
      <aside
        className={`sidebar fixed inset-y-0 left-0 top-11 z-50 flex w-[15.5rem] flex-col border-r border-slate-200 bg-[#f7f8f7] px-3 py-4 transition-transform duration-200 ease-in-out ${
          navigationOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="sidebar__head flex items-center justify-between px-1 pb-5">
          <BrandMark />
          <button
            className="sidebar__close flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 md:hidden"
            type="button"
            aria-label="Fechar navegação"
            onClick={() => {
              setNavigationOpen(false);
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="merchant-context mx-1 mb-4 border-b border-slate-200 pb-4 flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold tracking-[0.12em] text-slate-400 uppercase">
            Conta
          </span>
          <strong className="merchant-name text-[0.95rem] font-bold text-slate-900">
            {merchantName}
          </strong>
          <span
            className={`merchant-context__state flex items-center gap-1.5 text-xs font-semibold ${
              gatewayConnected ? 'text-[#0f8a5f]' : 'text-amber-700'
            }`}
          >
            {gatewayConnected ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-[#0f8a5f]" />
                {gatewayStatusText}
              </>
            ) : (
              <>
                <span aria-hidden="true">◇</span> {gatewayStatusText}
              </>
            )}
          </span>
        </div>
        <nav
          id="primary-navigation"
          aria-label="Navegação principal"
          className="flex-1 space-y-5 overflow-y-auto px-0.5"
        >
          {navSections.map((section) => (
            <div key={section.title} className="sidebar-section space-y-1">
              <span className="px-2.5 text-[0.65rem] font-bold tracking-[0.12em] text-slate-400 uppercase">
                {section.title}
              </span>
              <ul className="navigation-list space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    currentHash === item.href ||
                    (item.href === '#/links' && currentHash.includes('/links')) ||
                    (item.href === '#/' && (currentHash === '' || currentHash === '#/'));
                  return (
                    <li key={item.href}>
                      <a
                        className={`navigation-link relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                          isActive
                            ? 'navigation-link--active bg-[#e8fbd1] text-[#005c47] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#006b57]'
                            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                        }`}
                        href={item.href}
                      >
                        <Icon
                          className={`h-4 w-4 ${isActive ? 'text-[#005c47]' : 'text-slate-400'}`}
                        />
                        <span>{item.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <footer className="sidebar__footer mx-1 mt-auto border-t border-slate-200 pt-4 flex items-center justify-between gap-2">
          <div className="user-profile flex min-w-0 items-center gap-2.5">
            <span
              className="sidebar__avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#005c47] text-[0.7rem] font-bold text-white"
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="user-info flex min-w-0 flex-col">
              <strong className="truncate text-sm font-semibold leading-tight text-slate-900">
                {userName}
              </strong>
              <small className="text-xs text-slate-500">Administrador</small>
            </div>
          </div>
          <button
            className="logout-button inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            type="button"
            aria-label="Sair"
            disabled={logoutPending}
            onClick={() => {
              if (!onLogout || logoutPending) return;
              setLogoutPending(true);
              void Promise.resolve(onLogout()).finally(() => setLogoutPending(false));
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            {logoutPending ? 'Saindo…' : 'Sair'}
          </button>
        </footer>
      </aside>
      {navigationOpen && (
        <button
          className="sidebar-scrim fixed inset-0 top-11 z-40 bg-black/40 md:hidden"
          type="button"
          aria-label="Fechar menu ao clicar fora"
          onClick={() => {
            setNavigationOpen(false);
          }}
        />
      )}
      <div className="md:pl-[15.5rem] w-full min-w-0 flex flex-col flex-1">
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-5 pb-5 pt-16 md:p-7 lg:p-8 w-full max-w-[1600px] mx-auto space-y-5"
        >
          {content ?? (
            <>
              <div className="page-heading flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    Visão geral
                  </span>
                  <h1 className="text-3xl font-extrabold text-slate-900 mt-1">
                    Sua operação começa aqui
                  </h1>
                  <p className="text-slate-500 mt-1">
                    Conecte a Lera Box para acompanhar sua movimentação financeira.
                  </p>
                </div>
                <button
                  className="primary-action rounded-lg bg-[#007a5a] px-4 py-2.5 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
                  type="button"
                  disabled
                >
                  Criar link de pagamento
                </button>
              </div>
              <section
                className="empty-ledger mt-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm max-w-2xl"
                aria-labelledby="empty-ledger-title"
              >
                <div
                  className="empty-ledger__signal flex items-end gap-1.5 h-12 w-12 rounded-lg bg-slate-950 p-3 mb-6"
                  aria-hidden="true"
                >
                  <span className="w-1.5 h-2/5 bg-lime-400 rounded-full" />
                  <span className="w-1.5 h-4/5 bg-lime-400 rounded-full" />
                  <span className="w-1.5 h-full bg-lime-400 rounded-full" />
                </div>
                <span className="eyebrow text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Painel financeiro
                </span>
                <h2 id="empty-ledger-title" className="text-2xl font-bold text-slate-900 mt-2 mb-3">
                  Pronto para receber dados conciliados
                </h2>
                <p className="text-slate-600 text-sm max-w-md">
                  Dados financeiros reais aparecerão somente depois da conexão segura com o gateway.
                  Nenhum saldo demonstrativo será apresentado como operação real.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
