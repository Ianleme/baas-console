import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags
} from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';

import { ProblemException } from '../../platform/errors/problem.exception.js';
import {
  AuthError,
  AuthService,
  FixedWindowRateLimiter,
  type IssuedSession
} from './auth.service.js';
import { TypeOrmAuthStore } from './typeorm-auth.store.js';
import { GatewayOnboardingService } from '../gateway-accounts/gateway-onboarding.service.js';

function isSecureCookie(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true' ||
    process.env.SECURE_COOKIES === 'true'
  );
}

function accessCookieName(): string {
  return isSecureCookie() ? '__Host-baas_access' : 'baas_access';
}

function refreshCookieName(): string {
  return isSecureCookie() ? '__Host-baas_refresh' : 'baas_refresh';
}

function csrfCookieName(): string {
  return isSecureCookie() ? '__Host-baas_csrf' : 'baas_csrf';
}

const COOKIE_PATH = '/';

export class RegisterOwnerDto {
  @ApiPropertyOptional({
    enum: ['PF', 'PJ'],
    example: 'PJ',
    description: 'Tipo de pessoa (Pessoa Física ou Jurídica)'
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  personType?: 'PF' | 'PJ';

  @ApiPropertyOptional({
    example: 'Empresa Exemplo Ltda',
    description: 'Nome completo ou Razão Social'
  })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  name?: string;

  @ApiPropertyOptional({ example: 'Minha Loja', description: 'Nome fantasia da loja' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  tradingName?: string;

  @ApiPropertyOptional({ example: 'Empresa Exemplo Ltda', description: 'Razão social (legado)' })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  legalName?: string;

  @ApiPropertyOptional({ example: 'Minha Loja', description: 'Nome de exibição (legado)' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;

  @ApiProperty({
    example: 'proprietario@empresa.com.br',
    description: 'E-mail de acesso do proprietário'
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    description: 'Senha de acesso (mínimo 12 caracteres)'
  })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiPropertyOptional({ example: '(11) 98765-4321', description: 'Telefone de contato com DDD' })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @ApiPropertyOptional({
    example: '12.345.678/0001-90',
    description: 'CPF ou CNPJ do proprietário/empresa'
  })
  @IsOptional()
  @IsString()
  @Length(3, 32)
  document?: string;

  @ApiPropertyOptional({ example: '01001-000', description: 'CEP do endereço comercial' })
  @IsOptional()
  @IsString()
  @Length(8, 12)
  zipCode?: string;

  @ApiPropertyOptional({ example: 'Praça da Sé', description: 'Logradouro / Endereço' })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  address?: string;

  @ApiPropertyOptional({ example: '100', description: 'Número do endereço' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  number?: string;

  @ApiPropertyOptional({ example: 'Centro', description: 'Bairro' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'São Paulo', description: 'Cidade' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  city?: string;

  @ApiPropertyOptional({ example: 'SP', description: 'Unidade Federativa (UF com 2 letras)' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'proprietario@empresa.com.br', description: 'E-mail cadastrado' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!', description: 'Senha da conta' })
  @IsString()
  @Length(1, 128)
  password!: string;

  @ApiProperty({ example: true, description: 'Manter sessão conectada' })
  @IsBoolean()
  remember!: boolean;
}

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  private readonly registrationLimiter = new FixedWindowRateLimiter(5, 60_000);
  private readonly loginLimiter = new FixedWindowRateLimiter(10, 60_000);
  constructor(
    private readonly auth: AuthService,
    private readonly store: TypeOrmAuthStore,
    private readonly onboarding: GatewayOnboardingService
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a local merchant owner' })
  @ApiCreatedResponse({ description: 'Merchant owner created atomically' })
  async register(
    @Body() input: RegisterOwnerDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<Record<string, unknown>> {
    this.consume(this.registrationLimiter, ip, response);
    try {
      const user = await this.auth.registerOwner({
        legalName: input.name ?? input.legalName ?? '',
        displayName: input.tradingName ?? input.displayName ?? '',
        fullName: input.name ?? input.legalName ?? '',
        email: input.email,
        password: input.password
      });
      const gatewayOnboarding = isGatewayRegistration(input)
        ? await this.onboarding.register(user.merchantId, {
            personType: input.personType,
            name: input.name,
            tradingName: input.tradingName,
            email: input.email,
            phone: input.phone,
            document: input.document,
            zipCode: input.zipCode,
            address: input.address,
            number: input.number,
            neighborhood: input.neighborhood,
            city: input.city,
            state: input.state
          })
        : undefined;
      return {
        ...this.writeSession(response, await this.auth.login(input.email, input.password)),
        gatewayOnboarding: gatewayOnboarding
          ? { status: gatewayOnboarding.status, errorCode: gatewayOnboarding.lastErrorCode ?? null }
          : null
      };
    } catch (error) {
      if (error instanceof AuthError) throw this.problem(error);
      if (isDuplicateEntry(error))
        throw new ProblemException('REGISTRATION_CONFLICT', 409, 'Registration already exists.');
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate a local merchant owner' })
  @ApiOkResponse({ description: 'Access token and rotating refresh cookie issued' })
  async login(
    @Body() input: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<Record<string, unknown>> {
    this.consume(this.loginLimiter, ip, response);
    try {
      return this.writeSession(response, await this.auth.login(input.email, input.password));
    } catch (error) {
      if (error instanceof AuthError) throw this.problem(error);
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh-token family' })
  @ApiOkResponse({ description: 'Refresh token rotated' })
  async refresh(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Record<string, unknown>> {
    try {
      const cookies = parseCookies(request.headers.cookie);
      const refreshTok =
        cookies[refreshCookieName()] ??
        cookies['__Host-baas_refresh'] ??
        cookies.baas_refresh ??
        '';
      const csrfTok =
        cookies[csrfCookieName()] ?? cookies['__Host-baas_csrf'] ?? cookies.baas_csrf ?? '';
      return this.writeSession(
        response,
        await this.auth.rotate(refreshTok, csrfTok, csrfHeader ?? '')
      );
    } catch (error) {
      if (error instanceof AuthError) throw this.problem(error);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  async logout(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const cookies = parseCookies(request.headers.cookie);
    const refreshTok =
      cookies[refreshCookieName()] ?? cookies['__Host-baas_refresh'] ?? cookies.baas_refresh ?? '';
    const csrfTok =
      cookies[csrfCookieName()] ?? cookies['__Host-baas_csrf'] ?? cookies.baas_csrf ?? '';
    try {
      await this.auth.logout(refreshTok, csrfTok, csrfHeader ?? '');
      clearSessionCookies(response);
    } catch (error) {
      if (error instanceof AuthError) throw this.problem(error);
      throw error;
    }
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every refresh session for the owner' })
  async logoutAll(
    @Req() request: Request,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const cookies = parseCookies(request.headers.cookie);
    const refreshTok =
      cookies[refreshCookieName()] ?? cookies['__Host-baas_refresh'] ?? cookies.baas_refresh ?? '';
    const csrfTok =
      cookies[csrfCookieName()] ?? cookies['__Host-baas_csrf'] ?? cookies.baas_csrf ?? '';
    try {
      const session = await this.store.findSessionHash(refreshTok);
      if (!session || session.revokedAt) throw new AuthError('SESSION_INVALID');
      await this.auth.logoutAll(session.userId, csrfTok, csrfHeader ?? '');
      clearSessionCookies(response);
    } catch (error) {
      if (error instanceof AuthError) throw this.problem(error);
      throw error;
    }
  }

  private writeSession(response: Response, session: IssuedSession): Record<string, unknown> {
    const isSecure = isSecureCookie();
    response.cookie(accessCookieName(), session.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: session.accessExpiresAt
    });
    response.cookie(refreshCookieName(), session.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt
    });
    response.cookie(csrfCookieName(), session.csrfToken, {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt
    });
    return {
      accessToken: session.accessToken,
      accessExpiresAt: session.accessExpiresAt.toISOString(),
      expiresIn: 900,
      csrfToken: session.csrfToken,
      principal: session.principal
    };
  }

  private consume(limiter: FixedWindowRateLimiter, key: string, response: Response): void {
    try {
      limiter.consume(key);
    } catch {
      response.setHeader('Retry-After', '60');
      throw new ProblemException('RATE_LIMITED', 429, 'Too many requests. Retry later.');
    }
  }

  private problem(error: AuthError): ProblemException {
    return new ProblemException(
      error.code,
      error.code === 'CSRF_INVALID' ? 403 : 401,
      'Authentication request was rejected.'
    );
  }
}

function isGatewayRegistration(
  input: RegisterOwnerDto
): input is RegisterOwnerDto &
  Required<
    Pick<
      RegisterOwnerDto,
      | 'personType'
      | 'name'
      | 'tradingName'
      | 'phone'
      | 'document'
      | 'zipCode'
      | 'address'
      | 'number'
      | 'neighborhood'
      | 'city'
      | 'state'
    >
  > {
  return Boolean(
    input.personType &&
    input.name &&
    input.tradingName &&
    input.phone &&
    input.document &&
    input.zipCode &&
    input.address &&
    input.number &&
    input.neighborhood &&
    input.city &&
    input.state
  );
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator > 0)
      result[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1));
  }
  return result;
}

function clearSessionCookies(response: Response): void {
  const isSecure = isSecureCookie();
  response.clearCookie(accessCookieName(), {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: COOKIE_PATH
  });
  response.clearCookie(refreshCookieName(), {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: COOKIE_PATH
  });
  response.clearCookie(csrfCookieName(), {
    secure: isSecure,
    sameSite: 'lax',
    path: COOKIE_PATH
  });
  response.clearCookie('__Host-baas_access', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: COOKIE_PATH
  });
  response.clearCookie('__Host-baas_refresh', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: COOKIE_PATH
  });
  response.clearCookie('__Host-baas_csrf', {
    secure: true,
    sameSite: 'strict',
    path: COOKIE_PATH
  });
}

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
  );
}
