import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
  NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequireBranchScope, RequirePermission } from "../../auth/decorators";
import { PermissionGuard } from "../../rbac/permission.guard";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { AuditInterceptor } from "../../crud/audit.interceptor";
import { PaginationQueryDto } from "../../crud/dto";
import {
  IsOptional,
  IsString,
  IsEnum,
  IsIn,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ImportJobStatus, ImportRowStatus } from "@erp/shared-interfaces";
import { ApiQuery } from "@nestjs/swagger";
import { CsvImportService } from "./csv-import.service";
import { LocationImportService } from "./location-import.service";
import { ImportJobType } from "./inventory-import-job.entity";
import { ExcelImportGoodsReceiptService } from "./excel-import-goods-receipt.service";

class ImportJobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportJobType)
  type?: ImportJobType;

  @IsOptional()
  @IsEnum(ImportJobStatus)
  status?: ImportJobStatus;
}

class ImportJobRowsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportRowStatus)
  status?: ImportRowStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  override pageSize: number = 20;
}

@Controller("inventory/imports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CsvImportController {
  constructor(
    private readonly csvImportService: CsvImportService,
    private readonly locationImportService: LocationImportService,
    private readonly goodsReceiptImporter: ExcelImportGoodsReceiptService,
  ) {}

  // ─── Items ─────────────────────────────────────────────────────────

  @Post("items/validate")
  @RequirePermission("inventory.write")
  @UseInterceptors(FileInterceptor("file"))
  validateItems(
    @UploadedFile() file: Express.Multer.File,
    @Query("duplicateMode") duplicateMode: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.ITEMS,
      file,
      actor,
      duplicateMode,
    );
  }

  @Post("items/commit")
  @RequirePermission("inventory.write")
  commitItems(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Opening Balances ──────────────────────────────────────────────

  @Post("opening-balances/validate")
  @RequirePermission("inventory.write")
  @UseInterceptors(FileInterceptor("file"))
  validateOpeningBalances(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.OPENING_BALANCES,
      file,
      actor,
    );
  }

  @Post("opening-balances/commit")
  @RequirePermission("inventory.write")
  commitOpeningBalances(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Adjustments ──────────────────────────────────────────────────

  @Post("adjustments/validate")
  @RequirePermission("inventory.write")
  @UseInterceptors(FileInterceptor("file"))
  validateAdjustments(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.ADJUSTMENTS,
      file,
      actor,
    );
  }

  @Post("adjustments/commit")
  @RequirePermission("inventory.write")
  commitAdjustments(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Stock Takes ──────────────────────────────────────────────────

  @Post("stock-takes/validate")
  @RequirePermission("inventory.adjustment.create")
  @RequireBranchScope()
  @UseInterceptors(FileInterceptor("file"))
  @ApiQuery({ name: "stockTakeId", required: false, type: String })
  @ApiQuery({ name: "storageId", required: false, type: String })
  @ApiQuery({ name: "countByValue", required: false, type: Boolean })
  validateStockTake(
    @UploadedFile() file: Express.Multer.File,
    @Query("stockTakeId", new ParseUUIDPipe({ optional: true }))
    stockTakeId: string | undefined,
    @Query("storageId", new ParseUUIDPipe({ optional: true }))
    storageId: string | undefined,
    @Query("countByValue") countByValue: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.STOCK_TAKE,
      file,
      actor,
      undefined,
      stockTakeId,
      storageId
        ? { storageId, countByValue: countByValue === "true" }
        : undefined,
    );
  }

  @Post("stock-takes/commit")
  @RequirePermission("inventory.adjustment.create")
  @RequireBranchScope()
  commitStockTake(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Locations ────────────────────────────────────────────────────

  @Post("goods-receipts/validate")
  @RequirePermission("goods_receipt.write")
  @RequireBranchScope()
  @UseInterceptors(FileInterceptor("file"))
  validateGoodsReceipt(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.GOODS_RECEIPT,
      file,
      actor,
    );
  }

  @Get("goods-receipts/import-template.xlsx")
  @RequirePermission("goods_receipt.read")
  @RequireBranchScope()
  async downloadGoodsReceiptTemplate(@Res() res: Response) {
    this.sendTemplate(res, "NhapkhauHangHoaNhapKho.xls");
  }

  @Get("goods-receipts/import-template.xls")
  @RequirePermission("goods_receipt.read")
  @RequireBranchScope()
  downloadGoodsReceiptMisaTemplate(@Res() res: Response) {
    this.sendTemplate(res, "NhapkhauHangHoaNhapKho.xls");
  }

  @Get("goods-receipts/generated-import-template.xlsx")
  @RequirePermission("goods_receipt.read")
  @RequireBranchScope()
  async downloadGeneratedGoodsReceiptTemplate(@Res() res: Response) {
    const buffer = await this.goodsReceiptImporter.buildTemplateBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="DanhSachHangHoaNhapKho.xlsx"',
    );
    res.send(buffer);
  }

  @Get("goods-receipts/jobs/:id/rows")
  @RequirePermission("goods_receipt.read")
  @RequireBranchScope()
  listGoodsReceiptJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobRows(id, query, actor);
  }

  @Delete("goods-receipts/jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("goods_receipt.write")
  @RequireBranchScope()
  cancelGoodsReceiptJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.cancelJob(id, actor);
  }

  @Get("goods-receipts/jobs/:id/error-rows.xlsx")
  @RequirePermission("goods_receipt.read")
  @RequireBranchScope()
  async exportGoodsReceiptJobErrorRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvImportService.exportJobErrorRowsExcelBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="dong-nhap-kho-loi.xlsx"',
    );
    res.send(buffer);
  }

  @Post("locations/validate")
  @RequirePermission("inventory.write")
  @UseInterceptors(FileInterceptor("file"))
  validateLocations(
    @UploadedFile() file: Express.Multer.File,
    @Query("duplicateMode") duplicateMode: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.locationImportService.validate(file, actor, duplicateMode);
  }

  @Post("locations/commit")
  @RequirePermission("inventory.write")
  commitLocations(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.locationImportService.commit(jobId, actor);
  }

  @Get("locations/jobs/:id/error-rows.xlsx")
  @RequirePermission("inventory.read")
  async exportLocationErrorRowsExcel(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.locationImportService.exportErrorRowsBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="vi-tri-loi-nhap-khau.xlsx"',
    );
    res.send(buffer);
  }

  // ─── Job queries ──────────────────────────────────────────────────

  @Get("jobs")
  @RequirePermission("inventory.read")
  listJobs(@Query() query: ImportJobQueryDto, @Actor() actor: ActorContext) {
    return this.csvImportService.listJobs(query, actor);
  }

  @Get("jobs/:id")
  @RequirePermission("inventory.read")
  getJob(@Param("id", ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.csvImportService.getJob(id, actor);
  }

  @Get("jobs/:id/rows")
  @RequirePermission("inventory.read")
  listJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobRows(id, query, actor);
  }

  @Delete("jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("inventory.write")
  cancelJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.cancelJob(id, actor);
  }

  @Get("jobs/:id/error-rows.xlsx")
  @RequirePermission("inventory.read")
  async exportJobErrorRowsExcel(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvImportService.exportJobErrorRowsExcelBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="hang-hoa-loi-nhap-khau.xlsx"',
    );
    res.send(buffer);
  }

  // ─── Goods Issues ─────────────────────────────────────────────────

  @Post("goods-issues/validate")
  @RequirePermission("inventory.write")
  @RequireBranchScope()
  @UseInterceptors(FileInterceptor("file"))
  validateGoodsIssue(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.GOODS_ISSUE,
      file,
      actor,
    );
  }

  @Get("goods-issues/import-template.xls")
  @RequirePermission("inventory.read")
  @RequireBranchScope()
  downloadGoodsIssueTemplate(@Res() res: Response) {
    this.sendTemplate(res, "NhapKhauPhieuXKDieuChuyenHangHoa.xls");
  }

  @Get("goods-issues/jobs/:id/rows")
  @RequirePermission("inventory.read")
  @RequireBranchScope()
  listGoodsIssueJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobRows(id, query, actor);
  }

  @Delete("goods-issues/jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("inventory.write")
  @RequireBranchScope()
  cancelGoodsIssueJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.cancelJob(id, actor);
  }

  @Get("goods-issues/jobs/:id/error-rows.xlsx")
  @RequirePermission("inventory.read")
  @RequireBranchScope()
  async exportGoodsIssueJobErrorRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvImportService.exportJobErrorRowsExcelBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="dong-xuat-kho-loi.xlsx"',
    );
    res.send(buffer);
  }

  // ─── Stock Transfers ──────────────────────────────────────────────

  @Post("stock-transfers/validate")
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  @UseInterceptors(FileInterceptor("file"))
  validateStockTransfer(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.STOCK_TRANSFER,
      file,
      actor,
    );
  }

  @Get("stock-transfers/import-template.xls")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  downloadStockTransferTemplate(@Res() res: Response) {
    this.sendTemplate(res, "NhapKhauChuyenKho.xls");
  }

  @Get("stock-transfers/jobs/:id/rows")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  listStockTransferJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobRows(id, query, actor);
  }

  @Delete("stock-transfers/jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  cancelStockTransferJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.cancelJob(id, actor);
  }

  @Get("stock-transfers/jobs/:id/error-rows.xlsx")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  async exportStockTransferJobErrorRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvImportService.exportJobErrorRowsExcelBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="dong-chuyen-kho-loi.xlsx"',
    );
    res.send(buffer);
  }

  // ─── Transfer Orders ──────────────────────────────────────────────

  @Post("transfer-orders/validate")
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  @UseInterceptors(FileInterceptor("file"))
  validateTransferOrder(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(
      ImportJobType.TRANSFER_ORDER,
      file,
      actor,
    );
  }

  @Get("transfer-orders/import-template.xls")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  downloadTransferOrderTemplate(@Res() res: Response) {
    this.sendTemplate(res, "NhapKhauLenhDieuChuyenHangHoa.xls");
  }

  @Get("transfer-orders/jobs/:id/rows")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  listTransferOrderJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobRows(id, query, actor);
  }

  @Delete("transfer-orders/jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("inventory.transfer.create")
  @RequireBranchScope()
  cancelTransferOrderJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.cancelJob(id, actor);
  }

  @Get("transfer-orders/jobs/:id/error-rows.xlsx")
  @RequirePermission("inventory.transfer.read")
  @RequireBranchScope()
  async exportTransferOrderJobErrorRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvImportService.exportJobErrorRowsExcelBuffer(
      id,
      actor,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="dong-lenh-dieu-chuyen-loi.xlsx"',
    );
    res.send(buffer);
  }

  private sendTemplate(res: Response, fileName: string): void {
    const builtPath = join(__dirname, "templates", fileName);
    const sourcePath = join(
      process.cwd(),
      "src",
      "modules",
      "inventory",
      "csv",
      "templates",
      fileName,
    );
    const path = existsSync(builtPath) ? builtPath : sourcePath;
    if (!existsSync(path)) {
      throw new NotFoundException("Không tìm thấy tệp mẫu nhập khẩu");
    }
    const buffer = readFileSync(path);
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
