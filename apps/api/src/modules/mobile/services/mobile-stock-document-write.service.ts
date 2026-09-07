import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GoodsIssuePurpose, GoodsReceiptPurpose } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { GoodsIssueService } from '../../inventory/goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../../inventory/goods-receipt/goods-receipt.service';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ResolveItemLocationsQuery } from '../../inventory/location/queries/resolve-item-locations.query';
import { ResolveItemLocationsResponseDto } from '../../inventory/location/dto/resolve-item-locations.dto';
import { MobileStockDocumentKind } from '../dto/mobile-stock-document-list.query.dto';
import {
  MobileStockDocumentCreateDto,
  MobileStockDocumentLineWriteDto,
  MobileStockDocumentUpdateDto,
} from '../dto/mobile-stock-document-write.dto';

/**
 * Quyền GHI của từng loại chứng từ.
 *
 * Hai bộ khác hẳn nhau, không phải một bộ dùng chung: phiếu nhập gộp tạo vào
 * `post` (tạo LÀ ghi sổ) và sửa vào `write`, còn phiếu xuất chia nhỏ thành
 * `create`/`update`/`post`/`cancel`. Đừng "dọn cho đối xứng".
 */
const CREATE_PERMISSION_OF: Record<MobileStockDocumentKind, string> = {
  [MobileStockDocumentKind.GOODS_RECEIPT]: 'goods_receipt.post',
  [MobileStockDocumentKind.STOCK_IN]: 'goods_receipt.post',
  [MobileStockDocumentKind.STOCK_OUT]: 'inventory.goods-issue.create',
};

const UPDATE_PERMISSION_OF: Record<MobileStockDocumentKind, string> = {
  [MobileStockDocumentKind.GOODS_RECEIPT]: 'goods_receipt.write',
  [MobileStockDocumentKind.STOCK_IN]: 'goods_receipt.write',
  [MobileStockDocumentKind.STOCK_OUT]: 'inventory.goods-issue.update',
};

/**
 * Mục đích chứng từ, ép theo LOẠI MÀN chứ không nhận từ client.
 *
 * `GoodsReceiptPurpose` là khái niệm nội bộ backend; để nó rò xuống app thì mỗi
 * lần backend thêm một purpose là một lần app phải biết. Cùng lập luận đã áp
 * cho `purposes`/`excludePurposes` ở đường đọc danh sách.
 *
 * `OTHER` cho nhập kho, không phải `TRANSFER_IN`: điều chuyển đi một endpoint
 * hoàn toàn khác (`/inventory/transfer-orders/...`) và app chưa nối nó.
 */
const RECEIPT_PURPOSE_OF: Record<string, GoodsReceiptPurpose> = {
  [MobileStockDocumentKind.GOODS_RECEIPT]: GoodsReceiptPurpose.PURCHASE,
  [MobileStockDocumentKind.STOCK_IN]: GoodsReceiptPurpose.OTHER,
};

/** Một dòng hàng đã được bổ sung đủ thứ mà DTO của tầng dưới đòi. */
interface ResolvedLine {
  itemId: string;
  locationId: string;
  uomCode: string;
  quantity: number;
  unitPrice: number;
  note?: string;
}

/**
 * Tạo và sửa chứng từ kho cho app mobile.
 *
 * Uỷ quyền cho `GoodsReceiptService`/`GoodsIssueService` — **mọi ràng buộc
 * nghiệp vụ đã nằm trong đó**: phiếu mua phải có nhà cung cấp, ít nhất một dòng
 * hàng, số lượng dương, không sửa phiếu đã huỷ, khoá lạc quan theo `revision`,
 * và kiểm tồn kho lúc ghi sổ. Viết lại là chép một tập luật chắc chắn phân kỳ.
 *
 * Việc RIÊNG của service này gói gọn trong ba phép dịch:
 *
 * 1. **Bổ sung ba trường app không gửi** — `locationId`, `uomCode`, `purpose`;
 * 2. **Đổi tên trường** giữa hai họ chứng từ (`receivedAt`/`occurredAt`,
 *    `description`/`notes`, `deliveredBy`/`deliverer`);
 * 3. **Kiểm quyền theo `kind`**, vì decorator nhiều key là OR.
 *
 * Tạo phiếu là **LƯU VÀ GHI SỔ** (`createAndPost`), không có bước nháp: post
 * hỏng thì bản nháp bị xoá hẳn, nên kết cục chỉ có "đã ghi sổ" hoặc "không có
 * gì". App không cần biết trạng thái trung gian nào.
 */
