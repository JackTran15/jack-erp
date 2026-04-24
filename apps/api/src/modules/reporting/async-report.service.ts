import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WsChannel, WsEventType } from '@erp/shared-interfaces';
import { WebSocketEmitterService } from '../websocket/websocket-emitter.service';
import { ReportingService, ReportQuery } from './reporting.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

export type AsyncReportType =
  | 'sales-summary'
  | 'inventory-valuation'
  | 'receivables-aging'
  | 'payables-aging'
  | 'cash-reconciliation';

interface JobRecord {
  id: string;
  type: AsyncReportType;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  query: ReportQuery;
  actor: ActorContext;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class AsyncReportService {
  private readonly logger = new Logger(AsyncReportService.name);
  private readonly jobs = new Map<string, JobRecord>();

  constructor(
    private readonly reportingService: ReportingService,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async runAsyncReport(
    type: AsyncReportType,
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();

    const job: JobRecord = {
      id: jobId,
      type,
      status: 'QUEUED',
      query,
      actor,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    setImmediate(() => this.executeJob(job));

    this.logger.log(`Queued async report job=${jobId} type=${type}`);
    return { jobId };
  }

  checkJobStatus(jobId: string): {
    status: string;
    result?: unknown;
    error?: string;
  } {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException(`Report job not found: ${jobId}`);
    }

    return {
      status: job.status,
      result: job.status === 'COMPLETED' ? job.result : undefined,
      error: job.status === 'FAILED' ? job.error : undefined,
    };
  }

  private async executeJob(job: JobRecord): Promise<void> {
    job.status = 'RUNNING';

    try {
      const result = await this.dispatch(job.type, job.query, job.actor);
      job.status = 'COMPLETED';
      job.result = result;
      job.completedAt = new Date();

      this.wsEmitter.emitToUser(job.actor.userId, {
        eventId: randomUUID(),
        eventType: WsEventType.REPORT_JOB_COMPLETED,
        timestamp: new Date().toISOString(),
        organizationId: job.actor.organizationId,
        branchId: job.actor.branchId,
        correlationId: job.id,
        payload: {
          jobId: job.id,
          type: job.type,
          status: 'COMPLETED',
        },
      });

      this.logger.log(`Report job completed: ${job.id}`);
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
      job.completedAt = new Date();

      this.wsEmitter.emitToUser(job.actor.userId, {
        eventId: randomUUID(),
        eventType: WsEventType.REPORT_JOB_COMPLETED,
        timestamp: new Date().toISOString(),
        organizationId: job.actor.organizationId,
        branchId: job.actor.branchId,
        correlationId: job.id,
        payload: {
          jobId: job.id,
          type: job.type,
          status: 'FAILED',
          error: err.message,
        },
      });

      this.logger.error(`Report job failed: ${job.id} - ${err.message}`);
    }
  }

  private async dispatch(
    type: AsyncReportType,
    query: ReportQuery,
    actor: ActorContext,
  ): Promise<unknown> {
    switch (type) {
      case 'sales-summary':
        return this.reportingService.getSalesSummary(query, actor);
      case 'inventory-valuation':
        return this.reportingService.getInventoryValuation(query, actor);
      case 'receivables-aging':
        return this.reportingService.getReceivablesAging(query, actor);
      case 'payables-aging':
        return this.reportingService.getPayablesAging(query, actor);
      case 'cash-reconciliation':
        return this.reportingService.getCashReconciliation(query, actor);
    }
  }
}
