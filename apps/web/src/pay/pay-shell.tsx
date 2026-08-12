import { BrandMark } from '../components/brand-mark.js';
import { SandboxNotice } from '../components/sandbox-notice.js';
import '../styles/tokens.css';
import './pay-shell.css';

export function PayShell() {
  return (
    <div className="pay-surface">
      <header className="pay-header">
        <BrandMark />
        <SandboxNotice variant="badge" />
      </header>
      <main className="checkout-stage" aria-label="Checkout sandbox">
        <section className="checkout-shell" aria-labelledby="checkout-title">
          <div className="checkout-shell__mark">
            <BrandMark compact />
          </div>
          <span className="eyebrow eyebrow--green">Pagamento seguro</span>
          <h1 id="checkout-title">Checkout de teste</h1>
          <p>
            O link de pagamento será carregado aqui quando uma sessão válida estiver disponível.
          </p>
          <div className="sandbox-warning" role="note">
            <span aria-hidden="true">!</span>
            <p>
              <strong>Este ambiente é apenas sandbox.</strong>
              Não use dados reais de cartão ou documentos de terceiros.
            </p>
          </div>
        </section>
      </main>
      <footer className="pay-footer">BaaS Console · ambiente controlado de demonstração</footer>
    </div>
  );
}
