import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositAuditLogEntity } from './deposit-audit-log.entity';
import { DepositAuditService } from './deposit-audit.service';
import { DepositAuditController } from './deposit-audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DepositAuditLogEntity])],
  controllers: [DepositAuditController],
  providers: [DepositAuditService],
  exports: [DepositAuditService],
})
export class DepositAuditModule {}
