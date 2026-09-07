import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsUUID } from 'class-validator';

/**
 * Bulk "Ngừng kinh doanh" / "Đang kinh doanh" from the inventory item list.
 *
 * `ids` are grid row ids, and those are polymorphic: a grouped row carries a
 * products.id while an ungrouped ("orphan") row carries an items.id. The caller
 * is not asked to tell them apart — the service expands both (ADR-04).
 */
export class SetItemActiveStatusDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Grid row ids. A products.id expands to every variant of that product; an items.id targets that item.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({
    description: 'true = Đang kinh doanh, false = Ngừng kinh doanh.',
  })
  @IsBoolean()
  isActive!: boolean;
}

/** One item left untouched, with the rule that spared it. */
export class SetItemActiveStatusSkippedDto {
  @ApiProperty({ description: 'SKU of the item that was not changed.' })
  code!: string;

  @ApiProperty({
    enum: ['IN_SHOWROOM'],
    description:
      'IN_SHOWROOM — stock still sits in a main (Showroom) storage and has to be moved out first.',
  })
  reason!: string;
}

export class SetItemActiveStatusResponseDto {
  @ApiProperty({ description: 'Number of item rows actually updated.' })
  updated!: number;

  @ApiProperty({
    type: [SetItemActiveStatusSkippedDto],
    description:
      'Items deliberately left alone. A non-empty list is a normal outcome, not an error.',
  })
  skipped!: SetItemActiveStatusSkippedDto[];
}
