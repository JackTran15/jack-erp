import {
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReturnTemporaryTransferLineDto {
  @ApiProperty({ description: 'Line ID within the temporary transfer to return against' })
  @IsUUID()
  lineId: string;

  @ApiProperty({ description: 'Quantity to return to the source location', example: 1 })
  @IsNumber()
  @Min(0.01)
  returnQuantity: number;
}

export class ReturnTemporaryTransferDto {
  @ApiProperty({ type: [ReturnTemporaryTransferLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnTemporaryTransferLineDto)
  lines: ReturnTemporaryTransferLineDto[];
}
