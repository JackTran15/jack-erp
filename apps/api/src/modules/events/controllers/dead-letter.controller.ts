import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { DeadLetterService } from '../services/dead-letter.service';
import { ListDeadLetterDto } from '../dto/list-dead-letter.dto';
import { IgnoreDeadLetterDto } from '../dto/ignore-dead-letter.dto';

@Controller('dead-letter-events')
@UseGuards(PermissionGuard)
export class DeadLetterController {
  constructor(private readonly deadLetterService: DeadLetterService) {}

  @Get()
  @RequirePermission('events.dead-letter.manage')
  list(@Query() query: ListDeadLetterDto, @Actor() actor: ActorContext) {
    return this.deadLetterService.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('events.dead-letter.manage')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.deadLetterService.getById(id, actor);
  }

  @Post(':id/replay')
  @RequirePermission('events.dead-letter.manage')
  replay(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.deadLetterService.replay(id, actor);
  }

  @Post(':id/ignore')
  @RequirePermission('events.dead-letter.manage')
  ignore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IgnoreDeadLetterDto,
    @Actor() actor: ActorContext,
  ) {
    return this.deadLetterService.ignore(id, dto.reason, actor);
  }
}