@Injectable()
export class MobileStockDocumentWriteService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly rbac: RbacService,
    private readonly receipts: GoodsReceiptService,
    private readonly issues: GoodsIssueService,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async create(
    dto: MobileStockDocumentCreateDto,
    actor: ActorContext,
  ): Promise<{ id: string }> {
    const scoped = await this.scopedActor({
      kind: dto.kind,
      branchId: dto.branchId,
      permission: CREATE_PERMISSION_OF[dto.kind],
      actor,
    });

    const lines = await this.resolveLines({
      lines: dto.lines,
      branchId: dto.branchId,
      actor: scoped,
    });

    if (dto.kind === MobileStockDocumentKind.STOCK_OUT) {
      const created = await this.issues.createAndPost(
        {
          locationId: lines[0].locationId,
          counterpartyKind: dto.counterpartyKind,
          counterpartyId: dto.counterpartyId,
          purpose: GoodsIssuePurpose.OTHER,
          notes: dto.note,
          deliverer: dto.deliverer,
          occurredAt: dto.documentDate,
          lines: lines.map((line) => ({
            itemId: line.itemId,
            locationId: line.locationId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            notes: line.note,
          })),
        } as never,
        scoped,
      );

      return { id: created.id };
    }

    const created = await this.receipts.createAndPost(
      {
        purpose: RECEIPT_PURPOSE_OF[dto.kind],
        counterpartyKind: dto.counterpartyKind,
        counterpartyId: dto.counterpartyId,
        purchasingEmployeeId: dto.purchasingEmployeeId,
        paymentMethod: dto.paymentMethod,
        deliveredBy: dto.deliverer,
        description: dto.note,
        receivedAt: dto.documentDate,
        // Đầu phiếu neo vào vị trí của dòng ĐẦU TIÊN — cột `location_id` của
        // bảng là NOT NULL nhưng vị trí thật nằm ở từng dòng. Đúng cách trang
        // web đang làm.
        locationId: lines[0].locationId,
        lines,
      } as never,
      scoped,
    );

    return { id: created.id };
  }

  async update(
    args: {
      id: string;
      kind: MobileStockDocumentKind;
      branchId: string;
      dto: MobileStockDocumentUpdateDto;
    },
    actor: ActorContext,
  ): Promise<{ id: string }> {
    const { id, kind, branchId, dto } = args;

    const scoped = await this.scopedActor({
      kind,
      branchId,
      permission: UPDATE_PERMISSION_OF[kind],
      actor,
    });

    const lines = await this.resolveLines({
      lines: dto.lines,
      branchId,
      actor: scoped,
    });

    if (kind === MobileStockDocumentKind.STOCK_OUT) {
      // KHÔNG gửi `purpose`: DTO sửa của phiếu xuất không nhận nó (đổi mục đích
      // là huỷ-và-lập-lại), và `forbidNonWhitelisted` sẽ từ chối cả request.
      await this.issues.update(
        id,
        {
          locationId: lines[0].locationId,
          counterpartyKind: dto.counterpartyKind,
          counterpartyId: dto.counterpartyId,
          notes: dto.note,
          deliverer: dto.deliverer,
          occurredAt: dto.documentDate,
          lines: lines.map((line) => ({
            itemId: line.itemId,
            locationId: line.locationId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            notes: line.note,
          })),
        } as never,
        scoped,
      );

      return { id };
    }

    await this.receipts.update(
      id,
      {
        counterpartyKind: dto.counterpartyKind,
        counterpartyId: dto.counterpartyId,
        purchasingEmployeeId: dto.purchasingEmployeeId,
        deliveredBy: dto.deliverer,
        description: dto.note,
        receivedAt: dto.documentDate,
        locationId: lines[0].locationId,
        lines,
      } as never,
      scoped,
    );

    return { id };
  }

  /**
   * Kiểm quyền theo `kind` và theo cửa hàng, rồi trả actor đã gắn cửa hàng đó.
   *
   * Ba phép kiểm, và thứ tự có nghĩa: quyền thao tác trước (rẻ nhất), rồi quyền
   * cửa hàng, rồi mới tới quyền phụ theo mục đích — cái cuối phải chạm RBAC lần
   * nữa nên để sau cùng.
   */
  private async scopedActor(args: {
    kind: MobileStockDocumentKind;
    branchId: string;
    permission: string;
    actor: ActorContext;
  }): Promise<ActorContext> {
    const { kind, branchId, permission, actor } = args;

    const allowed = await this.rbac.hasAnyPermission(
      actor.userId,
      actor.organizationId,
      [permission],
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }

    if (!actor.branchIds?.includes(branchId)) {
      throw new ForbiddenException(`Access denied for branch: ${branchId}`);
    }

    // Quyền phụ theo mục đích — thứ rất dễ vấp: nhập kho `OTHER` còn đòi
    // `goods_receipt.other-receipt`, xuất `OTHER` đòi
    // `inventory.goods-issue.other-issue`. Hai service bên dưới cũng tự kiểm,
    // nhưng kiểm ở đây thì lỗi bật ra TRƯỚC khi ta ghi bất cứ thứ gì.
    const extra = EXTRA_PURPOSE_PERMISSION_OF[kind];
    if (extra) {
      const ok = await this.rbac.hasAnyPermission(
        actor.userId,
        actor.organizationId,
        [extra],
      );
      if (!ok) {
        throw new ForbiddenException(`Missing required permission: ${extra}`);
      }
    }

    return { ...actor, branchId };
  }

  /**
   * Bổ sung `locationId` và `uomCode` cho từng dòng.
   *
   * `locationId` đi qua `ResolveItemLocationsQuery` — cùng đường trang web dùng.
   * Nó trả kho mặc định của cửa hàng CỘNG vị trí cho từng mặt hàng, phân giải
   * theo ba bậc (kệ ưu tiên -> bin đang giữ tồn -> vị trí mặc định), nên một
   * lượt gọi là đủ cho cả phiếu.
   *
   * `uomCode` lấy từ `items.unit` — nó là bản CHỤP đơn vị tính tại thời điểm
   * lập phiếu, nên đọc từ danh mục đúng lúc này là đúng nghĩa.
   */
  private async resolveLines(args: {
    lines: MobileStockDocumentLineWriteDto[];
    branchId: string;
    actor: ActorContext;
  }): Promise<ResolvedLine[]> {
    const { lines, branchId, actor } = args;

    const itemIds = [...new Set(lines.map((line) => line.itemId))];

    const items = await this.items.find({
      where: { id: In(itemIds), organizationId: actor.organizationId },
      select: { id: true, unit: true },
    });
    const unitById = new Map(items.map((item) => [item.id, item.unit]));

    // Mặt hàng lạ phải chặn TẠI ĐÂY: để nó xuống tầng dưới thì lỗi bật ra dưới
    // dạng vi phạm khoá ngoại, một câu không ai đọc được.
    const unknown = itemIds.filter((id) => !unitById.has(id));
    if (unknown.length) {
      throw new BadRequestException(
        `Không tìm thấy hàng hoá: ${unknown.join(', ')}`,
      );
    }

    const resolved = await this.queryBus.execute<
      ResolveItemLocationsQuery,
      ResolveItemLocationsResponseDto
    >(
      new ResolveItemLocationsQuery(
        { variantItemIds: itemIds, branchId },
        actor,
      ),
    );
    const locationByItem = new Map(
      resolved.data.map((row) => [row.itemId, row.locationId]),
    );

    return lines.map((line) => {
      const locationId = locationByItem.get(line.itemId);

      if (!locationId) {
        throw new BadRequestException(
          'Cửa hàng chưa có vị trí lưu kho — vui lòng tạo ít nhất một vị trí trước khi lập phiếu',
        );
      }

      return {
        itemId: line.itemId,
        locationId,
        // `'Cái'` khi danh mục bỏ trống đơn vị: cột `uom_code` là NOT NULL, và
        // đây đúng là giá trị dự phòng trang web dùng.
        uomCode: unitById.get(line.itemId) || 'Cái',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        note: line.note,
      };
    });
  }
}

/** Quyền PHỤ mà một số mục đích đòi thêm, ngoài quyền thao tác. */
const EXTRA_PURPOSE_PERMISSION_OF: Partial<
  Record<MobileStockDocumentKind, string>
> = {
  [MobileStockDocumentKind.STOCK_IN]: 'goods_receipt.other-receipt',
  [MobileStockDocumentKind.STOCK_OUT]: 'inventory.goods-issue.other-issue',
};
