import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type {
  TransactionOriginType,
  TransactionStatus,
  TransactionType
} from '../entities/transaction.entity.js';

export class ListTransactionsDto {
  @IsOptional()
  @IsIn(['APPROVED', 'DENIED', 'PENDING', 'EXPIRED', 'CANCELLED'])
  status?: TransactionStatus;

  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: TransactionType;

  @IsOptional()
  @IsIn(['PAYMENT', 'WITHDRAWAL'])
  originType?: TransactionOriginType;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
