import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  ImportJobStatus,
  StockMovementType,
  PaginatedResponse,
  PaginationQuery,
  WsEventType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { InventoryLocationService } from '../location/inventory-location.service';
import {
  StockLedgerService,
  RecordMovementParams,
} from '../ledger/stock-ledger.service';
import {
  InventoryImportJobEntity,
  ImportJobType,
} from './inventory-import-job.entity';
import {
  InventoryImportJobRowEntity,
  ImportRowStatus,
} from './inventory-import-job-row.entity';

interface CsvRow {
  [key: string]: string;
}

interface RowError {
  column?: string;
  code: string;
  message: string;
}

const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    @InjectRepository(InventoryImportJobEntity)
    private readonly jobRepo: Repository<InventoryImportJobEntity>,
    @InjectRepository(InventoryImportJobRowEntity)
    private readonly rowRepo: Repository<InventoryImportJobRowEntity>,
    private readonly dataSource: DataSource,
    private readonly locationService: InventoryLocationService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async validate(
    type: ImportJobType,
    file: { originalname: string; buffer: Buffer },
    actor: ActorContext,
  ): Promise<InventoryImportJobEntity> {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const idempotencyKey = `${actor.organizationId}:${type}:${checksum}`;

    const existing = await this.jobRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        type,
        idempotencyKey,
      },
    });
    if (existing && existing.status === ImportJobStatus.COMMITTED) {
      return existing;
    }
    if (existing && existing.status !== ImportJobStatus.FAILED) {
      return existing;
    }

    const csvText = file.buffer.toString('utf-8');
    const parsed = this.parseCsv(csvText);
    if (parsed.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const job = this.jobRepo.create({
      type,
      fileName: file.originalname,
      fileChecksum: checksum,
      idempotencyKey,
      status: ImportJobStatus.VALIDATING,
      totalRows: parsed.length,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    const savedJob = await this.jobRepo.save(job);

    const rows: InventoryImportJobRowEntity[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let i = 0; i < parsed.length; i++) {
      const rawData = parsed[i];
      const errors = await this.validateRow(type, rawData, actor);
      const status = errors.length === 0 ? ImportRowStatus.VALID : ImportRowStatus.ERROR;

      if (status === ImportRowStatus.VALID) validCount++;
      else errorCount++;

      rows.push(
        this.rowRepo.create({
          jobId: savedJob.id,
          rowNumber: i + 1,
          rawData,
          status,
          errorMessages: errors.length > 0 ? errors : undefined,
        }),
      );
    }

    await this.rowRepo.save(rows);

    savedJob.validRows = validCount;
    savedJob.errorRows = errorCount;
    savedJob.status = errorCount > 0 ? ImportJobStatus.FAILED : ImportJobStatus.VALIDATED;
    await this.jobRepo.save(savedJob);

    this.emitStatusChanged(savedJob);
    return savedJob;
  }

  async commit(
    jobId: string,
    actor: ActorContext,
    batchSize = DEFAULT_BATCH_SIZE,
  ): Promise<InventoryImportJobEntity> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }
    if (job.status !== ImportJobStatus.VALIDATED) {
      throw new BadRequestException(
        `Job must be in VALIDATED status to commit. Current status: ${job.status}`,
      );
    }

    job.status = ImportJobStatus.COMMITTING;
    await this.jobRepo.save(job);
    this.emitStatusChanged(job);

    try {
      const validRows = await this.rowRepo.find({
        where: { jobId: job.id, status: ImportRowStatus.VALID },
        order: { rowNumber: 'ASC' },
      });

      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize);
        await this.commitBatch(job, batch, actor);
      }

      job.status = ImportJobStatus.COMMITTED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
    } catch (error) {
      this.logger.error(
        `Import job ${job.id} commit failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      job.status = ImportJobStatus.FAILED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
      throw error;
    }

    return job;
  }

  async getJob(
    jobId: string,
    actor: ActorContext,
  ): Promise<InventoryImportJobEntity> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
      relations: ['rows'],
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }
    return job;
  }

  async listJobs(
    query: PaginationQuery & { type?: ImportJobType; status?: ImportJobStatus },
    actor: ActorContext,
  ): Promise<PaginatedResponse<InventoryImportJobEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const [data, total] = await this.jobRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'desc' }
        : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private parseCsv(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: CsvRow = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? '';
      }
      rows.push(row);
    }

    return rows;
  }

  private async validateRow(
    type: ImportJobType,
    row: CsvRow,
    actor: ActorContext,
  ): Promise<RowError[]> {
    switch (type) {
      case ImportJobType.ITEMS:
        return this.validateItemRow(row);
      case ImportJobType.OPENING_BALANCES:
        return this.validateOpeningBalanceRow(row, actor);
      case ImportJobType.ADJUSTMENTS:
        return this.validateAdjustmentRow(row, actor);
    }
  }

  private validateItemRow(row: CsvRow): RowError[] {
    const errors: RowError[] = [];

    if (!row.itemCode?.trim()) {
      errors.push({ column: 'itemCode', code: 'REQUIRED', message: 'itemCode is required' });
    }
    if (!row.itemName?.trim()) {
      errors.push({ column: 'itemName', code: 'REQUIRED', message: 'itemName is required' });
    }
    if (!row.uom?.trim()) {
      errors.push({ column: 'uom', code: 'REQUIRED', message: 'uom is required' });
    }
    if (row.isActive !== undefined && row.isActive !== '') {
      const lower = row.isActive.toLowerCase();
      if (!['true', 'false', '1', '0'].includes(lower)) {
        errors.push({
          column: 'isActive',
          code: 'INVALID_BOOLEAN',
          message: 'isActive must be true/false or 1/0',
        });
      }
    }

    return errors;
  }

  private async validateOpeningBalanceRow(
    row: CsvRow,
    actor: ActorContext,
  ): Promise<RowError[]> {
    const errors: RowError[] = [];

    if (!row.branchCode?.trim()) {
      errors.push({ column: 'branchCode', code: 'REQUIRED', message: 'branchCode is required' });
    }
    if (!row.locationCode?.trim()) {
      errors.push({ column: 'locationCode', code: 'REQUIRED', message: 'locationCode is required' });
    }
    if (!row.itemCode?.trim()) {
      errors.push({ column: 'itemCode', code: 'REQUIRED', message: 'itemCode is required' });
    }
    if (!row.quantity?.trim()) {
      errors.push({ column: 'quantity', code: 'REQUIRED', message: 'quantity is required' });
    } else if (isNaN(Number(row.quantity)) || Number(row.quantity) < 0) {
      errors.push({
        column: 'quantity',
        code: 'INVALID_NUMERIC',
        message: 'quantity must be a non-negative number',
      });
    }
    if (!row.asOfDate?.trim()) {
      errors.push({ column: 'asOfDate', code: 'REQUIRED', message: 'asOfDate is required' });
    } else if (isNaN(Date.parse(row.asOfDate))) {
      errors.push({
        column: 'asOfDate',
        code: 'INVALID_DATE',
        message: 'asOfDate must be a valid ISO date',
      });
    }
    if (row.unitCost !== undefined && row.unitCost !== '') {
      if (isNaN(Number(row.unitCost)) || Number(row.unitCost) < 0) {
        errors.push({
          column: 'unitCost',
          code: 'INVALID_NUMERIC',
          message: 'unitCost must be a non-negative number',
        });
      }
    }

    return errors;
  }

  private async validateAdjustmentRow(
    row: CsvRow,
    actor: ActorContext,
  ): Promise<RowError[]> {
    const errors: RowError[] = [];

    if (!row.branchCode?.trim()) {
      errors.push({ column: 'branchCode', code: 'REQUIRED', message: 'branchCode is required' });
    }
    if (!row.locationCode?.trim()) {
      errors.push({ column: 'locationCode', code: 'REQUIRED', message: 'locationCode is required' });
    }
    if (!row.itemCode?.trim()) {
      errors.push({ column: 'itemCode', code: 'REQUIRED', message: 'itemCode is required' });
    }
    if (!row.deltaQuantity?.trim()) {
      errors.push({ column: 'deltaQuantity', code: 'REQUIRED', message: 'deltaQuantity is required' });
    } else {
      const delta = Number(row.deltaQuantity);
      if (isNaN(delta) || delta === 0) {
        errors.push({
          column: 'deltaQuantity',
          code: 'INVALID_NUMERIC',
          message: 'deltaQuantity must be a non-zero number',
        });
      }
    }
    if (!row.reasonCode?.trim()) {
      errors.push({ column: 'reasonCode', code: 'REQUIRED', message: 'reasonCode is required' });
    }

    return errors;
  }

  private async commitBatch(
    job: InventoryImportJobEntity,
    rows: InventoryImportJobRowEntity[],
    actor: ActorContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (const row of rows) {
        switch (job.type) {
          case ImportJobType.ITEMS:
            await this.commitItemRow(row, actor);
            break;
          case ImportJobType.OPENING_BALANCES:
            await this.commitOpeningBalanceRow(row, job, actor);
            break;
          case ImportJobType.ADJUSTMENTS:
            await this.commitAdjustmentRow(row, job, actor);
            break;
        }

        await manager.update(
          InventoryImportJobRowEntity,
          { id: row.id },
          { status: ImportRowStatus.COMMITTED },
        );
      }
    });
  }

  private async commitItemRow(
    row: InventoryImportJobRowEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = row.rawData as CsvRow;
    const isActive =
      data.isActive === undefined || data.isActive === ''
        ? true
        : ['true', '1'].includes(data.isActive.toLowerCase());

    try {
      await this.locationService.createItem(
        {
          code: data.itemCode,
          name: data.itemName,
          unit: data.uom,
          category: data.category || undefined,
          isActive,
        },
        actor,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        const existingItems = await this.dataSource
          .getRepository('items')
          .findOne({
            where: {
              organizationId: actor.organizationId,
              code: data.itemCode,
            },
          });
        if (existingItems) {
          await this.locationService.updateItem(
            existingItems.id,
            {
              name: data.itemName,
              unit: data.uom,
              category: data.category || undefined,
              isActive,
            },
            actor,
          );
        }
      } else {
        throw error;
      }
    }
  }

  private async commitOpeningBalanceRow(
    row: InventoryImportJobRowEntity,
    job: InventoryImportJobEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = row.rawData as CsvRow;
    const { itemId, locationId, branchId } = await this.resolveLocationCodes(
      data,
      actor,
    );

    const params: RecordMovementParams = {
      itemId,
      locationId,
      branchId,
      organizationId: actor.organizationId,
      movementType: StockMovementType.PURCHASE_RECEIPT,
      quantity: Number(data.quantity),
      referenceType: 'IMPORT_OPENING_BALANCE',
      referenceId: job.id,
      notes: `CSV import opening balance (row ${row.rowNumber})`,
      actorContext: actor,
    };

    await this.stockLedgerService.recordMovement(params);
  }

  private async commitAdjustmentRow(
    row: InventoryImportJobRowEntity,
    job: InventoryImportJobEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = row.rawData as CsvRow;
    const { itemId, locationId, branchId } = await this.resolveLocationCodes(
      data,
      actor,
    );
    const delta = Number(data.deltaQuantity);

    const params: RecordMovementParams = {
      itemId,
      locationId,
      branchId,
      organizationId: actor.organizationId,
      movementType:
        delta > 0
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE,
      quantity: delta,
      referenceType: 'IMPORT_ADJUSTMENT',
      referenceId: job.id,
      notes: `CSV import adjustment reason=${data.reasonCode} ref=${data.referenceNo ?? ''} (row ${row.rowNumber})`,
      actorContext: actor,
    };

    await this.stockLedgerService.recordMovement(params);
  }

  private async resolveLocationCodes(
    data: CsvRow,
    actor: ActorContext,
  ): Promise<{ itemId: string; locationId: string; branchId: string }> {
    const itemEntity = await this.dataSource.getRepository('items').findOne({
      where: {
        organizationId: actor.organizationId,
        code: data.itemCode,
      },
    });
    if (!itemEntity) {
      throw new BadRequestException(`Item code "${data.itemCode}" not found`);
    }

    const branchEntity = await this.dataSource.getRepository('branches').findOne({
      where: {
        organizationId: actor.organizationId,
        name: data.branchCode,
      },
    });
    if (!branchEntity) {
      throw new BadRequestException(`Branch code "${data.branchCode}" not found`);
    }

    const locationEntity = await this.dataSource
      .getRepository('locations')
      .createQueryBuilder('loc')
      .innerJoin('loc.storage', 'storage')
      .where('loc.code = :code', { code: data.locationCode })
      .andWhere('loc.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('storage.branchId = :branchId', { branchId: branchEntity.id })
      .getOne();
    if (!locationEntity) {
      throw new BadRequestException(
        `Location code "${data.locationCode}" not found in branch "${data.branchCode}"`,
      );
    }

    return {
      itemId: itemEntity.id,
      locationId: locationEntity.id,
      branchId: branchEntity.id,
    };
  }

  private emitStatusChanged(job: InventoryImportJobEntity): void {
    this.wsEmitter.emitToOrg(job.organizationId, {
      eventId: uuidv4(),
      eventType: WsEventType.INVENTORY_IMPORT_STATUS_CHANGED,
      timestamp: new Date().toISOString(),
      organizationId: job.organizationId,
      branchId: job.branchId,
      correlationId: job.id,
      payload: {
        jobId: job.id,
        type: job.type,
        status: job.status,
        totalRows: job.totalRows,
        validRows: job.validRows,
        errorRows: job.errorRows,
      },
    });
  }
}
