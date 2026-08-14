import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { renderReceiptHtml } from '@baas/receipt-template';
import type { Response } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';
import {
  TransactionsService,
  type TransactionItemView,
  type TransactionStatementView
} from './transactions.service.js';

export interface TransactionsPrincipalProvider {
  current(): { merchantId: string };
}

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(
    private readonly service: TransactionsService,
    @Inject('TransactionsPrincipalProvider')
    private readonly principal: TransactionsPrincipalProvider
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Consolidated transaction statement for tenant' })
  list(@Query() query: ListTransactionsDto): Promise<TransactionStatementView> {
    return this.service.list(this.principal.current().merchantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction detail by ID' })
  async getDetail(@Param('id') id: string): Promise<TransactionItemView> {
    const merchantId = this.principal.current().merchantId;
    const tx = await this.service.findById(merchantId, id);
    if (!tx) {
      throw new ProblemException('TRANSACTION_NOT_FOUND', 404, 'Transaction not found.');
    }
    return tx;
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get transaction receipt HTML or downloadable PDF document' })
  async getReceipt(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('format') format?: string
  ) {
    let actualRes = res;
    let actualFormat = format;
    const hasSetHeader = (obj: unknown): obj is { setHeader: (k: string, v: string) => void } =>
      typeof obj === 'object' &&
      obj !== null &&
      'setHeader' in obj &&
      typeof (obj as { setHeader: unknown }).setHeader === 'function';

    if (!hasSetHeader(res) && hasSetHeader(format)) {
      actualRes = format as unknown as Response;
      actualFormat = typeof res === 'string' ? res : undefined;
    }
    await this.handleReceiptResponse(id, actualFormat, actualRes);
  }

  @Get(':id/receipt/pdf')
  @ApiOperation({ summary: 'Download transaction receipt as PDF' })
  async getReceiptPdf(@Param('id') id: string, @Res() res: Response) {
    await this.handleReceiptResponse(id, 'pdf', res);
  }

  private async handleReceiptResponse(id: string, format: string | undefined, res: Response) {
    const merchantId = this.principal.current().merchantId;
    const tx = await this.service.findById(merchantId, id);
    if (!tx) {
      throw new ProblemException('TRANSACTION_NOT_FOUND', 404, 'Transaction not found.');
    }
    const html = renderReceiptHtml({
      transactionId: tx.id,
      externalReference: tx.externalReference,
      gatewayTransactionId: tx.gatewayTransactionId,
      type: tx.type,
      status: tx.status,
      grossAmountCents: tx.grossAmountCents,
      feeAmountCents: tx.feeAmountCents,
      netAmountCents: tx.netAmountCents,
      occurredAt: tx.occurredAt
    });

    if (format === 'pdf' || format === 'download') {
      let browser;
      try {
        const { chromium } = await import('playwright');
        try {
          browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
        } catch (launchErr) {
          const errMsg = launchErr instanceof Error ? launchErr.message : String(launchErr);
          if (
            errMsg.includes("Executable doesn't exist") ||
            errMsg.includes('playwright install')
          ) {
            const { execSync } = await import('node:child_process');
            execSync('npx playwright install chromium', { stdio: 'inherit' });
            browser = await chromium.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
          } else {
            throw launchErr;
          }
        }
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });
        await browser.close();

        const buffer = Buffer.from(pdfBuffer);
        res.setHeader('content-type', 'application/pdf');
        res.setHeader('content-length', buffer.length.toString());
        res.setHeader(
          'content-disposition',
          `attachment; filename="comprovante-${tx.externalReference}.pdf"`
        );
        res.end(buffer);
        return;
      } catch (err) {
        if (browser) {
          await browser.close().catch(() => undefined);
        }
        throw new ProblemException(
          'RECEIPT_PDF_FAILED',
          500,
          `Failed to render PDF receipt: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
