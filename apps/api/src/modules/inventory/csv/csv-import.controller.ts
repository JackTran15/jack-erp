import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ImportJobStatus } from '@erp/shared-interfaces';
import { CsvImportService } from './csv-import.service';
import { ImportJobType } from './inventory-import-job.entity';

class ImportJobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ImportJobType)
  type?: ImportJobType;

  @IsOptional()
  @IsEnum(ImportJobStatus)
  status?: ImportJobStatus;
}

@Controller('inventory/imports')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class CsvImportController {
  constructor(private readonly csvImportService: CsvImportService) {}

  // ─── Items ─────────────────────────────────────────────────────────

  @Post('items/validate')
  @RequirePermission('inventory.write')
  @UseInterceptors(FileInterceptor('file'))
  validateItems(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(ImportJobType.ITEMS, file, actor);
  }

  @Post('items/commit')
  @RequirePermission('inventory.write')
  commitItems(
    @Query('jobId', ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Opening Balances ──────────────────────────────────────────────

  @Post('opening-balances/validate')
  @RequirePermission('inventory.write')
  @UseInterceptors(FileInterceptor('file'))
  validateOpeningBalances(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(ImportJobType.OPENING_BALANCES, file, actor);
  }

  @Post('opening-balances/commit')
  @RequirePermission('inventory.write')
  commitOpeningBalances(
    @Query('jobId', ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Adjustments ──────────────────────────────────────────────────

  @Post('adjustments/validate')
  @RequirePermission('inventory.write')
  @UseInterceptors(FileInterceptor('file'))
  validateAdjustments(
    @UploadedFile() file: Express.Multer.File,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.validate(ImportJobType.ADJUSTMENTS, file, actor);
  }

  @Post('adjustments/commit')
  @RequirePermission('inventory.write')
  commitAdjustments(
    @Query('jobId', ParseUUIDPipe) jobId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.commit(jobId, actor);
  }

  // ─── Job queries ──────────────────────────────────────────────────

  @Get('jobs')
  @RequirePermission('inventory.read')
  listJobs(
    @Query() query: ImportJobQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.listJobs(query, actor);
  }

  @Get('jobs/:id')
  @RequirePermission('inventory.read')
  getJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.csvImportService.getJob(id, actor);
  }
}
