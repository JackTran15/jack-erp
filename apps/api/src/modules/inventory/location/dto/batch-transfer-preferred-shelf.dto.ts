import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PreferredShelfResponseDto } from './preferred-shelf.response.dto';

export class TransferPreferredShelfPairDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceStorageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  destStorageId!: string;
}

export class BatchTransferPreferredShelfRequestDto {
  @ApiProperty({ type: [TransferPreferredShelfPairDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferPreferredShelfPairDto)
  pairs!: TransferPreferredShelfPairDto[];
}

export class BatchTransferPreferredShelfRowDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  sourceStorageId!: string;

  @ApiProperty({ format: 'uuid' })
  destStorageId!: string;

  @ApiProperty({ type: PreferredShelfResponseDto, nullable: true })
  sourceShelf!: PreferredShelfResponseDto | null;

  @ApiProperty({ type: PreferredShelfResponseDto, nullable: true })
  destShelf!: PreferredShelfResponseDto | null;
}

export class BatchTransferPreferredShelfResponseDto {
  @ApiProperty({ type: [BatchTransferPreferredShelfRowDto] })
  data!: BatchTransferPreferredShelfRowDto[];
}
