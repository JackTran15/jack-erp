import { ApiProperty } from '@nestjs/swagger';

/**
 * One node of the partner-facing category menu.
 *
 * Deliberately narrower than the internal `ItemCategoryTreeNodeDto`: no
 * `status` (only ACTIVE categories are ever returned, so the field would carry
 * no information) and no `description` (an internal note, not shop copy).
 */
export class PartnerCategoryNodeDto {
  @ApiProperty({ description: 'Category id, stable across requests' })
  id!: string;

  @ApiProperty({ nullable: true, description: 'Category code, null when unset' })
  code!: string | null;

  @ApiProperty({ description: 'Display name, as stored' })
  name!: string;

  @ApiProperty({ nullable: true, description: 'Parent category id; null at the root' })
  parentId!: string | null;

  @ApiProperty({
    description:
      'Distinct active products in this category AND every category below it. ' +
      'A parent with no products attached directly still reports its children.',
  })
  productCount!: number;

  @ApiProperty({ type: () => [PartnerCategoryNodeDto] })
  children!: PartnerCategoryNodeDto[];
}

/**
 * No parameters today. The class exists so the global ValidationPipe
 * (`forbidNonWhitelisted: true`) rejects unknown fields instead of silently
 * ignoring them, which keeps room to add filters without changing the verb.
 */
export class PartnerCategoryTreeRequestDto {}

export class PartnerCategoryTreeResponseDto {
  @ApiProperty({ type: () => [PartnerCategoryNodeDto] })
  data!: PartnerCategoryNodeDto[];
}
