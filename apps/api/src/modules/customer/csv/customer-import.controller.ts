import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsEnum, IsOptional } from "class-validator";
import { Response } from "express";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequirePermission } from "../../auth/decorators";
import { AuditInterceptor } from "../../crud/audit.interceptor";
import { PaginationQueryDto } from "../../crud/dto";
import { ImportRowStatus } from "../../inventory/csv/inventory-import-job-row.entity";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { PermissionGuard } from "../../rbac/permission.guard";
import { CustomerImportService } from "./customer-import.service";
import { CustomerImportWorkbookService } from "./customer-import-workbook.service";

const TEMPLATE_FILE_NAME = "DanhMucKhachHang.xlsx";

class CustomerImportJobRowsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportRowStatus)
  status?: ImportRowStatus;
}

@Controller("customers/imports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CustomerImportController {
  constructor(
    private readonly importService: CustomerImportService,
    private readonly workbookService: CustomerImportWorkbookService,
  ) {}

  @Post("validate")
  @RequirePermission("customer.write")
  @UseInterceptors(FileInterceptor("file"))
  validate(
    @UploadedFile() file: Express.Multer.File,
    @Query("duplicateMode") duplicateMode: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    return this.importService.validate(file, actor, duplicateMode);
  }

  @Post("commit")
  @RequirePermission("customer.write")
  commit(
    @Query("jobId", ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.importService.commit(jobId, actor);
  }

  /**
   * Generated rather than served from a checked-in .xls, matching the inventory
   * items template: the file must always carry the current column keys, and
   * neither exceljs nor SheetJS can write a styled .xls (BIFF drops the hidden
   * key rows and the header fill).
   */
  @Get("import-template.xlsx")
  @RequirePermission("customer.read")
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.workbookService.buildWorkbookBuffer([]);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${TEMPLATE_FILE_NAME}"`,
    );
    res.send(buffer);
  }

  @Get("jobs/:id")
  @RequirePermission("customer.read")
  getJob(@Param("id", ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.importService.getJob(id, actor);
  }

  @Get("jobs/:id/rows")
  @RequirePermission("customer.read")
  listJobRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: CustomerImportJobRowsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.importService.listJobRows(id, query, actor);
  }

  @Delete("jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("customer.write")
  cancelJob(
    @Param("id", ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.importService.cancelJob(id, actor);
  }

  @Get("jobs/:id/error-rows.xlsx")
  @RequirePermission("customer.read")
  async exportJobErrorRows(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Actor() actor: ActorContext,
  ) {
    const buffer = await this.importService.exportErrorRowsBuffer(id, actor);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="khach-hang-loi-nhap-khau.xlsx"',
    );
    res.send(buffer);
  }
}
