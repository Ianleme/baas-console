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
  const fee = formatBrlCurrency(data.feeAmountCents);
  const net = formatBrlCurrency(data.netAmountCents);
  const dateFormatted = formatReceiptDate(data.occurredAt);
  const translatedStatus = translateStatus(data.status);
  const translatedType = translateType(data.type);
  const badgeStyle = getStatusBadgeStyle(data.status);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Comprovante - ${escapeHtml(data.externalReference)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      margin: 0;
      padding: 32px 16px;
    }
    .receipt-card {
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .receipt-header {
      text-align: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 24px;
    }
    .brand {
      font-size: 14px;
      font-weight: 800;
      color: #007a5a;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 8px 0 4px 0;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      background: ${badgeStyle.bg};
      color: ${badgeStyle.color};
      border: 1px solid ${badgeStyle.border};
      margin-top: 8px;
    }
    .amount-large {
      font-size: 32px;
      font-weight: 900;
      color: #0f172a;
      text-align: center;
      margin: 16px 0 24px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 14px;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #64748b;
      font-weight: 500;
    }
    .detail-value {
      color: #0f172a;
      font-weight: 600;
      word-break: break-all;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      margin-top: 32px;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-card { border: none; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    <div class="receipt-header">
      <div class="brand">BaaS Console</div>
      <h1 class="title">Comprovante de Operação</h1>
      <span class="status-badge">${escapeHtml(translatedStatus)}</span>
    </div>

    <div class="amount-large">${net}</div>

    <div class="detail-list">
      <div class="detail-row">
        <span class="detail-label">Referência</span>
        <span class="detail-value">${escapeHtml(data.externalReference)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tipo</span>
        <span class="detail-value">${escapeHtml(translatedType)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Valor Bruto</span>
        <span class="detail-value">${gross}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Taxa</span>
        <span class="detail-value">${fee}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Valor Líquido</span>
        <span class="detail-value">${net}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ID Gateway</span>
        <span class="detail-value">${escapeHtml(data.gatewayTransactionId ?? 'N/A')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ID Transação</span>
        <span class="detail-value">${escapeHtml(data.transactionId)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Data e Hora</span>
        <span class="detail-value">${escapeHtml(dateFormatted)}</span>
      </div>
    </div>

    <div class="footer">
      Documento gerado automaticamente pelo BaaS Console · Autenticidade garantida
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
