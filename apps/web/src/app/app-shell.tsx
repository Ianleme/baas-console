import { useState } from 'react';

import { BrandMark } from '../components/brand-mark.js';
import { SandboxNotice } from '../components/sandbox-notice.js';
import '../styles/tokens.css';
import './app-shell.css';

const navigation = [
  ['Visão geral', '#/'],
  ['Links de pagamento', '#/links'],
  ['Transações', '#/transacoes'],
  ['Carteira', '#/carteira'],
  ['Saques', '#/saques'],
  ['Webhooks', '#/webhooks'],
  ['Configurações', '#/configuracoes']
] as const;

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="app-surface">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <SandboxNotice variant="banner" />
      <button
        className="mobile-nav-toggle"
        type="button"
        aria-controls="primary-navigation"
        aria-expanded={navigationOpen}
        aria-label="Abrir navegação"
        onClick={() => {
          setNavigationOpen(true);
        }}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <aside className={`sidebar${navigationOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__head">
          <BrandMark />
          <button
            className="sidebar__close"
            type="button"
            aria-label="Fechar navegação"
            onClick={() => {
              setNavigationOpen(false);
            }}
          >
            ×
          </button>
        </div>
        <div className="merchant-context">
          <span className="eyebrow">Conta</span>
          <strong>Seu negócio</strong>
          <span className="merchant-context__state">
            <span aria-hidden="true">◇</span> Aguardando conexão
          </span>
        </div>
        <nav id="primary-navigation" aria-label="Navegação principal">
          <span className="eyebrow">Operação</span>
          <ul className="navigation-list">
            {navigation.map(([label, href], index) => (
              <li key={href}>
                <a
                  className={
                    index === 0 ? 'navigation-link navigation-link--active' : 'navigation-link'
                  }
                  href={href}
                >
                  <span className="navigation-link__glyph" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="sidebar__footer">
          <span className="sidebar__avatar" aria-hidden="true">
            IA
          </span>
          <span>
            <strong>Conta do lojista</strong>
            <small>Proprietário</small>
          </span>
        </footer>
      </aside>
      {navigationOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Fechar menu ao clicar fora"
          onClick={() => {
            setNavigationOpen(false);
          }}
        />
      )}
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <span className="eyebrow eyebrow--green">Visão geral</span>
            <h1>Sua operação começa aqui</h1>
            <p>Conecte a Lera Box para acompanhar sua movimentação financeira.</p>
          </div>
          <button className="primary-action" type="button" disabled>
            Criar link de pagamento
          </button>
        </div>
        <section className="empty-ledger" aria-labelledby="empty-ledger-title">
          <div className="empty-ledger__signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="eyebrow">Painel financeiro</span>
          <h2 id="empty-ledger-title">Pronto para receber dados conciliados</h2>
          <p>
            Dados financeiros reais aparecerão somente depois da conexão segura com o gateway.
            Nenhum saldo demonstrativo será apresentado como operação real.
          </p>
        </section>
      </main>
    </div>
  );
}
