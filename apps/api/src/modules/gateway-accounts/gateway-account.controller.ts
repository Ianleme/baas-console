import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags
} from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { ProblemException } from '../../platform/errors/problem.exception.js';
import { AuthError, AuthService } from '../auth/auth.service.js';
import { extractAccessToken } from '../auth/extract-token.js';
import { GatewayOnboardingError, GatewayOnboardingService } from './gateway-onboarding.service.js';

class ConnectGatewayDto {
  @ApiProperty({
    example: '12.345.678/0001-90',
    description: 'Documento (CPF ou CNPJ) cadastrado no gateway'
  })
  @IsString()
  @Length(3, 32)
  document!: string;

  @ApiProperty({
    example: 'temporary-secret',
    description: 'Senha temporária recebida por e-mail da Lera Box'
  })
  @IsString()
  @Length(1, 128)
  password!: string;
}

class RegisterGatewayDto {
  @ApiProperty({ enum: ['PF', 'PJ'], example: 'PJ', description: 'Tipo de pessoa' })
  @IsIn(['PF', 'PJ'])
  personType!: 'PF' | 'PJ';

  @ApiProperty({ example: 'Empresa Exemplo Ltda', description: 'Razão social ou nome completo' })
  @IsString()
  @Length(2, 255)
  name!: string;

  @ApiPropertyOptional({ example: 'Minha Loja', description: 'Nome fantasia' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  tradingName?: string;

  @ApiProperty({ example: 'proprietario@empresa.com.br', description: 'E-mail do responsável' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '(11) 98765-4321', description: 'Telefone com DDD' })
  @IsString()
  @Length(8, 20)
  phone!: string;

  @ApiProperty({ example: '12.345.678/0001-90', description: 'CPF ou CNPJ' })
  @IsString()
  @Length(3, 32)
  document!: string;

  @ApiProperty({ example: '01001-000', description: 'CEP' })
  @IsString()
  @Length(8, 12)
  zipCode!: string;

  @ApiProperty({ example: 'Praça da Sé', description: 'Endereço / Logradouro' })
  @IsString()
  @Length(2, 255)
  address!: string;

  @ApiProperty({ example: '100', description: 'Número' })
  @IsString()
  @Length(1, 20)
  number!: string;

  @ApiPropertyOptional({ example: 'Sala 42', description: 'Complemento' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  complement?: string;

  @ApiProperty({ example: 'Centro', description: 'Bairro' })
  @IsString()
  @Length(2, 120)
  neighborhood!: string;

  @ApiProperty({ example: 'São Paulo', description: 'Cidade' })
  @IsString()
  @Length(2, 120)
  city!: string;

  @ApiProperty({ example: 'SP', description: 'UF (sigla do estado com 2 letras)' })
  @IsString()
  @Length(2, 2)
  state!: string;
}

@ApiTags('gateway-account')
@ApiBearerAuth()
@Controller('api/v1/gateway-account')
export class GatewayAccountController {
  constructor(
    private readonly onboarding: GatewayOnboardingService,
    private readonly auth: AuthService
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or retry the current merchant at the gateway' })
  async register(
    @Req() request: Request,
    @Body() input: RegisterGatewayDto
  ): Promise<{ status: string; errorCode: string | null }> {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      const principal = this.auth.verifyAccessToken(token);
      const result = await this.onboarding.retryRegistration(principal.merchantId, input);
      return { status: result.status, errorCode: result.lastErrorCode ?? null };
    } catch (error) {
      if (error instanceof AuthError)
        throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
      if (error instanceof GatewayOnboardingError)
        throw new ProblemException(error.code, 409, 'Gateway registration was rejected.');
      throw error;
    }
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and connect the current merchant gateway account' })
  @ApiOkResponse({ description: 'Gateway profile verified and credentials encrypted' })
  async connect(
    @Req() request: Request,
    @Body() input: ConnectGatewayDto
  ): Promise<{ status: 'ACTIVE' }> {
    try {
      const token = extractAccessToken(request);
      if (!token) throw new AuthError('AUTH_REQUIRED');
      const principal = this.auth.verifyAccessToken(token);
      await this.onboarding.connect(principal.merchantId, input.document, input.password);
      return { status: 'ACTIVE' };
    } catch (error) {
      if (error instanceof AuthError)
        throw new ProblemException('AUTH_REQUIRED', 401, 'Authentication is required.');
      if (error instanceof GatewayOnboardingError)
        throw new ProblemException(error.code, 409, 'Gateway connection was rejected.');
      throw error;
    }
  }
}
