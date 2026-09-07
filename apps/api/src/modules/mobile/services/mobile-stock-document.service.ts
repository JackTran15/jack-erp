import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GoodsIssueStatus,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import {
  attachCounterparties,
  attachPurchasingEmployees,
} from '../../inventory/location/services/counterparty-name.util';
import { GoodsIssueEntity } from '../../inventory/goods-issue/goods-issue.entity';
import { GoodsIssueLineEntity } from '../../inventory/goods-issue/goods-issue-line.entity';
import { GoodsIssueSearchV2Dto } from '../../inventory/goods-issue/dto/goods-issue-search-v2.dto';
import { SearchGoodsIssuesV2Query } from '../../inventory/goods-issue/queries/search-goods-issues-v2.query';
import { GoodsReceiptEntity } from '../../inventory/goods-receipt/goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../../inventory/goods-receipt/goods-receipt-line.entity';
import { GoodsReceiptSearchV2Dto } from '../../inventory/goods-receipt/dto/goods-receipt-search-v2.dto';
import { SearchGoodsReceiptsV2Query } from '../../inventory/goods-receipt/queries/search-goods-receipts-v2.query';
import { MobileStockDocumentKind } from '../dto/mobile-stock-document-list.query.dto';
import {
  MobileStockDocumentDetailDto,
  MobileStockDocumentLineDto,
} from '../dto/mobile-stock-document-detail.response.dto';
import {
  MobileStockDocumentPageDto,
  MobileStockDocumentResponseDto,
  MobileStockDocumentStatus,
} from '../dto/mobile-stock-document.response.dto';

/** Hình dạng chung của cả hai handler v2 — chỉ khác kiểu phần tử `data`. */
interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totals: { totalAmount: number };
}

/**
 * Quyền đọc của TỪNG loại chứng từ.
 *
 * Nhập và xuất là hai quyền RIÊNG ở backend. Endpoint này gộp chúng vào một
 * route nên `@RequirePermission` trên controller chỉ chặn được người KHÔNG có
 * quyền nào (nhiều key = OR, xem `permission.guard.ts`); ai có quyền đọc phiếu
 * nhập vẫn lọt qua guard khi hỏi phiếu xuất. Bảng này đóng nốt lỗ đó, và phải
 * đóng ở service vì chỉ tới đây mới biết `kind`.
 */
const PERMISSION_OF: Record<MobileStockDocumentKind, string> = {
  [MobileStockDocumentKind.GOODS_RECEIPT]: 'goods_receipt.read',
  [MobileStockDocumentKind.STOCK_IN]: 'goods_receipt.read',
  [MobileStockDocumentKind.STOCK_OUT]: 'inventory.goods-issue.read',
};

/**
 * Bốn trạng thái của phiếu NHẬP gộp còn ba nhãn app hiển thị.
 *
 * `REVERSED` (đảo bút toán) và `CANCELLED` (huỷ) là hai đường khác nhau về kế
 * toán nhưng với người dùng app thì cùng nghĩa "phiếu này không còn hiệu lực",
 * và trang web cũng hiển thị cả hai là "Đã hủy".
 */
const RECEIPT_STATUS_MAP: Record<GoodsReceiptStatus, MobileStockDocumentStatus> =
  {
    [GoodsReceiptStatus.DRAFT]: 'draft',
    [GoodsReceiptStatus.POSTED]: 'posted',
    [GoodsReceiptStatus.CANCELLED]: 'cancelled',
    [GoodsReceiptStatus.REVERSED]: 'cancelled',
  };

/**
 * Phiếu XUẤT có bộ trạng thái KHÁC phiếu nhập — `APPROVED` thay cho `REVERSED`.
 *
 * `APPROVED` gộp vào `draft` vì đó là thứ trang web làm: nó hiển thị `DRAFT` và
 * `APPROVED` cùng một nhãn "Chưa thực hiện". Thêm nhãn thứ tư vào app cho một
 * khác biệt mà chính web không phân biệt là bắt màn hình vẽ thứ nó không giải
 * thích được.
 *
 * `CANCELLED` vẫn khai dù handler đã loại nó khỏi truy vấn: bảng thiếu một giá
 * trị enum thì `status` ra `undefined` và lọt xuống app dưới dạng khoá l10n
 * hỏng, mà TypeScript không bắt được vì `Record` đã đủ nhánh.
 */
