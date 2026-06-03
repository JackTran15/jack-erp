import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, In, Not } from "typeorm";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  ImportDuplicateMode,
  ImportJobStatus,
  InventoryImportExcelField,
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
  INVENTORY_IMPORT_VALIDATE_BATCH_SIZE,
  parseImportDuplicateMode,
  StockMovementType,
  PaginatedResponse,
  PaginationQuery,
  WsEventType,
  type InventoryImportExcelRow,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { WebSocketEmitterService } from "../../websocket/websocket-emitter.service";
import { InventoryLocationService } from "../location/inventory-location.service";
import { ItemEntity } from "../location/item.entity";
import { ItemProviderEntity } from "../location/item-provider.entity";
import {
  StockLedgerService,
  RecordMovementParams,
} from "../ledger/stock-ledger.service";
import {
  InventoryImportJobEntity,
  ImportJobType,
} from "./inventory-import-job.entity";
import {
  InventoryImportJobRowEntity,
  ImportRowStatus,
} from "./inventory-import-job-row.entity";
import { ExcelParserService } from "./excel-parser.service";
import { ExcelImportItemService } from "./excel-import-item.service";
import { InventoryImportWorkbookService } from "./import-workbook/inventory-import-workbook.service";
import { parseInventoryItemsFromDelimitedText } from "./inventory-import-delimited.parser";
import {
  getExcelField,
  isCsvFile,
  isExcelFile,
  parseGroupedDecimal,
} from "./inventory-excel-parse.utils";

interface CsvRow {
  [key: string]: string;
}

export interface ImportValidateResult {
  job: InventoryImportJobEntity;
  rows: InventoryImportJobRowEntity[];
  /** True when `rows` is a preview subset; full data remains in DB under `job.id`. */
  rowsTruncated?: boolean;
}

interface RowError {
  column?: string;
  code: string;
  message: string;
}

