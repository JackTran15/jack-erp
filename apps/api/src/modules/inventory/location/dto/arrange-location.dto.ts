import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ArrangeLocationLineDto {
  @ApiProperty({ description: 'Hàng hoá (item) cần xếp' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ description: 'Kho chứa vị trí "Chưa xếp" (nguồn) và kệ đích' })
  @IsUUID()
  storageId!: string;

  @ApiProperty({ description: 'Vị trí kệ đích để xếp hàng lên' })
  @IsUUID()
  destinationLocationId!: string;
}

export class ArrangeLocationDto {
  @ApiProperty({ type: [ArrangeLocationLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArrangeLocationLineDto)
  @ArrayMinSize(1)
  lines!: ArrangeLocationLineDto[];
}
