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
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
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
  IsEnum,
  IsIn,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ImportJobStatus, ImportRowStatus } from "@erp/shared-interfaces";
import { CsvImportService } from "./csv-import.service";
import { LocationImportService } from "./location-import.service";
import { ImportJobType } from "./inventory-import-job.entity";

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

  // ─── Locations ────────────────────────────────────────────────────

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
    const buffer = await this.locationImportService.exportErrorRowsBuffer(id, actor);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="vi-tri-loi-nhap-khau.xlsx"');
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
}
