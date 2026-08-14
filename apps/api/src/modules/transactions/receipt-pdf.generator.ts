import PDFDocument from 'pdfkit';
import {
  formatBrlCurrency,
  formatReceiptDate,
  translateStatus,
  translateType,
  type ReceiptData
} from '@baas/receipt-template';

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Comprovante - ${data.externalReference}`,
        Author: 'BaaS Console'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const gross = formatBrlCurrency(data.grossAmountCents);
    const fee = formatBrlCurrency(data.feeAmountCents);
    const net = formatBrlCurrency(data.netAmountCents);
    const dateFormatted = formatReceiptDate(data.occurredAt);
    const statusText = translateStatus(data.status);
    const typeText = translateType(data.type);

    const cardX = 60;
    const cardY = 50;
    const cardWidth = 475;
    const cardHeight = 580;

    // Draw card border and background
    doc
      .roundedRect(cardX, cardY, cardWidth, cardHeight, 12)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    let currentY = cardY + 25;

    // Brand Header
    doc
      .fillColor('#007A5A')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('BAAS CONSOLE', cardX, currentY, { align: 'center', width: cardWidth });

    currentY += 18;

    // Title
    doc
      .fillColor('#0F172A')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Comprovante de Operação', cardX, currentY, { align: 'center', width: cardWidth });

    currentY += 28;

    // Status Badge
    const isApproved = ['APROVADO', 'APPROVED', 'PAID', 'SUCCESS'].includes(statusText);
    const isDenied = ['NEGADO', 'DENIED', 'FAILED', 'REJECTED'].includes(statusText);
    const badgeBg = isApproved ? '#DCFCE7' : isDenied ? '#FEE2E2' : '#FEF3C7';
    const badgeColor = isApproved ? '#15803D' : isDenied ? '#B91C1C' : '#B45309';

    const badgeWidth = 110;
    const badgeHeight = 22;
    const badgeX = cardX + (cardWidth - badgeWidth) / 2;

    doc
      .roundedRect(badgeX, currentY, badgeWidth, badgeHeight, 11)
      .fillColor(badgeBg)
      .fill();

    doc
      .fillColor(badgeColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(statusText, badgeX, currentY + 6, { align: 'center', width: badgeWidth });

    currentY += 38;

    // Main Amount
    doc
      .fillColor('#0F172A')
      .fontSize(26)
      .font('Helvetica-Bold')
      .text(net, cardX, currentY, { align: 'center', width: cardWidth });

    currentY += 40;

    // Horizontal Divider
    doc
      .moveTo(cardX + 20, currentY)
      .lineTo(cardX + cardWidth - 20, currentY)
      .lineWidth(0.5)
      .strokeColor('#E2E8F0')
      .stroke();

    currentY += 15;

    // Detail rows helper
    const rows: [string, string][] = [
      ['Referência', data.externalReference],
      ['Tipo', typeText],
      ['Valor Bruto', gross],
      ['Taxa', fee],
      ['Valor Líquido', net],
      ['ID Gateway', data.gatewayTransactionId ?? 'N/A'],
      ['ID Transação', data.transactionId],
      ['Data e Hora', dateFormatted]
    ];

    const labelX = cardX + 30;
    const valueWidth = 260;
    const valueX = cardX + cardWidth - 30 - valueWidth;

    for (const [label, val] of rows) {
      doc
        .fillColor('#64748B')
        .fontSize(10)
        .font('Helvetica')
        .text(label, labelX, currentY);

      doc
        .fillColor('#0F172A')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(val, valueX, currentY, { align: 'right', width: valueWidth });

      currentY += 24;

      doc
        .moveTo(labelX, currentY - 5)
        .lineTo(cardX + cardWidth - 30, currentY - 5)
        .lineWidth(0.5)
        .dash(3, { space: 3 })
        .strokeColor('#F1F5F9')
        .stroke()
        .undash();
    }

    currentY += 15;

    // Footer note
    doc
      .fillColor('#94A3B8')
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Este documento é um comprovante digital gerado pelo BaaS Console.',
        cardX,
        currentY,
        { align: 'center', width: cardWidth }
      );

    doc.end();
  });
}
