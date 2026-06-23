import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTempWarehouseLineDto {
  @ApiPropertyOptional({ description: 'Replacement item — leaves direction unchanged' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  carrierUserId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceLocationId?: string | null;
}
