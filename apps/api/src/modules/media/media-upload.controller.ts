import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { CompleteMediaUploadResponseDto, RequestMediaUploadResponseDto } from './dto/media-upload.response.dto';
import { MediaUploadService } from './media-upload.service';

@ApiTags('media')
@Controller('media')
export class MediaUploadController {
  constructor(private readonly uploads: MediaUploadService) {}

  @Post('uploads')
  @ApiCreatedResponse({ type: RequestMediaUploadResponseDto })
  requestUpload(
    @Body() dto: CreateMediaUploadDto,
    @Actor() actor: ActorContext,
  ): Promise<RequestMediaUploadResponseDto> {
    return this.uploads.requestUpload(dto, actor);
  }

  @Post('uploads/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompleteMediaUploadResponseDto })
  completeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<CompleteMediaUploadResponseDto> {
    return this.uploads.completeUpload(id, actor);
  }
}
