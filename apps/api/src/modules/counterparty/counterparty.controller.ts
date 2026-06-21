import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import {
  SearchCounterpartiesDto,
  SearchCounterpartiesResponseDto,
} from './dto/search-counterparties.dto';
import { SearchCounterpartiesQuery } from './queries/search-counterparties.query';

@ApiTags('counterparties')
@Controller('counterparties')
@UseGuards(PermissionGuard)
export class CounterpartyController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  @ApiOperation({
    summary: 'Unified search across suppliers, customers and employees',
  })
  @ApiOkResponse({ type: SearchCounterpartiesResponseDto })
  search(
    @Body() dto: SearchCounterpartiesDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchCounterpartiesResponseDto> {
    return this.queryBus.execute(new SearchCounterpartiesQuery(dto, actor));
  }
}
