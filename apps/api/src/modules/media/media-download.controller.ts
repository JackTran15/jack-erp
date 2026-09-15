import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { GetMediaDownloadUrlResponseDto } from './dto/media-download.response.dto';
import { MediaDownloadService } from './media-download.service';

@ApiTags('media')
@Controller('media')
export class MediaDownloadController {
  constructor(private readonly downloads: MediaDownloadService) {}

  @Get(':id/download-url')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: GetMediaDownloadUrlResponseDto })
  getDownloadUrl(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
  ): Promise<GetMediaDownloadUrlResponseDto> {
    return this.downloads.getDownloadUrl(id, actor);
  }
}
