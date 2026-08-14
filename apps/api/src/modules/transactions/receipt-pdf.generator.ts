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
      margin: 40,
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
    const fee = formatBrlCurrency(data.feeAmountCents);
    const net = formatBrlCurrency(data.netAmountCents);
    const dateFormatted = formatReceiptDate(data.occurredAt);
    const statusText = translateStatus(data.status);
    const typeText = translateType(data.type);

    // Generate deterministic authentication protocol hash
    const authProtocol = createHash('sha256')
      .update(`${data.transactionId}:${data.externalReference}:${data.occurredAt}:${data.netAmountCents}`)
      .digest('hex')
      .toUpperCase();
    const shortProtocol = `${authProtocol.slice(0, 8)}-${authProtocol.slice(8, 16)}-${authProtocol.slice(16, 24)}-${authProtocol.slice(24, 32)}`;

    const pageW = 595.28;
    const margin = 40;
    const contentW = pageW - margin * 2; // 515.28

    // 1. Top Decorative Brand Bar
    doc.rect(0, 0, pageW, 7).fill('#007A5A');
    doc.rect(0, 7, pageW, 2).fill('#10B981');

    // 2. Header Section
    let y = 32;

    // Logo Emblem
    const logoX = margin;
    const logoY = y;
    doc.roundedRect(logoX, logoY, 32, 32, 6).fill('#0F172A');
    doc
      .fillColor('#10B981')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('B', logoX, logoY + 7, { width: 32, align: 'center' });

    // Logo Typography
    doc
      .fillColor('#0F172A')
      .fontSize(15)
      .font('Helvetica-Bold')
      .text('BAAS CONSOLE', logoX + 42, logoY + 4);
    doc
      .fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica')
      .text('PLATAFORMA BANCÁRIA DIGITAL', logoX + 42, logoY + 20);

    // Right Header Metadata
    doc
      .fillColor('#0F172A')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('COMPROVANTE DE OPERAÇÃO', margin, logoY + 4, { align: 'right', width: contentW });
    doc
      .fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica')
      .text(`Emissão: ${dateFormatted} (Horário de Brasília)`, margin, logoY + 20, {
        align: 'right',
        width: contentW
      });

    y = 80;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).lineWidth(1).strokeColor('#E2E8F0').stroke();

    // 3. Hero Amount & Status Card
    y = 95;
    const heroHeight = 86;
    doc
      .roundedRect(margin, y, contentW, heroHeight, 10)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#F8FAFC')
      .fillAndStroke();

    // Left: Valor Líquido
    doc
      .fillColor('#64748B')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('VALOR LÍQUIDO DA OPERAÇÃO', margin + 20, y + 16);

    doc
      .fillColor('#0F172A')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text(net, margin + 20, y + 34);

    // Right: Status Badge & Type Badge
    const isApproved = ['APROVADO', 'APPROVED', 'PAID', 'SUCCESS'].includes(statusText);
    const isDenied = ['NEGADO', 'DENIED', 'FAILED', 'REJECTED'].includes(statusText);
    const badgeBg = isApproved ? '#DCFCE7' : isDenied ? '#FEE2E2' : '#FEF3C7';
    const badgeBorder = isApproved ? '#86EFAC' : isDenied ? '#FCA5A5' : '#FDE68A';
    const badgeColor = isApproved ? '#15803D' : isDenied ? '#B91C1C' : '#B45309';

    const badgeW = 110;
    const badgeH = 24;
    const badgeX = margin + contentW - 20 - badgeW;
    const badgeY = y + 18;

    doc
      .roundedRect(badgeX, badgeY, badgeW, badgeH, 12)
      .lineWidth(1)
      .strokeColor(badgeBorder)
      .fillColor(badgeBg)
      .fillAndStroke();

    doc
      .fillColor(badgeColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(statusText, badgeX, badgeY + 6, { width: badgeW, align: 'center' });

    // Type Sub-badge
    doc
      .fillColor('#475569')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(`TIPO: ${typeText}`, badgeX - 30, badgeY + 34, { width: badgeW + 30, align: 'right' });

    // 4. Section Helper Function
    function renderSectionTitle(title: string, topY: number) {
      doc.rect(margin, topY + 2, 3.5, 12).fill('#007A5A');
      doc
        .fillColor('#0F172A')
        .fontSize(10.5)
        .font('Helvetica-Bold')
        .text(title, margin + 12, topY + 2);
      return topY + 22;
    }

    function renderTableRow(
      label: string,
      val: string,
      rowY: number,
      isHighlighted = false,
      isLast = false
    ) {
      const rowHeight = 26;
      if (isHighlighted) {
        doc.rect(margin, rowY - 4, contentW, rowHeight).fill('#F1F5F9');
      }

      doc
        .fillColor('#64748B')
        .fontSize(9)
        .font('Helvetica')
        .text(label, margin + 14, rowY + 3);

      doc
        .fillColor(isHighlighted ? '#007A5A' : '#0F172A')
        .fontSize(isHighlighted ? 10 : 9)
        .font('Helvetica-Bold')
        .text(val, margin + 180, rowY + 3, { width: contentW - 194, align: 'right' });

      if (!isLast) {
        doc
          .moveTo(margin + 14, rowY + rowHeight - 4)
          .lineTo(margin + contentW - 14, rowY + rowHeight - 4)
          .lineWidth(0.5)
          .dash(3, { space: 3 })
          .strokeColor('#E2E8F0')
          .stroke()
          .undash();
      }

      return rowY + rowHeight;
    }

    // Section 1: Dados da Transação
    y = 200;
    y = renderSectionTitle('DADOS DA OPERAÇÃO', y);

    const s1CardY = y;
    const s1CardH = 106;
    doc
      .roundedRect(margin, s1CardY, contentW, s1CardH, 8)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    let curY = s1CardY + 6;
    curY = renderTableRow('Código de Referência', data.externalReference, curY);
    curY = renderTableRow('Tipo de Movimentação', typeText, curY);
    curY = renderTableRow('Data e Horário Oficial', `${dateFormatted} (BRT / UTC-3)`, curY);
    curY = renderTableRow('Canal de Processamento', 'BaaS Gateway Sandbox', curY, false, true);

    // Section 2: Discriminação Financeira
    y = s1CardY + s1CardH + 18;
    y = renderSectionTitle('DISCRIMINAÇÃO FINANCEIRA', y);

    const s2CardY = y;
    const s2CardH = 82;
    doc
      .roundedRect(margin, s2CardY, contentW, s2CardH, 8)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    curY = s2CardY + 6;
    curY = renderTableRow('Valor Bruto', gross, curY);
    curY = renderTableRow('Tarifas / Taxas de Serviço', fee === 'R$ 0,00' ? 'R$ 0,00 (Gratuito)' : `- ${fee}`, curY);
    curY = renderTableRow('Valor Líquido Total', net, curY, true, true);

    // Section 3: Identificadores Técnicos e Auditoria
    y = s2CardY + s2CardH + 18;
    y = renderSectionTitle('IDENTIFICADORES DE AUDITORIA', y);

    const s3CardY = y;
    const s3CardH = 82;
    doc
      .roundedRect(margin, s3CardY, contentW, s3CardH, 8)
      .lineWidth(1)
      .strokeColor('#E2E8F0')
      .fillColor('#FFFFFF')
      .fillAndStroke();

    curY = s3CardY + 6;
    curY = renderTableRow('Identificador da Transação (ID)', data.transactionId, curY);
    curY = renderTableRow('Protocolo no Gateway Integrador', data.gatewayTransactionId ?? 'Não aplicável / Interno', curY);
    curY = renderTableRow('Chave de Verificação Criptográfica', shortProtocol, curY, false, true);

    // 5. Security & Authentication Box (Bottom)
    y = s3CardY + s3CardH + 24;
    const authBoxH = 50;
    doc
      .roundedRect(margin, y, contentW, authBoxH, 6)
      .lineWidth(0.8)
      .strokeColor('#CBD5E1')
      .fillColor('#F8FAFC')
      .fillAndStroke();

    doc
      .fillColor('#475569')
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text('AUTENTICAÇÃO DIGITAL E SEGURANÇA', margin + 14, y + 10);

    doc
      .fillColor('#64748B')
      .fontSize(7)
      .font('Courier')
      .text(`HASH: ${authProtocol}`, margin + 14, y + 24, { width: contentW - 28 });

    doc
      .fillColor('#94A3B8')
      .fontSize(6.5)
      .font('Helvetica')
      .text('Documento eletrônico autenticado e assinado digitalmente pelo ecossistema BaaS Console.', margin + 14, y + 36);

    // 6. Footer Disclaimer
    y = 780;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).lineWidth(0.5).strokeColor('#E2E8F0').stroke();

    doc
      .fillColor('#94A3B8')
      .fontSize(7)
      .font('Helvetica')
      .text(
        'BaaS Console • Sistema de Gerenciamento e BaaS Integration • Este comprovante possui validade para conciliação contábil e fiscal.',
        margin,
        y + 8,
        { align: 'center', width: contentW }
      );

    doc.end();
  });
}
