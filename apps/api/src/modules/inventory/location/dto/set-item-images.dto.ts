import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * One owner and the full image set it should end up with. `id` is a grid row
 * id — a products.id for a grouped row or an items.id for an ungrouped one —
 * and the service resolves which (ADR-02). There is deliberately no
 * `ownerType`: owner type is derived from the record, never taken from the
 * body (media-upload-fetch rule), and `forbidNonWhitelisted` rejects it.
 */
export class SetItemImagesAssignmentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'products.id of a grouped row or items.id of an ungrouped row.',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: 10,
    description:
      'Full replacement image set, in display order. Ids not listed are detached; an empty list removes every image.',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  imageIds!: string[];
}

export class SetItemImagesDto {
  @ApiProperty({ type: [SetItemImagesAssignmentDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SetItemImagesAssignmentDto)
  assignments!: SetItemImagesAssignmentDto[];
}

export class SetItemImagesUpdatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Code of the product or item that was updated.' })
  code!: string;

  @ApiProperty({ description: 'Number of images attached after the write.' })
  imageCount!: number;
}

export class SetItemImagesFailedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Code of the owner, or null when the id matched nothing.',
  })
  code!: string | null;

  @ApiProperty({
    enum: [
      'OWNER_NOT_FOUND',
      'MEDIA_NOT_FOUND',
      'MEDIA_STATE_CONFLICT',
      'MEDIA_LIMIT_EXCEEDED',
    ],
    description:
      'OWNER_NOT_FOUND — id is not a product or ungrouped item of this organization (variant ids count as not found); otherwise the MediaException code from syncOwner.',
  })
  reason!: string;
}

export class SetItemImagesResponseDto {
  @ApiProperty({ type: [SetItemImagesUpdatedDto] })
  updated!: SetItemImagesUpdatedDto[];

  @ApiProperty({
    type: [SetItemImagesFailedDto],
    description:
      'Assignments left untouched. A non-empty list is a normal outcome, not an error.',
  })
  failed!: SetItemImagesFailedDto[];
}
