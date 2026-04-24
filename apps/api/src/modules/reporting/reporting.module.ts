import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { ReportingService } from './reporting.service';
import { AsyncReportService } from './async-report.service';
import { ReportingController } from './reporting.controller';

@Module({
  imports: [RbacModule, WebSocketModule],
  controllers: [ReportingController],
  providers: [ReportingService, AsyncReportService],
  exports: [ReportingService],
})
export class ReportingModule {}
