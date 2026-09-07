import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  GoodsIssueStatus,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
} from '@erp/shared-interfaces';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { GoodsIssueEntity } from '../../inventory/goods-issue/goods-issue.entity';
import { SearchGoodsIssuesV2Query } from '../../inventory/goods-issue/queries/search-goods-issues-v2.query';
import {
  GoodsReceiptEntity,
  GoodsReceiptPaymentMethod,
} from '../../inventory/goods-receipt/goods-receipt.entity';
import { SearchGoodsReceiptsV2Query } from '../../inventory/goods-receipt/queries/search-goods-receipts-v2.query';
import { MobileStockDocumentKind } from '../dto/mobile-stock-document-list.query.dto';
import { MobileStockDocumentService } from './mobile-stock-document.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  // Ba chi nhánh được gán, và `branch-1` là cái trong token. `branch-9` cố ý
  // đứng NGOÀI danh sách để kiểm đường từ chối.
  branchIds: ['branch-1', 'branch-2', 'branch-3'],
  roles: [],
};

/** Một dòng phiếu NHẬP như handler v2 trả về — CỐ Ý mang cả field không được rò. */
function receipt(overrides: Partial<GoodsReceiptEntity> = {}): GoodsReceiptEntity {
  return {
    id: 'gr-1',
    documentNumber: 'NK000004',
    receivedAt: new Date('2026-09-03T01:33:00.000Z'),
    status: GoodsReceiptStatus.POSTED,
    totalAmount: 3010000,
    provider: {
      id: 'p-1',
      code: 'NCC-BITIS',
      name: 'Công ty Biti’s',
      maxDebt: 50000000,
      bankAccountNumber: '0123456789',
    },
    location: { id: 'loc-1', name: 'Mặc định' },
    lines: [{ id: 'l-1', quantity: '1.000' }],
    journalEntryId: 'je-1',
    ...overrides,
  } as unknown as GoodsReceiptEntity;
}

/** Một dòng phiếu XUẤT. Chú ý: KHÔNG có `receivedAt`. */
function issue(overrides: Partial<GoodsIssueEntity> = {}): GoodsIssueEntity {
  return {
    id: 'gi-1',
    documentNumber: 'PX000001',
    createdAt: new Date('2026-09-05T02:00:00.000Z'),
    occurredAt: new Date('2026-06-08T14:41:00.000Z'),
    status: GoodsIssueStatus.POSTED,
    totalAmount: 350000,
    provider: { id: 'p-1', code: 'NCC-A', name: 'NCC A', maxDebt: 1 },
    targetBranch: { id: 'b-2', name: 'Chi nhánh Cà Mau' },
    reasonRef: { id: 'r-1', name: 'Xuất khác' },
    location: { id: 'loc-1', name: 'Mặc định' },
    transferImported: false,
    ...overrides,
  } as unknown as GoodsIssueEntity;
}

/**
 * Phiếu NHẬP như đường CHI TIẾT trả về — khác [receipt] ở hai chỗ có thật:
 * không có `totalAmount` (chỉ đường tìm kiếm mới cộng sẵn), và `lines` mang đủ
 * dữ liệu dòng hàng kèm `item`.
 *
 * `lineTotal` cố ý KHÁC `quantity × unitPrice` (2 × 100 = 200, nhưng ghi 150):
 * chỉ dữ liệu lệch như vậy mới phân biệt được mapper đọc trường của backend hay
 * tự nhân lại.
 */
