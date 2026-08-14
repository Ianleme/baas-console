import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type {
  TransactionOriginType,
  TransactionStatus,
  TransactionType
} from '../entities/transaction.entity.js';

export class ListTransactionsDto {
  @ApiPropertyOptional({
    enum: ['APPROVED', 'DENIED', 'PENDING', 'EXPIRED', 'CANCELLED'],
    example: 'APPROVED',
    description: 'Filtrar por status da transação'
  })
  @IsOptional()
  @IsIn(['APPROVED', 'DENIED', 'PENDING', 'EXPIRED', 'CANCELLED'])
  status?: TransactionStatus;

  @ApiPropertyOptional({
    enum: ['CREDIT', 'DEBIT'],
    example: 'CREDIT',
    description: 'Tipo de movimentação (Crédito ou Débito)'
  })
  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: ['PAYMENT', 'WITHDRAWAL'],
    example: 'PAYMENT',
    description: 'Origem da transação (Pagamento recebido ou Saque)'
  })
  @IsOptional()
  @IsIn(['PAYMENT', 'WITHDRAWAL'])
  originType?: TransactionOriginType;

  @ApiPropertyOptional({
    example: 'REF-2026-01048',
    description: 'Busca por referência da transação ou pedido'
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reference?: string;

  @ApiPropertyOptional({
    example: '2026-08-01T00:00:00.000Z',
    format: 'date-time',
    description: 'Data de início do período (ISO 8601)'
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31T23:59:59.000Z',
    format: 'date-time',
    description: 'Data de término do período (ISO 8601)'
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50,
    description: 'Quantidade máxima de registros por página'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    default: 0,
    description: 'Deslocamento / offset para paginação'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
