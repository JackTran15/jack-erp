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

  @ApiProperty({
    enum: TempWarehouseDirection,
    description:
      'Direction of this session/line: warehouse_to_showroom (w2s) or showroom_to_warehouse (s2w). Selects/opens the per-direction session.',
  })
  @IsEnum(TempWarehouseDirection)
  direction: TempWarehouseDirection;

  @ApiPropertyOptional({
    description:
      'Warehouse-side storage for this session; resolved to its default location. Falls back to branch main storage when omitted. Only honored when opening the session.',
  })
  @IsOptional()
  @IsUUID()
  warehouseStorageId?: string;

  @ApiPropertyOptional({
    description:
      'Showroom-side storage for this session; resolved to its default location. Falls back to branch main showroom when omitted. Only honored when opening the session.',
  })
  @IsOptional()
  @IsUUID()
  showroomStorageId?: string;

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