function receiptDetail(
  overrides: Partial<GoodsReceiptEntity> = {},
): GoodsReceiptEntity {
  return {
    id: 'gr-1',
    documentNumber: 'NK000004',
    receivedAt: new Date('2026-09-03T01:33:00.000Z'),
    status: GoodsReceiptStatus.POSTED,
    purpose: GoodsReceiptPurpose.PURCHASE,
    deliveredBy: 'TÙNG',
    description: 'Hàng NCC Biti’s',
    provider: {
      id: 'p-1',
      code: 'NCC-BITIS',
      name: 'Công ty Biti’s',
      maxDebt: 50000000,
      bankAccountNumber: '0123456789',
      idCardNumber: '079000000001',
    },
    lines: [
      {
        id: 'l-1',
        uomCode: 'Đôi',
        quantity: '2.000',
        unitPrice: '100.00',
        lineTotal: '150.00',
        item: {
          id: 'i-1',
          code: 'JUNO-38',
          name: 'Juno Mary Jane đen size 38',
          unit: 'Chiếc',
          purchasePrice: '90.00',
          sellingPrice: '250.00',
        },
      },
    ],
    ...overrides,
  } as unknown as GoodsReceiptEntity;
}

/** Phiếu XUẤT như đường CHI TIẾT trả về. Chú ý: KHÔNG có `uomCode` ở dòng hàng. */
function issueDetail(
  overrides: Partial<GoodsIssueEntity> = {},
): GoodsIssueEntity {
  return {
    id: 'gi-1',
    documentNumber: 'PX000001',
    createdAt: new Date('2026-09-05T02:00:00.000Z'),
    occurredAt: new Date('2026-06-08T14:41:00.000Z'),
    status: GoodsIssueStatus.POSTED,
    deliverer: 'Nguyễn Văn A',
    notes: 'Xuất điều chuyển',
    provider: null,
    targetBranch: { id: 'b-2', name: 'Chi nhánh Cà Mau' },
    transferImported: false,
    lines: [
      {
        id: 'l-1',
        quantity: '0.500',
        unitPrice: '400000.00',
        lineTotal: '200000.00',
        item: { id: 'i-1', code: 'GAO-ST25', name: 'Gạo ST25', unit: 'Kg' },
      },
    ],
    ...overrides,
  } as unknown as GoodsIssueEntity;
}

function page<T>(rows: T[], totalAmount = 3010000) {
  return { data: rows, total: rows.length, page: 1, limit: 20, totals: { totalAmount } };
}

/**
 * Service chỉ làm ba việc: kiểm quyền theo loại chứng từ, dựng DTO cho đúng
 * handler, và nắn kết quả về hình dạng app đọc. Cả ba kiểm được mà KHÔNG cần
 * Postgres — e2e lo phần còn lại nhưng nó cần database, nên bộ này là lưới duy
 * nhất chạy được ở mọi máy.
 */
