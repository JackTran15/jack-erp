import {
  Controller,
  Get,
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
import { IsOptional, IsString, IsDateString, IsUUID } from "class-validator";
import { CsvExportService } from "./csv-export.service";

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

@Controller("inventory/exports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CsvExportController {
  constructor(private readonly csvExportService: CsvExportService) {}

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
      query,
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
