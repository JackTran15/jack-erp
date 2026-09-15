import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ImportableTransferOrderListItem,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TransferOrderService } from '../../inventory/transfer-order/transfer-order.service';
import { MobileTransferOrderService } from './mobile-transfer-order.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  // `branch-9` cố ý đứng NGOÀI danh sách để kiểm đường từ chối.
  branchIds: ['branch-1', 'branch-2'],
  roles: [],
};

/**
 * Một dòng như `listImportable` trả về — CỐ Ý mang cả những field không được rò
 * xuống app (`status`, `importGoodsReceiptId`, `counterpartyName`, và tên kho /
 * mã vị trí ở từng dòng).
 */
function order(
  overrides: Partial<ImportableTransferOrderListItem> = {},
): ImportableTransferOrderListItem {
  return {
    id: 'to-1',
    documentNumber: 'LDC000001',
    requestedDate: '2026-09-03',
    notes: 'Điều chuyển hàng tồn',
    sourceBranchId: 'branch-2',
    sourceBranchName: 'Chi nhánh Cà Mau',
    exportGoodsIssueId: 'gi-1',
    importGoodsReceiptId: null,
    exportGoodsIssueDocumentNumber: 'PX000009',
    counterpartyName: 'NCC A',
    totalAmount: 350000,
    status: TransferOrderStatus.IN_PROGRESS,
    lines: [
      {
        id: 'l-1',
        itemId: 'i-1',
        itemCode: 'GAO-ST25',
        itemName: 'Gạo ST25',
        unit: 'Kg',
        storageName: 'Kho chính',
        locationCode: 'A-01',
        locationName: 'Kệ A1',
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
        notes: null,
      },
    ],
    ...overrides,
  } as unknown as ImportableTransferOrderListItem;
}

/**
 * Service này làm đúng bốn việc, và cả bốn kiểm được mà không cần Postgres:
 * giải chi nhánh, lọc theo cửa hàng nguồn, tìm theo chuỗi, và cắt trang.
 *
 * Vị từ "chờ nhận" thì nằm ở `TransferOrderService` — chép lại kỳ vọng về nó ở
 * đây là test cùng một đoạn code hai lần.
 */
