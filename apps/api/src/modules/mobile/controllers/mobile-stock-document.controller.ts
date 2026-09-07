import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileStockDocumentDetailQueryDto } from '../dto/mobile-stock-document-detail.query.dto';
import { MobileStockDocumentDetailDto } from '../dto/mobile-stock-document-detail.response.dto';
import { MobileStockDocumentListQueryDto } from '../dto/mobile-stock-document-list.query.dto';
import { MobileStockDocumentPageDto } from '../dto/mobile-stock-document.response.dto';
import {
  MobileStockDocumentCreateDto,
  MobileStockDocumentUpdateDto,
} from '../dto/mobile-stock-document-write.dto';
import { MobileStockDocumentService } from '../services/mobile-stock-document.service';
import { MobileStockDocumentWriteService } from '../services/mobile-stock-document-write.service';

/**
 * Chứng từ kho cho app mobile.
 *
 * `GET` với query phẳng, không phải `POST` với body lồng như
 * `/v2/goods-receipts/search` mà trang web dùng: đây là một thao tác ĐỌC, và
 * mọi đường `/mobile/**` khác đều là `GET` — đổi kiểu ở đúng một endpoint là
 * bắt client mobile nhớ một ngoại lệ.
 *
 * MỘT endpoint cho nhiều loại chứng từ, phân biệt bằng `kind`. Backend thực ra
 * để chúng ở hai bảng (`goods_receipts` cho nhập, `goods_issues` cho xuất) và
 * còn chia nhỏ bằng cột `purpose`; app không cần biết chuyện đó, và giấu nó ở
 * đây nghĩa là thêm loại chứng từ sau này chỉ là thêm một giá trị enum chứ
 * không phải một đường dẫn mới.
 *
 * Có cả đường ĐỌC (danh sách, chi tiết) lẫn đường GHI (tạo, sửa). Xoá/huỷ chưa
 * có — app chưa có màn cho nó, và hai họ chứng từ xoá theo hai kiểu khác nhau
 * (`DELETE` cho phiếu nhập, `POST :id/cancel` cho phiếu xuất).
 */
@ApiTags('mobile')
@Controller('mobile/stock-documents')
@UseGuards(PermissionGuard)
export class MobileStockDocumentController {
  constructor(
    private readonly documents: MobileStockDocumentService,
    private readonly writes: MobileStockDocumentWriteService,
  ) {}

  /**
   * Hai quyền vì hai nguồn dữ liệu: phiếu nhập và phiếu xuất là hai quyền RIÊNG
   * ở backend, mà endpoint này phục vụ cả hai.
   *
   * `PermissionGuard` coi nhiều key là **OR**, nên decorator ở đây chỉ chặn được
   * người không có quyền nào — ai có quyền đọc phiếu nhập vẫn lọt qua khi hỏi
   * phiếu xuất. Phép kiểm ĐÚNG theo `kind` nằm ở `MobileStockDocumentService`,
   * chỗ duy nhất biết client đang hỏi loại nào. Gỡ một trong hai lớp là mở lại
   * lỗ phân quyền.
   */
  @Get()
  @RequirePermission(['goods_receipt.read', 'inventory.goods-issue.read'])
  @ApiOperation({ summary: 'Danh sách chứng từ kho theo loại, phân trang' })
  @ApiOkResponse({ type: MobileStockDocumentPageDto })
  list(
    @Query() query: MobileStockDocumentListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileStockDocumentPageDto> {
    return this.documents.list(
      {
        kind: query.kind,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        from: query.from,
        to: query.to,
        branchId: query.branchId,
        search: query.search,
      },
      actor,
    );
  }

  /**
   * `kind` là query BẮT BUỘC, không suy ra được từ `id`: hai loại chứng từ nằm
   * ở hai bảng khác nhau. Lý do đầy đủ ở `MobileStockDocumentDetailQueryDto`.
   *
   * `ParseUUIDPipe` khiến một `id` sai định dạng trả **400**, không phải 404 —
   * và app **không tra được bằng SỐ PHIẾU**. Đó là ràng buộc thật chứ không
   * phải thiếu sót: `documentNumber` chỉ được sinh lúc ghi sổ, nên phiếu nháp
   * không có số để tra.
   *
   * Hai quyền OR ở decorator, rồi service kiểm lại đúng quyền theo `kind` —
   * cùng hai lớp mà [list] đang dùng, và gỡ một lớp là mở lại lỗ phân quyền.
   */
  @Get(':id')
  @RequirePermission(['goods_receipt.read', 'inventory.goods-issue.read'])
  @ApiOperation({ summary: 'Chi tiết một chứng từ kho, kèm dòng hàng' })
  @ApiOkResponse({ type: MobileStockDocumentDetailDto })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileStockDocumentDetailQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileStockDocumentDetailDto> {
    return this.documents.getById(
      { id, kind: query.kind, branchId: query.branchId },
      actor,
    );
  }

  /**
   * 201 vì đây là tạo tài nguyên thật, và phiếu trả về đã ở trạng thái GHI SỔ:
   * tầng dưới lưu nháp rồi post ngay trong một thao tác, post hỏng thì xoá hẳn
   * bản nháp. Không có trạng thái trung gian nào app phải xử.
   *
   * Chỉ trả `{ id }` chứ không trả trọn phiếu: app điều hướng bằng id, và bản
   * đầy đủ đã có đường riêng (`GET :id`) với đúng hình dạng màn chi tiết cần.
   * Trả hai hình dạng cho cùng một bản ghi là hai thứ sẽ phân kỳ.
   *
   * Quyền kiểm theo `kind` TRONG service — nhiều key ở decorator là OR.
   */
  @Post()
  @RequirePermission([
    'goods_receipt.post',
    'inventory.goods-issue.create',
  ])
  @ApiOperation({ summary: 'Tạo chứng từ kho (lưu và ghi sổ)' })
  create(
    @Body() dto: MobileStockDocumentCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<{ id: string }> {
    return this.writes.create(dto, actor);
  }

  /**
   * `kind` và `branchId` đi qua QUERY chứ không nằm trong body: chúng KHÔNG
   * đổi được (đổi loại chứng từ hay chuyển cửa hàng là huỷ-và-lập-lại), nhưng
   * server vẫn cần chúng để biết tra bảng nào và kiểm quyền cửa hàng nào. Để
   * trong body thì chúng trông như thứ sửa được.
   */
  @Patch(':id')
  @RequirePermission([
    'goods_receipt.write',
    'inventory.goods-issue.update',
  ])
  @ApiOperation({ summary: 'Sửa chứng từ kho' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileStockDocumentDetailQueryDto,
    @Body() dto: MobileStockDocumentUpdateDto,
    @Actor() actor: ActorContext,
  ): Promise<{ id: string }> {
    if (!query.branchId) {
      throw new BadRequestException('branchId là bắt buộc khi sửa chứng từ');
    }

    return this.writes.update(
      { id, kind: query.kind, branchId: query.branchId, dto },
      actor,
    );
  }
}
