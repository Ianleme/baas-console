export interface ReceiptData {
  transactionId: string;
  externalReference: string;
  gatewayTransactionId: string | null;
  type: string;
  status: string;
  grossAmountCents: string;
  feeAmountCents: string;
  netAmountCents: string;
  occurredAt: string;
  merchantName?: string;
}

export function formatBrlCurrency(centsString: string): string {
  try {
    const cents = BigInt(centsString);
    const amount = Number(cents) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  } catch {
    return 'R$ 0,00';
  }
}

export function formatReceiptDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return isoDate;
  }
}

export function translateStatus(status: string): string {
  const upper = status.trim().toUpperCase();
  switch (upper) {
    case 'APPROVED':
    case 'PAID':
    case 'SUCCESS':
      return 'APROVADO';
    case 'DENIED':
    case 'FAILED':
    case 'REJECTED':
      return 'NEGADO';
    case 'PENDING':
      return 'PENDENTE';
    case 'EXPIRED':
      return 'EXPIRADO';
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELADO';
    default:
      return upper;
  }
}

export function translateType(type: string): string {
  const upper = type.trim().toUpperCase();
  switch (upper) {
    case 'DEBIT':
      return 'DÉBITO';
    case 'CREDIT':
      return 'CRÉDITO';
    case 'PAYMENT':
    case 'PAYMENT_PIX':
    case 'PAYMENT_CARD':
      return 'PAGAMENTO';
    case 'WITHDRAWAL':
      return 'SAQUE';
    case 'PIX':
      return 'PIX';
    case 'CARD':
      return 'CARTÃO';
    default:
      return upper;
  }
}

