import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PosCatalogLookupQueryDto {
  @ApiProperty({ description: 'Exact barcode or SKU code to look up.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;
}
