import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class IntraWarehouseTransferLineDto {
  @ApiProperty({ description: 'UUID of the inventory item' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: 'Quantity to transfer (must be > 0)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Optional notes for this line' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateIntraWarehouseTransferDto {
  @ApiProperty({ description: 'UUID of the source location' })
  @IsUUID()
  sourceLocationId!: string;

  @ApiProperty({ description: 'UUID of the destination location (must be in same storage as source)' })
  @IsUUID()
  destinationLocationId!: string;

  @ApiProperty({ type: [IntraWarehouseTransferLineDto], description: 'Lines to transfer' })
  @ValidateNested({ each: true })
  @Type(() => IntraWarehouseTransferLineDto)
  @ArrayMinSize(1)
  lines!: IntraWarehouseTransferLineDto[];
}
