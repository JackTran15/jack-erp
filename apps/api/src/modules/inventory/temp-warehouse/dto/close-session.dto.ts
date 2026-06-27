import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { TempWarehouseCloseMode } from '@erp/shared-interfaces';

export class CloseBranchSessionsDto {
  @ApiProperty({ description: 'Branch whose ACTIVE direction sessions are closed' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ enum: TempWarehouseCloseMode })
  @IsEnum(TempWarehouseCloseMode)
  mode: TempWarehouseCloseMode;
}
