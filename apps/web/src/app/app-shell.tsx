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
}

const navSections = [
  {
    title: 'OPERAÇÕES',
    items: [
      { label: 'Visão geral', href: '#/', icon: LayoutDashboard },
      { label: 'Links de pagamento', href: '#/links', icon: LinkIcon },
      { label: 'Transações', href: '#/transacoes', icon: Receipt }
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
      const rawName = data.userName || (data.email ? data.email.split('@')[0] : undefined);
      const userName = rawName ?? 'Conta do lojista';
      const merchantName = data.tradingName || userName;
      const initials =
        userName
          .split(' ')
          .filter((part): part is string => Boolean(part && part[0]))
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

export function AppShell({ content, activePath }: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const profile = useUserProfile();

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
        className={`sidebar fixed inset-y-0 left-0 top-11 z-50 flex w-64 flex-col border-r border-slate-200 bg-[#f8fafc] p-4 transition-transform duration-200 ease-in-out ${
          navigationOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="sidebar__head flex items-center justify-between pb-4">
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
        <div className="merchant-context border-b border-slate-200 pb-4 mb-4 flex flex-col gap-1">
          <span className="eyebrow text-[0.68rem] font-bold tracking-wider text-slate-400 uppercase">
            CONTA
          </span>
          <strong className="merchant-name text-base font-bold text-slate-900">
            {profile.merchantName}
          </strong>
          <span
            className={`merchant-context__state flex items-center gap-1.5 text-xs font-semibold ${
              profile.verified ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {profile.verified ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Conta verificada
              </>
            ) : (
              <>
                <span aria-hidden="true">◇</span> {profile.statusText}
              </>
            )}
          </span>
        </div>
        <nav
          id="primary-navigation"
          aria-label="Navegação principal"
          className="flex-1 space-y-4 overflow-y-auto"
        >
          {navSections.map((section) => (
            <div key={section.title} className="sidebar-section space-y-1">
              <span className="eyebrow text-[0.68rem] font-bold tracking-wider text-slate-400 uppercase px-2">
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
                        className={`navigation-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                          isActive
                            ? 'navigation-link--active bg-[#d8f3dc] text-[#005c47]'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
        <footer className="sidebar__footer border-t border-slate-200 pt-4 flex items-center justify-between mt-auto">
          <div className="user-profile flex items-center gap-3">
            <span
              className="sidebar__avatar flex h-9 w-9 items-center justify-center rounded-full bg-[#005c47] text-xs font-bold text-white"
              aria-hidden="true"
            >
              {profile.initials}
            </span>
            <div className="user-info flex flex-col">
              <strong className="text-sm font-semibold text-slate-900 leading-tight">
                {profile.userName}
              </strong>
              <small className="text-xs text-slate-500">Proprietário</small>
            </div>
          </div>
          <a
            className="logout-button flex items-center gap-1.5 rounded-md p-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            href="#/logout"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </a>
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
      <div className="md:pl-64 w-full min-w-0 flex flex-col flex-1">
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-6 md:p-8 lg:p-10 w-full max-w-[1700px] mx-auto space-y-6"
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
