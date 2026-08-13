import { createHmac, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsString, Length, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';

import type { CardBrand } from '../../integrations/lera-box/fees/lera-box-fees.client.js';
import { LeraBoxDependencyError } from '../../integrations/lera-box/auth/lera-box-identity.client.js';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { CheckoutLinkError, CheckoutLinkService } from '../checkout-links/checkout-link.service.js';
import {
  CheckoutSessionError,
  CheckoutSessionService,
  publicCheckoutHeaders
} from '../public-checkout/checkout-session.service.js';
import {
  TypeOrmCheckoutSessionStore,
  type ResolvedCheckoutSession
} from '../public-checkout/typeorm-checkout-session.store.js';
import {
  CardPaymentError,
  CardPaymentService,
  type CardQuote
} from './card/card-payment.service.js';
import { PixPaymentError, PixPaymentService } from './pix/pix-payment.service.js';
import { TypeOrmPixAttemptStore } from './typeorm-payment-attempt.stores.js';

const CHECKOUT_COOKIE = '__Host-baas_checkout';

class ExchangeDto {
  @IsString() @Length(43, 256) token!: string;
}
class PixDto {
  @IsString() @Length(11, 32) payerDocument!: string;
}
class CardQuoteDto {
  @IsIn(['VISA', 'MASTERCARD', 'ELO']) brand!: CardBrand;
  @IsInt() @Min(1) @Max(21) installments!: number;
}
class CardDataDto {
  @IsString() @Length(13, 25) number!: string;
  @IsString() @Length(2, 100) holder!: string;
  @IsInt() @Min(1) @Max(12) expiryMonth!: number;
  @IsInt() @Min(2026) @Max(2200) expiryYear!: number;
  @IsString() @Length(3, 4) cvv!: string;
}
class CardConfirmDto {
  @IsString() @Length(40, 4096) quoteId!: string;
  @IsObject() card!: CardDataDto;
}

export class CheckoutQuoteSigner {
  constructor(private readonly secret: string) {}
  sign(sessionId: string, linkId: string, quote: CardQuote): string {
    const payload = Buffer.from(
      JSON.stringify({ sessionId, linkId, quote, exp: Date.now() + 300_000 })
    ).toString('base64url');
    return `${payload}.${this.signature(payload)}`;
  }
  verify(value: string, sessionId: string, linkId: string): CardQuote {
    const [payload, supplied] = value.split('.');
    if (!payload || !supplied) throw new CardPaymentError('QUOTE_INVALID');
    const expected = this.signature(payload);
    const left = Buffer.from(supplied, 'base64url');
    const right = Buffer.from(expected, 'base64url');
    if (left.length !== right.length || !timingSafeEqual(left, right))
      throw new CardPaymentError('QUOTE_INVALID');
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        sessionId: string;
        linkId: string;
        quote: CardQuote;
        exp: number;
      };
      if (decoded.sessionId !== sessionId || decoded.linkId !== linkId || decoded.exp < Date.now())
        throw new Error();
      return decoded.quote;
    } catch {
      throw new CardPaymentError('QUOTE_INVALID');
    }
  }
  private signature(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

@ApiTags('public-checkout')
@Controller('api/v1/public')
export class PaymentsController {
  constructor(
    private readonly sessions: CheckoutSessionService,
    private readonly sessionStore: TypeOrmCheckoutSessionStore,
    private readonly links: CheckoutLinkService,
    private readonly pix: PixPaymentService,
    private readonly pixStore: TypeOrmPixAttemptStore,
    private readonly card: CardPaymentService,
    private readonly quotes: CheckoutQuoteSigner
  ) {}

  @Post('checkout-sessions')
  @ApiCreatedResponse({
    description: 'One-time fragment token exchanged for a short secure session'
  })
  async exchange(@Body() input: ExchangeDto, @Res({ passthrough: true }) response: Response) {
    try {
      const result = await this.sessions.exchange(input.token);
      setPublicHeaders(response);
      response.cookie(CHECKOUT_COOKIE, result.sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/v1/public',
        maxAge: result.cookie.maxAgeSeconds * 1000
      });
      return { checkout: result.checkout, csrfToken: result.csrfToken };
    } catch (error) {
      if (error instanceof CheckoutSessionError)
        throw new ProblemException(
          error.code,
          error.code === 'PUBLIC_TOKEN_INVALID' ? 400 : 409,
          'Checkout link is unavailable.'
        );
      throw error;
    }
  }

  @Post('payments/pix')
  @ApiOperation({ summary: 'Create exactly one Pix attempt for the checkout session' })
  async createPix(
    @Req() request: Request,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() input: PixDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.writeSession(request, csrf);
    this.method(session, 'PIX');
    try {
      await this.links.assertCanStartAttempt(session.merchantId, session.link.id);
      const result = await this.pix.start({
        merchantId: session.merchantId,
        checkoutLinkId: session.link.id,
        amountCents: session.link.amountCents,
        description: session.link.description,
        payerDocument: input.payerDocument,
        accessToken: session.gatewayAccessToken
      });
      response.status(result.httpStatus);
      setPublicHeaders(response);
      return pixAttemptView(result.attempt, session.link.amountCents, session.link.expiresAt);
    } catch (error) {
      throw paymentProblem(error);
    }
  }

  @Get('payments/pix/:attemptId')
  @ApiOkResponse({ description: 'Read-only status for an attempt owned by this checkout session' })
  async pixStatus(
    @Req() request: Request,
    @Param('attemptId') attemptId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.readSession(request);
    const attempt = await this.pixStore.required(attemptId);
    if (attempt.checkoutLinkId !== session.link.id)
      throw new ProblemException('PAYMENT_NOT_FOUND', 404, 'Payment attempt was not found.');
    setPublicHeaders(response);
    return pixAttemptView(attempt, session.link.amountCents, session.link.expiresAt);
  }

  @Post('payments/card/quote')
  @ApiCreatedResponse({
    description: 'Server-authoritative fee quote bound to the checkout session'
  })
  async quote(
    @Req() request: Request,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() input: CardQuoteDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.writeSession(request, csrf);
    this.method(session, 'CARD');
    try {
      const quote = await this.card.quote(
        session.link.amountCents,
        input.brand,
        input.installments
      );
      const quoteId = this.quotes.sign(session.sessionId, session.link.id, quote);
      setPublicHeaders(response);
      return { ...quote, quoteId };
    } catch (error) {
      throw paymentProblem(error);
    }
  }

  @Post('payments/card/confirm')
  @ApiCreatedResponse({ description: 'One-shot card confirmation; card secrets remain transient' })
  async confirm(
    @Req() request: Request,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() input: CardConfirmDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.writeSession(request, csrf);
    this.method(session, 'CARD');
    try {
      await this.links.assertCanStartAttempt(session.merchantId, session.link.id);
      const quote = this.quotes.verify(input.quoteId, session.sessionId, session.link.id);
      if (quote.grossAmountCents !== session.link.amountCents)
        throw new CardPaymentError('QUOTE_INVALID');
      const result = await this.card.confirm({
        merchantId: session.merchantId,
        checkoutLinkId: session.link.id,
        accessToken: session.gatewayAccessToken,
        description: session.link.description,
        quote,
        card: input.card
      });
      response.status(result.httpStatus);
      setPublicHeaders(response);
      return result.attempt;
    } catch (error) {
      throw paymentProblem(error);
    }
  }

  private async writeSession(request: Request, csrf: string | undefined) {
    if (!csrf) throw new ProblemException('CSRF_INVALID', 403, 'CSRF validation failed.');
    const session = await this.sessionStore.resolve(cookie(request, CHECKOUT_COOKIE), csrf);
    if (!session)
      throw new ProblemException('CHECKOUT_SESSION_INVALID', 401, 'Checkout session is invalid.');
    return session;
  }
  private async readSession(request: Request) {
    const session = await this.sessionStore.resolveRead(cookie(request, CHECKOUT_COOKIE));
    if (!session)
      throw new ProblemException('CHECKOUT_SESSION_INVALID', 401, 'Checkout session is invalid.');
    return session;
  }
  private method(session: ResolvedCheckoutSession, required: 'PIX' | 'CARD') {
    if (session.link.allowedMethods !== required && session.link.allowedMethods !== 'PIX_CARD')
      throw new ProblemException(
        'PAYMENT_METHOD_NOT_ALLOWED',
        409,
        'Payment method is unavailable.'
      );
  }
}