const ISSUE_STATUS_MAP: Record<GoodsIssueStatus, MobileStockDocumentStatus> = {
  [GoodsIssueStatus.DRAFT]: 'draft',
  [GoodsIssueStatus.APPROVED]: 'draft',
  [GoodsIssueStatus.POSTED]: 'posted',
  [GoodsIssueStatus.CANCELLED]: 'cancelled',
};

/**
 * Danh sách chứng từ kho cho app mobile.
 *
 * Uỷ quyền cho hai handler v2 mà trang web đang dùng rồi NẮN LẠI hình dạng,
 * thay vì tự viết truy vấn. Ba thứ nhận được miễn phí và không muốn viết lại:
 * `totals.totalAmount` cộng trên toàn tập kết quả lọc, `totalAmount` từng dòng,
 * và phép giải tên đối tượng đa hình (nhà cung cấp / khách hàng / nhân viên).
 *
 * Việc nắn lại là BẮT BUỘC chứ không phải cho gọn: hai handler đó trả thẳng
 * entity TypeORM, tức mỗi dòng kéo theo toàn bộ `ProviderEntity` — có `maxDebt`,
 * số tài khoản ngân hàng, CMND. Đẩy nguyên xuống app là rò công nợ và thông tin
 * ngân hàng của nhà cung cấp qua một màn chỉ hiển thị bốn mẩu chữ.
 *
 * Chứng từ kho scope theo CHI NHÁNH (khác nhà cung cấp và hàng hoá vốn theo tổ
 * chức). Chi nhánh lấy từ token qua `@Actor`, không từ header.
 */
