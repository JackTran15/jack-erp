import {
  ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS,
  ItemCategoryImportExcelField,
  type ItemCategoryImportExcelRow,
  ImportDuplicateMode,
  ImportJobStatus,
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
  PaginatedResponse,
  PaginationQuery,
  WsEventType,
  parseImportDuplicateMode,
} from "@erp/shared-interfaces";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import * as ExcelJS from "exceljs";
import { DataSource, EntityManager, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { WebSocketEmitterService } from "../../websocket/websocket-emitter.service";
import {
  ItemCategoryEntity,
  ItemCategoryStatus,
} from "../location/item-category.entity";
import {
  cellToString,
  isCsvFile,
  isOleExcelBuffer,
  isZipExcelBuffer,
} from "./inventory-excel-parse.utils";
import { parseDelimitedGrid } from "./import-workbook/semicolon-grid.utils";
import {
  ImportRowStatus,
  InventoryImportJobRowEntity,
} from "./inventory-import-job-row.entity";
import {
  ImportJobType,
  InventoryImportJobEntity,
} from "./inventory-import-job.entity";
import {
  CategoryImportWorkbookService,
  CategoryWorkbookRow,
} from "./category-import-workbook.service";

const CATEGORY_CODE_MAX_LENGTH = 50;
/** Data starts two rows below the EN-keys row (one label row in between). */
const DATA_ROW_OFFSET = 2;

type RowMessage = { column?: string; code: string; message: string };

interface ParsedRow {
  rowNumber: number;
  raw: ItemCategoryImportExcelRow;
}

/** Resolved values persisted in normalizedData, applied at commit. */
interface NormalizedCategoryRow {
  code: string;
  name: string;
  /** Parent category code — resolved in-file or from DB; absent = root. */
  parentCode?: string;
  existingCategoryId?: string;
}

interface ExistingCategory {
  id: string;
  code?: string | null;
  name: string;
}

interface ValidationContext {
  duplicateMode: ImportDuplicateMode;
  /** code (lowercase) → category */
  categoriesByCode: Map<string, ExistingCategory>;
  /** name (lowercase) → category */
  categoriesByName: Map<string, ExistingCategory>;
  /** codes (lowercase) present in the uploaded file */
  fileCodes: Set<string>;
  seenCodes: Set<string>;
  seenNames: Set<string>;
}

function getField(
  row: ItemCategoryImportExcelRow,
  key: ItemCategoryImportExcelField,
): string {
  return (row[key] ?? "").trim();
}

function label(key: ItemCategoryImportExcelField): string {
  return ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS[key];
}

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

@Injectable()
export class CategoryImportService {
  private readonly logger = new Logger(CategoryImportService.name);

  constructor(
    @InjectRepository(InventoryImportJobEntity)
    private readonly jobRepo: Repository<InventoryImportJobEntity>,
    @InjectRepository(InventoryImportJobRowEntity)
    private readonly rowRepo: Repository<InventoryImportJobRowEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    private readonly dataSource: DataSource,
    private readonly workbookService: CategoryImportWorkbookService,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  // ─── Validate ─────────────────────────────────────────────────────────────

  async validate(
    file: Express.Multer.File,
    actor: ActorContext,
    duplicateModeInput?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("Vui lòng chọn tệp nhập khẩu.");
    }

    const duplicateMode = parseImportDuplicateMode(duplicateModeInput);
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const idempotencyKey = `${actor.organizationId}:${actor.branchId ?? ""}:CATEGORIES:${checksum}:${duplicateMode}`;

    const existing = await this.jobRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        type: ImportJobType.CATEGORIES,
        idempotencyKey,
      },
    });
    if (existing) {
      if (
        existing.status === ImportJobStatus.COMMITTED ||
        existing.status === ImportJobStatus.FAILED
      ) {
        await this.removeImportJob(existing.id);
      } else {
        const { rows, rowsTruncated } = await this.loadJobRowsPreview(
          existing.id,
        );
        return { job: existing, rows, rowsTruncated };
      }
    }

    const parsedRows = await this.parseUploadFile(file);

    const job = this.jobRepo.create({
      type: ImportJobType.CATEGORIES,
      fileName: file.originalname,
      fileChecksum: checksum,
      idempotencyKey,
      duplicateMode,
      status: ImportJobStatus.VALIDATING,
      totalRows: parsedRows.length,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    const savedJob = await this.jobRepo.save(job);
    this.emitStatusChanged(savedJob);

    const context = await this.buildValidationContext(
      actor,
      duplicateMode,
      parsedRows,
    );

    let validRows = 0;
    let errorRows = 0;

    const rowEntities = parsedRows.map(({ rowNumber, raw }) => {
      const { status, errors, warnings, normalized } =
        this.validateAndNormalizeRow(raw, context);
      if (status === ImportRowStatus.VALID) validRows++;
      else errorRows++;

      return this.rowRepo.create({
        jobId: savedJob.id,
        rowNumber,
        rawData: raw,
        normalizedData: normalized as unknown as Record<string, unknown>,
        status,
        errorMessages: errors.length > 0 ? errors : undefined,
        warningMessages: warnings.length > 0 ? warnings : undefined,
      });
    });

    for (const batch of chunked(rowEntities, INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE)) {
      await this.rowRepo.save(batch);
    }

    savedJob.status =
      validRows > 0 ? ImportJobStatus.VALIDATED : ImportJobStatus.FAILED;
    savedJob.validRows = validRows;
    savedJob.errorRows = errorRows;
    await this.jobRepo.save(savedJob);
    this.emitStatusChanged(savedJob);

    const { rows, rowsTruncated } = await this.loadJobRowsPreview(savedJob.id);
    return { job: savedJob, rows, rowsTruncated };
  }

  // ─── Commit ───────────────────────────────────────────────────────────────

  async commit(jobId: string, actor: ActorContext) {
    const job = await this.getJob(jobId, actor);
    if (job.status !== ImportJobStatus.VALIDATED) {
      throw new BadRequestException("Job chưa được xác thực hoặc đã xử lý.");
    }
    if (job.validRows === 0) {
      throw new BadRequestException("Không có dòng hợp lệ để nhập khẩu.");
    }

    job.status = ImportJobStatus.COMMITTING;
    await this.jobRepo.save(job);
    this.emitStatusChanged(job);

    let categoriesCreated = 0;
    let categoriesUpdated = 0;
    // code (lowercase) → categoryId, accumulated across batches so parents
    // created in an earlier batch resolve in later ones.
    const idByCode = new Map<string, string>();

    try {
      const validRowEntities = await this.rowRepo.find({
        where: { jobId: job.id, status: ImportRowStatus.VALID },
        order: { rowNumber: "ASC" },
      });

      for (const batch of chunked(
        validRowEntities,
        INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
      )) {
        await this.dataSource.transaction(async (em) => {
          const rows = batch.map((rowEntity) => ({
            rowEntity,
            normalized:
              rowEntity.normalizedData as unknown as NormalizedCategoryRow,
          }));

          // Pass 1: upsert categories so every code in the batch has an id.
          for (const { normalized } of rows) {
            const created = await this.upsertCategory(
              em,
              normalized,
              actor,
              idByCode,
            );
            if (created) categoriesCreated++;
            else categoriesUpdated++;
          }

          // Pass 2: link parents (parents may sit anywhere in the file).
          for (const { rowEntity, normalized } of rows) {
            await this.linkParent(em, normalized, actor, idByCode);
            await em
              .getRepository(InventoryImportJobRowEntity)
              .update(rowEntity.id, { status: ImportRowStatus.COMMITTED });
          }
        });
      }

      job.status = ImportJobStatus.COMMITTED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
    } catch (err) {
      this.logger.error("Category import commit failed", err);
      job.status = ImportJobStatus.FAILED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
      throw err;
    }

    const { rows, rowsTruncated } = await this.loadJobRowsPreview(job.id);
    return { job, rows, rowsTruncated, categoriesCreated, categoriesUpdated };
  }

  // ─── Job queries / cancel / error rows ────────────────────────────────────

  async getJob(
    jobId: string,
    actor: ActorContext,
  ): Promise<InventoryImportJobEntity> {
    const job = await this.jobRepo.findOne({
      where: {
        id: jobId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        type: ImportJobType.CATEGORIES,
      },
    });
    if (!job) throw new NotFoundException("Không tìm thấy job nhập khẩu.");
    return job;
  }

  async cancelJob(jobId: string, actor: ActorContext): Promise<void> {
    const job = await this.getJob(jobId, actor);
    if (
      job.status === ImportJobStatus.COMMITTING ||
      job.status === ImportJobStatus.COMMITTED
    ) {
      throw new BadRequestException(
        "Không thể hủy phiên nhập khẩu đang được ghi vào hệ thống.",
      );
    }
    await this.removeImportJob(job.id);
  }

  async listJobRows(
    jobId: string,
    query: PaginationQuery & { status?: ImportRowStatus },
    actor: ActorContext,
  ): Promise<PaginatedResponse<InventoryImportJobRowEntity>> {
    await this.getJob(jobId, actor);

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

  async exportErrorRowsBuffer(
    jobId: string,
    actor: ActorContext,
  ): Promise<Buffer> {
    const job = await this.getJob(jobId, actor);

    const errorRows = await this.rowRepo.find({
      where: { jobId: job.id, status: ImportRowStatus.ERROR },
      order: { rowNumber: "ASC" },
    });

    const rows: CategoryWorkbookRow[] = errorRows.map((r) => ({
      ...(r.rawData as ItemCategoryImportExcelRow),
      statusMessage: (r.errorMessages ?? []).map((e) => e.message).join("; "),
    }));

    return this.workbookService.buildWorkbookBuffer(rows, {
      includeStatusColumn: true,
    });
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  private async parseUploadFile(
    file: Express.Multer.File,
  ): Promise<ParsedRow[]> {
    const buffer = file.buffer;
    if (!buffer?.length) {
      throw new BadRequestException("Tệp nhập khẩu rỗng hoặc không hợp lệ");
    }

    let grid: string[][];
    if (isCsvFile(file.originalname ?? "")) {
      grid = this.parseCsvGrid(buffer.toString("utf-8"));
    } else if (isZipExcelBuffer(buffer)) {
      grid = await this.readXlsxGrid(buffer);
    } else if (isOleExcelBuffer(buffer)) {
      grid = this.readXlsGrid(buffer);
    } else {
      throw new BadRequestException(
        "Định dạng tệp không hợp lệ. Vui lòng dùng file .xlsx, .xls hoặc .csv (file mẫu nhập khẩu nhóm hàng hóa).",
      );
    }

    return this.extractRows(grid);
  }

  private parseCsvGrid(text: string): string[][] {
    const hasKeysRow = (grid: string[][]): boolean =>
      grid.some((row) =>
        row.some(
          (cell) =>
            cellToString(cell).trim() ===
            ItemCategoryImportExcelField.ITEM_CATEGORY_CODE,
        ),
      );

    const semicolon = parseDelimitedGrid(text, ";");
    if (hasKeysRow(semicolon)) return semicolon;
    const comma = parseDelimitedGrid(text, ",");
    if (hasKeysRow(comma)) return comma;
    return semicolon;
  }

  /**
   * Keys row is located dynamically by `ItemCategoryCode`; data starts TWO
   * rows below it (row 6 keys / row 7 labels / row 8 data in the template).
   */
  private extractRows(grid: string[][]): ParsedRow[] {
    const keysRowIndex = grid.findIndex((row) =>
      row.some(
        (cell) =>
          cellToString(cell).trim() ===
          ItemCategoryImportExcelField.ITEM_CATEGORY_CODE,
      ),
    );
    if (keysRowIndex < 0) {
      throw new BadRequestException(
        `Tệp không đúng định dạng (thiếu hàng key ${ItemCategoryImportExcelField.ITEM_CATEGORY_CODE})`,
      );
    }

    const keys = (grid[keysRowIndex] ?? []).map((cell) =>
      cellToString(cell).trim(),
    );

    const rows: ParsedRow[] = [];
    for (let i = keysRowIndex + DATA_ROW_OFFSET; i < grid.length; i++) {
      const line = grid[i] ?? [];
      const raw: ItemCategoryImportExcelRow = {};
      let hasValue = false;

      keys.forEach((key, colIndex) => {
        if (!key) return;
        const value = cellToString(line[colIndex]);
        if (value) hasValue = true;
        raw[key] = value;
      });

      if (!hasValue) continue;
      if (
        !raw[ItemCategoryImportExcelField.ITEM_CATEGORY_CODE]?.trim() &&
        !raw[ItemCategoryImportExcelField.ITEM_CATEGORY_NAME]?.trim()
      ) {
        continue;
      }
      rows.push({ rowNumber: i + 1, raw });
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        `Tệp không có dòng dữ liệu hợp lệ. Điền ít nhất một dòng từ dòng ${keysRowIndex + DATA_ROW_OFFSET + 1} (có Mã nhóm hoặc Tên nhóm hàng hóa).`,
      );
    }
    return rows;
  }

  private async readXlsxGrid(buffer: Buffer): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw new BadRequestException(
        "Không đọc được tệp Excel .xlsx. Vui lòng kiểm tra lại file mẫu nhập khẩu nhóm hàng hóa.",
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
    }

    const grid: string[][] = [];
    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const line: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        line[colNumber - 1] = cellToString(cell.value);
      });
      grid[rowIndex - 1] = line;
    }
    return grid;
  }

  private readXlsGrid(buffer: Buffer): string[][] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    } catch {
      throw new BadRequestException(
        "Không đọc được tệp Excel .xls. Vui lòng kiểm tra lại file mẫu nhập khẩu nhóm hàng hóa.",
      );
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
    }
    return XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  private async buildValidationContext(
    actor: ActorContext,
    duplicateMode: ImportDuplicateMode,
    parsedRows: ParsedRow[],
  ): Promise<ValidationContext> {
    const F = ItemCategoryImportExcelField;
    const fileCodes = new Set<string>();
    const fileNames = new Set<string>();
    const fileParentCodes = new Set<string>();
    for (const { raw } of parsedRows) {
      const code = getField(raw, F.ITEM_CATEGORY_CODE);
      if (code) fileCodes.add(code.toLowerCase());
      const name = getField(raw, F.ITEM_CATEGORY_NAME);
      if (name) fileNames.add(name.toLowerCase());
      const parent = getField(raw, F.PARENT_NAME);
      if (parent) fileParentCodes.add(parent.toLowerCase());
    }

    const loadCategories = async (
      column: "code" | "name",
      values: string[],
    ): Promise<ItemCategoryEntity[]> => {
      const out: ItemCategoryEntity[] = [];
      for (const chunk of chunked(values, INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE)) {
        out.push(
          ...(await this.categoryRepo
            .createQueryBuilder("c")
            .select(["c.id", "c.code", "c.name"])
            .where("c.organizationId = :orgId", { orgId: actor.organizationId })
            .andWhere(`LOWER(c.${column}) IN (:...vals)`, { vals: chunk })
            .getMany()),
        );
      }
      return out;
    };

    // Parents referenced by code must resolve against the DB too.
    const codeLookups = [...new Set([...fileCodes, ...fileParentCodes])];
    const matched = new Map<string, ItemCategoryEntity>();
    for (const category of [
      ...(await loadCategories("code", codeLookups)),
      ...(await loadCategories("name", [...fileNames])),
    ]) {
      matched.set(category.id, category);
    }

    const categoriesByCode = new Map<string, ExistingCategory>();
    const categoriesByName = new Map<string, ExistingCategory>();
    for (const c of matched.values()) {
      const entry: ExistingCategory = { id: c.id, code: c.code, name: c.name };
      if (c.code) categoriesByCode.set(c.code.trim().toLowerCase(), entry);
      categoriesByName.set(c.name.trim().toLowerCase(), entry);
    }

    return {
      duplicateMode,
      categoriesByCode,
      categoriesByName,
      fileCodes,
      seenCodes: new Set(),
      seenNames: new Set(),
    };
  }

  private validateAndNormalizeRow(
    raw: ItemCategoryImportExcelRow,
    ctx: ValidationContext,
  ): {
    status: ImportRowStatus;
    errors: RowMessage[];
    warnings: RowMessage[];
    normalized: NormalizedCategoryRow;
  } {
    const errors: RowMessage[] = [];
    const warnings: RowMessage[] = [];

    const F = ItemCategoryImportExcelField;
    const code = getField(raw, F.ITEM_CATEGORY_CODE);
    const name = getField(raw, F.ITEM_CATEGORY_NAME);
    const parentCode = getField(raw, F.PARENT_NAME);

    const normalized: NormalizedCategoryRow = { code, name };
    const codeKey = code.toLowerCase();

    // ── Code: required per template, ≤50, unique in file ──
    if (!code) {
      errors.push({
        column: F.ITEM_CATEGORY_CODE,
        code: "REQUIRED",
        message: `${label(F.ITEM_CATEGORY_CODE)} không được để trống.`,
      });
    } else {
      if (code.length > CATEGORY_CODE_MAX_LENGTH) {
        errors.push({
          column: F.ITEM_CATEGORY_CODE,
          code: "TOO_LONG",
          message: `${label(F.ITEM_CATEGORY_CODE)} không được vượt quá ${CATEGORY_CODE_MAX_LENGTH} ký tự.`,
        });
      }
      if (ctx.seenCodes.has(codeKey)) {
        errors.push({
          column: F.ITEM_CATEGORY_CODE,
          code: "DUPLICATE_IN_FILE",
          message: `Mã nhóm "${code}" bị trùng trong tệp nhập khẩu.`,
        });
      }
      ctx.seenCodes.add(codeKey);
    }

    // ── Name: required, unique per org, unique in file ──
    const nameKey = name.toLowerCase();
    if (!name) {
      errors.push({
        column: F.ITEM_CATEGORY_NAME,
        code: "REQUIRED",
        message: `${label(F.ITEM_CATEGORY_NAME)} không được để trống.`,
      });
    } else {
      if (ctx.seenNames.has(nameKey)) {
        errors.push({
          column: F.ITEM_CATEGORY_NAME,
          code: "DUPLICATE_IN_FILE",
          message: `Tên nhóm "${name}" bị trùng trong tệp nhập khẩu.`,
        });
      }
      ctx.seenNames.add(nameKey);
    }

    // ── Duplicate detection by code (UPDATE/SKIP) ──
    const existingByCode = code ? ctx.categoriesByCode.get(codeKey) : undefined;
    if (existingByCode) {
      if (ctx.duplicateMode === ImportDuplicateMode.SKIP) {
        errors.push({
          column: F.ITEM_CATEGORY_CODE,
          code: "DUPLICATE_CATEGORY",
          message: `Mã nhóm "${code}" đã tồn tại trong hệ thống.`,
        });
      } else {
        normalized.existingCategoryId = existingByCode.id;
      }
    }

    // ── Name owned by a DIFFERENT category (name is unique per org) ──
    if (name) {
      const nameOwner = ctx.categoriesByName.get(nameKey);
      if (nameOwner && nameOwner.id !== existingByCode?.id) {
        if (existingByCode || !nameOwner.code) {
          // Updating another row's name onto this one would break the unique
          // index — reject. (A code-less name match is adopted at commit via
          // the same semantics as resolveOrCreateCategoryByCode instead.)
          if (existingByCode) {
            errors.push({
              column: F.ITEM_CATEGORY_NAME,
              code: "NAME_TAKEN",
              message: `Tên nhóm "${name}" đã thuộc nhóm khác trong hệ thống.`,
            });
          } else {
            // New code + existing code-less name → adopt that category.
            normalized.existingCategoryId = nameOwner.id;
          }
        } else {
          errors.push({
            column: F.ITEM_CATEGORY_NAME,
            code: "NAME_TAKEN",
            message: `Tên nhóm "${name}" đã thuộc nhóm "${nameOwner.code}" trong hệ thống.`,
          });
        }
      }
    }

    // ── Parent: resolve in-file first, then DB; miss → WARNING + root ──
    if (parentCode) {
      const parentKey = parentCode.toLowerCase();
      if (parentKey === codeKey) {
        warnings.push({
          column: F.PARENT_NAME,
          code: "PARENT_SELF",
          message: `Nhóm cha trùng chính nhóm "${code}" — đặt làm nhóm gốc.`,
        });
      } else if (
        ctx.fileCodes.has(parentKey) ||
        ctx.categoriesByCode.has(parentKey)
      ) {
        normalized.parentCode = parentCode;
      } else {
        warnings.push({
          column: F.PARENT_NAME,
          code: "PARENT_NOT_FOUND",
          message: `Không tìm thấy nhóm cha mã "${parentCode}" — đặt làm nhóm gốc.`,
        });
      }
    }

    // TaxRate: no entity field yet — kept in rawData only (see gaps doc).

    return {
      status: errors.length > 0 ? ImportRowStatus.ERROR : ImportRowStatus.VALID,
      errors,
      warnings,
      normalized,
    };
  }

  // ─── Commit helpers ───────────────────────────────────────────────────────

  /** Returns true when a new category was created, false when updated. */
  private async upsertCategory(
    em: EntityManager,
    normalized: NormalizedCategoryRow,
    actor: ActorContext,
    idByCode: Map<string, string>,
  ): Promise<boolean> {
    const repo = em.getRepository(ItemCategoryEntity);
    const codeKey = normalized.code.toLowerCase();

    if (normalized.existingCategoryId) {
      await repo.update(normalized.existingCategoryId, {
        code: normalized.code,
        name: normalized.name,
      });
      idByCode.set(codeKey, normalized.existingCategoryId);
      return false;
    }

    const created = await repo.save(
      repo.create({
        code: normalized.code,
        name: normalized.name,
        status: ItemCategoryStatus.ACTIVE,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }),
    );
    idByCode.set(codeKey, created.id);
    return true;
  }

  private async linkParent(
    em: EntityManager,
    normalized: NormalizedCategoryRow,
    actor: ActorContext,
    idByCode: Map<string, string>,
  ): Promise<void> {
    if (!normalized.parentCode) return;
    const repo = em.getRepository(ItemCategoryEntity);
    const codeKey = normalized.code.toLowerCase();
    const parentKey = normalized.parentCode.toLowerCase();

    let parentId = idByCode.get(parentKey);
    if (!parentId) {
      const parent = await repo
        .createQueryBuilder("c")
        .select(["c.id"])
        .where("c.organizationId = :orgId", { orgId: actor.organizationId })
        .andWhere("LOWER(c.code) = :code", { code: parentKey })
        .getOne();
      if (!parent) return; // validated as warning already — leave as root
      parentId = parent.id;
      idByCode.set(parentKey, parent.id);
    }

    const selfId = idByCode.get(codeKey);
    if (!selfId || parentId === selfId) return;

    // Walk the (already updated) ancestor chain: linking must not create a
    // cycle through categories whose parents this import did not touch.
    let ancestorId: string | null | undefined = parentId;
    for (let depth = 0; ancestorId && depth < 50; depth++) {
      if (ancestorId === selfId) {
        this.logger.warn(
          `Bỏ liên kết nhóm cha "${normalized.parentCode}" cho "${normalized.code}" — tạo vòng lặp cây nhóm.`,
        );
        return;
      }
      const ancestor: ItemCategoryEntity | null = await repo.findOne({
        where: { id: ancestorId, organizationId: actor.organizationId },
        select: { id: true, parentGroupId: true },
      });
      ancestorId = ancestor?.parentGroupId ?? null;
    }

    await repo.update(selfId, { parentGroupId: parentId });
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  private async loadJobRowsPreview(jobId: string): Promise<{
    rows: InventoryImportJobRowEntity[];
    rowsTruncated: boolean;
  }> {
    const [rows, total] = await this.rowRepo.findAndCount({
      where: { jobId },
      order: { status: "ASC", rowNumber: "ASC" },
      take: INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
    });
    return { rows, rowsTruncated: total > INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT };
  }

  private async removeImportJob(jobId: string): Promise<void> {
    await this.rowRepo.delete({ jobId });
    await this.jobRepo.delete({ id: jobId });
  }

  private emitStatusChanged(job: InventoryImportJobEntity): void {
    this.wsEmitter.emitToOrg(job.organizationId, {
      eventId: uuidv4(),
      eventType: WsEventType.INVENTORY_IMPORT_STATUS_CHANGED,
      timestamp: new Date().toISOString(),
      organizationId: job.organizationId,
      branchId: job.branchId,
      correlationId: job.id,
      payload: { jobId: job.id, type: job.type, status: job.status },
    });
  }
}
