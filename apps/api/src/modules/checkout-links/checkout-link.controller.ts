import { Body, Controller, Get, Inject, Optional, Param, Post, Query, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min
} from 'class-validator';
import type { Request } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthError, AuthService } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import { EmailOutboxService } from '../notifications/email-outbox.service.js';
import {
  CheckoutLinkError,
  CheckoutLinkService,
  type CheckoutLinkRecord
} from './checkout-link.service.js';

export const PUBLIC_CHECKOUT_BASE_URL = 'PUBLIC_CHECKOUT_BASE_URL';

class CreateCheckoutLinkDto {
  @ApiProperty({
    example: 'REF-2026-01048',
    description: 'Referência única pública do pedido ou cobrança'
  })
  @IsString()
  @Length(1, 100)
  publicReference!: string;

  @ApiProperty({
    example: 'Pedido #1048 - 2x Camisetas Algodão Premium',
    description: 'Descrição da cobrança exibida ao pagador'
  })
  @IsString()
  @Length(1, 255)
  description!: string;

  @ApiProperty({
    example: '32000',
    description: 'Valor total da cobrança em centavos de Real (ex: 32000 = R$ 320,00)'
  })
  @IsString()
  amountCents!: string;

  @ApiProperty({
    enum: ['PIX', 'CARD', 'PIX_CARD'],
    example: 'PIX_CARD',
    description: 'Métodos aceitos no checkout'
  })
  @IsIn(['PIX', 'CARD', 'PIX_CARD'])
  allowedMethods!: 'PIX' | 'CARD' | 'PIX_CARD';

  @ApiProperty({
    example: 12,
    minimum: 1,
    maximum: 21,
    description: 'Número máximo de parcelas permitidas no cartão'
  })
  @IsInt()
  @Min(1)
  @Max(21)
  maxInstallments!: number;

  @ApiProperty({
    example: '2026-12-31T23:59:59.000Z',
    format: 'date-time',
    description: 'Data de expiração do link'
  })
  @IsDateString()
  expiresAt!: string;
}

export class SendCheckoutLinkEmailDto {
  @ApiProperty({
    example: 'cliente@exemplo.com.br',
    description: 'E-mail do destinatário para envio do link'
  })
  @IsEmail()
  email!: string;
}

class ListCheckoutLinksDto {
  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'])
  status?: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'CANCELLED';

  @ApiPropertyOptional({ enum: ['PIX', 'CARD', 'PIX_CARD'] })
  @IsOptional()
  @IsIn(['PIX', 'CARD', 'PIX_CARD'])
  method?: 'PIX' | 'CARD' | 'PIX_CARD';

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

class CheckoutLinkFeeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['VISA', 'MASTERCARD', 'ELO'] }) brand!: string;
  @ApiProperty() installments!: number;
  @ApiProperty() feeBps!: number;
}

class CheckoutLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() publicReference!: string;
  @ApiProperty() description!: string;
  @ApiProperty() amountCents!: string;
  @ApiProperty({ enum: ['PIX', 'CARD', 'PIX_CARD'] }) allowedMethods!: string;
  @ApiProperty() maxInstallments!: number;
  @ApiProperty({ type: [CheckoutLinkFeeResponseDto] }) feeSnapshot!: CheckoutLinkFeeResponseDto[];
  @ApiProperty({ enum: ['ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

class CheckoutLinkListSummaryResponseDto {
  @ApiProperty() totalCount!: number;
  @ApiProperty() activeCount!: number;
  @ApiProperty() paidCount!: number;
  @ApiProperty() paidAmountCents!: string;
}

class ListCheckoutLinksResponseDto {
  @ApiProperty({ type: [CheckoutLinkResponseDto] }) items!: CheckoutLinkResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty({ type: CheckoutLinkListSummaryResponseDto })
  summary!: CheckoutLinkListSummaryResponseDto;
}

@ApiTags('checkout-links')
@ApiBearerAuth()
@Controller('api/v1/checkout-links')
export class CheckoutLinkController {
  constructor(
    private readonly links: CheckoutLinkService,
    private readonly auth: AuthService,
    @Optional() private readonly outbox?: EmailOutboxService,
    @Optional()
    @Inject(PUBLIC_CHECKOUT_BASE_URL)
    private readonly publicCheckoutBaseUrl?: string
  ) {}

  @Get()
  @ApiOperation({ summary: 'List checkout links for the authenticated merchant' })
  @ApiOkResponse({
    description: 'Tenant-scoped checkout links',
    type: ListCheckoutLinksResponseDto
  })
  async list(@Req() request: Request, @Query() query: ListCheckoutLinksDto) {
    try {
      const result = await this.links.list(this.merchant(request), {
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.method ? { method: query.method } : {}),
        ...(query.from ? { createdFrom: new Date(query.from) } : {}),
        ...(query.to ? { createdTo: new Date(query.to) } : {}),
        limit: query.limit,
        offset: query.offset
      });
      return { ...result, items: result.items.map(publicRecord) };
    } catch (error) {
      throw problem(error);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant-scoped checkout link' })
  async detail(@Req() request: Request, @Param('id') id: string) {
    try {
      return publicRecord(await this.links.detail(this.merchant(request), id));
    } catch (error) {
      throw problem(error);
    }
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Issue an active tenant-scoped checkout URL token' })
  @ApiOkResponse({ description: 'Current or safely rotated public checkout token' })
  async share(@Req() request: Request, @Param('id') id: string) {
    try {
      const detail = await this.links.share(this.merchant(request), id);
      return { publicToken: detail.publicToken };
    } catch (error) {
      throw problem(error);
    }
  }

  @Post()
  @ApiCreatedResponse({ description: 'Checkout link and one-time public fragment token' })
  async create(@Req() request: Request, @Body() input: CreateCheckoutLinkDto) {
    try {
      const created = await this.links.create(this.merchant(request), {
        publicReference: input.publicReference,
        description: input.description,
        amountCents: input.amountCents,
        allowedMethods: input.allowedMethods,
        maxInstallments: input.maxInstallments,
        expiresAt: new Date(input.expiresAt)
      });
      return { ...publicRecord(created.link), publicToken: created.publicToken };
    } catch (error) {
      throw problem(error);
    }
  }

  @Post(':id/cancel')
  @ApiOkResponse({ description: 'Checkout link cancelled when no unresolved attempt exists' })
  async cancel(@Req() request: Request, @Param('id') id: string) {
    try {
      return publicRecord(await this.links.cancel(this.merchant(request), id));
    } catch (error) {
      throw problem(error);
    }
  }

  @Post(':id/send-email')
  @ApiCreatedResponse({ description: 'Checkout link delivery enqueued' })
  async sendEmail(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() input: SendCheckoutLinkEmailDto
  ) {
    try {
      const merchantId = this.merchant(request);
      if (!this.outbox) {
        throw new ProblemException(
          'OUTBOX_UNAVAILABLE',
          503,
          'Email outbox service is not configured.'
        );
      }
      if (!this.publicCheckoutBaseUrl) {
        throw new ProblemException(
          'PUBLIC_CHECKOUT_BASE_URL_MISSING',
          503,
          'Public checkout URL is not configured.'
        );
      }
      const { link, publicToken } = await this.links.share(merchantId, id);
      const checkoutUrl = createCheckoutUrl(this.publicCheckoutBaseUrl, publicToken);
      const recipient = input.email.trim();
      const tokenVersion = createHash('sha256').update(publicToken).digest('hex').slice(0, 16);
      const idempotencyKey = `checkout-email:${link.id}:${recipient.toLowerCase()}:${tokenVersion}`;
      const delivery = await this.outbox.enqueue({
        merchantId,
        kind: 'CHECKOUT_LINK',
        idempotencyKey,
        recipient,
        payload: {
          linkId: link.id,
          publicReference: link.publicReference,
          description: link.description,
          amountCents: link.amountCents,
          checkoutUrl,
          text: `Acesse seu checkout seguro: ${checkoutUrl}`,
          html: `<p>Sua cobrança está pronta.</p><p><a href="${checkoutUrl}">Abrir checkout seguro</a></p>`
        }
      });
      return {
        deliveryId: delivery.id,
        status: delivery.status,
        recipientMasked: delivery.recipientMasked
      };
    } catch (error) {
      throw problem(error);
    }
  }

  private merchant(request: Request): string {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      return this.auth.verifyAccessToken(token).merchantId;
    } catch {
      throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
  }
}

function createCheckoutUrl(baseUrl: string, publicToken: string) {
  let url: URL;
  try {
    url = new URL('/pay.html', baseUrl);
  } catch {
    throw new ProblemException(
      'PUBLIC_CHECKOUT_BASE_URL_INVALID',
      503,
      'Public checkout URL is invalid.'
    );
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new ProblemException(
      'PUBLIC_CHECKOUT_BASE_URL_INVALID',
      503,
      'Public checkout URL must use HTTPS.'
    );
  }
  url.hash = `/checkout/${publicToken}`;
  return url.toString();
}

function publicRecord(link: CheckoutLinkRecord) {
  return {
    id: link.id,
    publicReference: link.publicReference,
    description: link.description,
    amountCents: link.amountCents,
    allowedMethods: link.allowedMethods,
    maxInstallments: link.maxInstallments,
    feeSnapshot: link.feeSnapshot,
    status: link.status,
    expiresAt: link.expiresAt.toISOString(),
    createdAt: link.createdAt.toISOString()
  };
}
function problem(error: unknown): ProblemException {
  if (error instanceof ProblemException) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  if (error instanceof CheckoutLinkError || code === 'LINK_NOT_FOUND') {
    const errorCode = code ?? (error instanceof CheckoutLinkError ? error.code : 'LINK_NOT_FOUND');
    const status =
      errorCode === 'LINK_NOT_FOUND'
        ? 404
        : ['LINK_STATE_CONFLICT', 'PAYMENT_ATTEMPT_UNRESOLVED', 'LINK_NOT_ACTIVE'].includes(
              errorCode
            )
          ? 409
          : 400;
    return new ProblemException(errorCode, status, 'Checkout link request was rejected.');
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  )
    return new ProblemException('CHECKOUT_LINK_CONFLICT', 409, 'Checkout link already exists.');
  throw error;
}
