import {
  INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  ImportDuplicateMode,
  ImportJobStatus,
  LocationType,
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
import { DataSource, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { WebSocketEmitterService } from "../../websocket/websocket-emitter.service";
import { LocationEntity } from "../location/location.entity";
import { StorageEntity } from "../location/storage.entity";
import {
  isCsvFile,
  isOleExcelBuffer,
  isZipExcelBuffer,
} from "./inventory-excel-parse.utils";
import {
  ImportRowStatus,
  InventoryImportJobRowEntity,
} from "./inventory-import-job-row.entity";
import {
  ImportJobType,
  InventoryImportJobEntity,
} from "./inventory-import-job.entity";
import {
  LocationImportRow,
  LocationImportWorkbookService,
} from "./location-import-workbook.service";

const LOCATION_TYPE_VI_MAP: Record<string, LocationType> = {
  kệ: LocationType.SHELF,
  ke: LocationType.SHELF,
  giá: LocationType.RACK,
  gia: LocationType.RACK,
  thùng: LocationType.BIN,
  thung: LocationType.BIN,
  "khu vực": LocationType.ZONE,
  "khu vuc": LocationType.ZONE,
  shelf: LocationType.SHELF,
  rack: LocationType.RACK,
  bin: LocationType.BIN,
  zone: LocationType.ZONE,
};

function parseLocationType(label: string | undefined): LocationType {
  if (!label) return LocationType.SHELF;
  const key = label.trim().toLowerCase();
  return LOCATION_TYPE_VI_MAP[key] ?? LocationType.SHELF;
}

interface ParsedRow {
  rowNumber: number;
  code: string;
  name: string;
  storageName: string;
  typeLabel: string;
}

@Injectable()
export class LocationImportService {
  private readonly logger = new Logger(LocationImportService.name);

  constructor(
    @InjectRepository(InventoryImportJobEntity)
    private readonly jobRepo: Repository<InventoryImportJobEntity>,
    @InjectRepository(InventoryImportJobRowEntity)
    private readonly rowRepo: Repository<InventoryImportJobRowEntity>,
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly dataSource: DataSource,
    private readonly workbookService: LocationImportWorkbookService,
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
    const parsedRows = this.parseFile(file);

    const job = this.jobRepo.create({
      type: ImportJobType.LOCATIONS,
      fileName: file.originalname,
      fileChecksum: checksum,
      idempotencyKey: `${actor.organizationId}:LOCATIONS:${checksum}:${duplicateMode}`,
      status: ImportJobStatus.VALIDATING,
      totalRows: parsedRows.length,
      duplicateMode,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });
    const savedJob = await this.jobRepo.save(job);
    this.emitStatusChanged(savedJob);

    let existingKeys: Set<string> | undefined;
    if (duplicateMode === ImportDuplicateMode.SKIP) {
      existingKeys = await this.loadExistingLocationKeys(actor);
    }

    let validRows = 0;
    let errorRows = 0;
    const previewRows: InventoryImportJobRowEntity[] = [];

    for (
      let i = 0;
      i < parsedRows.length;
      i += INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE
    ) {
      const batch = parsedRows.slice(
        i,
        i + INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
      );
      const rowEntities: InventoryImportJobRowEntity[] = [];

      for (const parsed of batch) {
        const { status, errors } = await this.validateRow(
          parsed,
          actor,
          duplicateMode,
          existingKeys,
        );
        const rowEntity = this.rowRepo.create({
          jobId: savedJob.id,
          rowNumber: parsed.rowNumber,
          rawData: {
            LocationCode: parsed.code,
            LocationName: parsed.name,
            StorageName: parsed.storageName,
            LocationType: parsed.typeLabel,
          },
          status,
          errorMessages: errors.length > 0 ? errors : undefined,
        });
        if (status === ImportRowStatus.VALID) validRows++;
        else errorRows++;
        rowEntities.push(rowEntity);
      }

      const savedBatch = await this.rowRepo.save(rowEntities);
      if (previewRows.length < 200) previewRows.push(...savedBatch);
    }

    savedJob.status =
      validRows > 0 ? ImportJobStatus.VALIDATED : ImportJobStatus.FAILED;
    savedJob.validRows = validRows;
    savedJob.errorRows = errorRows;
    await this.jobRepo.save(savedJob);
    this.emitStatusChanged(savedJob);

    return {
      job: savedJob,
      rows: previewRows.slice(0, 200),
      rowsTruncated: parsedRows.length > 200,
    };
  }

  // ─── Commit ───────────────────────────────────────────────────────────────

  async commit(jobId: string, actor: ActorContext) {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) throw new NotFoundException("Không tìm thấy job nhập khẩu.");
    if (job.status !== ImportJobStatus.VALIDATED) {
      throw new BadRequestException("Job chưa được xác thực hoặc đã xử lý.");
    }
    if (job.validRows === 0) {
      throw new BadRequestException("Không có dòng hợp lệ để nhập khẩu.");
    }

    job.status = ImportJobStatus.COMMITTING;
    await this.jobRepo.save(job);
    this.emitStatusChanged(job);

    let locationsCommitted = 0;

    try {
      const validRowEntities = await this.rowRepo.find({
        where: { jobId: job.id, status: ImportRowStatus.VALID },
        order: { rowNumber: "ASC" },
      });

      for (
        let i = 0;
        i < validRowEntities.length;
        i += INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE
      ) {
        const batch = validRowEntities.slice(
          i,
          i + INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
        );

        await this.dataSource.transaction(async (em) => {
          const storageRepo = em.getRepository(StorageEntity);
          const locationRepo = em.getRepository(LocationEntity);
          const rowRepo = em.getRepository(InventoryImportJobRowEntity);

          for (const rowEntity of batch) {
            const raw = rowEntity.rawData as Record<string, string>;
            const code = (raw["LocationCode"] ?? "").trim();
            const name = (raw["LocationName"] ?? "").trim();
            const storageName = (raw["StorageName"] ?? "").trim();
            const type = parseLocationType(raw["LocationType"]);

            const storage = await storageRepo
              .createQueryBuilder("s")
              .where("s.organizationId = :orgId", {
                orgId: actor.organizationId,
              })
              .andWhere(
                actor.branchId ? "s.branchId = :branchId" : "1=1",
                actor.branchId ? { branchId: actor.branchId } : {},
              )
              .andWhere("unaccent(LOWER(s.name)) = unaccent(LOWER(:sName))", {
                sName: storageName,
              })
              .getOne();

            if (!storage) continue;

            const existing = await locationRepo.findOne({
              where: {
                organizationId: actor.organizationId,
                storageId: storage.id,
                code,
              },
            });

            if (existing) {
              await locationRepo.update(existing.id, { name, type });
            } else {
              await locationRepo.save(
                locationRepo.create({
                  code,
                  name,
                  storageId: storage.id,
                  branchId: storage.branchId,
                  type,
                  isActive: true,
                  organizationId: actor.organizationId,
                  createdBy: actor.userId,
                }),
              );
            }

            await rowRepo.update(rowEntity.id, {
              status: ImportRowStatus.COMMITTED,
            });
            locationsCommitted++;
          }
        });
      }

      job.status = ImportJobStatus.COMMITTED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
    } catch (err) {
      this.logger.error("Location import commit failed", err);
      job.status = ImportJobStatus.FAILED;
      await this.jobRepo.save(job);
      this.emitStatusChanged(job);
      throw err;
    }

    return { job, locationsCommitted };
  }

  // ─── Error rows export ────────────────────────────────────────────────────

  async exportErrorRowsBuffer(
    jobId: string,
    actor: ActorContext,
  ): Promise<Buffer> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, organizationId: actor.organizationId },
    });
    if (!job) throw new NotFoundException("Không tìm thấy job nhập khẩu.");

    const errorRows = await this.rowRepo.find({
      where: { jobId: job.id, status: ImportRowStatus.ERROR },
      order: { rowNumber: "ASC" },
    });

    const rows: LocationImportRow[] = errorRows.map((r) => {
      const raw = r.rawData as Record<string, string>;
      return {
        code: raw["LocationCode"] ?? "",
        name: raw["LocationName"] ?? "",
        storageName: raw["StorageName"] ?? "",
        typeLabel: raw["LocationType"] ?? "",
        statusMessage: (r.errorMessages ?? []).map((e) => e.message).join("; "),
      };
    });

    return this.workbookService.buildWorkbookBuffer(rows, true);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private parseFile(file: Express.Multer.File): ParsedRow[] {
    const name = file.originalname ?? "";
    if (isCsvFile(name)) return this.parseCsv(file.buffer);
    // Both xlsx and xls handled by XLSX library
    if (isZipExcelBuffer(file.buffer) || isOleExcelBuffer(file.buffer)) {
      return this.parseExcel(file.buffer);
    }
    throw new BadRequestException(
      "Định dạng tệp không hợp lệ. Vui lòng dùng .xlsx, .xls hoặc .csv.",
    );
  }

  private parseCsv(buffer: Buffer): ParsedRow[] {
    const text = buffer.toString("utf-8");
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.split(";").map((c) => c.trim()));
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    return lines
      .slice(2)
      .filter((cols) => cols.some((c) => c !== ""))
      .map((cols, idx) => ({
        rowNumber: idx + 3,
        code: cols[0] ?? "",
        name: cols[1] ?? "",
        storageName: cols[2] ?? "",
        typeLabel: cols[3] ?? "",
      }));
  }

  private parseExcel(buffer: Buffer): ParsedRow[] {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(
      sheet,
      { header: 1 },
    );
    const rows: ParsedRow[] = [];
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    for (let i = 2; i < grid.length; i++) {
      const cols = grid[i] ?? [];
      const code = String(cols[0] ?? "").trim();
      if (!code && !cols[1] && !cols[2]) continue;
      rows.push({
        rowNumber: i + 1,
        code,
        name: String(cols[1] ?? "").trim(),
        storageName: String(cols[2] ?? "").trim(),
        typeLabel: String(cols[3] ?? "").trim(),
      });
    }
    return rows;
  }

  private async validateRow(
    parsed: ParsedRow,
    actor: ActorContext,
    duplicateMode: ImportDuplicateMode,
    existingKeys?: Set<string>,
  ): Promise<{
    status: ImportRowStatus;
    errors: Array<{ column?: string; code: string; message: string }>;
  }> {
    const errors: Array<{ column?: string; code: string; message: string }> =
      [];

    if (!parsed.code) {
      errors.push({
        column: "LocationCode",
        code: "REQUIRED",
        message: "Mã vị trí không được để trống.",
      });
    }
    if (!parsed.name) {
      errors.push({
        column: "LocationName",
        code: "REQUIRED",
        message: "Tên vị trí không được để trống.",
      });
    }
    if (!parsed.storageName) {
      errors.push({
        column: "StorageName",
        code: "REQUIRED",
        message: "Thuộc kho không được để trống.",
      });
      return { status: ImportRowStatus.ERROR, errors };
    }

    const storage = await this.storageRepo
      .createQueryBuilder("s")
      .where("s.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere(
        actor.branchId ? "s.branchId = :branchId" : "1=1",
        actor.branchId ? { branchId: actor.branchId } : {},
      )
      .andWhere("unaccent(LOWER(s.name)) = unaccent(LOWER(:sName))", {
        sName: parsed.storageName.trim(),
      })
      .getOne();

    if (!storage) {
      errors.push({
        column: "StorageName",
        code: "STORAGE_NOT_FOUND",
        message: `Kho "${parsed.storageName}" chưa tồn tại trong hệ thống.`,
      });
      return { status: ImportRowStatus.ERROR, errors };
    }

    if (errors.length > 0) {
      return { status: ImportRowStatus.ERROR, errors };
    }

    if (
      duplicateMode === ImportDuplicateMode.SKIP &&
      existingKeys?.has(`${storage.id}:${parsed.code}`)
    ) {
      errors.push({
        column: "LocationCode",
        code: "DUPLICATE_LOCATION",
        message: `Mã vị trí "${parsed.code}" đã tồn tại trong kho "${parsed.storageName}".`,
      });
      return { status: ImportRowStatus.ERROR, errors };
    }

    return { status: ImportRowStatus.VALID, errors: [] };
  }

  private async loadExistingLocationKeys(
    actor: ActorContext,
  ): Promise<Set<string>> {
    const locations = await this.locationRepo
      .createQueryBuilder("l")
      .select(["l.storageId", "l.code"])
      .where("l.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere(
        actor.branchId ? "l.branchId = :branchId" : "1=1",
        actor.branchId ? { branchId: actor.branchId } : {},
      )
      .getMany();
    return new Set(locations.map((l) => `${l.storageId}:${l.code}`));
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
