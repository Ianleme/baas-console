import { Body, Controller, Get, Optional, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
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

class CreateCheckoutLinkDto {
  @IsString() @Length(1, 100) publicReference!: string;
  @IsString() @Length(1, 255) description!: string;
  @IsString() amountCents!: string;
  @IsIn(['PIX', 'CARD', 'PIX_CARD']) allowedMethods!: 'PIX' | 'CARD' | 'PIX_CARD';
  @IsInt() @Min(1) @Max(21) maxInstallments!: number;
  @IsDateString() expiresAt!: string;
}

export class SendCheckoutLinkEmailDto {
  @IsEmail() email!: string;
}

@ApiTags('checkout-links')
@ApiBearerAuth()
@Controller('api/v1/checkout-links')
export class CheckoutLinkController {
  constructor(
    private readonly links: CheckoutLinkService,
    private readonly auth: AuthService,
    @Optional() private readonly outbox?: EmailOutboxService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List checkout links for the authenticated merchant' })
  @ApiOkResponse({ description: 'Tenant-scoped checkout links' })
  async list(@Req() request: Request) {
    return (await this.links.list(this.merchant(request))).map(publicRecord);
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
      const link = await this.links.detail(merchantId, id);
      if (!this.outbox) {
        throw new ProblemException(
          'OUTBOX_UNAVAILABLE',
          503,
          'Email outbox service is not configured.'
        );
      }
      const recipient = input.email.trim();
      const idempotencyKey = `checkout-email:${link.id}:${recipient.toLowerCase()}`;
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
          text: `Checkout Link: ${link.description} (Ref: ${link.publicReference})`
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
