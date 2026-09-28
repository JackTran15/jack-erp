import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { CreatePromotionV2Dto } from '../application/dto/create-promotion.dto';
import { UpdatePromotionV2Dto } from '../application/dto/update-promotion.dto';
import { ChangePromotionStatusV2Dto } from '../application/dto/change-promotion-status.dto';
import { PromotionSearchV2Dto } from '../application/dto/promotion-search-v2.dto';
import { EvaluateCartDto } from '../application/dto/evaluate-cart.dto';
import {
  ExportItemDiscountLinesDto,
  ImportItemDiscountLinesDto,
  ImportItemDiscountLinesResult,
  ITEM_DISCOUNT_EXCEL_METHODS,
} from '../application/dto/item-discount-excel.dto';
import { CreatePromotionCommand } from '../application/commands/create-promotion.command';
import { UpdatePromotionCommand } from '../application/commands/update-promotion.command';
import { DuplicatePromotionCommand } from '../application/commands/duplicate-promotion.command';
import { ChangePromotionStatusCommand } from '../application/commands/change-promotion-status.command';
import { DeletePromotionCommand } from '../application/commands/delete-promotion.command';
import { SearchPromotionsV2Query } from '../application/queries/search-promotions-v2.query';
import { GetPromotionQuery } from '../application/queries/get-promotion.query';
import { EvaluateCartQuery } from '../application/queries/evaluate-cart.query';
import { ExportItemDiscountLinesQuery } from '../application/queries/export-item-discount-lines.query';
import { ImportItemDiscountLinesQuery } from '../application/queries/import-item-discount-lines.query';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** `.xlsx` theo đuôi file hoặc mimetype; nội dung hỏng thì bước parse vẫn trả 400 (A-17). */
function isXlsxUpload(file: Express.Multer.File): boolean {
  return file.originalname.toLowerCase().endsWith('.xlsx') || file.mimetype === XLSX_CONTENT_TYPE;
}

@ApiTags('promotions-v2')
@Controller('promotions')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class PromotionV2Controller {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('search')
  @Version('2')
  @RequirePermission('promotion.read')
  search(@Body() dto: PromotionSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchPromotionsV2Query(dto, actor));
  }

  /**
   * Xuất các dòng đang có trên lưới "Giảm giá hàng hóa" ra `.xlsx`. Các dòng chỉ
   * tồn tại ở client (chưa lưu) nên gửi lên qua body; mã/tên/ĐVT/giá bán đọc lại
   * từ DB theo tổ chức, dòng của tổ chức khác bị bỏ qua (AC-12).
   */
  @Post('item-discount-lines/export')
  @Version('2')
  @HttpCode(200)
  @RequirePermission('promotion.read')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ description: 'File GiamGiaHangHoa.xlsx', schema: { type: 'string', format: 'binary' } })
  async exportItemDiscountLines(
    @Body() dto: ExportItemDiscountLinesDto,
    @Actor() actor: ActorContext,
  ): Promise<StreamableFile> {
    const buffer: Buffer = await this.queryBus.execute(new ExportItemDiscountLinesQuery(dto, actor));
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="GiamGiaHangHoa.xlsx"',
    });
  }

  /**
   * Đọc file `.xlsx` và trả `{rows, errors}` để nạp vào lưới "Giảm giá hàng hóa".
   * Không ghi DB (ADR-01); lỗi mức file trả 400, lỗi mức dòng nằm trong `errors`.
   */
  @Post('item-discount-lines/import')
  @Version('2')
  @HttpCode(200)
  @RequirePermission('promotion.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_FILE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'method'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'File .xlsx, tối đa 5 MB, 2.000 dòng' },
        method: { type: 'string', enum: [...ITEM_DISCOUNT_EXCEL_METHODS] },
      },
    },
  })
  @ApiOkResponse({ type: ImportItemDiscountLinesResult })
  importItemDiscountLines(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportItemDiscountLinesDto,
    @Actor() actor: ActorContext,
  ): Promise<ImportItemDiscountLinesResult> {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (!isXlsxUpload(file)) throw new BadRequestException('File không đúng định dạng .xlsx');
    return this.queryBus.execute(new ImportItemDiscountLinesQuery(file.buffer, dto.method, actor));
  }

  @Get(':id')
  @Version('2')
  @RequirePermission('promotion.read')
  getById(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetPromotionQuery(id, actor));
  }

  /**
   * Prices a cart without writing anything. Accepts either the back-office
   * `promotion.read` or the cashier-scoped `pos.promotion.evaluate`, because
   * the till needs this endpoint but must not inherit read access to the
   * whole promotion catalogue.
   */
  @Post('evaluate')
  @Version('2')
  @RequirePermission(['promotion.read', 'pos.promotion.evaluate'])
  @RequireBranchScope()
  evaluate(@Body() dto: EvaluateCartDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new EvaluateCartQuery(dto, actor));
  }

  @Post()
  @Version('2')
  @RequirePermission('promotion.write')
  create(@Body() dto: CreatePromotionV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new CreatePromotionCommand(dto, actor));
  }

  @Put(':id')
  @Version('2')
  @RequirePermission('promotion.write')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new UpdatePromotionCommand(id, dto, actor));
  }

  @Post(':id/duplicate')
  @Version('2')
  @RequirePermission('promotion.write')
  duplicate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new DuplicatePromotionCommand(id, actor));
  }

  @Patch(':id/status')
  @Version('2')
  @RequirePermission('promotion.write')
  changeStatus(@Param('id') id: string, @Body() dto: ChangePromotionStatusV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new ChangePromotionStatusCommand(id, dto, actor));
  }

  @Delete(':id')
  @Version('2')
  @HttpCode(204)
  @RequirePermission('promotion.delete')
  async delete(@Param('id') id: string, @Actor() actor: ActorContext): Promise<void> {
    await this.commandBus.execute(new DeletePromotionCommand(id, actor));
  }
}
