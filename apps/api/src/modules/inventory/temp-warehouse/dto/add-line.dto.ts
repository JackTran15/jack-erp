import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TempWarehouseDirection } from '@erp/shared-interfaces';

export class AddTempWarehouseLineDto {
  @ApiProperty({ description: 'Branch the session belongs to — required' })
  @IsUUID()
  branchId: string;

  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    enum: TempWarehouseDirection,
    description:
      'Omit to auto-resolve direction from the items current stock balance at the branchs main warehouse vs main showroom location',
  })
  @IsOptional()
  @IsEnum(TempWarehouseDirection)
  direction?: TempWarehouseDirection;

  @ApiPropertyOptional({ description: 'Carrier user id (FK users)' })
  @IsOptional()
  @IsUUID()
  carrierUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Shelf/location on the source side of the movement',
  })
  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;
}
