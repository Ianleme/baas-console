import type { ReactNode } from 'react';

import { BrandMark } from '../components/brand-mark.js';
import { SandboxNotice } from '../components/sandbox-notice.js';
import '../styles/tokens.css';

export function PayShell({ content }: { content?: ReactNode }) {
  return (
    <div className="pay-surface bg-slate-50 min-h-screen flex flex-col justify-between p-4 sm:p-6">
      <header className="pay-header flex items-center justify-between max-w-xl mx-auto w-full pb-6">
        <BrandMark />
        <SandboxNotice variant="badge" />
      </header>
      <main
        className="checkout-stage flex-1 flex items-center justify-center py-6"
        aria-label="Checkout sandbox"
      >
        <section
          className="checkout-shell bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-w-xl w-full space-y-6"
          aria-label="Pagamento sandbox"
        >
          <div className="checkout-shell__mark flex justify-center pb-2">
            <BrandMark compact />
          </div>
          {content ?? (
            <div className="space-y-2">
              <span className="eyebrow text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Pagamento seguro
              </span>
              <h1 id="checkout-title" className="text-2xl font-bold text-slate-900">
                Checkout de teste
              </h1>
              <p className="text-slate-500 text-sm">
                O link de pagamento será carregado aqui quando uma sessão válida estiver disponível.
              </p>
            </div>
          )}
          <div
            className="sandbox-warning rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3"
            role="note"
          >
            <span aria-hidden="true" className="font-bold text-base text-amber-700">
              !
            </span>
            <p>
              <strong className="font-bold">Este ambiente é apenas sandbox.</strong> Não use dados
              reais de cartão ou documentos de terceiros.
            </p>
          </div>
        </section>
      </main>
      <footer className="pay-footer text-center text-xs text-slate-400 py-4">
        BaaS Console · ambiente controlado de demonstração
      </footer>
    </div>
  );
}
