import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';

export class CreateWithdrawalDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amountCents must be a positive integer in string format' })
  amountCents!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  pixKey!: string;

  @IsNotEmpty()
  @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])
  pixKeyType!: PixKeyType;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  externalReference?: string;
}
