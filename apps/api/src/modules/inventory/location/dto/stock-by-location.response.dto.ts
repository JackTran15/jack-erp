import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '@erp/shared-interfaces';

export class StockByLocationProviderDto {
  @ApiProperty({ format: 'uuid' }) providerId: string;
  @ApiProperty() providerName: string;
  @ApiProperty() isPrimary: boolean;
}

export class StockByLocationItemDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) categoryId: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) productId: string | null;
  @ApiPropertyOptional({ nullable: true }) variantLabel: string | null;
  @ApiProperty() isPosVisible: boolean;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sellingPrice: number;
  @ApiProperty() purchasePrice: number;
  @ApiProperty({ type: [String] }) barcodes: string[];
  @ApiProperty({ type: [StockByLocationProviderDto] })
  providers: StockByLocationProviderDto[];
  @ApiProperty() quantity: number;
  @ApiPropertyOptional({ nullable: true }) minQty: number | null;
  @ApiPropertyOptional({ nullable: true }) maxQty: number | null;
  @ApiProperty() belowMin: boolean;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastMovementAt: string | null;
}

export class StockByLocationStorageRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class StockByLocationBranchRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class StockByLocationLocationRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: LocationType }) type: LocationType;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: StockByLocationStorageRefDto })
  storage: StockByLocationStorageRefDto;
  @ApiProperty({ type: StockByLocationBranchRefDto })
  branch: StockByLocationBranchRefDto;
}

export class StockByLocationMetaDto {
  @ApiProperty({ type: StockByLocationLocationRefDto })
  location: StockByLocationLocationRefDto;
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class StockByLocationResponseDto {
  @ApiProperty({ type: [StockByLocationItemDto] })
  data: StockByLocationItemDto[];
  @ApiProperty({ type: StockByLocationMetaDto })
  meta: StockByLocationMetaDto;
}
