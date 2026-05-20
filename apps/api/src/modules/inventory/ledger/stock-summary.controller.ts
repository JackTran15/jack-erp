import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { StockSummaryService } from './stock-summary.service';
import { StockSummaryQueryDto } from './dto/stock-summary-query.dto';

@ApiTags('inventory')
@Controller('inventory/stock')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard)
export class StockSummaryController {
  constructor(private readonly service: StockSummaryService) {}

  @Get('summary')
  @RequirePermission('inventory.read')
  getSummary(
    @Query() query: StockSummaryQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getSummary({
      ...query,
      organizationId: actor.organizationId,
    });
  }

  @Get('summary/filter-options')
  @RequirePermission('inventory.read')
  getFilterOptions(@Actor() actor: ActorContext) {
    return this.service.getFilterOptions(actor.organizationId);
  }
}
