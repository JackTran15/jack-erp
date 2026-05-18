import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssueReasonEntity } from './issue-reason.entity';
import { IssueReasonService } from './issue-reason.service';
import { IssueReasonController } from './issue-reason.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IssueReasonEntity])],
  controllers: [IssueReasonController],
  providers: [IssueReasonService],
  exports: [IssueReasonService],
})
export class IssueReasonModule {}