describe('MobileTransferOrderService', () => {
  let service: MobileTransferOrderService;
  let listImportable: jest.Mock;

  beforeEach(async () => {
    listImportable = jest.fn().mockResolvedValue([order()]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileTransferOrderService,
        { provide: TransferOrderService, useValue: { listImportable } },
      ],
    }).compile();

    service = module.get(MobileTransferOrderService);
  });

  const run = (
    query: {
      branchId?: string;
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      sourceBranchId?: string;
      search?: string;
    } = {},
  ) => service.listImportable({ page: 1, limit: 20, ...query }, actor);

  describe('giải chi nhánh', () => {
    it('bỏ trống thì dùng chi nhánh trong token', async () => {
      await run();

      expect(listImportable.mock.calls[0][1].branchId).toBe('branch-1');
    });

    it('đổi được sang chi nhánh khác trong tầm', async () => {
      // `listImportable` đọc `actor.branchId` làm cửa hàng ĐÍCH, nên đây là cách
      // duy nhất hỏi "lệnh nào đang chờ cửa hàng kia".
      await run({ branchId: 'branch-2' });

      expect(listImportable.mock.calls[0][1].branchId).toBe('branch-2');
    });

    it('chi nhánh ngoài tầm thì NÉM, không lặng lẽ lùi về mặc định', async () => {
      // Lùi im lặng nghĩa là màn hình nói một cửa hàng trong khi bày dữ liệu của
      // cửa hàng khác — sai theo kiểu không ai phát hiện ra.
      await expect(run({ branchId: 'branch-9' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(listImportable).not.toHaveBeenCalled();
    });
  });

  describe('khoảng ngày', () => {
    it('chuyển thẳng `from`/`to` xuống vị từ', async () => {
      await run({ from: '2026-09-01', to: '2026-09-30' });

      expect(listImportable.mock.calls[0][0]).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      });
    });
  });

  describe('lọc theo cửa hàng nguồn', () => {
    it('giữ đúng lệnh của cửa hàng đó', async () => {
      listImportable.mockResolvedValue([
        order({ id: 'to-1', sourceBranchId: 'branch-2' }),
        order({ id: 'to-2', sourceBranchId: 'branch-3' }),
      ]);

      const result = await run({ sourceBranchId: 'branch-3' });

      expect(result.data.map((row) => row.id)).toEqual(['to-2']);
      expect(result.total).toBe(1);
    });

    it('bỏ trống thì nhận mọi cửa hàng nguồn', async () => {
      listImportable.mockResolvedValue([
        order({ id: 'to-1', sourceBranchId: 'branch-2' }),
        order({ id: 'to-2', sourceBranchId: 'branch-3' }),
      ]);

      expect((await run()).total).toBe(2);
    });
  });

  describe('tìm theo chuỗi', () => {
    beforeEach(() => {
      listImportable.mockResolvedValue([
        order({ id: 'to-1', exportGoodsIssueDocumentNumber: 'PX000009' }),
        order({
          id: 'to-2',
          documentNumber: 'LDC000777',
          exportGoodsIssueDocumentNumber: null,
          sourceBranchName: 'Chi nhánh Huế',
        }),
      ]);
    });

    it('khớp số phiếu XUẤT', async () => {
      expect((await run({ search: 'px000009' })).data.map((r) => r.id)).toEqual([
        'to-1',
      ]);
    });

    it('khớp cả mã LỆNH — người dùng đọc được cái nào thì gõ cái đó', async () => {
      expect((await run({ search: 'LDC000777' })).data.map((r) => r.id)).toEqual([
        'to-2',
      ]);
    });

    it('khớp tên cửa hàng nguồn', async () => {
      expect((await run({ search: 'huế' })).data.map((r) => r.id)).toEqual(['to-2']);
    });

    it('chuỗi rỗng hoặc toàn khoảng trắng thì KHÔNG lọc gì', async () => {
      expect((await run({ search: '   ' })).total).toBe(2);
    });

    it('có phân biệt DẤU — giới hạn của server, nêu ra để không ai đi dò', async () => {
      expect((await run({ search: 'hue' })).total).toBe(0);
    });
  });

  describe('cắt trang trong bộ nhớ', () => {
    beforeEach(() => {
      listImportable.mockResolvedValue(
        Array.from({ length: 5 }, (_, index) => order({ id: `to-${index}` })),
      );
    });

    it('trang 1 lấy đúng `limit` dòng đầu', async () => {
      const result = await run({ page: 1, limit: 2 });

      expect(result.data.map((r) => r.id)).toEqual(['to-0', 'to-1']);
      expect(result).toMatchObject({ total: 5, page: 1, limit: 2 });
    });

    it('trang 3 lấy đúng phần còn lại', async () => {
      expect((await run({ page: 3, limit: 2 })).data.map((r) => r.id)).toEqual([
        'to-4',
      ]);
    });

    it('trang vượt quá thì rỗng, `total` vẫn là tổng thật', async () => {
      // `total` là thứ thanh cuộn vô tận của app dùng để biết khi nào hết dữ
      // liệu — nó phải là tổng của TẬP LỌC, không phải số dòng của trang.
      const result = await run({ page: 9, limit: 2 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(5);
    });

    it('`total` đếm SAU khi lọc, không phải trước', async () => {
      listImportable.mockResolvedValue([
        order({ id: 'to-1', sourceBranchId: 'branch-2' }),
        order({ id: 'to-2', sourceBranchId: 'branch-3' }),
        order({ id: 'to-3', sourceBranchId: 'branch-3' }),
      ]);

      expect((await run({ sourceBranchId: 'branch-3' })).total).toBe(2);
    });
  });

  describe('nắn hình dạng', () => {
    it('một dòng chỉ còn CHÍN trường — không rò cờ nội bộ', async () => {
      const [row] = (await run()).data;

      expect(Object.keys(row).sort()).toEqual([
        'documentDate',
        'documentNumber',
        'exportDocumentNumber',
        'id',
        'lines',
        'note',
        'sourceBranchId',
        'sourceBranchName',
        'totalAmount',
      ]);
    });

    it('dòng hàng chỉ còn MƯỜI MỘT trường — đúng thứ dòng phiếu cần', async () => {
      const [row] = (await run()).data;

      // Hình dạng DÙNG CHUNG với dòng của chứng từ kho (`name`/`sku`, không
      // phải `itemName`/`itemCode`) — đó là điều kiện để app có một parser duy
      // nhất và thay thẳng dòng của phiếu bằng danh sách này. Bốn trường
      // kho/vị trí có mặt vì hình dạng là dùng chung; GIÁ TRỊ của chúng phải
      // null, xem test ngay dưới.
      expect(Object.keys(row.lines[0]).sort()).toEqual([
        'itemId',
        'lineTotal',
        'locationId',
        'locationName',
        'name',
        'quantity',
        'sku',
        'storageId',
        'storageName',
        'unit',
        'unitPrice',
      ]);
    });

    it('KHÔNG rò `status`, `importGoodsReceiptId`, `counterpartyName`, tên kho', async () => {
      const serialized = JSON.stringify((await run()).data);

      expect(serialized).not.toContain('status');
      expect(serialized).not.toContain('importGoodsReceiptId');
      expect(serialized).not.toContain('counterpartyName');
      expect(serialized).not.toContain('locationCode');
    });

    it('bốn trường kho/vị trí là NULL — kho của lệnh là kho NGUỒN', async () => {
      // Guard này trước đây là `not.toContain('storageName')`, tức canh cái
      // KHOÁ. Từ khi dòng phiếu kho mang bốn trường kho/vị trí thì khoá buộc
      // phải có mặt (một parser, một hình dạng), nên thứ đáng canh là GIÁ TRỊ.
      //
      // Điều phải chặn không đổi: `storageName`/`locationName` mà lệnh điều
      // chuyển mang là kho NGUỒN — nơi chi nhánh kia đã xuất hàng. Chép chúng
      // sang đây là nói với màn Sửa rằng hàng đang nằm ở bin của một cửa hàng
      // khác, và app sẽ gửi lại đúng thứ đó khi lưu.
      const [row] = (await run()).data;

      expect(row.lines[0]).toEqual(
        expect.objectContaining({
          locationId: null,
          locationName: null,
          storageId: null,
          storageName: null,
        }),
      );
    });

    it('`exportDocumentNumber` giữ NULL — app tự lùi về mã lệnh', async () => {
      // Nắn ở app chứ không ở đây: server không biết màn hình muốn hiện gì khi
      // phiếu xuất chưa ghi sổ, còn app thì có một dòng chữ để lùi về.
      listImportable.mockResolvedValue([
        order({ exportGoodsIssueDocumentNumber: null }),
      ]);

      const [row] = (await run()).data;

      expect(row.exportDocumentNumber).toBeNull();
      expect(row.documentNumber).toBe('LDC000001');
    });

    it('số tiền ép về SỐ — driver `pg` trả `numeric` thành chuỗi', async () => {
      listImportable.mockResolvedValue([
        order({
          totalAmount: '350000.00' as unknown as number,
          lines: [
            {
              itemId: 'i-1',
              itemCode: 'X',
              itemName: 'X',
              unit: 'Kg',
              quantity: '2.500',
              unitPrice: '100.00',
              lineTotal: '250.00',
            },
          ] as unknown as ImportableTransferOrderListItem['lines'],
        }),
      ]);

      const [row] = (await run()).data;

      expect(row.totalAmount).toBe(350000);
      expect(row.lines[0].quantity).toBe(2.5);
      expect(row.lines[0].lineTotal).toBe(250);
    });
  });
});
