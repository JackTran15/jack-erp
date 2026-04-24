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

  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\-_/]+$/)
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
  @IsEnum(['YYYYMMDD', 'YYYYMM', 'YYYY', 'MMDD', 'MM', 'DD'])
  dateFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  sequenceLength?: number;

  @IsOptional()
  @IsEnum(ResetPolicy)
  resetPolicy?: ResetPolicy;
}
