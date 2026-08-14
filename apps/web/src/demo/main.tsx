import '../styles/tokens.css';

async function loadDemo(): Promise<{
  merchant: { displayName: string };
  balanceCents: string;
  mode: string;
}> {
  const sessionResponse = await window.fetch('/api/v1/demo/session', { method: 'POST' });
  if (!sessionResponse.ok) throw new Error('DEMO_UNAVAILABLE');
  const session = (await sessionResponse.json()) as { accessToken: string };
  const viewResponse = await window.fetch('/api/v1/demo/view', {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
  if (!viewResponse.ok) throw new Error('DEMO_VIEW_UNAVAILABLE');
  return (await viewResponse.json()) as {
    merchant: { displayName: string };
    balanceCents: string;
    mode: string;
  };
}

const root = document.querySelector('#demo-root');
if (!root) throw new Error('DEMO_ROOT_MISSING');
void loadDemo()
  .then((view) => {
    const amount = (Number(view.balanceCents) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    root.innerHTML = `<main><h1>${view.merchant.displayName}</h1><p>Somente leitura</p><strong>${amount}</strong><p>Tour demonstrativo sem senha pública.</p></main>`;
  })
  .catch(() => {
    root.innerHTML = '<main><h1>Demo indisponível</h1></main>';
  });