describe('MobileStockDocumentService', () => {
  let service: MobileStockDocumentService;
  let execute: jest.Mock;
  let hasAnyPermission: jest.Mock;
  let findReceipt: jest.Mock;
  let findIssue: jest.Mock;
  let managerFind: jest.Mock;

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue(page([receipt()]));
    hasAnyPermission = jest.fn().mockResolvedValue(true);
    findReceipt = jest.fn().mockResolvedValue(receiptDetail());
    findIssue = jest.fn().mockResolvedValue(issueDetail());

    // `manager` là thứ `attachCounterparties` nhận. Trả mảng rỗng cho mọi truy
    // vấn nghĩa là không giải được đối tượng đa hình nào — đúng ca mặc định, và
    // là lý do các kỳ vọng dưới đây lùi về `provider.name`.
    // `manager` là thứ `attachCounterparties` và `attachPurchasingEmployees`
    // nhận. Mặc định trả mảng rỗng cho mọi truy vấn: không giải được đối tượng
    // đa hình nào — đúng ca mặc định, và là lý do các kỳ vọng dưới đây lùi về
    // `provider.name`. Test nào cần giải thật thì lái `managerFind`.
    managerFind = jest.fn().mockResolvedValue([]);
    const manager = { find: managerFind };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileStockDocumentService,
        { provide: QueryBus, useValue: { execute } },
        { provide: RbacService, useValue: { hasAnyPermission } },
        {
          provide: getRepositoryToken(GoodsReceiptEntity),
          useValue: { findOne: findReceipt, manager },
        },
        {
          provide: getRepositoryToken(GoodsIssueEntity),
          useValue: { findOne: findIssue, manager },
        },
      ],
    }).compile();

    service = module.get(MobileStockDocumentService);
  });

  const run = (
    kind: MobileStockDocumentKind,
    query: {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      search?: string;
    } = {},
  ) => service.list({ kind, page: 1, limit: 20, ...query }, actor);

  const sentQuery = () => execute.mock.calls[0][0];
  const sentDto = () => sentQuery().dto;

  describe('phân quyền theo loại chứng từ', () => {
    it('phiếu NHẬP đòi quyền đọc phiếu nhập', async () => {
      await run(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.read',
      ]);
    });

    it('phiếu XUẤT đòi quyền đọc phiếu xuất — KHÔNG phải quyền nhập', async () => {
      // Mock phải trả dòng đúng LOẠI: `list` chạy trọn luồng, và mapper phiếu
      // xuất đọc `createdAt` — thứ mà một dòng phiếu nhập không có.
      execute.mockResolvedValue(page([issue()], 350000));

      await run(MobileStockDocumentKind.STOCK_OUT);

      // Guard của controller coi nhiều key là OR nên nó không chặn được ca này;
      // đây là lớp duy nhất biết `kind` và vì thế là lớp duy nhất đóng được lỗ.
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.read',
      ]);
    });

    it('nhập kho dùng CÙNG quyền với nhập hàng — cùng một bảng', async () => {
      await run(MobileStockDocumentKind.STOCK_IN);

      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.read',
      ]);
    });

    it('thiếu quyền -> ném Forbidden và KHÔNG chạm tới dữ liệu', async () => {
      hasAnyPermission.mockResolvedValue(false);

      await expect(run(MobileStockDocumentKind.STOCK_OUT)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Kiểm quyền phải xảy ra TRƯỚC khi truy vấn, không phải lọc kết quả sau.
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('nhập hàng vs nhập kho — cùng bảng, khác phép lọc', () => {
    it('nhập hàng lọc purposes=[PURCHASE]', async () => {
      await run(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(sentQuery()).toBeInstanceOf(SearchGoodsReceiptsV2Query);
      expect(sentDto().purposes).toEqual([GoodsReceiptPurpose.PURCHASE]);
      expect(sentDto().excludePurposes).toBeUndefined();
    });

    it('nhập kho LOẠI TRỪ purchase, không liệt kê từng purpose', async () => {
      await run(MobileStockDocumentKind.STOCK_IN);

      expect(sentQuery()).toBeInstanceOf(SearchGoodsReceiptsV2Query);
      // Liệt kê `[OTHER, TRANSFER_IN, STOCK_TAKE]` thì backend thêm một purpose
      // mới là nó lặng lẽ vắng mặt khỏi màn Nhập kho.
      expect(sentDto().excludePurposes).toEqual([GoodsReceiptPurpose.PURCHASE]);
      expect(sentDto().purposes).toBeUndefined();
    });
  });

  describe('xuất kho — bảng khác, DTO khác', () => {
    beforeEach(() => execute.mockResolvedValue(page([issue()], 350000)));

    it('đi qua query của phiếu XUẤT', async () => {
      await run(MobileStockDocumentKind.STOCK_OUT);

      expect(sentQuery()).toBeInstanceOf(SearchGoodsIssuesV2Query);
    });

    it('KHÔNG gửi purposes — DTO bên xuất không có khoá đó', async () => {
      await run(MobileStockDocumentKind.STOCK_OUT);

      // `forbidNonWhitelisted` biến một khoá lạ thành 400 cho cả lượt gọi.
      expect('purposes' in sentDto()).toBe(false);
      expect('excludePurposes' in sentDto()).toBe(false);
    });

    it('ngày lấy `createdAt` — entity KHÔNG có `receivedAt`', async () => {
      const result = await run(MobileStockDocumentKind.STOCK_OUT);

      // Và cố ý không lấy `occurredAt` dù nó mới là ngày nghiệp vụ: handler lọc
      // và sắp theo `createdAt`, hiện một trường khác trường đang lọc thì có
      // phiếu ghi tháng 6 nằm trong kỳ tháng 9.
      expect(result.data[0].documentDate).toBe('2026-09-05T02:00:00.000Z');
    });

    it('phiếu điều chuyển lùi về CHI NHÁNH ĐÍCH làm đối tượng', async () => {
      // `undefined` chứ không `null`: quan hệ eager của TypeORM khai kiểu
      // `T | undefined`, và ca thật là hai quan hệ đó KHÔNG được join ra.
      execute.mockResolvedValue(
        page([issue({ counterparty: null, provider: undefined })], 0),
      );

      // Thiếu bậc này thì mọi phiếu điều chuyển hiện trống.
      expect((await run(MobileStockDocumentKind.STOCK_OUT)).data[0].partyName).toBe(
        'Chi nhánh Cà Mau',
      );
    });

    it('APPROVED gộp vào `draft` — app chỉ có ba nhãn', async () => {
      for (const [status, expected] of [
        [GoodsIssueStatus.DRAFT, 'draft'],
        [GoodsIssueStatus.APPROVED, 'draft'],
        [GoodsIssueStatus.POSTED, 'posted'],
        [GoodsIssueStatus.CANCELLED, 'cancelled'],
      ] as const) {
        execute.mockResolvedValue(page([issue({ status })], 0));

        expect((await run(MobileStockDocumentKind.STOCK_OUT)).data[0].status).toBe(
          expected,
        );
      }
    });

    it('một dòng chỉ còn BẢY trường — không rò công nợ hay cờ nội bộ', async () => {
      const result = await run(MobileStockDocumentKind.STOCK_OUT);

      expect(Object.keys(result.data[0]).sort()).toEqual([
        'amount', 'code', 'documentDate', 'id', 'partyCode', 'partyName', 'status',
      ]);
      expect(result.data[0]).not.toHaveProperty('provider');
      expect(result.data[0]).not.toHaveProperty('targetBranch');
      expect(result.data[0]).not.toHaveProperty('transferImported');
    });
  });

  describe('phần chung của mọi loại', () => {
    it('có lọc kỳ thì dựng khoá `date`, không lọc thì BỎ HẲN', async () => {
      await run(MobileStockDocumentKind.STOCK_IN, {
        from: '2026-09-01',
        to: '2026-09-30',
      });
      expect(sentDto().date).toEqual({ from: '2026-09-01', to: '2026-09-30' });

      execute.mockClear();
      await run(MobileStockDocumentKind.STOCK_IN);
      // `{}` rỗng vẫn đi qua `applyDateRange` và thêm một WHERE vô nghĩa.
      expect('date' in sentDto()).toBe(false);
    });

    it('chuỗi tìm kiếm đi vào MỘT khoá `search`, không tách đôi', async () => {
      for (const kind of [
        MobileStockDocumentKind.GOODS_RECEIPT,
        MobileStockDocumentKind.STOCK_IN,
        MobileStockDocumentKind.STOCK_OUT,
      ]) {
        execute.mockClear();
        // Trang RỖNG: ca này chỉ hỏi DTO gửi xuống trông thế nào, mà mock dùng
        // chung của suite trả dòng dạng phiếu NHẬP — đưa nó qua mapper của
        // phiếu xuất thì vỡ vì một lý do chẳng liên quan gì tới tìm kiếm.
        execute.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          totals: { totalAmount: 0 },
        });

        await run(kind, { search: 'NK0001' });

        expect(sentDto().search).toBe('NK0001');

        // Đây là chỗ dễ sai nhất và nó KHÔNG ném lỗi khi sai: `FilterBuilder`
        // nối mọi mệnh đề bằng AND, nên nhét cùng chuỗi vào `documentNumber`
        // và `party` là hỏi phần GIAO ("số phiếu chứa X VÀ tên đối tượng chứa
        // X") — gần như luôn rỗng, và đọc ra thì giống hệt "chưa có dữ liệu".
        expect('documentNumber' in sentDto()).toBe(false);
        expect('party' in sentDto()).toBe(false);
      }
    });

    it('tìm kiếm rỗng hoặc toàn khoảng trắng thì BỎ HẲN khoá', async () => {
      await run(MobileStockDocumentKind.STOCK_IN, { search: '   ' });

      expect('search' in sentDto()).toBe(false);
    });

    it('phân trang đi thẳng vào DTO', async () => {
      await run(MobileStockDocumentKind.STOCK_IN, { page: 3, limit: 5 });

      expect(sentDto().page).toBe(3);
      expect(sentDto().limit).toBe(5);
    });

    it('envelope giữ nguyên, `summary` là tổng TOÀN KỲ', async () => {
      const result = await run(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.summary).toEqual({ totalAmount: 3010000 });
    });

    it('phiếu nhập vẫn nắn đúng và vẫn không rò gì', async () => {
      const result = await run(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(result.data[0]).toEqual({
        id: 'gr-1',
        code: 'NK000004',
        documentDate: '2026-09-03T01:33:00.000Z',
        partyName: 'Công ty Biti’s',
        partyCode: 'NCC-BITIS',
        amount: 3010000,
        status: 'posted',
      });
    });

    it('phiếu chưa ghi sổ thì `code` là NULL ở CẢ HAI loại', async () => {
      execute.mockResolvedValue(page([receipt({ documentNumber: undefined })]));
      expect((await run(MobileStockDocumentKind.STOCK_IN)).data[0].code).toBeNull();

      execute.mockClear();
      execute.mockResolvedValue(page([issue({ documentNumber: undefined })], 0));
      expect((await run(MobileStockDocumentKind.STOCK_OUT)).data[0].code).toBeNull();
    });
  });

  describe('getById — chi tiết một chứng từ', () => {
    const detail = (kind: MobileStockDocumentKind, id = 'gr-1') =>
      service.getById({ id, kind }, actor);

    it('kiểm quyền theo `kind` TRƯỚC khi chạm database', async () => {
      hasAnyPermission.mockResolvedValue(false);

      await expect(detail(MobileStockDocumentKind.STOCK_OUT)).rejects.toThrow(
        ForbiddenException,
      );

      // Vế thứ hai mới là vế đáng giá: hỏi database rồi mới từ chối nghĩa là
      // một người không có quyền vẫn làm server chạy truy vấn cho mình.
      expect(findIssue).not.toHaveBeenCalled();
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.read',
      ]);
    });

    it('phiếu NHẬP đòi quyền nhập, phiếu XUẤT đòi quyền xuất', async () => {
      await detail(MobileStockDocumentKind.GOODS_RECEIPT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.read',
      ]);

      hasAnyPermission.mockClear();
      await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.read',
      ]);
    });

    it('lọc theo TỔ CHỨC và CHI NHÁNH của người gọi', async () => {
      await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      // Controller mobile KHÔNG có `BranchScopeGuard`, nên nếu mệnh đề này rơi
      // ra thì đoán một `id` là đọc được chứng từ của chi nhánh khác.
      expect(findReceipt.mock.calls[0][0].where).toEqual({
        id: 'gr-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      });
    });

    it('không tìm thấy thì ném NotFound', async () => {
      findReceipt.mockResolvedValue(null);

      await expect(detail(MobileStockDocumentKind.GOODS_RECEIPT)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('màn Nhập kho TỪ CHỐI một phiếu mua hàng, và ngược lại', async () => {
      // Hai màn dùng CHUNG bảng `goods_receipts`; thiếu phép kiểm `purpose` thì
      // `/stock/stock-in/detail/<id phiếu mua>` mở được phiếu mua và hiển thị nó
      // dưới tiêu đề "Nhập kho".
      await expect(detail(MobileStockDocumentKind.STOCK_IN)).rejects.toThrow(
        NotFoundException,
      );

      findReceipt.mockResolvedValue(
        receiptDetail({ purpose: GoodsReceiptPurpose.TRANSFER_IN }),
      );
      await expect(
        detail(MobileStockDocumentKind.GOODS_RECEIPT),
      ).rejects.toThrow(NotFoundException);

      // Và cặp ĐÚNG thì qua được — nếu không, hai dòng trên chỉ đang chứng minh
      // là mọi thứ đều bị từ chối.
      await expect(detail(MobileStockDocumentKind.STOCK_IN)).resolves.toEqual(
        expect.objectContaining({ id: 'gr-1' }),
      );
    });

    it('phiếu nhập: đúng 14 trường, dòng hàng đúng 7 — không rò gì thêm', async () => {
      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(Object.keys(result).sort()).toEqual([
        'amount',
        'code',
        'counterpartyId',
        'counterpartyKind',
        'deliverer',
        'documentDate',
        'id',
        'lines',
        'note',
        'partyCode',
        'partyName',
        'paymentMethod',
        'purchasingEmployee',
        'status',
      ]);
      expect(Object.keys(result.lines[0]).sort()).toEqual([
        'itemId',
        'lineTotal',
        'name',
        'quantity',
        'sku',
        'unit',
        'unitPrice',
      ]);

      // Ba thứ đắt nhất nếu lọt: công nợ và số tài khoản của nhà cung cấp, giá
      // vốn của hàng hoá.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('maxDebt');
      expect(serialized).not.toContain('bankAccountNumber');
      expect(serialized).not.toContain('purchasePrice');
    });

    it('mọi dòng hàng mang itemId — thứ màn SỬA gửi lại', async () => {
      // Thiếu nó thì mọi dòng đọc về đều `null` ở phía app, và người dùng bị
      // chặn bằng "cần chọn lại hàng hoá" khi chỉ muốn đổi cái ngày.
      const receipt = await detail(MobileStockDocumentKind.GOODS_RECEIPT);
      expect(receipt.lines[0].itemId).toBe('i-1');

      findIssue.mockResolvedValue(issueDetail());
      const issue = await detail(MobileStockDocumentKind.STOCK_OUT);
      expect(issue.lines[0].itemId).toBe('i-1');
    });

    it('phiếu nhập trả đủ ĐỊNH DANH đối tượng, nhân viên mua và phương thức', async () => {
      findReceipt.mockResolvedValue(
        receiptDetail({
          counterpartyKind: DocCounterpartyKind.SUPPLIER,
          counterpartyId: 'p-1',
          purchasingEmployeeId: 'u-9',
          paymentMethod: GoodsReceiptPaymentMethod.CREDIT,
        } as Partial<GoodsReceiptEntity>),
      );
      // Hai lượt tra, đúng thứ tự service gọi: đối tượng trước, nhân viên mua
      // sau. Đi qua helper THẬT chứ không gán thẳng trường transient — chính
      // helper là thứ ghi đè nó, nên gán tay là test một đường không tồn tại.
      managerFind
        .mockResolvedValueOnce([{ id: 'p-1', code: 'NCC-BITIS', name: 'Công ty Biti’s' }])
        .mockResolvedValueOnce([{ id: 'u-9', firstName: 'Trần', lastName: 'Văn B' }]);

      await expect(
        detail(MobileStockDocumentKind.GOODS_RECEIPT),
      ).resolves.toMatchObject({
        counterpartyKind: 'supplier',
        counterpartyId: 'p-1',
        purchasingEmployee: { id: 'u-9', name: 'Trần Văn B' },
        paymentMethod: 'CREDIT',
      });
    });

    it('phiếu XUẤT: hai khái niệm của phiếu nhập luôn null, không phải quên map', async () => {
      findIssue.mockResolvedValue(issueDetail());

      await expect(detail(MobileStockDocumentKind.STOCK_OUT)).resolves.toMatchObject({
        purchasingEmployee: null,
        paymentMethod: null,
      });
    });

    it('partyCode lấy mã của CHÍNH đối tượng, không chỉ của nhà cung cấp', async () => {
      // Đối tượng là NHÂN VIÊN thì `provider` rỗng; đọc mỗi `provider.code` là
      // mã luôn null dù đối tượng có mã.
      findReceipt.mockResolvedValue(
        receiptDetail({
          provider: undefined,
          counterpartyKind: DocCounterpartyKind.EMPLOYEE,
          counterpartyId: 'u-9',
        } as Partial<GoodsReceiptEntity>),
      );
      // Nhánh nhân viên của `attachCounterparties` tra HAI bảng: user lấy tên,
      // hồ sơ nhân viên lấy mã.
      managerFind
        .mockResolvedValueOnce([{ id: 'u-9', firstName: 'Trần', lastName: 'Văn B' }])
        .mockResolvedValueOnce([{ userId: 'u-9', code: 'NV-009' }]);

      await expect(
        detail(MobileStockDocumentKind.GOODS_RECEIPT),
      ).resolves.toMatchObject({ partyCode: 'NV-009', partyName: 'Trần Văn B' });
    });

    it('phiếu nhập: ngày là receivedAt, người giao và diễn giải đi kèm', async () => {
      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(result).toMatchObject({
        code: 'NK000004',
        documentDate: '2026-09-03T01:33:00.000Z',
        partyName: 'Công ty Biti’s',
        partyCode: 'NCC-BITIS',
        deliverer: 'TÙNG',
        note: 'Hàng NCC Biti’s',
        status: 'posted',
      });
    });

    it('phiếu nhập: đơn vị tính lấy uomCode của DÒNG, không lấy của hàng hoá', async () => {
      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      // `uomCode` là bản chụp lúc nhập ('Đôi'); `item.unit` là giá trị hiện tại
      // ('Chiếc'). Đổi đơn vị của hàng hoá về sau không được làm đổi phiếu cũ.
      expect(result.lines[0].unit).toBe('Đôi');
    });

    it('phiếu xuất: đơn vị tính lấy từ hàng hoá — bảng đó KHÔNG có cột uom', async () => {
      const result = await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');

      expect(result.lines[0].unit).toBe('Kg');
    });

    it('phiếu xuất: ngày là occurredAt, lùi về createdAt khi trống', async () => {
      // KHÁC màn danh sách (dùng `createdAt`) — lệch có chủ ý vì danh sách lọc
      // và sắp theo `createdAt`, còn màn chi tiết không lọc gì.
      const withDate = await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');
      expect(withDate.documentDate).toBe('2026-06-08T14:41:00.000Z');

      findIssue.mockResolvedValue(issueDetail({ occurredAt: null }));
      const without = await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');
      expect(without.documentDate).toBe('2026-09-05T02:00:00.000Z');
    });

    it('phiếu xuất: đối tượng lùi về CHI NHÁNH ĐÍCH khi không có đối tác', async () => {
      const result = await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');

      // Phiếu điều chuyển không có nhà cung cấp nào; thiếu bậc này thì mọi phiếu
      // điều chuyển hiện trống ở ô "Nhà cung cấp".
      expect(result.partyName).toBe('Chi nhánh Cà Mau');
      expect(result.partyCode).toBeNull();
    });

    it('số lượng giữ được PHẦN LẺ, không làm tròn', async () => {
      const result = await detail(MobileStockDocumentKind.STOCK_OUT, 'gi-1');

      // Cột `numeric(18,3)`; hàng bán theo kg tồn tại thật. Làm tròn ở đây là
      // hiện sai số lượng mà không có gì báo.
      expect(result.lines[0].quantity).toBe(0.5);
    });

    it('tiền cộng từ lineTotal của backend, KHÔNG nhân lại số lượng × đơn giá', async () => {
      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      // Dữ liệu mẫu cố ý lệch: 2 × 100 = 200, nhưng backend ghi 150 (có chiết
      // khấu). Trang web cũng ưu tiên `lineTotal` theo đúng thứ tự này.
      expect(result.lines[0].lineTotal).toBe(150);
      expect(result.amount).toBe(150);
    });

    it('chuỗi số của Postgres về đúng KIỂU SỐ', async () => {
      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      // Driver `pg` trả `numeric` thành chuỗi. Để nguyên thì app nhận "150.00"
      // và mọi phép cộng phía client thành nối chuỗi.
      expect(typeof result.lines[0].quantity).toBe('number');
      expect(typeof result.lines[0].unitPrice).toBe('number');
      expect(typeof result.amount).toBe('number');
    });

    it('phiếu không có người giao / diễn giải cho chuỗi RỖNG, không null', async () => {
      findReceipt.mockResolvedValue(
        receiptDetail({ deliveredBy: undefined, description: undefined }),
      );

      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(result.deliverer).toBe('');
      expect(result.note).toBe('');
    });

    it('phiếu chưa ghi sổ trả code null, và phiếu rỗng dòng cho tiền 0', async () => {
      findReceipt.mockResolvedValue(
        receiptDetail({ documentNumber: undefined, lines: [] }),
      );

      const result = await detail(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(result.code).toBeNull();
      expect(result.lines).toEqual([]);
      expect(result.amount).toBe(0);
    });
  });

  describe('chọn cửa hàng qua query `branchId`', () => {
    it('KHÔNG truyền thì giữ nguyên chi nhánh trong token', async () => {
      await run(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(sentQuery().actor.branchId).toBe('branch-1');
    });

    it('truyền chi nhánh hợp lệ thì handler nhận đúng chi nhánh đó', async () => {
      await service.list(
        {
          kind: MobileStockDocumentKind.GOODS_RECEIPT,
          page: 1,
          limit: 20,
          branchId: 'branch-2',
        },
        actor,
      );

      // Hai handler v2 đọc `actor.branchId`; đây là đường DUY NHẤT đổi được
      // cửa hàng, vì header `X-Branch-Id` bị `@Actor` bỏ qua khi token đã có
      // sẵn một `branchId`.
      expect(sentQuery().actor.branchId).toBe('branch-2');
    });

    it('KHÔNG sửa actor gốc — trả bản sao', async () => {
      await service.list(
        {
          kind: MobileStockDocumentKind.GOODS_RECEIPT,
          page: 1,
          limit: 20,
          branchId: 'branch-3',
        },
        actor,
      );

      // `ActorContext` được dùng lại ở nhiều nhánh trong cùng một request; sửa
      // tại chỗ là đổi ngầm phạm vi của những nhánh khác.
      expect(actor.branchId).toBe('branch-1');
    });

    it('chi nhánh ngoài tầm bị TỪ CHỐI, và từ chối TRƯỚC khi truy vấn', async () => {
      await expect(
        service.list(
          {
            kind: MobileStockDocumentKind.GOODS_RECEIPT,
            page: 1,
            limit: 20,
            branchId: 'branch-9',
          },
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Vế thứ hai mới đáng giá: hỏi database rồi mới từ chối nghĩa là một
      // người không có quyền vẫn làm server chạy truy vấn cho mình.
      expect(execute).not.toHaveBeenCalled();
    });

    it('lùi im lặng về chi nhánh mặc định là SAI — phải ném', async () => {
      await expect(
        service.list(
          {
            kind: MobileStockDocumentKind.STOCK_OUT,
            page: 1,
            limit: 20,
            branchId: 'branch-9',
          },
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('đường CHI TIẾT cũng nhận `branchId`, và lọc theo đúng nó', async () => {
      await service.getById(
        {
          id: 'gr-1',
          kind: MobileStockDocumentKind.GOODS_RECEIPT,
          branchId: 'branch-2',
        },
        actor,
      );

      expect(findReceipt.mock.calls[0][0].where).toEqual({
        id: 'gr-1',
        organizationId: 'org-1',
        branchId: 'branch-2',
      });
    });

    it('đường CHI TIẾT từ chối chi nhánh ngoài tầm', async () => {
      await expect(
        service.getById(
          {
            id: 'gr-1',
            kind: MobileStockDocumentKind.GOODS_RECEIPT,
            branchId: 'branch-9',
          },
          actor,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(findReceipt).not.toHaveBeenCalled();
    });
  });
});
