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
import { TransferOrderService } from '../../inventory/transfer-order/transfer-order.service';
import {
  MobileStockDocumentKind,
  MobileStockDocumentPurpose,
} from '../dto/mobile-stock-document-list.query.dto';
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
 * Mục đích MẶC ĐỊNH của chứng từ, ép theo LOẠI MÀN.
 *
 * `GoodsReceiptPurpose` là khái niệm nội bộ backend; để nó rò xuống app thì mỗi
 * lần backend thêm một purpose là một lần app phải biết. Cùng lập luận đã áp
 * cho `purposes`/`excludePurposes` ở đường đọc danh sách.
 *
 * Bảng này là nhánh MẶC ĐỊNH (`purpose` vắng hoặc `other`). Người dùng chọn
 * "Điều chuyển" ở màn Mục đích thì đi nhánh riêng — xem [create]. Phiếu NHẬP
 * HÀNG không có màn Mục đích nên luôn là `PURCHASE`.
 */
const RECEIPT_PURPOSE_OF: Record<string, GoodsReceiptPurpose> = {
  [MobileStockDocumentKind.GOODS_RECEIPT]: GoodsReceiptPurpose.PURCHASE,
  [MobileStockDocumentKind.STOCK_IN]: GoodsReceiptPurpose.OTHER,
};

/**
 * Mục đích mà đường GHI nhận được.
 *
 * `MobileStockDocumentPurpose` có năm giá trị vì nó dùng chung với bộ LỌC danh
 * sách; ba giá trị còn lại (`sale`, `disposal`, `stock-take`) là phiếu do hệ
 * thống sinh hoặc do luồng khác lập, không phải thứ app tạo tay. Tập này là chỗ
 * DUY NHẤT nói ra chỗ lệch đó.
 */
