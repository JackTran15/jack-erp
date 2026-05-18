import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TempWarehouseCloseMode } from '@erp/shared-interfaces';

export class CloseTempWarehouseSessionDto {
  @ApiProperty({ enum: TempWarehouseCloseMode })
  @IsEnum(TempWarehouseCloseMode)
  mode: TempWarehouseCloseMode;
}