const IMPORT_ERROR_STATUS_COLUMN_KEY = "ImportValidationStatus";
const IMPORT_ERROR_STATUS_COLUMN_LABEL = "Tình trạng";

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    @InjectRepository(InventoryImportJobEntity)
    private readonly jobRepo: Repository<InventoryImportJobEntity>,
    @InjectRepository(InventoryImportJobRowEntity)
    private readonly rowRepo: Repository<InventoryImportJobRowEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemProviderEntity)
    private readonly itemProviderRepo: Repository<ItemProviderEntity>,
    private readonly dataSource: DataSource,
    private readonly locationService: InventoryLocationService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly excelParser: ExcelParserService,
    private readonly excelImportItemService: ExcelImportItemService,
    private readonly workbookService: InventoryImportWorkbookService,
  ) {}

  async validate(
    type: ImportJobType,
    file: Express.Multer.File | undefined,
    actor: ActorContext,
    duplicateModeInput?: string,
  ): Promise<ImportValidateResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        "Không nhận được tệp tải lên hoặc tệp rỗng. Vui lòng chọn lại file Excel.",
      );
    }

    const duplicateMode = parseImportDuplicateMode(duplicateModeInput);
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const idempotencyKey = `${actor.organizationId}:${type}:${checksum}:${duplicateMode}`;

    const existing = await this.jobRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        type,
        idempotencyKey,
      },
    });
    if (existing) {
      if (
        existing.status === ImportJobStatus.COMMITTED ||
        existing.status === ImportJobStatus.FAILED
      ) {
        // Allow re-import: discard the old job so the same file can be validated fresh.
        await this.removeImportJob(existing.id);
      } else {
        // VALIDATING / VALIDATED — return the in-progress job as-is.
        const { rows, rowsTruncated } = await this.loadJobRowsPreview(
          existing.id,
        );
        return { job: existing, rows, rowsTruncated };
      }
    }

    const parsed = await this.parseUploadFile(type, file);
    if (parsed.length === 0) {
      throw new BadRequestException("Tệp không có dòng dữ liệu hợp lệ");
    }

    const job = this.jobRepo.create({
      type,
      fileName: file.originalname,
      fileChecksum: checksum,
      idempotencyKey,
      duplicateMode,
      status: ImportJobStatus.VALIDATING,
      totalRows: parsed.length,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    const savedJob = await this.jobRepo.save(job);

    const existingSkuCodes =
      type === ImportJobType.ITEMS && duplicateMode === ImportDuplicateMode.SKIP
        ? await this.loadExistingSkuCodes(
            parsed as InventoryImportExcelRow[],
            actor.organizationId,
          )
        : undefined;

    let validCount = 0;
    let errorCount = 0;

    for (
      let offset = 0;
      offset < parsed.length;
      offset += INVENTORY_IMPORT_VALIDATE_BATCH_SIZE
    ) {
      const chunk = parsed.slice(
        offset,
        offset + INVENTORY_IMPORT_VALIDATE_BATCH_SIZE,
      );
      const entities: InventoryImportJobRowEntity[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const rawData = chunk[i];
        const rowNumber = offset + i + 1;
        const errors = await this.validateRow(
          type,
          rawData,
          actor,
          duplicateMode,
          false,
          existingSkuCodes,
        );
        const status =
          errors.length === 0 ? ImportRowStatus.VALID : ImportRowStatus.ERROR;

        if (status === ImportRowStatus.VALID) validCount++;
        else errorCount++;

        entities.push(
          this.rowRepo.create({
            jobId: savedJob.id,
            rowNumber,
            rawData,
            status,
            errorMessages: errors.length > 0 ? errors : undefined,
          }),
        );
      }

      await this.saveJobRowsInBatches(entities);
    }

    savedJob.validRows = validCount;
    savedJob.errorRows = errorCount;
    savedJob.status =
      validCount > 0 ? ImportJobStatus.VALIDATED : ImportJobStatus.FAILED;
    await this.jobRepo.save(savedJob);

    this.emitStatusChanged(savedJob);
    const { rows, rowsTruncated } = await this.loadJobRowsPreview(savedJob.id);
    return { job: savedJob, rows, rowsTruncated };
  }

  async commit(
    jobId: string,
    actor: ActorContext,
    batchSize = INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  ): Promise<
    ImportValidateResult & { productsCreated: number; itemsCommitted: number }
  > {
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
    if ((job.validRows ?? 0) === 0) {
      throw new BadRequestException("Không có dòng hợp lệ để nhập khẩu");
    }

    job.status = ImportJobStatus.COMMITTING;
    await this.jobRepo.save(job);
    this.emitStatusChanged(job);

    let productsCreated = 0;
    let itemsCommitted = 0;

    try {
      const validRows = await this.rowRepo.find({
        where: { jobId: job.id, status: ImportRowStatus.VALID },
        order: { rowNumber: "ASC" },
      });

      if (job.type === ImportJobType.ITEMS) {
        this.excelImportItemService.resetCaches();
        const productNamesCreated = new Set<string>();
        const stats = { productsCreated: 0, itemsCommitted: 0 };

        for (let i = 0; i < validRows.length; i += batchSize) {
          const batch = validRows.slice(i, i + batchSize);
          await this.commitExcelItemBatch(
            job,
            batch,
            actor,
            stats,
            productNamesCreated,
          );
        }

        productsCreated = productNamesCreated.size;
        itemsCommitted = stats.itemsCommitted;
      } else {
        for (let i = 0; i < validRows.length; i += batchSize) {
          const batch = validRows.slice(i, i + batchSize);
          await this.commitBatch(job, batch, actor);
        }
        itemsCommitted = validRows.length;
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

    const { rows, rowsTruncated } = await this.loadJobRowsPreview(job.id);
    return { job, rows, rowsTruncated, productsCreated, itemsCommitted };
  }

  async getJob(
    jobId: string,
    actor: ActorContext,
  ): Promise<InventoryImportJobEntity> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }
    return job;
  }

  /**
   * Hủy job chưa commit: xóa job + rows để giải phóng idempotency key (upload lại cùng file).
   */
  async cancelJob(jobId: string, actor: ActorContext): Promise<void> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    if (
      job.status === ImportJobStatus.COMMITTING ||
      job.status === ImportJobStatus.COMMITTED
    ) {
      throw new BadRequestException(
        "Không thể hủy phiên nhập khẩu đang được ghi vào hệ thống.",
      );
    }

    await this.removeImportJob(jobId);
  }

  async listJobRows(
    jobId: string,
    query: PaginationQuery & { status?: ImportRowStatus },
    actor: ActorContext,
  ): Promise<PaginatedResponse<InventoryImportJobRowEntity>> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    const where: { jobId: string; status?: ImportRowStatus } = { jobId };
    if (query.status) where.status = query.status;

    const [data, total] = await this.rowRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: { rowNumber: "ASC" },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async exportJobErrorRowsExcelBuffer(
    jobId: string,
    actor: ActorContext,
  ): Promise<Buffer> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    const errorRows = await this.rowRepo.find({
      where: { jobId, status: ImportRowStatus.ERROR },
      order: { rowNumber: "ASC" },
    });

    const dataRows = errorRows.map((row) => ({
      ...(row.rawData as InventoryImportExcelRow),
      [IMPORT_ERROR_STATUS_COLUMN_KEY]: this.formatImportRowErrors(
        row.errorMessages,
      ),
    }));

    return this.workbookService.buildItemsWorkbookBuffer(dataRows, {
      extraColumn: {
        key: IMPORT_ERROR_STATUS_COLUMN_KEY,
        label: IMPORT_ERROR_STATUS_COLUMN_LABEL,
      },
    });
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
        ? { [query.sortBy]: query.sortOrder ?? "desc" }
        : { createdAt: "DESC" },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async parseUploadFile(
    type: ImportJobType,
    file: { originalname: string; buffer: Buffer },
  ): Promise<Array<InventoryImportExcelRow | CsvRow>> {
    if (isExcelFile(file.originalname)) {
      // Canonical Excel grid is shared for all ITEMS import.
      return this.excelParser.parseInventoryItemsWorkbook(file.buffer);
    }

    if (isCsvFile(file.originalname)) {
      const csvText = file.buffer.toString("utf-8");
      if (type === ImportJobType.ITEMS) {
        return parseInventoryItemsFromDelimitedText(csvText);
      }
      // Opening balances / adjustments keep legacy CSV parsers.
      return this.parseCsv(csvText);
    }

    throw new BadRequestException(
      "Định dạng tệp không hỗ trợ. Vui lòng dùng .xlsx, .xls hoặc .csv",
    );
  }

  private isExcelJob(job: InventoryImportJobEntity): boolean {
    return isExcelFile(job.fileName);
  }

  private formatImportRowErrors(errors?: Array<{ message: string }>): string {
    if (!errors?.length) return "";
    return errors.map((e) => e.message).join("; ");
  }

  private async removeImportJob(jobId: string): Promise<void> {
    await this.rowRepo.delete({ jobId });
    await this.jobRepo.delete(jobId);
  }

  private async saveJobRowsInBatches(
    rows: InventoryImportJobRowEntity[],
  ): Promise<void> {
    for (
      let i = 0;
      i < rows.length;
      i += INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE
    ) {
      const batch = rows.slice(i, i + INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE);
      await this.rowRepo.save(batch);
    }
  }

  private async loadJobRowsPreview(
    jobId: string,
    limit = INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  ): Promise<{
    rows: InventoryImportJobRowEntity[];
    rowsTruncated: boolean;
  }> {
    const total = await this.rowRepo.count({ where: { jobId } });
    if (total <= limit) {
      const rows = await this.rowRepo.find({
        where: { jobId },
        order: { rowNumber: "ASC" },
      });
      return { rows, rowsTruncated: false };
    }

    const errorRows = await this.rowRepo.find({
      where: { jobId, status: ImportRowStatus.ERROR },
      order: { rowNumber: "ASC" },
      take: limit,
    });

    if (errorRows.length >= limit) {
      return { rows: errorRows, rowsTruncated: true };
    }

    const validRows = await this.rowRepo.find({
      where: { jobId, status: Not(ImportRowStatus.ERROR) },
      order: { rowNumber: "ASC" },
      take: limit - errorRows.length,
    });

    return {
      rows: [...errorRows, ...validRows],
      rowsTruncated: true,
    };
  }

  private async loadExistingSkuCodes(
    parsed: InventoryImportExcelRow[],
    organizationId: string,
  ): Promise<Set<string>> {
    const codes = new Set<string>();
    for (const row of parsed) {
      const sku = getExcelField(
        row,
        InventoryImportExcelField.SKU_CODE,
      )?.trim();
      if (sku) codes.add(sku);
    }

    const existing = new Set<string>();
    const codeList = [...codes];
    for (
      let i = 0;
      i < codeList.length;
      i += INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE
    ) {
      const batch = codeList.slice(
        i,
        i + INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
      );
      const items = await this.itemRepo.find({
        where: { organizationId, code: In(batch) },
        select: ["code"],
      });
      for (const item of items) {
        existing.add(item.code);
      }
    }
    return existing;
  }

  private async commitExcelItemBatch(
    job: InventoryImportJobEntity,
    rows: InventoryImportJobRowEntity[],
    actor: ActorContext,
    stats: { productsCreated: number; itemsCommitted: number },
    productNamesCreated: Set<string>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (const row of rows) {
        await this.excelImportItemService.commitRow(
          row.rawData as InventoryImportExcelRow,
          job.duplicateMode ?? ImportDuplicateMode.UPDATE,
          actor,
          stats,
          productNamesCreated,
        );

        await manager.update(
          InventoryImportJobRowEntity,
          { id: row.id },
          { status: ImportRowStatus.COMMITTED },
        );
      }
    });
  }

  private parseCsv(text: string): CsvRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: CsvRow = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? "";
      }
      rows.push(row);
    }

    return rows;
  }

  private async validateRow(
    type: ImportJobType,
    row: CsvRow | InventoryImportExcelRow,
    actor: ActorContext,
    duplicateMode: ImportDuplicateMode,
    isExcel: boolean,
    existingSkuCodes?: Set<string>,
  ): Promise<RowError[]> {
    switch (type) {
      case ImportJobType.ITEMS:
        return this.validateExcelItemRow(
          row as InventoryImportExcelRow,
          actor,
          duplicateMode,
          existingSkuCodes,
        );
      case ImportJobType.OPENING_BALANCES:
        return this.validateOpeningBalanceRow(row as CsvRow, actor);
      case ImportJobType.ADJUSTMENTS:
        return this.validateAdjustmentRow(row as CsvRow, actor);
      default:
        return [];
    }
  }

  private async validateExcelItemRow(
    row: InventoryImportExcelRow,
    actor: ActorContext,
    duplicateMode: ImportDuplicateMode,
    existingSkuCodes?: Set<string>,
  ): Promise<RowError[]> {
    const errors: RowError[] = [];
    const sku = getExcelField(row, InventoryImportExcelField.SKU_CODE);
    const name = getExcelField(
      row,
      InventoryImportExcelField.INVENTORY_ITEM_NAME,
    );

    if (!sku) {
      errors.push({
        column: InventoryImportExcelField.SKU_CODE,
        code: "REQUIRED",
        message: "Mã SKU không được để trống",
      });
    }
    if (!name) {
      errors.push({
        column: InventoryImportExcelField.INVENTORY_ITEM_NAME,
        code: "REQUIRED",
        message: "Tên hàng hóa không được để trống",
      });
    }

    const cost = getExcelField(row, InventoryImportExcelField.COST_PRICE);
    if (cost && parseGroupedDecimal(cost) === undefined) {
      errors.push({
        column: InventoryImportExcelField.COST_PRICE,
        code: "INVALID_NUMERIC",
        message: "Giá mua không hợp lệ",
      });
    }
    const price = getExcelField(row, InventoryImportExcelField.UNIT_PRICE);
    if (price && parseGroupedDecimal(price) === undefined) {
      errors.push({
        column: InventoryImportExcelField.UNIT_PRICE,
        code: "INVALID_NUMERIC",
        message: "Giá bán không hợp lệ",
      });
    }

    if (
      sku &&
      duplicateMode === ImportDuplicateMode.SKIP &&
      existingSkuCodes?.has(sku)
    ) {
      errors.push({
        column: InventoryImportExcelField.SKU_CODE,
        code: "DUPLICATE_SKU",
        message: `Mã SKU "${sku}" đã tồn tại trong hệ thống.`,
      });
    }

    return errors;
  }

  private validateLegacyCsvItemRow(row: CsvRow): RowError[] {
    const errors: RowError[] = [];

    if (!row.itemCode?.trim()) {
      errors.push({
        column: "itemCode",
        code: "REQUIRED",
        message: "itemCode is required",
      });
    }
    if (!row.itemName?.trim()) {
      errors.push({
        column: "itemName",
        code: "REQUIRED",
        message: "itemName is required",
      });
    }
    if (!row.uom?.trim()) {
      errors.push({
        column: "uom",
        code: "REQUIRED",
        message: "uom is required",
      });
    }
    if (!row.providerCode?.trim()) {
      errors.push({
        column: "providerCode",
        code: "REQUIRED",
        message: "providerCode is required",
      });
    }
    if (row.isActive !== undefined && row.isActive !== "") {
      const lower = row.isActive.toLowerCase();
      if (!["true", "false", "1", "0"].includes(lower)) {
        errors.push({
          column: "isActive",
          code: "INVALID_BOOLEAN",
          message: "isActive must be true/false or 1/0",
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
      errors.push({
        column: "branchCode",
        code: "REQUIRED",
        message: "branchCode is required",
      });
    }
    if (!row.locationCode?.trim()) {
      errors.push({
        column: "locationCode",
        code: "REQUIRED",
        message: "locationCode is required",
      });
    }
    if (!row.itemCode?.trim()) {
      errors.push({
        column: "itemCode",
        code: "REQUIRED",
        message: "itemCode is required",
      });
    }
    if (!row.quantity?.trim()) {
      errors.push({
        column: "quantity",
        code: "REQUIRED",
        message: "quantity is required",
      });
    } else if (isNaN(Number(row.quantity)) || Number(row.quantity) < 0) {
      errors.push({
        column: "quantity",
        code: "INVALID_NUMERIC",
        message: "quantity must be a non-negative number",
      });
    }
    if (!row.asOfDate?.trim()) {
      errors.push({
        column: "asOfDate",
        code: "REQUIRED",
        message: "asOfDate is required",
      });
    } else if (isNaN(Date.parse(row.asOfDate))) {
      errors.push({
        column: "asOfDate",
        code: "INVALID_DATE",
        message: "asOfDate must be a valid ISO date",
      });
    }
    if (row.unitCost !== undefined && row.unitCost !== "") {
      if (isNaN(Number(row.unitCost)) || Number(row.unitCost) < 0) {
        errors.push({
          column: "unitCost",
          code: "INVALID_NUMERIC",
          message: "unitCost must be a non-negative number",
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
      errors.push({
        column: "branchCode",
        code: "REQUIRED",
        message: "branchCode is required",
      });
    }
    if (!row.locationCode?.trim()) {
      errors.push({
        column: "locationCode",
        code: "REQUIRED",
        message: "locationCode is required",
      });
    }
    if (!row.itemCode?.trim()) {
      errors.push({
        column: "itemCode",
        code: "REQUIRED",
        message: "itemCode is required",
      });
    }
    if (!row.deltaQuantity?.trim()) {
      errors.push({
        column: "deltaQuantity",
        code: "REQUIRED",
        message: "deltaQuantity is required",
      });
    } else {
      const delta = Number(row.deltaQuantity);
      if (isNaN(delta) || delta === 0) {
        errors.push({
          column: "deltaQuantity",
          code: "INVALID_NUMERIC",
          message: "deltaQuantity must be a non-zero number",
        });
      }
    }
    if (!row.reasonCode?.trim()) {
      errors.push({
        column: "reasonCode",
        code: "REQUIRED",
        message: "reasonCode is required",
      });
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
      data.isActive === undefined || data.isActive === ""
        ? true
        : ["true", "1"].includes(data.isActive.toLowerCase());

    const provider = await this.locationService.resolveProviderByCode(
      data.providerCode,
      actor,
    );
    const categoryId = data.category
      ? (
          await this.locationService.resolveOrCreateCategoryByName(
            data.category,
            actor,
          )
        ).id
      : undefined;

    let itemId: string;
    try {
      const created = await this.locationService.createItem(
        {
          code: data.itemCode,
          name: data.itemName,
          unit: data.uom,
          categoryId,
          isActive,
        },
        actor,
      );
      itemId = created.id;
    } catch (error) {
      if (error instanceof ConflictException) {
        const existing = await this.itemRepo.findOne({
          where: {
            organizationId: actor.organizationId,
            code: data.itemCode,
          },
        });
        if (!existing) throw error;
        await this.locationService.updateItem(
          existing.id,
          {
            name: data.itemName,
            unit: data.uom,
            categoryId,
            isActive,
          },
          actor,
        );
        itemId = existing.id;
      } else {
        throw error;
      }
    }

    // Link provider as primary if not already linked; if no primary exists, this one becomes primary.
    const existingLink = await this.itemProviderRepo.findOne({
      where: { itemId, providerId: provider.id },
    });
    if (!existingLink) {
      const hasPrimary = await this.itemProviderRepo.count({
        where: { itemId, isPrimary: true },
      });
      await this.itemProviderRepo.save(
        this.itemProviderRepo.create({
          itemId,
          providerId: provider.id,
          isPrimary: hasPrimary === 0,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
        }),
      );
    }
  }

  private async commitOpeningBalanceRow(
    row: InventoryImportJobRowEntity,
    job: InventoryImportJobEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = row.rawData as CsvRow;
    const { itemId, locationId, branchId, purchasePrice } =
      await this.resolveLocationCodes(data, actor);

    // Opening balance CSV does not carry a unit price column; fall back to
    // items.purchase_price (same policy as the Task 1 backfill).
    const params: RecordMovementParams = {
      itemId,
      locationId,
      branchId,
      organizationId: actor.organizationId,
      movementType: StockMovementType.PURCHASE_RECEIPT,
      quantity: Number(data.quantity),
      referenceType: "IMPORT_OPENING_BALANCE",
      referenceId: job.id,
      notes: `CSV import opening balance (row ${row.rowNumber})`,
      actorContext: actor,
      unitCost: purchasePrice,
    };

    await this.stockLedgerService.recordMovement(params);
  }

  private async commitAdjustmentRow(
    row: InventoryImportJobRowEntity,
    job: InventoryImportJobEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = row.rawData as CsvRow;
    const { itemId, locationId, branchId, purchasePrice } =
      await this.resolveLocationCodes(data, actor);
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
      referenceType: "IMPORT_ADJUSTMENT",
      referenceId: job.id,
      notes: `CSV import adjustment reason=${data.reasonCode} ref=${data.referenceNo ?? ""} (row ${row.rowNumber})`,
      actorContext: actor,
      unitCost: purchasePrice,
    };

    await this.stockLedgerService.recordMovement(params);
  }

  private async resolveLocationCodes(
    data: CsvRow,
    actor: ActorContext,
  ): Promise<{
    itemId: string;
    locationId: string;
    branchId: string;
    purchasePrice: number;
  }> {
    const itemEntity = (await this.dataSource.getRepository("items").findOne({
      where: {
        organizationId: actor.organizationId,
        code: data.itemCode,
      },
    })) as { id: string; purchasePrice?: string | number } | null;
    if (!itemEntity) {
      throw new BadRequestException(`Item code "${data.itemCode}" not found`);
    }

    const branchEntity = await this.dataSource
      .getRepository("branches")
      .findOne({
        where: {
          organizationId: actor.organizationId,
          name: data.branchCode,
        },
      });
    if (!branchEntity) {
      throw new BadRequestException(
        `Branch code "${data.branchCode}" not found`,
      );
    }

    const locationEntity = await this.dataSource
      .getRepository("locations")
      .createQueryBuilder("loc")
      .innerJoin("loc.storage", "storage")
      .where("loc.code = :code", { code: data.locationCode })
      .andWhere("loc.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("storage.branchId = :branchId", { branchId: branchEntity.id })
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
      purchasePrice: Number(itemEntity.purchasePrice ?? 0),
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
