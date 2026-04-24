import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ResetPolicy } from '../document-number-rule.entity';

export class UpdateDocumentNumberRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\-_/]+$/)
  prefix?: string;

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
