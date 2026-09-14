import { ApiProperty } from '@nestjs/swagger';

export class GetMediaDownloadUrlResponseDto {
  @ApiProperty({ description: 'Public URL for public media, or a presigned GET URL for private media.' })
  url: string;

  @ApiProperty({
    description: 'When the link expires. Always null for public media; ~15 minutes for a private attachment link.',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  expiresAt: string | null;
}
