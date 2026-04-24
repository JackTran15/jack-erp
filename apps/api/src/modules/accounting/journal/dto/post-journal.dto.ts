import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JournalSource } from '@erp/shared-interfaces';

export class PostJournalLineDto {
  @IsUUID()
  accountId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debitAmount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(1)
  lineOrder: number;
}

export class PostJournalDto {
  @IsEnum(JournalSource)
  source: JournalSource;

  @IsOptional()
  @IsUUID()
  sourceReferenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PostJournalLineDto)
  lines: PostJournalLineDto[];
}
