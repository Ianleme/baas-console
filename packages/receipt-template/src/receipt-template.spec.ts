import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatBrlCurrency,
  formatReceiptDate,
  getStatusBadgeStyle,
  renderReceiptHtml,
  translateStatus,
  translateType,
  type ReceiptData
} from './index.js';

void describe('@baas/receipt-template', () => {
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

  void it('formats BRL currency correctly from integer cents', () => {
    assert.match(formatBrlCurrency('5000'), /R\$\s*50,00/);
    assert.match(formatBrlCurrency('150'), /R\$\s*1,50/);
    assert.equal(formatBrlCurrency('invalid'), 'R$ 0,00');
  });

  void it('formats receipt date in pt-BR locale', () => {
    const formatted = formatReceiptDate('2026-08-12T14:30:00.000Z');
    assert.ok(formatted.includes('12/08/2026'));
  });

  void it('translates status and type into PT-BR correctly', () => {
    assert.equal(translateStatus('APPROVED'), 'APROVADO');
    assert.equal(translateStatus('DENIED'), 'NEGADO');
    assert.equal(translateStatus('PENDING'), 'PENDENTE');
    assert.equal(translateStatus('EXPIRED'), 'EXPIRADO');

    assert.equal(translateType('DEBIT'), 'DÉBITO');
    assert.equal(translateType('CREDIT'), 'CRÉDITO');
    assert.equal(translateType('PAYMENT_PIX'), 'PAGAMENTO');
    assert.equal(translateType('WITHDRAWAL'), 'SAQUE');
  });

  void it('provides red badge styles for DENIED status and green for APPROVED', () => {
    const deniedStyle = getStatusBadgeStyle('DENIED');
    assert.equal(deniedStyle.bg, '#fee2e2');
    assert.equal(deniedStyle.color, '#b91c1c');

    const approvedStyle = getStatusBadgeStyle('APPROVED');
    assert.equal(approvedStyle.bg, '#dcfce7');
    assert.equal(approvedStyle.color, '#15803d');
  });

  void it('renders complete HTML receipt with translated strings, escape guards and CSS print media rules', () => {
    const html = renderReceiptHtml(sampleData);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('REF-2026-99'));
    assert.ok(html.includes('APROVADO'));
    assert.ok(html.includes('PAGAMENTO'));
    assert.ok(html.includes('Comprovante de Operação'));
    assert.ok(html.includes('@media print'));
  });

  void it('renders DENIED receipt with red badge and translated text NEGADO', () => {
    const html = renderReceiptHtml({
      ...sampleData,
      status: 'DENIED',
      type: 'DEBIT'
    });
    assert.ok(html.includes('NEGADO'));
    assert.ok(html.includes('DÉBITO'));
    assert.ok(html.includes('background: #fee2e2'));
    assert.ok(html.includes('color: #b91c1c'));
  });

  void it('escapes dangerous HTML characters in reference and status', () => {
    const xssData: ReceiptData = {
      ...sampleData,
      externalReference: '<script>alert(1)</script>',
      status: '<b>APPROVED</b>'
    };
    const html = renderReceiptHtml(xssData);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
