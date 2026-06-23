import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../../common/filters/filter.dto';

export class CashCountSearchV2Dto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @ApiProperty({ required: false, type: DateRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  countedAt?: DateRangeFilterDto;

  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  @ApiProperty({ required: false, type: StringFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  purpose?: StringFilterDto;

  @ApiProperty({ required: false, type: EnumFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;
}
