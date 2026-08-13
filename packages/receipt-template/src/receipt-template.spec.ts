import {
  formatBrlCurrency,
  formatReceiptDate,
  renderReceiptHtml,
  type ReceiptData
} from './index.js';

describe('@baas/receipt-template', () => {
  const sampleData: ReceiptData = {
    transactionId: 'tx-12345',
    externalReference: 'REF-2026-99',
    gatewayTransactionId: 'gw-999',
    type: 'PAYMENT_PIX',
    status: 'APPROVED',
    grossAmountCents: '5000',
    feeAmountCents: '150',
    netAmountCents: '4850',
    occurredAt: '2026-08-12T14:30:00.000Z'
  };

  it('formats BRL currency correctly from integer cents', () => {
    expect(formatBrlCurrency('5000')).toMatch(/R\$\s*50,00/);
    expect(formatBrlCurrency('150')).toMatch(/R\$\s*1,50/);
    expect(formatBrlCurrency('invalid')).toBe('R$ 0,00');
  });

  it('formats receipt date in pt-BR locale', () => {
    const formatted = formatReceiptDate('2026-08-12T14:30:00.000Z');
    expect(formatted).toContain('12/08/2026');
  });

  it('renders complete HTML receipt with escape guards and CSS print media rules', () => {
    const html = renderReceiptHtml(sampleData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('REF-2026-99');
    expect(html).toContain('PAYMENT_PIX');
    expect(html).toContain('gw-999');
    expect(html).toContain('tx-12345');
    expect(html).toContain('@media print');
  });

  it('escapes dangerous HTML characters in reference and status', () => {
    const xssData: ReceiptData = {
      ...sampleData,
      externalReference: '<script>alert(1)</script>',
      status: '<b>APPROVED</b>'
    };
    const html = renderReceiptHtml(xssData);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
