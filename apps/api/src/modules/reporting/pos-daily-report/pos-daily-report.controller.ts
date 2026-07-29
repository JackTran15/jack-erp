import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { Response } from 'express';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { PosDailySummaryDto } from './dto/pos-daily-summary.dto';
import { PosDailySummaryExportDto } from './dto/pos-daily-summary-export.dto';
import { PosDailySummaryDetailDto } from './dto/pos-daily-summary-detail.dto';
import { GetPosDailySummaryQuery } from './queries/get-pos-daily-summary.query';
import { GetPosDailySummaryDetailQuery } from './queries/get-pos-daily-summary-detail.query';
import { PosDailySummaryExportService } from './pos-daily-summary-export.service';

const BRANCH_READ = 'reporting.invoice.branch.read';

/** POS daily report ("Báo cáo theo ngày" → tab "Tổng hợp"). */
@ApiTags('reports/pos')
@Controller('reports/pos')
@UseGuards(PermissionGuard)
export class PosDailyReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly exportService: PosDailySummaryExportService,
  ) {}

  @Post('daily-summary')
  @RequirePermission(BRANCH_READ)
  dailySummary(
    @Body() dto: PosDailySummaryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetPosDailySummaryQuery(dto, actor));
  }

  /** "Xem chi tiết" drill-down for one Tab 1 summary line item. */
  @Post('daily-summary/detail')
  @RequirePermission(BRANCH_READ)
  dailySummaryDetail(
    @Body() dto: PosDailySummaryDetailDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetPosDailySummaryDetailQuery(dto, actor));
  }

  @Post('daily-summary/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(BRANCH_READ)
  async exportDailySummary(
    @Body() dto: PosDailySummaryExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ) {
    const summary = await this.queryBus.execute(
      new GetPosDailySummaryQuery(dto, actor),
    );
    const buffer = await this.exportService.buildWorkbookBuffer(summary, dto, actor);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Bao-cao-tong-hop.xlsx"',
    );
    res.send(buffer);
  }
}
