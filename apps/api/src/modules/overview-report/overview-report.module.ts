import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branch/branch.module';
import { OverviewReportController } from './overview-report.controller';
import { OverviewReportService } from './overview-report.service';

/** Trang "Tổng quan" của backoffice — đọc bằng các mảnh SQL của `modules/mobile`. */
@Module({
  imports: [AuthModule, BranchModule],
  controllers: [OverviewReportController],
  providers: [OverviewReportService],
})
export class OverviewReportModule {}