export function getStatusBadgeStyle(status: string): { bg: string; color: string; border: string } {
  const upper = status.trim().toUpperCase();
  switch (upper) {
    case 'APPROVED':
    case 'PAID':
    case 'SUCCESS':
    case 'APROVADO':
      return { bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    case 'DENIED':
    case 'FAILED':
    case 'REJECTED':
    case 'NEGADO':
      return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
    case 'PENDING':
    case 'PENDENTE':
      return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
    case 'EXPIRED':
    case 'EXPIRADO':
    case 'CANCELLED':
    case 'CANCELED':
    case 'CANCELADO':
      return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    default:
      return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  }
}

export function renderReceiptHtml(data: ReceiptData): string {
  const gross = formatBrlCurrency(data.grossAmountCents);
  const net = formatBrlCurrency(data.netAmountCents);
  const dateFormatted = formatReceiptDate(data.occurredAt);
  const translatedStatus = translateStatus(data.status);
  const translatedType = translateType(data.type);
  const badgeStyle = getStatusBadgeStyle(data.status);
  const companyName = data.merchantName || 'BaaS Console';

  // Compute security hash
  let authHash = `${data.transactionId}:${data.externalReference}:${data.occurredAt}:${data.netAmountCents}`;
  try {
    let hash = 0;
    for (let i = 0; i < authHash.length; i++) {
      hash = (hash << 5) - hash + authHash.charCodeAt(i);
      hash |= 0;
    }
    authHash =
      'AUTH-' +
      Math.abs(hash).toString(16).toUpperCase().padStart(8, '0') +
      '-' +
      data.transactionId.replace(/-/g, '').slice(0, 16).toUpperCase();
  } catch {
    authHash = data.transactionId.toUpperCase();
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comprovante - ${escapeHtml(data.externalReference)}</title>
<style>
  @page { size: A4; margin: 12mm 15mm; background-color: #f1f5f9; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background-color: #f1f5f9; font-size: 13px; line-height: 1.45; -webkit-print-color-adjust: exact;
    padding: 24px 16px;
  }
  .receipt-card { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); overflow: hidden; }
  .brand-bar { height: 6px; background: linear-gradient(90deg, #006b57 0%, #10b981 100%); }
  .header { padding: 26px 32px 20px 32px; display: table; width: 100%; border-bottom: 1px solid #f1f5f9; }
  .header-left { display: table-cell; vertical-align: middle; }
  .brand-logo { display: inline-block; width: 38px; height: 38px; margin-right: 12px; vertical-align: middle; }
  .brand-title-wrap { display: inline-block; vertical-align: middle; }
  .brand-name { font-size: 17px; font-weight: 800; color: #0f172a; }
  .brand-sub { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  .header-right { display: table-cell; vertical-align: middle; text-align: right; }
  .doc-type { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #334155; }
  .doc-date { font-size: 11px; color: #64748b; margin-top: 3px; }
  
  .hero-box { background: #f8fafc; padding: 24px 32px; border-bottom: 1px solid #e2e8f0; display: table; width: 100%; }
  .hero-amount { display: table-cell; vertical-align: middle; }
  .hero-label { font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .hero-value { font-size: 34px; font-weight: 800; color: #0f172a; letter-spacing: -1px; margin-top: 2px; }
  .hero-status { display: table-cell; vertical-align: middle; text-align: right; }
  .status-badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-weight: 700; font-size: 11px; background: ${badgeStyle.bg}; color: ${badgeStyle.color}; border: 1px solid ${badgeStyle.border}; }
  
  .section { padding: 18px 32px; border-bottom: 1px solid #f1f5f9; }
  .section-title { font-size: 10.5px; font-weight: 700; color: #006b57; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; }
  .table-data { width: 100%; border-collapse: collapse; }
  .table-data tr { border-bottom: 1px dashed #f1f5f9; }
  .table-data tr:last-child { border-bottom: none; }
  .table-data td { padding: 7px 0; font-size: 12.5px; }
  .label-cell { color: #64748b; font-weight: 500; width: 40%; }
  .value-cell { color: #0f172a; font-weight: 600; text-align: right; width: 60%; }
  .mono { font-family: "Courier New", monospace; font-size: 11.5px; }
  
  .security-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin: 20px 32px 22px 32px; }
  .sec-hash-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; font-family: monospace; font-size: 9.5px; color: #475569; word-break: break-all; }
  
  @media print {
    body { background-color: #ffffff; padding: 0; }
    .receipt-card { border: none; box-shadow: none; max-width: 100%; }
  }
</style>
</head>
<body>
<div class="receipt-card">
  <div class="brand-bar"></div>
  <div class="header">
    <div class="header-left">
      <svg class="brand-logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 3.5 42 14v20L24 44.5 6 34V14L24 3.5Z" stroke="#006b57" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="m14 17 10-5.8L34 17 24 23 14 17Zm0 14 10 5.8L34 31l-10-6-10 6Z" stroke="#006b57" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="brand-title-wrap">
        <div class="brand-name">${escapeHtml(companyName)}</div>
        <div class="brand-sub">PLATAFORMA BANCÁRIA DIGITAL</div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-type">Comprovante de Operação</div>
      <div class="doc-date">${escapeHtml(dateFormatted)}</div>
    </div>
  </div>

  <div class="hero-box">
    <div class="hero-amount">
      <div class="hero-label">Valor Líquido da Operação</div>
      <div class="hero-value">${escapeHtml(net)}</div>
    </div>
    <div class="hero-status">
      <div class="status-badge">${escapeHtml(translatedStatus)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dados da Operação</div>
    <table class="table-data">
      <tr><td class="label-cell">Código de Referência</td><td class="value-cell mono">${escapeHtml(data.externalReference)}</td></tr>
      <tr><td class="label-cell">Tipo de Movimentação</td><td class="value-cell">${escapeHtml(translatedType)}</td></tr>
      <tr><td class="label-cell">Data e Horário Oficial</td><td class="value-cell">${escapeHtml(dateFormatted)} (Horário de Brasília)</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Discriminação Financeira</div>
    <table class="table-data">
      <tr><td class="label-cell">Valor Bruto</td><td class="value-cell">${escapeHtml(gross)}</td></tr>
      <tr><td class="label-cell" style="font-weight:700;">Valor Líquido Total</td><td class="value-cell" style="color:#006b57; font-weight:800;">${escapeHtml(net)}</td></tr>
    </table>
  </div>

  <div class="security-card">
    <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:#334155; margin-bottom:4px;">Autenticação Digital &amp; Segurança</div>
    <div class="sec-hash-box">HASH: ${escapeHtml(authHash)}</div>
    <div style="font-size:9.5px; color:#94a3b8; margin-top:5px;">Documento autenticado eletronicamente pelo ecossistema BaaS Console. Válido para conciliação contábil e fiscal.</div>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
