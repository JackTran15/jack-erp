import {
  CUSTOMER_IMPORT_EXCEL_FIELD_LABELS,
  CustomerImportExcelField,
  type CustomerImportExcelRow,
  CustomerStatus,
  ImportDuplicateMode,
  ImportJobStatus,
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
  DocumentType,
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
import { DocumentNumberingService } from "../../document-numbering/document-numbering.service";
import {
  cellToString,
  isCsvFile,
  isOleExcelBuffer,
  isZipExcelBuffer,
} from "../../inventory/csv/inventory-excel-parse.utils";
import { parseDelimitedGrid } from "../../inventory/csv/import-workbook/semicolon-grid.utils";
import {
  ImportRowStatus,
  InventoryImportJobRowEntity,
} from "../../inventory/csv/inventory-import-job-row.entity";
import {
  ImportJobType,
  InventoryImportJobEntity,
} from "../../inventory/csv/inventory-import-job.entity";
import { WebSocketEmitterService } from "../../websocket/websocket-emitter.service";
import { CustomerGroupEntity } from "../customer-group.entity";
import { CustomerEntity, Gender } from "../customer.entity";
import {
  MembershipCardEntity,
  MembershipTier,
} from "../membership-card.entity";
import { DEFAULT_NEW_CUSTOMER_MEMBERSHIP_TIER } from "../membership-card.utils";
import { EmployeeProfileEntity } from "../../rbac/employee/employee-profile.entity";
import {
  GENDER_BY_NORMALIZED,
  TIER_BY_NORMALIZED,
  normalizeVietnameseText,
} from "./customer-excel-labels";
import {
  CustomerImportWorkbookService,
  CustomerWorkbookRow,
} from "./customer-import-workbook.service";

const HEADER_KEY_ROW_INDEX = 2; // 1-based row 2
const DATA_START_ROW_INDEX = 5; // 1-based row 5

const CUSTOMER_GROUP_CODE_MAX_LENGTH = 50;

type RowMessage = { column?: string; code: string; message: string };

/** A data row plus the 1-based sheet row it came from (skipped rows excluded). */
interface ParsedRow {
  rowNumber: number;
  raw: CustomerImportExcelRow;
}

/** Resolved technical values persisted in normalizedData, applied at commit. */
interface NormalizedCustomerRow {
  code?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  birthDate?: string;
  gender?: Gender;
  nationalId?: string;
  companyName?: string;
  taxCode?: string;
  note?: string;
  groupCode?: string;
  assignedStaffId?: string;
  cardNumber?: string;
  tier?: MembershipTier;
  existingCustomerId?: string;
}

/** Per-validate lookup context, scoped to the values present in the file. */
interface ValidationContext {
  duplicateMode: ImportDuplicateMode;
  /** code (lowercase) → customer */
  customersByCode: Map<
    string,
    { id: string; status: CustomerStatus; phone?: string; email?: string }
  >;
  /** phone → customer code (lowercase) */
  customerCodeByPhone: Map<string, string>;
  /** email (lowercase) → customer code (lowercase) */
  customerCodeByEmail: Map<string, string>;
  /** card number (lowercase) → customerId */
  customerIdByCardNumber: Map<string, string>;
  /** employee code (lowercase) → userId */
  userIdByEmployeeCode: Map<string, string>;
  seenCodes: Set<string>;
  seenPhones: Set<string>;
  seenEmails: Set<string>;
  seenCardNumbers: Set<string>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse dd/MM/yyyy (also d/M/yyyy and ISO yyyy-MM-dd) → ISO date string. */
function parseImportDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let year: number, month: number, day: number;
  const vn = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (vn) {
    day = Number(vn[1]);
    month = Number(vn[2]);
    year = Number(vn[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function getField(
  row: CustomerImportExcelRow,
  key: CustomerImportExcelField,
): string {
  return (row[key] ?? "").trim();
}

function label(key: CustomerImportExcelField): string {
  return CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[key];
}

/**
 * Card number for import-created customers without a MemberCardNo.
 * generateMembershipCardNumber (Date.now-based) collides inside the tight
 * commit loop — several rows commit within the same millisecond.
 */
function issueImportCardNumber(): string {
  return `MC${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function chunked<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

@Injectable()
export class CustomerImportService {
  private readonly logger = new Logger(CustomerImportService.name);

  constructor(
    @InjectRepository(InventoryImportJobEntity)
    private readonly jobRepo: Repository<InventoryImportJobEntity>,
    @InjectRepository(InventoryImportJobRowEntity)
    private readonly rowRepo: Repository<InventoryImportJobRowEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly groupRepo: Repository<CustomerGroupEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepo: Repository<MembershipCardEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employeeProfileRepo: Repository<EmployeeProfileEntity>,
    private readonly dataSource: DataSource,
    private readonly docNumbering: DocumentNumberingService,
    private readonly workbookService: CustomerImportWorkbookService,
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
    const idempotencyKey = `${actor.organizationId}:${actor.branchId ?? ""}:CUSTOMERS:${checksum}:${duplicateMode}`;

    const existing = await this.jobRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        type: ImportJobType.CUSTOMERS,
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

    const parsedRows = await this.parseUploadFile(file);

    const job = this.jobRepo.create({
      type: ImportJobType.CUSTOMERS,
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

    let customersCreated = 0;
    let customersUpdated = 0;
    // Groups resolved/created during this commit: code (lowercase) → groupId.
    const groupIdByCode = new Map<string, string>();

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
          for (const rowEntity of batch) {
            const normalized =
              rowEntity.normalizedData as unknown as NormalizedCustomerRow;
            const created = await this.commitRow(
              em,
              normalized,
              actor,
              groupIdByCode,
            );
            if (created) customersCreated++;
            else customersUpdated++;

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
      this.logger.error("Customer import commit failed", err);
      job.status = ImportJobStatus.FAILED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
      throw err;
    }

    const { rows, rowsTruncated } = await this.loadJobRowsPreview(job.id);
    return { job, rows, rowsTruncated, customersCreated, customersUpdated };
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
        type: ImportJobType.CUSTOMERS,
      },
    });
    if (!job) throw new NotFoundException("Không tìm thấy job nhập khẩu.");
    return job;
  }

  /**
   * Hủy job chưa commit: xóa job + rows để giải phóng idempotency key
   * (cho phép upload lại cùng file).
   */
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

    const rows: CustomerWorkbookRow[] = errorRows.map((r) => ({
      ...(r.rawData as CustomerImportExcelRow),
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

    if (isCsvFile(file.originalname ?? "")) {
      return this.parseCsvText(buffer.toString("utf-8"));
    }

    let grid: string[][];
    if (isZipExcelBuffer(buffer)) {
      grid = await this.readXlsxGrid(buffer);
    } else if (isOleExcelBuffer(buffer)) {
      grid = this.readXlsGrid(buffer);
    } else {
      throw new BadRequestException(
        "Định dạng tệp không hợp lệ. Vui lòng dùng file .xlsx, .xls hoặc .csv (file mẫu nhập khẩu khách hàng).",
      );
    }

    return this.extractRows(grid, HEADER_KEY_ROW_INDEX, DATA_START_ROW_INDEX);
  }

  /**
   * CSV theo cùng layout MISA (dòng key EN, tiêu đề, nhãn VN, dữ liệu). Dòng
   * key được dò theo `CustomerCode` (không cố định dòng 2), dữ liệu bắt đầu
   * 3 dòng bên dưới; hỗ trợ delimiter `;` hoặc `,` (quote-aware, UTF-8 BOM).
   */
  private parseCsvText(text: string): ParsedRow[] {
    const findKeysRow = (grid: string[][]): number =>
      grid.findIndex((row) =>
        row.some(
          (cell) =>
            cellToString(cell).trim() ===
            CustomerImportExcelField.CUSTOMER_CODE,
        ),
      );

    let grid = parseDelimitedGrid(text, ";");
    let keysRowIndex = findKeysRow(grid);
    if (keysRowIndex < 0) {
      const commaGrid = parseDelimitedGrid(text, ",");
      const commaKeysRowIndex = findKeysRow(commaGrid);
      if (commaKeysRowIndex >= 0) {
        grid = commaGrid;
        keysRowIndex = commaKeysRowIndex;
      }
    }

    if (keysRowIndex < 0) {
      throw new BadRequestException(
        `Tệp CSV không đúng định dạng (thiếu hàng key ${CustomerImportExcelField.CUSTOMER_CODE})`,
      );
    }

    const headerKeyRow = keysRowIndex + 1;
    return this.extractRows(grid, headerKeyRow, headerKeyRow + 3);
  }

  private extractRows(
    grid: string[][],
    headerKeyRowIndex1Based: number,
    dataStartRowIndex1Based: number,
  ): ParsedRow[] {
    const keys = (grid[headerKeyRowIndex1Based - 1] ?? []).map((cell) =>
      cellToString(cell).trim(),
    );
    if (!keys.includes(CustomerImportExcelField.CUSTOMER_CODE)) {
      throw new BadRequestException(
        `Sheet dữ liệu không đúng định dạng (thiếu hàng key ${CustomerImportExcelField.CUSTOMER_CODE} ở dòng ${headerKeyRowIndex1Based})`,
      );
    }

    const rows: ParsedRow[] = [];
    for (let i = dataStartRowIndex1Based - 1; i < grid.length; i++) {
      const line = grid[i] ?? [];
      const raw: CustomerImportExcelRow = {};
      let hasValue = false;

      keys.forEach((key, colIndex) => {
        if (!key) return;
        const value = cellToString(line[colIndex]);
        if (value) hasValue = true;
        raw[key] = value;
      });

      if (!hasValue) continue;
      if (
        !raw[CustomerImportExcelField.CUSTOMER_CODE]?.trim() &&
        !raw[CustomerImportExcelField.CUSTOMER_NAME]?.trim()
      ) {
        continue;
      }
      rows.push({ rowNumber: i + 1, raw });
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        `Tệp không có dòng dữ liệu hợp lệ. Điền ít nhất một dòng từ dòng ${dataStartRowIndex1Based} (có Mã khách hàng hoặc Tên khách hàng).`,
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
        "Không đọc được tệp Excel .xlsx. Vui lòng kiểm tra lại file Excel mẫu nhập khẩu khách hàng.",
      );
    }
    const sheet =
      workbook.worksheets.find((ws) =>
        normalizeVietnameseText(ws.name).includes("khach hang"),
      ) ?? workbook.worksheets[0];
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
        "Không đọc được tệp Excel .xls. Vui lòng kiểm tra lại file Excel mẫu nhập khẩu khách hàng.",
      );
    }
    const sheetName =
      workbook.SheetNames.find((name) =>
        normalizeVietnameseText(name).includes("khach hang"),
      ) ?? workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
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

  /**
   * Lookups are scoped to the values present in the uploaded file (chunked
   * case-insensitive IN queries) — never full-org scans.
   */
  private async buildValidationContext(
    actor: ActorContext,
    duplicateMode: ImportDuplicateMode,
    parsedRows: ParsedRow[],
  ): Promise<ValidationContext> {
    const F = CustomerImportExcelField;
    const fileCodes = new Set<string>();
    const filePhones = new Set<string>();
    const fileEmails = new Set<string>();
    const fileCardNumbers = new Set<string>();
    const fileEmployeeCodes = new Set<string>();
    for (const { raw } of parsedRows) {
      const code = getField(raw, F.CUSTOMER_CODE);
      if (code) fileCodes.add(code.toLowerCase());
      const phone = getField(raw, F.TEL);
      if (phone) filePhones.add(phone);
      const email = getField(raw, F.EMAIL);
      if (email) fileEmails.add(email.toLowerCase());
      const cardNumber = getField(raw, F.MEMBER_CARD_NO);
      if (cardNumber) fileCardNumbers.add(cardNumber.toLowerCase());
      const employeeCode = getField(raw, F.EMPLOYEE_CODE);
      if (employeeCode) fileEmployeeCodes.add(employeeCode.toLowerCase());
    }

    const loadCustomers = async (
      column: "code" | "phone" | "email",
      values: string[],
      lowered: boolean,
    ): Promise<CustomerEntity[]> => {
      const out: CustomerEntity[] = [];
      for (const chunk of chunked(values, INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE)) {
        const qb = this.customerRepo
          .createQueryBuilder("c")
          .select(["c.id", "c.code", "c.phone", "c.email", "c.status"])
          .where("c.organizationId = :orgId", { orgId: actor.organizationId });
        if (lowered) {
          qb.andWhere(`LOWER(c.${column}) IN (:...vals)`, { vals: chunk });
        } else {
          qb.andWhere(`c.${column} IN (:...vals)`, { vals: chunk });
        }
        out.push(...(await qb.getMany()));
      }
      return out;
    };

    const matchedCustomers = new Map<string, CustomerEntity>();
    for (const customer of [
      ...(await loadCustomers("code", [...fileCodes], true)),
      ...(await loadCustomers("phone", [...filePhones], false)),
      ...(await loadCustomers("email", [...fileEmails], true)),
    ]) {
      matchedCustomers.set(customer.id, customer);
    }

    const customersByCode: ValidationContext["customersByCode"] = new Map();
    const customerCodeByPhone = new Map<string, string>();
    const customerCodeByEmail = new Map<string, string>();
    for (const c of matchedCustomers.values()) {
      const codeKey = c.code.trim().toLowerCase();
      customersByCode.set(codeKey, {
        id: c.id,
        status: c.status,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
      });
      if (c.phone) customerCodeByPhone.set(c.phone.trim(), codeKey);
      if (c.email) customerCodeByEmail.set(c.email.trim().toLowerCase(), codeKey);
    }

    const customerIdByCardNumber = new Map<string, string>();
    for (const chunk of chunked(
      [...fileCardNumbers],
      INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
    )) {
      const cards = await this.cardRepo
        .createQueryBuilder("m")
        .select(["m.cardNumber", "m.customerId"])
        .where("m.organizationId = :orgId", { orgId: actor.organizationId })
        .andWhere("LOWER(m.cardNumber) IN (:...vals)", { vals: chunk })
        .getMany();
      for (const card of cards) {
        customerIdByCardNumber.set(
          card.cardNumber.trim().toLowerCase(),
          card.customerId,
        );
      }
    }

    const userIdByEmployeeCode = new Map<string, string>();
    for (const chunk of chunked(
      [...fileEmployeeCodes],
      INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
    )) {
      const profiles = await this.employeeProfileRepo
        .createQueryBuilder("e")
        .select(["e.code", "e.userId"])
        .where("e.organizationId = :orgId", { orgId: actor.organizationId })
        .andWhere("LOWER(e.code) IN (:...vals)", { vals: chunk })
        .getMany();
      for (const profile of profiles) {
        userIdByEmployeeCode.set(profile.code.trim().toLowerCase(), profile.userId);
      }
    }

    return {
      duplicateMode,
      customersByCode,
      customerCodeByPhone,
      customerCodeByEmail,
      customerIdByCardNumber,
      userIdByEmployeeCode,
      seenCodes: new Set(),
      seenPhones: new Set(),
      seenEmails: new Set(),
      seenCardNumbers: new Set(),
    };
  }

  private validateAndNormalizeRow(
    raw: CustomerImportExcelRow,
    ctx: ValidationContext,
  ): {
    status: ImportRowStatus;
    errors: RowMessage[];
    warnings: RowMessage[];
    normalized: NormalizedCustomerRow;
  } {
    const errors: RowMessage[] = [];
    const warnings: RowMessage[] = [];

    const F = CustomerImportExcelField;
    const code = getField(raw, F.CUSTOMER_CODE);
    const name = getField(raw, F.CUSTOMER_NAME);
    const phone = getField(raw, F.TEL);

    const normalized: NormalizedCustomerRow = { name, phone };

    // ── CustomerName: required ──
    if (!name) {
      errors.push({
        column: F.CUSTOMER_NAME,
        code: "REQUIRED",
        message: `${label(F.CUSTOMER_NAME)} không được để trống.`,
      });
    }

    // ── Tel: required per template, unique per org and within file ──
    if (!phone) {
      errors.push({
        column: F.TEL,
        code: "REQUIRED",
        message: `${label(F.TEL)} không được để trống.`,
      });
    } else if (phone.length > 30) {
      errors.push({
        column: F.TEL,
        code: "TOO_LONG",
        message: `${label(F.TEL)} không được vượt quá 30 ký tự.`,
      });
    } else {
      if (ctx.seenPhones.has(phone)) {
        errors.push({
          column: F.TEL,
          code: "DUPLICATE_IN_FILE",
          message: `Số điện thoại "${phone}" bị trùng trong tệp nhập khẩu.`,
        });
      }
      ctx.seenPhones.add(phone);
    }

    // ── CustomerCode: dedupe key ──
    const codeKey = code.toLowerCase();
    if (code) {
      if (code.length > 50) {
        errors.push({
          column: F.CUSTOMER_CODE,
          code: "TOO_LONG",
          message: `${label(F.CUSTOMER_CODE)} không được vượt quá 50 ký tự.`,
        });
      }
      if (ctx.seenCodes.has(codeKey)) {
        errors.push({
          column: F.CUSTOMER_CODE,
          code: "DUPLICATE_IN_FILE",
          message: `Mã khách hàng "${code}" bị trùng trong tệp nhập khẩu.`,
        });
      }
      ctx.seenCodes.add(codeKey);
      normalized.code = code;

      const existing = ctx.customersByCode.get(codeKey);
      if (existing) {
        if (existing.status === CustomerStatus.MERGED) {
          // Merged customers are tombstones — edits must go to the target.
          errors.push({
            column: F.CUSTOMER_CODE,
            code: "CUSTOMER_MERGED",
            message: `Khách hàng "${code}" đã được gộp — không thể cập nhật qua nhập khẩu.`,
          });
        } else if (ctx.duplicateMode === ImportDuplicateMode.SKIP) {
          errors.push({
            column: F.CUSTOMER_CODE,
            code: "DUPLICATE_CUSTOMER",
            message: `Mã khách hàng "${code}" đã tồn tại trong hệ thống.`,
          });
        } else {
          normalized.existingCustomerId = existing.id;
        }
      }
    }

    // ── Tel vs DB: must not belong to a different customer ──
    if (phone) {
      const ownerCode = ctx.customerCodeByPhone.get(phone);
      if (ownerCode !== undefined && ownerCode !== codeKey) {
        errors.push({
          column: F.TEL,
          code: "PHONE_TAKEN",
          message: `Số điện thoại "${phone}" đã thuộc về khách hàng khác trong hệ thống.`,
        });
      }
    }

    // ── Email: optional; invalid format = warning; conflicts = error ──
    const email = getField(raw, F.EMAIL);
    if (email) {
      if (!EMAIL_PATTERN.test(email)) {
        warnings.push({
          column: F.EMAIL,
          code: "EMAIL_INVALID",
          message: `Email "${email}" không hợp lệ — bỏ qua cột này.`,
        });
      } else {
        const emailKey = email.toLowerCase();
        if (ctx.seenEmails.has(emailKey)) {
          errors.push({
            column: F.EMAIL,
            code: "DUPLICATE_IN_FILE",
            message: `Email "${email}" bị trùng trong tệp nhập khẩu.`,
          });
        }
        ctx.seenEmails.add(emailKey);

        const ownerCode = ctx.customerCodeByEmail.get(emailKey);
        if (ownerCode !== undefined && ownerCode !== codeKey) {
          errors.push({
            column: F.EMAIL,
            code: "EMAIL_TAKEN",
            message: `Email "${email}" đã thuộc về khách hàng khác trong hệ thống.`,
          });
        } else {
          normalized.email = email;
        }
      }
    }

    // ── Gender: unknown value = warning, skip field ──
    const genderRaw = getField(raw, F.GENDER);
    if (genderRaw) {
      const gender = GENDER_BY_NORMALIZED[normalizeVietnameseText(genderRaw)];
      if (gender) {
        normalized.gender = gender;
      } else {
        warnings.push({
          column: F.GENDER,
          code: "GENDER_UNRECOGNIZED",
          message: `Giới tính "${genderRaw}" không hợp lệ (Nam/Nữ/Không xác định) — bỏ qua cột này.`,
        });
      }
    }

    // ── Birthday: dd/MM/yyyy; invalid = warning, skip field ──
    const birthdayRaw = getField(raw, F.BIRTHDAY);
    if (birthdayRaw) {
      const birthDate = parseImportDate(birthdayRaw);
      if (birthDate) {
        normalized.birthDate = birthDate;
      } else {
        warnings.push({
          column: F.BIRTHDAY,
          code: "DATE_INVALID",
          message: `Ngày sinh "${birthdayRaw}" không đúng định dạng dd/MM/yyyy — bỏ qua cột này.`,
        });
      }
    }

    // ── IdentifyNumber / CompanyTaxCode: too long = warning, skip field ──
    const nationalId = getField(raw, F.IDENTIFY_NUMBER);
    if (nationalId) {
      if (nationalId.length > 12) {
        warnings.push({
          column: F.IDENTIFY_NUMBER,
          code: "TOO_LONG",
          message: `${label(F.IDENTIFY_NUMBER)} dài quá 12 ký tự — bỏ qua cột này.`,
        });
      } else {
        normalized.nationalId = nationalId;
      }
    }
    const taxCode = getField(raw, F.COMPANY_TAX_CODE);
    if (taxCode) {
      if (taxCode.length > 20) {
        warnings.push({
          column: F.COMPANY_TAX_CODE,
          code: "TOO_LONG",
          message: `${label(F.COMPANY_TAX_CODE)} dài quá 20 ký tự — bỏ qua cột này.`,
        });
      } else {
        normalized.taxCode = taxCode;
      }
    }

    // ── Plain string fields ──
    const address = getField(raw, F.ADDRESS);
    if (address) normalized.address = address.slice(0, 500);
    const companyName = getField(raw, F.COMPANY_NAME);
    if (companyName) normalized.companyName = companyName.slice(0, 255);
    const note = getField(raw, F.DESCRIPTION);
    if (note) normalized.note = note;

    // ── CustomerCategoryCode: group resolved/created at commit ──
    const groupCode = getField(raw, F.CUSTOMER_CATEGORY_CODE);
    if (groupCode) {
      if (groupCode.length > CUSTOMER_GROUP_CODE_MAX_LENGTH) {
        errors.push({
          column: F.CUSTOMER_CATEGORY_CODE,
          code: "TOO_LONG",
          message: `${label(F.CUSTOMER_CATEGORY_CODE)} không được vượt quá ${CUSTOMER_GROUP_CODE_MAX_LENGTH} ký tự.`,
        });
      } else {
        normalized.groupCode = groupCode;
      }
    }

    // ── EmployeeCode: lookup; miss = warning, skip field ──
    const employeeCode = getField(raw, F.EMPLOYEE_CODE);
    if (employeeCode) {
      const userId = ctx.userIdByEmployeeCode.get(employeeCode.toLowerCase());
      if (userId) {
        normalized.assignedStaffId = userId;
      } else {
        warnings.push({
          column: F.EMPLOYEE_CODE,
          code: "EMPLOYEE_NOT_FOUND",
          message: `Mã nhân viên "${employeeCode}" không tồn tại — bỏ qua cột này.`,
        });
      }
    }

    // ── MemberCardNo / MemberLevelCode: warnings only, row stays VALID ──
    const cardNumber = getField(raw, F.MEMBER_CARD_NO);
    const tierRaw = getField(raw, F.MEMBER_LEVEL_CODE);
    if (cardNumber) {
      const cardKey = cardNumber.toLowerCase();
      const owner = ctx.customerIdByCardNumber.get(cardKey);
      const existingId = normalized.existingCustomerId;
      if (ctx.seenCardNumbers.has(cardKey)) {
        warnings.push({
          column: F.MEMBER_CARD_NO,
          code: "CARD_DUPLICATE_IN_FILE",
          message: `Mã thẻ "${cardNumber}" bị trùng trong tệp — không thay đổi thẻ thành viên.`,
        });
      } else if (owner !== undefined && owner !== existingId) {
        warnings.push({
          column: F.MEMBER_CARD_NO,
          code: "CARD_NUMBER_TAKEN",
          message: `Mã thẻ "${cardNumber}" đã thuộc về khách hàng khác — không thay đổi thẻ thành viên.`,
        });
      } else {
        normalized.cardNumber = cardNumber;
      }
      ctx.seenCardNumbers.add(cardKey);
    }
    if (tierRaw) {
      const tier = TIER_BY_NORMALIZED[normalizeVietnameseText(tierRaw)];
      if (tier) {
        normalized.tier = tier;
      } else {
        warnings.push({
          column: F.MEMBER_LEVEL_CODE,
          code: "MEMBER_LEVEL_UNRECOGNIZED",
          message: `Hạng thẻ "${tierRaw}" không hợp lệ (Thường/Bạc/Vàng/Kim cương) — dùng hạng mặc định.`,
        });
      }
    }

    return {
      status: errors.length > 0 ? ImportRowStatus.ERROR : ImportRowStatus.VALID,
      errors,
      warnings,
      normalized,
    };
  }

  // ─── Commit helpers ───────────────────────────────────────────────────────

  /** Returns true when a new customer was created, false when updated. */
  private async commitRow(
    em: EntityManager,
    normalized: NormalizedCustomerRow,
    actor: ActorContext,
    groupIdByCode: Map<string, string>,
  ): Promise<boolean> {
    const customerRepo = em.getRepository(CustomerEntity);

    const groupId = normalized.groupCode
      ? await this.resolveOrCreateGroup(em, normalized.groupCode, actor, groupIdByCode)
      : undefined;

    const fieldUpdates: Partial<CustomerEntity> = {};
    if (normalized.phone) fieldUpdates.phone = normalized.phone;
    if (normalized.email) fieldUpdates.email = normalized.email;
    if (normalized.address) fieldUpdates.address = normalized.address;
    if (normalized.birthDate) {
      // Keep the ISO string: a Date object here is serialized with LOCAL
      // date components by TypeORM and shifts one day on non-UTC servers.
      fieldUpdates.birthDate = normalized.birthDate as unknown as Date;
    }
    if (normalized.gender) fieldUpdates.gender = normalized.gender;
    if (normalized.nationalId) fieldUpdates.nationalId = normalized.nationalId;
    if (normalized.companyName) fieldUpdates.companyName = normalized.companyName;
    if (normalized.taxCode) fieldUpdates.taxCode = normalized.taxCode;
    if (normalized.note) fieldUpdates.note = normalized.note;
    if (normalized.assignedStaffId) {
      fieldUpdates.assignedStaffId = normalized.assignedStaffId;
    }
    if (groupId) fieldUpdates.groupId = groupId;

    if (normalized.existingCustomerId) {
      // UPDATE mode: overwrite only fields the file provides (empty cells keep DB values).
      await customerRepo.update(normalized.existingCustomerId, {
        name: normalized.name,
        ...fieldUpdates,
      });
      await this.upsertMembershipCard(
        em,
        normalized.existingCustomerId,
        normalized,
        actor,
        false,
      );
      return false;
    }

    const code =
      normalized.code?.trim() ||
      (await this.docNumbering.generate(
        DocumentType.CUSTOMER,
        actor.branchId,
        actor,
      ));

    const customer = await customerRepo.save(
      customerRepo.create({
        code,
        name: normalized.name,
        ...fieldUpdates,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      }),
    );
    await this.upsertMembershipCard(em, customer.id, normalized, actor, true);
    return true;
  }

  private async resolveOrCreateGroup(
    em: EntityManager,
    groupCode: string,
    actor: ActorContext,
    groupIdByCode: Map<string, string>,
  ): Promise<string> {
    const codeKey = groupCode.toLowerCase();
    const cached = groupIdByCode.get(codeKey);
    if (cached) return cached;

    const groupRepo = em.getRepository(CustomerGroupEntity);
    let group = await groupRepo
      .createQueryBuilder("g")
      .where("g.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere("LOWER(g.code) = :code", { code: codeKey })
      .getOne();

    if (!group) {
      // A group may pre-date the code column (looked up by name) — adopt it.
      group = await groupRepo
        .createQueryBuilder("g")
        .where("g.organizationId = :orgId", { orgId: actor.organizationId })
        .andWhere("LOWER(g.name) = :name", { name: codeKey })
        .getOne();
      if (group && !group.code) {
        group.code = groupCode;
        group = await groupRepo.save(group);
      }
    }

    if (!group) {
      group = await groupRepo.save(
        groupRepo.create({
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          code: groupCode,
          name: groupCode,
          createdBy: actor.userId,
        }),
      );
    }

    groupIdByCode.set(codeKey, group.id);
    return group.id;
  }

  private async upsertMembershipCard(
    em: EntityManager,
    customerId: string,
    normalized: NormalizedCustomerRow,
    actor: ActorContext,
    isNewCustomer: boolean,
  ): Promise<void> {
    // Existing customer with no card data in the file → leave the card alone.
    if (!isNewCustomer && !normalized.cardNumber && !normalized.tier) return;

    const cardRepo = em.getRepository(MembershipCardEntity);
    const card = isNewCustomer
      ? null
      : await cardRepo.findOne({
          where: { customerId, organizationId: actor.organizationId },
        });

    if (card) {
      if (normalized.cardNumber) card.cardNumber = normalized.cardNumber;
      if (normalized.tier) card.tier = normalized.tier;
      await cardRepo.save(card);
      return;
    }

    // Mirror CustomerService.create: every new customer gets a card.
    await cardRepo.save(
      cardRepo.create({
        organizationId: actor.organizationId,
        customerId,
        cardNumber: normalized.cardNumber ?? issueImportCardNumber(),
        tier: normalized.tier ?? DEFAULT_NEW_CUSTOMER_MEMBERSHIP_TIER,
        points: 0,
        issuedAt: new Date(new Date().toISOString().slice(0, 10)),
        isActive: true,
        createdBy: actor.userId,
      }),
    );
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
      eventType: WsEventType.CUSTOMER_IMPORT_STATUS_CHANGED,
      timestamp: new Date().toISOString(),
      organizationId: job.organizationId,
      branchId: job.branchId,
      correlationId: job.id,
      payload: { jobId: job.id, type: job.type, status: job.status },
    });
  }
}
