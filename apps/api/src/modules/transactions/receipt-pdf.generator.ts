import { createHash } from 'node:crypto';
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
      margin: 35,
      info: {
        Title: `Comprovante de Operação - ${data.externalReference}`,
        Author: 'BaaS Console',
        Subject: 'Comprovante de Transação Financeira',
        Creator: 'BaaS Console Financial Platform'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const gross = formatBrlCurrency(data.grossAmountCents);
    const net = formatBrlCurrency(data.netAmountCents);
    const dateFormatted = formatReceiptDate(data.occurredAt);
    const statusText = translateStatus(data.status);
    const typeText = translateType(data.type);
    const companyName = data.merchantName || 'BaaS Console';

    // Generate security hash
    const authProtocol = createHash('sha256')
      .update(
        `${data.transactionId}:${data.externalReference}:${data.occurredAt}:${data.netAmountCents}`
      )
      .digest('hex')
      .toUpperCase();

    const pageW = 595.28;
    const margin = 40;
    const contentW = pageW - margin * 2; // 515.28

    // Outer Card Container
    const cardX = margin;
    const cardY = 35;
    const cardH = 580;

    // Card background & subtle shadow border
    doc
      .roundedRect(cardX, cardY, contentW, cardH, 14)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    // 1. Top Gradient / Accent Bar
    doc.save();
    doc.roundedRect(cardX, cardY, contentW, 6, 4).clip();
    doc.rect(cardX, cardY, contentW / 2, 6).fill('#006B57');
    doc.rect(cardX + contentW / 2, cardY, contentW / 2, 6).fill('#10B981');
    doc.restore();

    // 2. Header Section
    let y = cardY + 22;

    // Official Vector Hexagon Logo (Transparent background, exact SVG path from brand-mark)
    const logoX = cardX + 22;
    const logoY = y;
    const scale = 0.75; // Scale 48x48 down to 36x36

    doc.save();
    doc.translate(logoX, logoY);
    doc.scale(scale);
    doc
      .path('M24 3.5 42 14v20L24 44.5 6 34V14L24 3.5Z')
      .lineWidth(3)
      .lineCap('round')
      .lineJoin('round')
      .strokeColor('#006B57')
      .stroke();
    doc
      .path('m14 17 10-5.8L34 17 24 23 14 17Zm0 14 10 5.8L34 31l-10-6-10 6Z')
      .lineWidth(3)
      .lineCap('round')
      .lineJoin('round')
      .strokeColor('#006B57')
      .stroke();
    doc.restore();

    // Brand Name & Subtitle
    const brandTextX = logoX + 46;
    doc
      .fillColor('#0F172A')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(companyName, brandTextX, logoY + 2);

    doc
      .fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('PLATAFORMA BANCÁRIA DIGITAL', brandTextX, logoY + 18, {
        characterSpacing: 0.5
      });

    // Right Header Text
    doc
      .fillColor('#334155')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('COMPROVANTE DE OPERAÇÃO', cardX, logoY + 2, { align: 'right', width: contentW - 24 });

    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .font('Helvetica')
      .text(dateFormatted, cardX, logoY + 18, { align: 'right', width: contentW - 24 });

    y += 44;
    doc
      .moveTo(cardX, y)
      .lineTo(cardX + contentW, y)
      .lineWidth(0.8)
      .strokeColor('#F1F5F9')
      .stroke();

    // 3. Hero Box
    y += 1;
    const heroH = 78;
    doc.rect(cardX, y, contentW, heroH).fill('#F8FAFC');

    // Left: Amount Label & Value
    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text('VALOR LÍQUIDO DA OPERAÇÃO', cardX + 24, y + 15, { characterSpacing: 0.4 });

    doc
      .fillColor('#0F172A')
      .fontSize(26)
      .font('Helvetica-Bold')
      .text(net, cardX + 24, y + 30);

    // Right: Status Badge
    const isApproved = ['APROVADO', 'APPROVED', 'PAID', 'SUCCESS'].includes(statusText);
    const isDenied = ['NEGADO', 'DENIED', 'FAILED', 'REJECTED'].includes(statusText);
    const badgeBg = isApproved ? '#DCFCE7' : isDenied ? '#FEE2E2' : '#FEF3C7';
    const badgeBorder = isApproved ? '#86EFAC' : isDenied ? '#FCA5A5' : '#FDE68A';
    const badgeColor = isApproved ? '#15803D' : isDenied ? '#B91C1C' : '#B45309';

    const badgeW = 95;
    const badgeH = 22;
    const badgeX = cardX + contentW - 24 - badgeW;
    const badgeY = y + (heroH - badgeH) / 2;

    doc
      .roundedRect(badgeX, badgeY, badgeW, badgeH, 11)
      .lineWidth(1)
      .strokeColor(badgeBorder)
      .fillColor(badgeBg)
      .fillAndStroke();

    doc
      .fillColor(badgeColor)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(statusText, badgeX, badgeY + 5.5, { width: badgeW, align: 'center' });

    y += heroH;
    doc
      .moveTo(cardX, y)
      .lineTo(cardX + contentW, y)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .stroke();

    // 4. Section 1: Dados da Operação
    y += 16;
    doc
      .fillColor('#006B57')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('DADOS DA OPERAÇÃO', cardX + 24, y, { characterSpacing: 0.5 });

    y += 14;

    function renderRow(label: string, value: string, rowY: number, isMono = false, isNet = false) {
      doc
        .fillColor('#64748B')
        .fontSize(9.5)
        .font('Helvetica')
        .text(label, cardX + 24, rowY);

      doc
        .fillColor(isNet ? '#006B57' : '#0F172A')
        .fontSize(9.5)
        .font(isNet ? 'Helvetica-Bold' : isMono ? 'Courier-Bold' : 'Helvetica-Bold')
        .text(value, cardX + 180, rowY, { align: 'right', width: contentW - 204 });

      doc
        .moveTo(cardX + 24, rowY + 16)
        .lineTo(cardX + contentW - 24, rowY + 16)
        .lineWidth(0.5)
        .dash(2, { space: 2 })
        .strokeColor('#F1F5F9')
        .stroke()
        .undash();

      return rowY + 22;
    }

    y = renderRow('Código de Referência', data.externalReference, y, true);
    y = renderRow('Tipo de Movimentação', typeText, y);
    y = renderRow('Data e Horário Oficial', `${dateFormatted} (Horário de Brasília)`, y);

    // 5. Section 2: Discriminação Financeira
    y += 8;
    doc
      .fillColor('#006B57')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('DISCRIMINAÇÃO FINANCEIRA', cardX + 24, y, { characterSpacing: 0.5 });

    y += 14;
    y = renderRow('Valor Bruto', gross, y);
    y = renderRow('Valor Líquido Total', net, y, false, true);

    // 6. Security Card Box
    y += 10;
    const secBoxH = 58;
    doc
      .roundedRect(cardX + 24, y, contentW - 48, secBoxH, 8)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#F8FAFC')
      .fillAndStroke();

    doc
      .fillColor('#334155')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('AUTENTICAÇÃO DIGITAL & SEGURANÇA', cardX + 36, y + 10, { characterSpacing: 0.4 });

    // Inner hash pill
    doc
      .roundedRect(cardX + 36, y + 22, contentW - 72, 16, 3)
      .lineWidth(0.5)
      .strokeColor('#CBD5E1')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    doc
      .fillColor('#475569')
      .fontSize(7.5)
      .font('Courier')
      .text(`HASH: ${authProtocol}`, cardX + 42, y + 26);

    doc
      .fillColor('#94A3B8')
      .fontSize(7)
      .font('Helvetica')
      .text(
        'Documento autenticado eletronicamente pelo ecossistema BaaS Console. Válido para conciliação contábil e fiscal.',
        cardX + 36,
        y + 44,
        { width: contentW - 72 }
      );

    doc.end();
  });
}
