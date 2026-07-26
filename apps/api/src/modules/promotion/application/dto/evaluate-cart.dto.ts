import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsISO8601,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateCartLineInputDto {
  @ApiProperty({ description: 'Client-supplied, echoed back in lineDiscounts so the client can map results without guessing by order' })
  @IsString()
  @IsNotEmpty()
  lineId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Per-line discount the cashier already entered manually' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualLineDiscount?: number;
}

export class EvaluateCartDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a walk-in customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'ISO datetime; omitted = server current time' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  @ApiPropertyOptional({ type: [String], description: 'Ids of auto_apply=false programs the cashier picked manually' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  @ApiProperty({ type: [EvaluateCartLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluateCartLineInputDto)
  lines: EvaluateCartLineInputDto[];
}
