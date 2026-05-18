import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class TransferTempWarehouseLinesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'IDs of ACTIVE lines in the session to materialize into stock transfer(s).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  lineIds: string[];

  @ApiPropertyOptional({ description: 'Free-form note attached to the resulting stock transfer(s).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
