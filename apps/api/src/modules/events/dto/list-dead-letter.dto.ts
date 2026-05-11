import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DeadLetterStatus } from '@erp/shared-interfaces';

export class ListDeadLetterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsEnum(DeadLetterStatus)
  status?: DeadLetterStatus;

  @IsOptional()
  @IsString()
  topic?: string;
}
