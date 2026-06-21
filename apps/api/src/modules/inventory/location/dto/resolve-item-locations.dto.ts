import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

export class ResolveItemLocationsDto {
  @ApiProperty({ type: [String], description: 'Variant item ids to resolve a location for' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  variantItemIds: string[];

  @ApiProperty({
    description:
      'Branch whose default receiving warehouse is used when storageId is omitted',
  })
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional({
    description:
      'Target storage; when provided, resolution uses this storage and ignores the branch default',
  })
  @IsOptional()
  @IsUUID()
  storageId?: string;
}

export type ResolvedLocationSource = 'preferred' | 'stock' | 'default' | 'none';

export class ResolvedItemLocationDto {
  @ApiProperty()
  itemId: string;

  @ApiProperty({ nullable: true })
  productId: string | null;

  @ApiProperty({ nullable: true })
  storageId: string | null;

  @ApiProperty({ nullable: true })
  locationId: string | null;

  @ApiProperty({ nullable: true })
  locationCode: string | null;

  @ApiProperty({ nullable: true })
  locationName: string | null;

  @ApiProperty({ enum: ['preferred', 'stock', 'default', 'none'] })
  source: ResolvedLocationSource;
}

export class ResolveItemLocationsResponseDto {
  @ApiProperty({ type: [ResolvedItemLocationDto] })
  data: ResolvedItemLocationDto[];
}
