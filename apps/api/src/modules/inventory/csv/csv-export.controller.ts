import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequirePermission } from "../../auth/decorators";
import { PermissionGuard } from "../../rbac/permission.guard";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { AuditInterceptor } from "../../crud/audit.interceptor";
import { PaginationQueryDto } from "../../crud/dto";
import {
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
  IsArray,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { CsvExportService } from "./csv-export.service";
import { LocationExportService } from "./location-export.service";

class ExportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

class ExportItemsBodyDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsBoolean()
  @Type(() => Boolean)
  isGetAll: boolean = false;
}

@Controller("inventory/exports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CsvExportController {
  constructor(
    private readonly csvExportService: CsvExportService,
    private readonly locationExportService: LocationExportService,
  ) {}

  @Get("items")
  @RequirePermission("inventory.read")
  async exportItems(
    @Query() query: ExportQueryDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const csv = await this.csvExportService.exportItems(query, actor);
    this.sendCsv(res, csv, "items-export.csv");
  }

  @Get("items/excel")
  @RequirePermission("inventory.read")
  async exportItemsExcel(
    @Query() query: ExportQueryDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvExportService.exportItemsExcelBuffer(
      { ...query, isGetAll: true },
      actor,
    );
    this.sendExcel(res, buffer, "danh-sach-hang-hoa.xlsx");
  }

  @Post("items/excel")
  @RequirePermission("inventory.read")
  async exportItemsExcelSelected(
    @Body() body: ExportItemsBodyDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvExportService.exportItemsExcelBuffer(
      { page: 1, pageSize: 0, itemIds: body.itemIds, productIds: body.productIds, isGetAll: body.isGetAll },
      actor,
    );
    this.sendExcel(res, buffer, "danh-sach-hang-hoa.xlsx");
  }

  @Get("items/template")
  @RequirePermission("inventory.read")
  async exportItemsTemplate(
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.csvExportService.exportItemsTemplateBuffer(actor);
    this.sendExcel(res, buffer, "mau-nhap-hang-hoa.xlsx");
  }

  @Get("balances")
  @RequirePermission("inventory.read")
  async exportBalances(
    @Query() query: ExportQueryDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const csv = await this.csvExportService.exportBalances(query, actor);
    this.sendCsv(res, csv, "balances-export.csv");
  }

  @Get("ledger")
  @RequirePermission("inventory.read")
  async exportLedger(
    @Query() query: ExportQueryDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const csv = await this.csvExportService.exportLedger(query, actor);
    this.sendCsv(res, csv, "ledger-export.csv");
  }

  // ─── Locations ────────────────────────────────────────────────────

  @Get("locations/template")
  @RequirePermission("inventory.read")
  async exportLocationsTemplate(@Res() res: Response) {
    const buffer = await this.locationExportService.exportTemplateBuffer();
    this.sendExcel(res, buffer, "mau-vi-tri-hang-hoa.xlsx");
  }

  @Get("locations/excel")
  @RequirePermission("inventory.read")
  async exportLocationsExcel(@Res() res: Response, @Actor() actor: ActorContext) {
    const buffer = await this.locationExportService.exportLocationsExcelBuffer(actor);
    this.sendExcel(res, buffer, "danh-sach-vi-tri-hang-hoa.xlsx");
  }

  private sendCsv(res: Response, csv: string, filename: string): void {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }

  private sendExcel(res: Response, buffer: Buffer, filename: string): void {
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
