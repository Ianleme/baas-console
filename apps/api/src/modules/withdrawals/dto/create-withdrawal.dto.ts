import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';

export class CreateWithdrawalDto {
  @ApiProperty({
    example: '50000',
    description: 'Valor do saque em centavos (ex: 50000 = R$ 500,00)'
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amountCents must be a positive integer in string format' })
  amountCents!: string;

  @ApiProperty({
    example: '12345678909',
    description: 'Chave Pix de destino dos fundos'
  })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  pixKey!: string;

  @ApiProperty({
    enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'],
    example: 'CPF',
    description: 'Tipo da chave Pix de destino'
  })
  @IsNotEmpty()
  @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])
  pixKeyType!: PixKeyType;

  @ApiPropertyOptional({
    example: 'SAQUE-2026-001',
    description: 'Identificador ou referência externa customizada para reconciliação'
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  externalReference?: string;
}
