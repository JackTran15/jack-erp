import {
  IsEnum,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { DocumentType } from '@erp/shared-interfaces';
import { ResetPolicy } from '../document-number-rule.entity';

export class CreateDocumentNumberRuleDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsOptional()
  @IsString()
  branchId?: string;

  // Still required, but allowed to be the empty string: the invoice rule carries
  // no prefix at all (its number starts with the date), and the `+` quantifier
  // used to reject that outright. Kept non-optional because the column is NOT
  // NULL with no default — an absent prefix would fail at the insert instead.
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\-_/]*$/)
  prefix: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\-_/]*$/)
  suffix?: string;

  @IsOptional()
  @IsBoolean()
  includeDate?: boolean;

  @IsOptional()
  @IsString()
  @IsEnum(['YYMMDD', 'YYYYMMDD', 'YYYYMM', 'YYYY', 'MMDD', 'MM', 'DD'])
  dateFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  sequenceLength?: number;

  @IsOptional()
  @IsEnum(ResetPolicy)
  resetPolicy?: ResetPolicy;

  // The string joining prefix / date / sequence / suffix. Empty runs them
  // together ("2608210001"); "-" is the legacy layout. Deliberately unconstrained
  // beyond a length cap — "-", "/", "." and "" are all reasonable, and enumerating
  // them buys nothing.
  @IsOptional()
  @IsString()
  @MaxLength(5)
  separator?: string;
}
