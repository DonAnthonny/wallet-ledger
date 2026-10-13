
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AmountDto {
  @ApiProperty({
    description:
      'Positive integer amount in minor currency units, sent as a string.',
    example: '1000',
    type: String,
    pattern: '^[1-9]\\d{0,17}$',
  })
  @IsString()
  @Matches(/^[1-9]\d{0,17}$/, {
    message: 'amount must be a positive integer in minor currency units',
  })
  amount!: string;
}

export class DepositDto extends AmountDto {
  @ApiProperty({
    description:
      'Unique payment reference. Reusing an existing reference is rejected.',
    example: 'payment-ref-2026-000001',
    maxLength: 128,
  })
  @IsString()
  @MaxLength(128)
  referenceId!: string;
}

export class TransferDto extends AmountDto {
  @ApiProperty({
    description: 'UUID of the destination user.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  destinationUserId!: string;
}

export class LedgerQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting from 1.',
    example: 1,
    default: 1,
    minimum: 1,
    type: Number,
  })
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page. Maximum enforced by the service: 100.',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit = 20;

  @ApiPropertyOptional({
    description: 'Inclusive start date/time filter in ISO-like format.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
  from?: string;

  @ApiPropertyOptional({
    description: 'End date/time filter in ISO-like format.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by ledger operation.',
    example: 'DEPOSIT',
    enum: ['DEPOSIT', 'WITHDRAW', 'TRANSFER'],
  })
  @IsOptional()
  @IsString()
  operation?: string;

  @ApiPropertyOptional({
    description: 'Filter by ledger entry status.',
    example: 'SUCCESS',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
