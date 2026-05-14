import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemporaryTransferLineDto {
  @ApiProperty({ description: 'Item being transferred to temporary location' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Source location (where the item is physically taken from)' })
  @IsUUID()
  sourceLocationId: string;

  @ApiProperty({ description: 'Quantity to transfer (must be positive)', example: 1 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTemporaryTransferDto {
  @ApiProperty({ description: 'User responsible for carrying the items (carrier)' })
  @IsUUID()
  carrierUserId: string;

  @ApiPropertyOptional({ description: 'Branch of the source location; defaults to actor branch if omitted' })
  @IsOptional()
  @IsUUID()
  sourceBranchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateTemporaryTransferLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemporaryTransferLineDto)
  lines: CreateTemporaryTransferLineDto[];
}
