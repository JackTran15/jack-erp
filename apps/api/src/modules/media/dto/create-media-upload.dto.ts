import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MediaOwnerType } from '../media-object.entity';
import { MEDIA_OWNER_POLICIES } from '../media-owner-policies';

const OWNER_TYPES = Object.keys(MEDIA_OWNER_POLICIES) as MediaOwnerType[];

/** Upper bound across every ownerType policy (10 MiB, the attachment types); the exact per-ownerType limit is re-checked in `MediaUploadService`. */
const MAX_DECLARABLE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Rejects C0 controls (U+0000 - U+001F), DEL and C1 controls (U+007F -
 * U+009F), bidi/format characters (U+061C, U+200E - U+200F, U+202A - U+202E,
 * U+2066 - U+2069), and zero-width/BOM characters (U+200B - U+200D, U+2060,
 * U+FEFF). A NUL byte in `fileName` reaches Postgres as an invalid UTF-8 byte
 * sequence (500); a bidi override character can spoof a file extension, e.g.
 * rendering "invoice[RLO]fdp.exe" as "invoice...exe.pdf"; a zero-width or BOM
 * character can hide inside an otherwise-identical name, e.g. splitting
 * "invoice.pdf" and "invoi[ZWSP]ce.pdf" apart for anything that compares
 * file names as display strings.
 *
 * Built from numeric code points, not string literals, so this source file
 * holds plain ASCII hex instead of embedding the raw control/bidi characters
 * the pattern exists to reject.
 */
function codePointRange(from: number, to: number): string {
  return String.fromCodePoint(from) + '-' + String.fromCodePoint(to);
}

const FORBIDDEN_FILE_NAME_CHARS =
  codePointRange(0x0000, 0x001f) +
  codePointRange(0x007f, 0x009f) +
  codePointRange(0x061c, 0x061c) +
  codePointRange(0x200b, 0x200d) +
  codePointRange(0x200e, 0x200f) +
  codePointRange(0x202a, 0x202e) +
  codePointRange(0x2060, 0x2060) +
  codePointRange(0x2066, 0x2069) +
  codePointRange(0xfeff, 0xfeff);

const SAFE_FILE_NAME = new RegExp('^[^' + FORBIDDEN_FILE_NAME_CHARS + ']+$');

export class CreateMediaUploadDto {
  @ApiProperty({
    enum: OWNER_TYPES,
    description: 'Owner type this upload will belong to; decides the bucket, size limit and content-type allowlist.',
  })
  @IsIn(OWNER_TYPES)
  ownerType: MediaOwnerType;

  @ApiProperty({ description: 'Original file name; used for display and Content-Disposition only.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(SAFE_FILE_NAME, {
    message: 'fileName must not contain control, bidi override, or zero-width characters',
  })
  fileName: string;

  @ApiProperty({ description: 'Declared MIME type; checked against the ownerType allowlist and re-checked at confirm time.' })
  @IsString()
  @MaxLength(100)
  contentType: string;

  @ApiProperty({ description: 'Declared size in bytes; checked against the ownerType limit and re-checked at confirm time.' })
  @IsInt()
  @Min(1)
  @Max(MAX_DECLARABLE_SIZE_BYTES)
  size: number;
}