function cookie(request: Request, name: string): string {
  for (const item of request.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function setPublicHeaders(response: Response): void {
  for (const [name, value] of Object.entries(publicCheckoutHeaders()))
    response.setHeader(name, value);
}
function pixAttemptView(
  attempt: Awaited<ReturnType<TypeOrmPixAttemptStore['required']>>,
  amountCents: string,
  expiresAt: Date
) {
  return { ...attempt, amountCents, expiresAt: expiresAt.toISOString() };
}
function paymentProblem(error: unknown): ProblemException {
  if (error instanceof ProblemException) return error;
  if (error instanceof LeraBoxDependencyError)
    return new ProblemException(
      'GATEWAY_PAYMENT_REJECTED',
      error.remoteStatus && error.remoteStatus < 500 ? 422 : 503,
      'The gateway could not process the payment.'
    );
  if (
    error instanceof CardPaymentError ||
    error instanceof PixPaymentError ||
    error instanceof CheckoutLinkError
  ) {
    const status = [
      'FEE_CHANGED',
      'CARD_COOLDOWN',
      'PAYMENT_ATTEMPT_UNRESOLVED',
      'LINK_NOT_ACTIVE'
    ].includes(error.code)
      ? 409
      : 400;
    return new ProblemException(error.code, status, 'Payment request was rejected.');
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  )
    return new ProblemException(
      'PAYMENT_ATTEMPT_UNRESOLVED',
      409,
      'A payment attempt is already unresolved.'
    );
  throw error;
}
