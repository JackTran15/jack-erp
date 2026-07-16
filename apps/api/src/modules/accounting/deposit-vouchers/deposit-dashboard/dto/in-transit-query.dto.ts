import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class InTransitQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  staleDays?: number;
}
