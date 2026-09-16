import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export const RESOLVE_IMAGE_NAMES_MAX = 500;

export type ResolvedImageNameMatch = 'product' | 'orphan' | 'variant';
export type ResolvedImageNameError = 'SEQ_OUT_OF_RANGE' | 'DUPLICATE_SEQ';

/**
 * Request body for `POST /v2/inventory-items/resolve-image-names` (ADR-03).
 * File names as dropped on the quick image update page, with or without the
 * image extension — the server strips `.jpg/.jpeg/.png/.gif/.webp` itself.
 * At most 500 names per call; the client splits larger drops (A-14).
 */
export class ResolveImageNamesDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: RESOLVE_IMAGE_NAMES_MAX,
    description: 'File names, with or without an image extension',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RESOLVE_IMAGE_NAMES_MAX)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  names!: string[];
}

/** One resolved name, in the order it was sent. */
export class ResolvedImageNameDto {
  @ApiProperty({ description: 'The name exactly as sent' })
  name!: string;

  @ApiProperty({
    description: 'Code part of the name (extension and `(NN)` removed); empty when nothing is left',
  })
  code!: string;

  @ApiProperty({ nullable: true, description: 'The `NN` of a `(NN)` suffix, or null' })
  seq!: number | null;

  @ApiProperty({
    enum: ['product', 'orphan', 'variant'],
    nullable: true,
    description:
      'What the code matched in the organization: a product code, an orphan item code, or a variant code (attached to the parent product)',
  })
  match!: ResolvedImageNameMatch | null;

  @ApiProperty({
    nullable: true,
    description: 'Id to send to set-images; for a variant this is the parent product id',
  })
  ownerId!: string | null;

  @ApiProperty({ nullable: true, description: 'Code of the owner (parent product for a variant)' })
  ownerCode!: string | null;

  @ApiProperty({ nullable: true, description: 'Name of the owner (parent product for a variant)' })
  ownerName!: string | null;

  @ApiProperty({
    enum: ['SEQ_OUT_OF_RANGE', 'DUPLICATE_SEQ'],
    nullable: true,
    description:
      'SEQ_OUT_OF_RANGE: `(NN)` outside 1..10; DUPLICATE_SEQ: an earlier name in this call already used the same owner and sequence',
  })
  error!: ResolvedImageNameError | null;
}

export class ResolveImageNamesResponseDto {
  @ApiProperty({ type: [ResolvedImageNameDto] })
  data!: ResolvedImageNameDto[];
}