const WRITABLE_PURPOSES: readonly MobileStockDocumentPurpose[] = [
  MobileStockDocumentPurpose.OTHER,
  MobileStockDocumentPurpose.TRANSFER,
];

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
    // Vòng đời hai pha của lệnh điều chuyển. Uỷ quyền thay vì tự dựng lệnh rồi
    // tự gọi hai service phiếu: mọi ràng buộc (chỉ cửa hàng đích nhập được,
    // lệnh đã nhập thì khoá, hai cửa hàng phải khác nhau) nằm sẵn trong đó.
    private readonly transferOrders: TransferOrderService,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async create(
    dto: MobileStockDocumentCreateDto,
    actor: ActorContext,
  ): Promise<{ id: string }> {
    this.assertPurpose(dto);

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

    const isTransfer = dto.purpose === MobileStockDocumentPurpose.TRANSFER;

    // ── Điều chuyển: hai nhánh RIÊNG, không đi qua hai nhánh mặc định ───────
    //
    // Cả hai uỷ quyền cho `TransferOrderService` thay vì gọi thẳng service
    // phiếu nhập/xuất, và đó là điều kiện để phiếu nối được vào LỆNH điều
    // chuyển. Lập một phiếu xuất "mục đích điều chuyển" bằng đường thường thì
    // hàng trừ khỏi kho nguồn mà cửa hàng đích không bao giờ thấy nó đang về —
    // sai một cách im lặng, và chỉ lộ ra khi ai đó đi kiểm kê.

    if (isTransfer && dto.kind === MobileStockDocumentKind.STOCK_OUT) {
      // Một lượt: dựng lệnh điều chuyển rồi xác nhận xuất luôn. Cửa hàng NGUỒN
      // lấy từ `scoped.branchId` (service đọc `actor.branchId`), nên `scopedActor`
      // đã ghi đè đúng giá trị ở trên.
      const order = await this.transferOrders.createAndConfirmExport(
        {
          locationId: lines[0].locationId,
          targetBranchId: dto.targetBranchId!,
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
        },
        scoped,
      );

      // Trả id PHIẾU XUẤT, không phải id lệnh: app điều hướng sang màn chi tiết
      // chứng từ kho, và lệnh điều chuyển không có màn nào ở app.
      return { id: orderLegOrThrow(order.exportGoodsIssueId, 'phiếu xuất') };
    }

    if (isTransfer && dto.transferOrderId) {
      // Xác nhận nhập. **KHÔNG gửi `lines`**: `confirmImport` tự lấy dòng hàng
      // từ chính lệnh, nên số lượng nhận không bao giờ lệch thứ cửa hàng nguồn
      // đã xuất — và app không phải giải `locationId` từng dòng ở kho đích.
      const order = await this.transferOrders.confirmImport(
        dto.transferOrderId,
        scoped,
        {
          counterpartyKind: dto.counterpartyKind,
          counterpartyId: dto.counterpartyId,
          deliverer: dto.deliverer,
          description: dto.note,
          occurredAt: dto.documentDate,
        },
      );

      return { id: orderLegOrThrow(order.importGoodsReceiptId, 'phiếu nhập') };
    }

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
        // Điều chuyển KHÔNG chọn lệnh nào: phiếu nhập ĐỘC LẬP, chỉ ghi lại cửa
        // hàng nguồn. Không có lệnh để nối, nên không có gì chuyển sang "hoàn
        // thành" — đúng ca mà trang web cũng cho phép.
        purpose: isTransfer
          ? GoodsReceiptPurpose.TRANSFER_IN
          : RECEIPT_PURPOSE_OF[dto.kind],
        ...(isTransfer ? { sourceBranchId: dto.sourceBranchId } : {}),
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

  /**
   * Kiểm cặp `kind` × `purpose` — chỗ DUY NHẤT biết cả hai.
   *
   * `@IsEnum` ở DTO chỉ chặn được giá trị lạ; mọi luật dưới đây là về TỔ HỢP,
   * và không decorator nào diễn tả được chúng.
   *
   * Ba trường transfer bị chặn khi `purpose` không phải `transfer`: nhận mà bỏ
   * qua thì app tưởng mình đã gửi một cửa hàng đích, và phiếu lặng lẽ ra sai.
   */
  private assertPurpose(dto: MobileStockDocumentCreateDto): void {
    const purpose = dto.purpose ?? MobileStockDocumentPurpose.OTHER;

    if (!WRITABLE_PURPOSES.includes(purpose)) {
      throw new BadRequestException(
        `Không lập được phiếu với mục đích ${purpose}`,
      );
    }

    const isTransfer = purpose === MobileStockDocumentPurpose.TRANSFER;

    // Phiếu NHẬP HÀNG không có màn Mục đích — mục đích của nó luôn là mua hàng.
    if (isTransfer && dto.kind === MobileStockDocumentKind.GOODS_RECEIPT) {
      throw new BadRequestException(
        `purpose=${purpose} không dùng được với kind=${dto.kind}`,
      );
    }

    if (!isTransfer) {
      const stray = (
        [
          ['sourceBranchId', dto.sourceBranchId],
          ['targetBranchId', dto.targetBranchId],
          ['transferOrderId', dto.transferOrderId],
        ] as const
      ).find(([, value]) => value != null);

      if (stray) {
        throw new BadRequestException(
          `${stray[0]} chỉ dùng được khi mục đích là điều chuyển`,
        );
      }

      return;
    }

    if (dto.kind === MobileStockDocumentKind.STOCK_OUT) {
      // Bắt ở đây thay vì để `GoodsIssueService` bắt: nhánh xuất kho đi qua
      // `createAndConfirmExport`, và nếu thiếu cửa hàng đích thì nó đã DỰNG
      // xong một lệnh điều chuyển trước lúc hỏng.
      if (!dto.targetBranchId) {
        throw new BadRequestException(
          'Vui lòng chọn cửa hàng đích để điều chuyển',
        );
      }

      if (dto.sourceBranchId || dto.transferOrderId) {
        throw new BadRequestException(
          'Phiếu xuất kho điều chuyển chỉ nhận cửa hàng đích',
        );
      }

      return;
    }

    // Nhập kho điều chuyển. Hai lối vào loại trừ nhau: theo LỆNH
    // (`transferOrderId`) hoặc phiếu ĐỘC LẬP (`sourceBranchId`). Gửi cả hai thì
    // không biết nghe ai — và cửa hàng nguồn của lệnh mới là cái đúng.
    if (dto.targetBranchId) {
      throw new BadRequestException(
        'Phiếu nhập kho điều chuyển không nhận cửa hàng đích',
      );
    }

    if (dto.transferOrderId && dto.sourceBranchId) {
      throw new BadRequestException(
        'Chọn lệnh điều chuyển rồi thì không gửi kèm cửa hàng nguồn',
      );
    }

    // Vắng CẢ HAI thì KHÔNG chặn ở đây: `GoodsReceiptService` đã có câu tiếng
    // Việt cho ca đó ("Phiếu điều chuyển cần chi nhánh nguồn hoặc tham chiếu
    // phiếu điều chuyển"), và trang web cũng để server chặn. Thêm một câu thứ
    // hai ở đây là hai chỗ nói cùng một điều và sẽ phân kỳ.
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

/**
 * Định danh của một chân (phiếu nhập / phiếu xuất) mà lệnh điều chuyển vừa sinh.
 *
 * `TransferOrderEntity` khai hai trường đó NULLABLE vì một lệnh mới lập thì chưa
 * có chân nào. Nhưng sau `createAndConfirmExport` / `confirmImport` thì nó bắt
 * buộc phải có — vắng nghĩa là tầng dưới vừa đổi hành vi, và app thì đang chờ
 * một id để điều hướng.
 *
 * Ném thay vì trả chuỗi rỗng: một đường dẫn mang id rỗng biểu hiện ra là màn
 * trắng, không phải "không tìm thấy".
 */
function orderLegOrThrow(id: string | null | undefined, leg: string): string {
  if (!id) {
    throw new BadRequestException(
      `Lệnh điều chuyển không sinh được ${leg}, vui lòng thử lại`,
    );
  }

  return id;
}
