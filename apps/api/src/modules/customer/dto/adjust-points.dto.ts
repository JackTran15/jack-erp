import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { PointType } from '../point-history.entity';

export class AdjustPointsDto {
  @IsEnum(PointType) type: PointType;
  @IsInt() delta: number; // positive or negative
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsString() note?: string;
}
