import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AccountType } from '@erp/shared-interfaces';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsUUID()
  parentAccountId?: string;
}
