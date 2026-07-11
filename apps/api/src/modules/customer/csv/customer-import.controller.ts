import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { existsSync, readFileSync } from "fs";
import { join } from "path";
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

const TEMPLATE_FILE_NAME = "DanhMucKhachHang.xls";

class CustomerImportJobRowsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportRowStatus)
  status?: ImportRowStatus;
}

@Controller("customers/imports")
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CustomerImportController {
  constructor(private readonly importService: CustomerImportService) {}

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

  @Get("import-template.xls")
  @RequirePermission("customer.read")
  downloadTemplate(@Res() res: Response) {
    const builtPath = join(__dirname, "templates", TEMPLATE_FILE_NAME);
    const sourcePath = join(
      process.cwd(),
      "src",
      "modules",
      "customer",
      "csv",
      "templates",
      TEMPLATE_FILE_NAME,
    );
    const path = existsSync(builtPath) ? builtPath : sourcePath;
    if (!existsSync(path)) {
      throw new NotFoundException("Không tìm thấy tệp mẫu nhập khẩu");
    }
    const buffer = readFileSync(path);
    res.setHeader("Content-Type", "application/vnd.ms-excel");
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
