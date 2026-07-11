import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";
import { Response } from "express";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequirePermission } from "../../auth/decorators";
import { AuditInterceptor } from "../../crud/audit.interceptor";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { PermissionGuard } from "../../rbac/permission.guard";
import { CustomerExportService } from "./customer-export.service";

const EXPORT_FILE_NAME = "danh-muc-khach-hang.xlsx";

class ExportCustomersSelectedDto {
  @ApiProperty({
    description: "Danh sách id khách hàng được chọn để xuất khẩu",
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  customerIds: string[];
}

@Controller("customers/exports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CustomerExportController {
  constructor(private readonly exportService: CustomerExportService) {}

  @Get("excel")
  @RequirePermission("customer.read")
  async exportAll(@Res() res: Response, @Actor() actor: ActorContext) {
    const buffer = await this.exportService.exportCustomersExcelBuffer(actor);
    this.sendWorkbook(res, buffer);
  }

  @Post("excel")
  @RequirePermission("customer.read")
  async exportSelected(
    @Body() dto: ExportCustomersSelectedDto,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.exportService.exportCustomersExcelBuffer(
      actor,
      dto.customerIds,
    );
    this.sendWorkbook(res, buffer);
  }

  private sendWorkbook(res: Response, buffer: Buffer): void {
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${EXPORT_FILE_NAME}"`,
    );
    res.send(buffer);
  }
}
