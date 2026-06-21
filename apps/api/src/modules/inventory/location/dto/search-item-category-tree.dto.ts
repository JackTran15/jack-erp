import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ItemCategoryStatus } from '../item-category.entity';

export class SearchItemCategoryTreeDto {
  @ApiPropertyOptional({ description: 'Match on category name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ItemCategoryStatus })
  @IsOptional()
  @IsEnum(ItemCategoryStatus)
  status?: ItemCategoryStatus;
}

export class ItemCategoryTreeNodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  code: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  parentGroupId: string | null;

  @ApiProperty({ enum: ItemCategoryStatus })
  status: ItemCategoryStatus;

  @ApiProperty({ type: () => [ItemCategoryTreeNodeDto] })
  children: ItemCategoryTreeNodeDto[];
}

export class SearchItemCategoryTreeResponseDto {
  @ApiProperty({ type: [ItemCategoryTreeNodeDto] })
  data: ItemCategoryTreeNodeDto[];
}
