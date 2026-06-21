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

export class PreferredShelfPairDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  storageId!: string;
}

export class BatchPreferredShelfRequestDto {
  @ApiProperty({ type: [PreferredShelfPairDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PreferredShelfPairDto)
  pairs!: PreferredShelfPairDto[];
}

export class BatchPreferredShelfRowDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  storageId!: string;

  @ApiProperty({ type: PreferredShelfResponseDto, nullable: true })
  shelf!: PreferredShelfResponseDto | null;
}

export class BatchPreferredShelfResponseDto {
  @ApiProperty({ type: [BatchPreferredShelfRowDto] })
  data!: BatchPreferredShelfRowDto[];
}