@Injectable()
export class MobileStockDocumentService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly rbac: RbacService,
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsIssueEntity)
    private readonly issueRepo: Repository<GoodsIssueEntity>,
  ) {}

  async list(
    query: {
      kind: MobileStockDocumentKind;
      page: number;
      limit: number;
      from?: string;
      to?: string;
      branchId?: string;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileStockDocumentPageDto> {
    const { kind, page, limit, from, to, search } = query;

    await this.assertCanRead(kind, actor);

    // Giải chi nhánh TRƯỚC khi dựng DTO: hai handler v2 đọc `actor.branchId`,
    // nên cách duy nhất đổi được cửa hàng là đưa cho chúng một actor khác.
    const scoped = withBranch(actor, query.branchId);

    // Bỏ hẳn khoá `date` khi không lọc kỳ: `{}` rỗng vẫn đi qua `applyDateRange`
    // và thêm một mệnh đề WHERE vô nghĩa.
    const dateFilter = from || to ? { date: { from, to } } : {};

    return kind === MobileStockDocumentKind.STOCK_OUT
      ? this.listIssues({ page, limit, dateFilter, search }, scoped)
      : this.listReceipts({ kind, page, limit, dateFilter, search }, scoped);
  }

  /**
   * Chi tiết MỘT chứng từ: phần đầu phiếu cộng toàn bộ dòng hàng.
   *
   * KHÔNG đi qua `QueryBus` như [list] — hai handler v2 phục vụ tìm kiếm, không
   * có đường tra một bản ghi, và đường v1 (`GET /goods-receipts/:id`) thì nằm
   * sau `BranchScopeGuard` cùng một loạt thứ app không cần. Đọc thẳng repository
   * ở đây rẻ hơn và giữ được toàn quyền kiểm soát cái gì đi ra.
   *
   * Cái giá phải trả cho việc bỏ `QueryBus`: `totalAmount` không còn được server
   * cộng sẵn, nên [toDetailAmount] tự cộng từ `lineTotal`.
   */
  async getById(
    args: { id: string; kind: MobileStockDocumentKind; branchId?: string },
    actor: ActorContext,
  ): Promise<MobileStockDocumentDetailDto> {
    const { id, kind } = args;

    await this.assertCanRead(kind, actor);

    const scoped = withBranch(actor, args.branchId);

    return kind === MobileStockDocumentKind.STOCK_OUT
      ? this.findIssue(id, scoped)
      : this.findReceipt(id, kind, scoped);
  }

  private async findReceipt(
    id: string,
    kind: MobileStockDocumentKind,
    actor: ActorContext,
  ): Promise<MobileStockDocumentDetailDto> {
    const row = await this.receiptRepo.findOne({
      where: scopeOf(id, actor),
      // Tắt eager rồi khai lại tường minh: mặc định nó kéo thêm `location` của
      // phiếu VÀ `location` của TỪNG dòng hàng — trọn `LocationEntity` mỗi cái,
      // cho một màn không vẽ vị trí kho.
      loadEagerRelations: false,
      relations: { provider: true, lines: { item: true } },
      // `select` là phép TỐI ƯU, không phải hàng rào. Hàng rào là hai mapper ở
      // cuối file: chúng chép TƯỜNG MINH từng trường, nên kể cả khi TypeORM bỏ
      // qua `select` này thì `purchasePrice` của hàng hoá hay `maxDebt` của nhà
      // cung cấp vẫn không có đường ra ngoài.
      select: {
        id: true,
        documentNumber: true,
        receivedAt: true,
        status: true,
        purpose: true,
        deliveredBy: true,
        description: true,
        counterpartyKind: true,
        counterpartyId: true,
        // Hai trường CHỈ màn Sửa dùng — xem doc của DTO chi tiết.
        purchasingEmployeeId: true,
        paymentMethod: true,
        provider: { id: true, code: true, name: true },
        lines: {
          id: true,
          uomCode: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          createdAt: true,
          item: { id: true, code: true, name: true, unit: true },
        },
      },
      // Dòng hàng phải ra theo thứ tự ổn định, nếu không mỗi lần kéo-để-làm-mới
      // là danh sách xáo lại một kiểu. Cùng tiêu chí mà `GET /:id/lines` của v1
      // dùng.
      order: { lines: { createdAt: 'ASC' } },
    });

    if (!row) throw new NotFoundException(notFoundMessage(id));

    // `goods-receipt` và `stock-in` CÙNG bảng, phân biệt bằng `purpose`. Thiếu
    // phép kiểm này thì đường dẫn của màn Nhập kho mở được một phiếu mua hàng và
    // hiển thị nó dưới tiêu đề "Nhập kho" — sai một cách im lặng, và `kind` chỉ
    // còn là gợi ý chứ không phải một ràng buộc.
    const isPurchase = row.purpose === GoodsReceiptPurpose.PURCHASE;
    if (isPurchase !== (kind === MobileStockDocumentKind.GOODS_RECEIPT)) {
      throw new NotFoundException(notFoundMessage(id));
    }

    await attachCounterparties(
      this.receiptRepo.manager,
      [row],
      actor.organizationId,
    );
    // `purchasingEmployeeId` trỏ vào `users`, không phải đối tượng chứng từ, nên
    // nó cần một lượt tra riêng. Helper gộp mọi id thành một truy vấn.
    await attachPurchasingEmployees(
      this.receiptRepo.manager,
      [row],
      actor.organizationId,
    );

    return toDetailFromReceipt(row);
  }

  private async findIssue(
    id: string,
    actor: ActorContext,
  ): Promise<MobileStockDocumentDetailDto> {
    const row = await this.issueRepo.findOne({
      where: scopeOf(id, actor),
      loadEagerRelations: false,
      relations: { provider: true, targetBranch: true, lines: { item: true } },
      select: {
        id: true,
        documentNumber: true,
        occurredAt: true,
        createdAt: true,
        status: true,
        deliverer: true,
        notes: true,
        counterpartyKind: true,
        counterpartyId: true,
        provider: { id: true, code: true, name: true },
        targetBranch: { id: true, name: true },
        lines: {
          id: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          item: { id: true, code: true, name: true, unit: true },
        },
      },
      // `id ASC` chứ không `createdAt`: `GoodsIssueLineEntity` KHÔNG có cột
      // `createdAt` (khác hẳn dòng phiếu nhập). Cùng lý do mà `GET /:id/lines`
      // của v1 sắp theo `id`.
      order: { lines: { id: 'ASC' } },
    });

    if (!row) throw new NotFoundException(notFoundMessage(id));

    // KHÔNG kiểm `purpose`: phiếu xuất ở bảng riêng, và màn Xuất kho của app
    // hiện mọi mục đích — đúng như trang web.
    await attachCounterparties(
      this.issueRepo.manager,
      [row],
      actor.organizationId,
    );

    return toDetailFromIssue(row);
  }

  /**
   * Guard của controller chỉ kiểm được "có MỘT trong hai quyền" vì nó không
   * thấy `kind`. Đây là chỗ kiểm đúng quyền của loại chứng từ đang hỏi.
   */
  private async assertCanRead(
    kind: MobileStockDocumentKind,
    actor: ActorContext,
  ): Promise<void> {
    const permission = PERMISSION_OF[kind];

    const allowed = await this.rbac.hasAnyPermission(
      actor.userId,
      actor.organizationId,
      [permission],
    );

    if (!allowed) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }
  }

  /** Nhập hàng và nhập kho: cùng bảng, khác nhau đúng ở phép lọc `purpose`. */
  private async listReceipts(
    args: {
      kind: MobileStockDocumentKind;
      page: number;
      limit: number;
      dateFilter: Partial<GoodsReceiptSearchV2Dto>;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileStockDocumentPageDto> {
    const { kind, page, limit, dateFilter, search } = args;

    const dto: GoodsReceiptSearchV2Dto = {
      page,
      limit,
      // Một ô gõ duy nhất -> số phiếu HOẶC tên đối tượng. Không tách được
      // thành `documentNumber` + `party`: `FilterBuilder` nối chúng bằng AND,
      // nên cùng một chuỗi cho cả hai là hỏi phần GIAO, gần như luôn rỗng.
      ...(search?.trim() ? { search: search.trim() } : {}),
      // Ép ở SERVER theo `kind`, không nhận từ client: `GoodsReceiptPurpose` là
      // khái niệm nội bộ của backend, để nó rò xuống Dart thì mọi lần backend
      // thêm một purpose là một lần app phải biết.
      //
      // `excludePurposes` chứ không liệt kê `[OTHER, TRANSFER_IN, STOCK_TAKE]`:
      // liệt kê thì thêm một purpose mới ở backend là nó lặng lẽ vắng mặt khỏi
      // màn Nhập kho, còn loại trừ thì nó tự xuất hiện.
      ...(kind === MobileStockDocumentKind.GOODS_RECEIPT
        ? { purposes: [GoodsReceiptPurpose.PURCHASE] }
        : { excludePurposes: [GoodsReceiptPurpose.PURCHASE] }),
      ...dateFilter,
    };

    const result = await this.queryBus.execute<
      SearchGoodsReceiptsV2Query,
      SearchResult<GoodsReceiptEntity>
    >(new SearchGoodsReceiptsV2Query(dto, actor));

    return toPage(result, toMobileFromReceipt);
  }

  /** Xuất kho: bảng khác, DTO khác — không có `purposes`, không có `description`. */
  private async listIssues(
    args: {
      page: number;
      limit: number;
      dateFilter: Partial<GoodsIssueSearchV2Dto>;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileStockDocumentPageDto> {
    const { page, limit, dateFilter, search } = args;

    // KHÔNG lọc `purpose`: màn Xuất kho của web cũng hiện mọi loại (bán hàng,
    // điều chuyển, huỷ hàng, kiểm kê). Và DTO bên này chỉ nhận MỘT giá trị
    // `purpose`, không có `purposes`/`excludePurposes` như bên nhập.
    // Xem ghi chú ở `listReceipts` về vì sao là MỘT khoá `search`.
    const dto: GoodsIssueSearchV2Dto = {
      page,
      limit,
      ...(search?.trim() ? { search: search.trim() } : {}),
      ...dateFilter,
    };

    const result = await this.queryBus.execute<
      SearchGoodsIssuesV2Query,
      SearchResult<GoodsIssueEntity>
    >(new SearchGoodsIssuesV2Query(dto, actor));

    return toPage(result, toMobileFromIssue);
  }
}

function toPage<T>(
  result: SearchResult<T>,
  map: (row: T) => MobileStockDocumentResponseDto,
): MobileStockDocumentPageDto {
  return {
    data: result.data.map(map),
    total: result.total,
    page: result.page,
    limit: result.limit,
    summary: { totalAmount: result.totals.totalAmount },
  };
}

/**
 * Chép TƯỜNG MINH bảy trường thay vì spread row.
 *
 * Đây là thứ duy nhất chặn `provider`/`lines` rò ra ngoài, và nó phải giữ được
 * tính chất đó kể cả khi ai đó thêm cột vào entity — nên đừng đổi thành
 * `{...row, ...}` rồi xoá bớt.
 */
function toMobileFromReceipt(
  row: GoodsReceiptEntity,
): MobileStockDocumentResponseDto {
  return {
    id: row.id,
    // `documentNumber` chỉ được sinh lúc ghi sổ, nên phiếu nháp không có mã.
    // Trả `null` thật thay vì một chuỗi rỗng: app cần phân biệt "chưa có mã"
    // với "mã rỗng" để chọn cách hiển thị thay thế.
    code: row.documentNumber ?? null,
    documentDate: row.receivedAt.toISOString(),
    // `counterparty` là đường mới (đa hình), `provider` là đường cũ. Ưu tiên
    // đường mới rồi mới lùi về đường cũ — đúng thứ tự trang web đang dùng, nếu
    // không thì phiếu có đối tượng là khách hàng sẽ hiện trống.
    partyName: row.counterparty?.name ?? row.provider?.name ?? null,
    partyCode: row.provider?.code ?? null,
    amount: row.totalAmount ?? 0,
    status: RECEIPT_STATUS_MAP[row.status],
  };
}

/**
 * Bản riêng cho phiếu XUẤT — KHÔNG dùng lại mapper phiếu nhập.
 *
 * Ba chỗ lệch, và chỗ đầu tiên là lỗi lúc chạy chứ không phải lúc build nếu
 * dùng nhầm: `GoodsIssueEntity` **không có `receivedAt`**.
 */
function toMobileFromIssue(
  row: GoodsIssueEntity,
): MobileStockDocumentResponseDto {
  return {
    id: row.id,
    code: row.documentNumber ?? null,
    // `createdAt` chứ KHÔNG `occurredAt`, dù `occurredAt` mới là ngày nghiệp vụ
    // người dùng nhập: handler LỌC và SẮP XẾP theo `createdAt`. Hiện một trường
    // khác trường đang lọc thì sẽ có phiếu ghi ngày tháng 6 nằm trong kỳ tháng
    // 9, và người dùng không có cách nào hiểu vì sao. Trang web cũng hiện
    // `createdAt`. Muốn đổi sang `occurredAt` thì phải đổi cả vế lọc ở handler.
    documentDate: row.createdAt.toISOString(),
    // Thêm một bậc so với phiếu nhập: phiếu điều chuyển (`TRANSFER_OUT`) không
    // có đối tác nào, "đối tượng" của nó là CHI NHÁNH ĐÍCH. Thiếu bậc này thì
    // mọi phiếu điều chuyển hiện trống.
    partyName:
      row.counterparty?.name ??
      row.provider?.name ??
      row.targetBranch?.name ??
      null,
    partyCode: row.provider?.code ?? null,
    amount: row.totalAmount ?? 0,
    status: ISSUE_STATUS_MAP[row.status],
  };
}

/**
 * Chi nhánh mà lượt gọi này thật sự chạy trên đó.
 *
 * `@Actor` giải chi nhánh theo thứ tự **`jwt > header > jwtList`**
 * (`actor-context.decorator.ts`), mà `AuthService.login` luôn nhét
 * `branchId = branchIds[0]` vào token. Hệ quả: header `X-Branch-Id` mà app gửi
 * KHÔNG BAO GIỜ thắng, và người dùng không có cách nào đổi cửa hàng. Đã đo:
 * ba chi nhánh khác nhau trả về cùng một tập chứng từ.
 *
 * Nên cửa hàng đi qua QUERY, và đây là chỗ duy nhất giải nó. Trả về một BẢN SAO
 * của actor thay vì sửa tại chỗ: `ActorContext` được dùng lại ở nhiều nhánh
 * trong cùng một request, và sửa nó là đổi ngầm phạm vi của những nhánh khác.
 *
 * Yêu cầu một chi nhánh ngoài tầm thì **NÉM**, không lặng lẽ lùi về mặc định:
 * lùi im lặng nghĩa là màn hình nói "Chi nhánh Hà Nội" trong khi bày dữ liệu
 * của chi nhánh khác — sai theo kiểu không ai phát hiện ra.
 */
function withBranch(actor: ActorContext, requested?: string): ActorContext {
  if (!requested || requested === actor.branchId) return actor;

  if (!actor.branchIds?.includes(requested)) {
    throw new ForbiddenException(`Access denied for branch: ${requested}`);
  }

  return { ...actor, branchId: requested };
}

/**
 * Phạm vi tra cứu của MỌI lượt đọc chi tiết.
 *
 * `MobileStockDocumentController` KHÔNG gắn `BranchScopeGuard` (khác controller
 * v1), nên lọc chi nhánh là việc của chỗ này. Thiếu nó là mở đường đọc chứng từ
 * của chi nhánh khác chỉ bằng cách đoán một `id`.
 *
 * `branchId` để tuỳ chọn vì `ActorContext` cho phép nó vắng (tài khoản chưa gắn
 * chi nhánh nào); khi vắng thì phép lọc theo tổ chức vẫn còn.
 */
function scopeOf(id: string, actor: ActorContext) {
  return {
    id,
    organizationId: actor.organizationId,
    ...(actor.branchId ? { branchId: actor.branchId } : {}),
  };
}

/**
 * Một câu cho MỌI ca không tìm thấy — kể cả ca "có thật nhưng sai `kind`" và ca
 * "có thật nhưng ở chi nhánh khác".
 *
 * Cố ý không nói rõ vì sao: phân biệt "không tồn tại" với "tồn tại nhưng anh
 * không được xem" là nói cho người hỏi biết một `id` nào đó có thật.
 */
function notFoundMessage(id: string): string {
  return `Không tìm thấy chứng từ ${id}`;
}

/**
 * Cột `numeric` của Postgres về Node dưới dạng CHUỖI (`"1.000"`, `"430000.00"`)
 * — driver `pg` không tự ép, vì `numeric` rộng hơn `double` của JS.
 *
 * Ép một lần ở đây thay vì để mỗi client tự parse. `null`/`undefined` cho `0`:
 * `unitPrice` và `lineTotal` có `default: 0` ở DB nên chỉ vắng khi dòng hàng
 * được dựng bằng một đường không đi qua entity.
 *
 * Khai kiểu vào là `unknown` chứ không `string`: `GoodsIssueLineEntity.quantity`
 * khai TS là `number` trong khi runtime vẫn là chuỗi — tin vào khai báo đó là
 * chỗ hỏng lặng lẽ.
 */
function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Thành tiền của phiếu, cộng từ các dòng.
 *
 * `GET /:id` của backend KHÔNG có `totalAmount` — chỉ đường tìm kiếm v2 mới
 * cộng sẵn. Trang web cũng tự cộng ở đúng chỗ này (`orderTotal`), và cũng cộng
 * `lineTotal` chứ không nhân lại `quantity × unitPrice`.
 */
function toDetailAmount(lines: MobileStockDocumentLineDto[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

/**
 * Dòng hàng của phiếu NHẬP.
 *
 * Đơn vị tính lấy `uomCode` của chính dòng hàng — bản CHỤP tại thời điểm nhập.
 * Đổi đơn vị của hàng hoá về sau không được làm đổi phiếu đã lập, nên `item.unit`
 * chỉ là đường lùi khi cột kia trống.
 */
function toReceiptLine(line: GoodsReceiptLineEntity): MobileStockDocumentLineDto {
  return {
    itemId: line.item?.id ?? '',
    name: line.item?.name ?? '',
    sku: line.item?.code ?? '',
    unit: line.uomCode || (line.item?.unit ?? ''),
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    lineTotal: toNumber(line.lineTotal),
  };
}

/**
 * Dòng hàng của phiếu XUẤT.
 *
 * KHÁC bản phiếu nhập ở đơn vị tính: `goods_issue_lines` **không có cột uom**,
 * nên chỉ còn `item.unit` — tức giá trị HIỆN TẠI của hàng hoá, không phải bản
 * chụp lúc xuất. Đây là hạn chế của lược đồ backend, không phải lựa chọn ở đây.
 */
function toIssueLine(line: GoodsIssueLineEntity): MobileStockDocumentLineDto {
  return {
    itemId: line.item?.id ?? '',
    name: line.item?.name ?? '',
    sku: line.item?.code ?? '',
    unit: line.item?.unit ?? '',
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    lineTotal: toNumber(line.lineTotal),
  };
}

/**
 * Chép TƯỜNG MINH, cùng lý do đã ghi ở [toMobileFromReceipt]: đây là thứ duy
 * nhất chặn `provider` (có `maxDebt`, số tài khoản, CMND) và `item` (~30 trường
 * gồm cả giá vốn) rò ra ngoài, và nó phải giữ được tính chất đó kể cả khi ai đó
 * thêm cột vào entity.
 */
function toDetailFromReceipt(
  row: GoodsReceiptEntity,
): MobileStockDocumentDetailDto {
  const lines = (row.lines ?? []).map(toReceiptLine);

  return {
    id: row.id,
    code: row.documentNumber ?? null,
    documentDate: row.receivedAt.toISOString(),
    partyName: row.counterparty?.name ?? row.provider?.name ?? null,
    // Mã của CHÍNH đối tượng trước, rồi mới lùi về `provider`. Chỉ đọc
    // `provider.code` thì đối tượng là nhân viên sẽ luôn ra `null` dù có mã.
    partyCode: row.counterparty?.code ?? row.provider?.code ?? null,
    counterpartyKind: row.counterpartyKind ?? null,
    counterpartyId: row.counterpartyId ?? null,
    purchasingEmployee: row.purchasingEmployee ?? null,
    paymentMethod: row.paymentMethod ?? null,
    amount: toDetailAmount(lines),
    status: RECEIPT_STATUS_MAP[row.status],
    // `?? ''` chứ không `null`: app hiển thị hai dòng này như hai dòng thông tin
    // luôn có mặt, chỉ là chưa ai điền.
    deliverer: row.deliveredBy ?? '',
    note: row.description ?? '',
    lines,
  };
}

/**
 * Bản riêng cho phiếu XUẤT. Ba chỗ lệch so với phiếu nhập, và cả ba đều là lỗi
 * lúc CHẠY nếu dùng nhầm mapper kia: không có `receivedAt`, không có
 * `description`, không có `deliveredBy`.
 */
function toDetailFromIssue(row: GoodsIssueEntity): MobileStockDocumentDetailDto {
  const lines = (row.lines ?? []).map(toIssueLine);

  return {
    id: row.id,
    code: row.documentNumber ?? null,
    // `occurredAt` — ngày nghiệp vụ người dùng nhập — chứ KHÔNG `createdAt` như
    // màn danh sách. Lệch có chủ ý: danh sách LỌC và SẮP theo `createdAt`, nên
    // hiện một trường khác trường đang lọc sẽ đẻ ra ca "phiếu ghi tháng 6 nằm
    // trong kỳ tháng 9". Màn chi tiết không lọc gì nên hiện được ngày thật, và
    // đó cũng là thứ dialog của trang web hiển thị.
    documentDate: (row.occurredAt ?? row.createdAt).toISOString(),
    // Ba bậc: phiếu điều chuyển không có đối tác nào, "đối tượng" của nó là CHI
    // NHÁNH ĐÍCH.
    partyName:
      row.counterparty?.name ??
      row.provider?.name ??
      row.targetBranch?.name ??
      null,
    partyCode: row.counterparty?.code ?? row.provider?.code ?? null,
    counterpartyKind: row.counterpartyKind ?? null,
    counterpartyId: row.counterpartyId ?? null,
    // Phiếu XUẤT không có hai khái niệm này — không phải "chưa map".
    purchasingEmployee: null,
    paymentMethod: null,
    amount: toDetailAmount(lines),
    status: ISSUE_STATUS_MAP[row.status],
    deliverer: row.deliverer ?? '',
    note: row.notes ?? '',
    lines,
  };
}
