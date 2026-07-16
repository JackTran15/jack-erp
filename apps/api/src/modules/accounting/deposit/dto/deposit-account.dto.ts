import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DepositAccountType, DepositAccountStatus } from '@erp/shared-interfaces';

export class CreateDepositAccountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  accountNo: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  accountName: string;

  @ApiProperty()
  @IsUUID()
  bankId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankBranch?: string;

  @ApiProperty({ enum: DepositAccountType })
  @IsEnum(DepositAccountType)
  type: DepositAccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tid?: string;

  @ApiProperty({ description: 'COA 112x account id' })
  @IsUUID()
  accountId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance: number;

  @ApiProperty()
  @IsDateString()
  openingDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: DepositAccountStatus })
  @IsOptional()
  @IsEnum(DepositAccountStatus)
  status?: DepositAccountStatus;

  /** Set server-side to openingBalance on create; not part of the admin form. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  balance?: number;
}

export class UpdateDepositAccountDto extends PartialType(CreateDepositAccountDto) {}
