import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoodsReceiptPurpose } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { GoodsIssueService } from '../../inventory/goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../../inventory/goods-receipt/goods-receipt.service';
import { ItemEntity } from '../../inventory/location/item.entity';
import { MobileStockDocumentKind } from '../dto/mobile-stock-document-list.query.dto';
import { MobileStockDocumentWriteService } from './mobile-stock-document-write.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1', 'branch-2'],
  roles: [],
};

const ITEM_ID = 'a3000000-0000-4000-8000-000000000001';

const baseDto = {
  branchId: 'branch-1',
  documentDate: '2026-09-03T10:00:00.000Z',
  lines: [{ itemId: ITEM_ID, quantity: 2, unitPrice: 350000 }],
};

/**
 * Service này chỉ làm ba việc, và cả ba đều kiểm được mà không cần Postgres:
 * bổ sung ba trường app không gửi, đổi tên trường giữa hai họ chứng từ, và
 * kiểm quyền theo `kind`. Ràng buộc nghiệp vụ thì nằm ở hai service được uỷ
 * quyền — chép lại ở đây là test cùng một đoạn code hai lần.
 */
describe('MobileStockDocumentWriteService', () => {
  let service: MobileStockDocumentWriteService;
  let execute: jest.Mock;
  let hasAnyPermission: jest.Mock;
  let receiptCreate: jest.Mock;
  let receiptUpdate: jest.Mock;
  let issueCreate: jest.Mock;
  let issueUpdate: jest.Mock;
  let findItems: jest.Mock;

  beforeEach(async () => {
    hasAnyPermission = jest.fn().mockResolvedValue(true);
    receiptCreate = jest.fn().mockResolvedValue({ id: 'gr-1' });
    receiptUpdate = jest.fn().mockResolvedValue({ id: 'gr-1' });
    issueCreate = jest.fn().mockResolvedValue({ id: 'gi-1' });
    issueUpdate = jest.fn().mockResolvedValue({ id: 'gi-1' });
    findItems = jest
      .fn()
      .mockResolvedValue([{ id: ITEM_ID, unit: 'đôi' } as ItemEntity]);
    execute = jest.fn().mockResolvedValue({
      data: [{ itemId: ITEM_ID, storageId: 'st-1', locationId: 'loc-1' }],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileStockDocumentWriteService,
        { provide: QueryBus, useValue: { execute } },
        { provide: RbacService, useValue: { hasAnyPermission } },
        {
          provide: GoodsReceiptService,
          useValue: { createAndPost: receiptCreate, update: receiptUpdate },
        },
        {
          provide: GoodsIssueService,
          useValue: { createAndPost: issueCreate, update: issueUpdate },
        },
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { find: findItems },
        },
      ],
    }).compile();

    service = module.get(MobileStockDocumentWriteService);
  });

  const create = (kind: MobileStockDocumentKind, extra: object = {}) =>
    service.create({ kind, ...baseDto, ...extra } as never, actor);

  const sentReceipt = () => receiptCreate.mock.calls[0][0];
  const sentIssue = () => issueCreate.mock.calls[0][0];

  describe('bổ sung ba trường app KHÔNG gửi', () => {
    it('`locationId` mỗi dòng lấy từ resolve-locations', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(sentReceipt().lines[0].locationId).toBe('loc-1');
      // Đầu phiếu neo vào vị trí của dòng đầu — cột đó NOT NULL nhưng vị trí
      // thật nằm ở từng dòng.
      expect(sentReceipt().locationId).toBe('loc-1');
    });

    it('`uomCode` lấy từ đơn vị tính của HÀNG HOÁ', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(sentReceipt().lines[0].uomCode).toBe('đôi');
    });

    it('hàng hoá bỏ trống đơn vị thì lùi về "Cái", không để rỗng', async () => {
      findItems.mockResolvedValue([{ id: ITEM_ID, unit: '' } as ItemEntity]);

      await create(MobileStockDocumentKind.GOODS_RECEIPT);

      // Cột `uom_code` là NOT NULL; đây đúng là giá trị dự phòng của trang web.
      expect(sentReceipt().lines[0].uomCode).toBe('Cái');
    });

    it('`purpose` ép theo `kind`, KHÔNG lấy từ client', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT);
      expect(sentReceipt().purpose).toBe(GoodsReceiptPurpose.PURCHASE);

      receiptCreate.mockClear();
      await create(MobileStockDocumentKind.STOCK_IN);
      // `OTHER` chứ không `TRANSFER_IN`: điều chuyển đi endpoint khác hẳn.
      expect(sentReceipt().purpose).toBe(GoodsReceiptPurpose.OTHER);
    });

    it('client gửi kèm `purpose` cũng KHÔNG được dùng', async () => {
      await create(MobileStockDocumentKind.STOCK_IN, {
        purpose: GoodsReceiptPurpose.PURCHASE,
      } as never);

      expect(sentReceipt().purpose).toBe(GoodsReceiptPurpose.OTHER);
    });
  });

  describe('đổi tên trường giữa hai họ chứng từ', () => {
    it('phiếu NHẬP: receivedAt / description / deliveredBy', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT, {
        deliverer: 'TÙNG',
        note: 'Hàng NCC',
      });

      const sent = sentReceipt();
      expect(sent.receivedAt).toBe('2026-09-03T10:00:00.000Z');
      expect(sent.description).toBe('Hàng NCC');
      expect(sent.deliveredBy).toBe('TÙNG');
      // Dùng nhầm tên của họ kia là một trường bị bỏ IM LẶNG, không phải lỗi.
      expect(sent.occurredAt).toBeUndefined();
      expect(sent.notes).toBeUndefined();
    });

    it('phiếu XUẤT: occurredAt / notes / deliverer', async () => {
      await create(MobileStockDocumentKind.STOCK_OUT, {
        deliverer: 'AN',
        note: 'Xuất huỷ',
      });

      const sent = sentIssue();
      expect(sent.occurredAt).toBe('2026-09-03T10:00:00.000Z');
      expect(sent.notes).toBe('Xuất huỷ');
      expect(sent.deliverer).toBe('AN');
      expect(sent.receivedAt).toBeUndefined();
      expect(sent.description).toBeUndefined();
    });

    it('phiếu XUẤT đi GoodsIssueService, phiếu NHẬP đi GoodsReceiptService', async () => {
      await create(MobileStockDocumentKind.STOCK_OUT);

      expect(issueCreate).toHaveBeenCalledTimes(1);
      expect(receiptCreate).not.toHaveBeenCalled();
    });
  });

  describe('kiểm quyền', () => {
    it('cửa hàng ngoài tầm bị từ chối TRƯỚC khi ghi gì', async () => {
      await expect(
        create(MobileStockDocumentKind.GOODS_RECEIPT, { branchId: 'branch-9' }),
      ).rejects.toThrow(ForbiddenException);

      expect(receiptCreate).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('thiếu quyền thao tác thì từ chối, và không chạm database', async () => {
      hasAnyPermission.mockResolvedValue(false);

      await expect(
        create(MobileStockDocumentKind.GOODS_RECEIPT),
      ).rejects.toThrow(ForbiddenException);

      expect(findItems).not.toHaveBeenCalled();
    });

    it('mỗi `kind` đòi đúng quyền của nó', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.post',
      ]);

      hasAnyPermission.mockClear();
      await create(MobileStockDocumentKind.STOCK_OUT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.create',
      ]);
    });

    it('nhập kho và xuất kho đòi THÊM quyền theo mục đích', async () => {
      await create(MobileStockDocumentKind.STOCK_IN);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.other-receipt',
      ]);

      hasAnyPermission.mockClear();
      await create(MobileStockDocumentKind.STOCK_OUT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.other-issue',
      ]);
    });

    it('nhập HÀNG không đòi quyền phụ nào', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT);

      expect(hasAnyPermission).toHaveBeenCalledTimes(1);
    });

    it('actor xuống tầng dưới mang CỬA HÀNG của phiếu, không phải của token', async () => {
      await create(MobileStockDocumentKind.GOODS_RECEIPT, {
        branchId: 'branch-2',
      });

      expect(receiptCreate.mock.calls[0][1].branchId).toBe('branch-2');
      // Bản sao, không sửa tại chỗ — actor gốc còn dùng ở nhánh khác.
      expect(actor.branchId).toBe('branch-1');
    });
  });

  describe('dòng hàng', () => {
    it('mặt hàng lạ bị chặn ở đây, không để xuống thành lỗi khoá ngoại', async () => {
      findItems.mockResolvedValue([]);

      await expect(
        create(MobileStockDocumentKind.GOODS_RECEIPT),
      ).rejects.toThrow(BadRequestException);

      expect(receiptCreate).not.toHaveBeenCalled();
    });

    it('cửa hàng chưa có vị trí lưu thì báo rõ, không gửi locationId rỗng', async () => {
      execute.mockResolvedValue({
        data: [{ itemId: ITEM_ID, storageId: null, locationId: null }],
      });

      await expect(
        create(MobileStockDocumentKind.GOODS_RECEIPT),
      ).rejects.toThrow(BadRequestException);
    });

    it('hỏi vị trí đúng MỘT lượt cho cả phiếu, không mỗi dòng một lượt', async () => {
      await service.create(
        {
          kind: MobileStockDocumentKind.GOODS_RECEIPT,
          ...baseDto,
          lines: [
            { itemId: ITEM_ID, quantity: 1, unitPrice: 1 },
            { itemId: ITEM_ID, quantity: 2, unitPrice: 2 },
          ],
        } as never,
        actor,
      );

      expect(execute).toHaveBeenCalledTimes(1);
      // Trùng `itemId` gộp lại trước khi hỏi.
      expect(execute.mock.calls[0][0].dto.variantItemIds).toEqual([ITEM_ID]);
    });
  });

  describe('sửa', () => {
    const update = (kind: MobileStockDocumentKind) =>
      service.update(
        {
          id: 'doc-1',
          kind,
          branchId: 'branch-1',
          dto: {
            documentDate: '2026-09-03T10:00:00.000Z',
            lines: baseDto.lines,
          } as never,
        },
        actor,
      );

    it('phiếu XUẤT sửa KHÔNG mang `purpose`', async () => {
      await update(MobileStockDocumentKind.STOCK_OUT);

      // DTO sửa của phiếu xuất không nhận `purpose`, và `forbidNonWhitelisted`
      // sẽ từ chối CẢ request nếu ta gửi kèm.
      expect(issueUpdate.mock.calls[0][1].purpose).toBeUndefined();
    });

    it('sửa đòi quyền KHÁC quyền tạo', async () => {
      await update(MobileStockDocumentKind.GOODS_RECEIPT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'goods_receipt.write',
      ]);

      hasAnyPermission.mockClear();
      await update(MobileStockDocumentKind.STOCK_OUT);
      expect(hasAnyPermission).toHaveBeenCalledWith('admin-1', 'org-1', [
        'inventory.goods-issue.update',
      ]);
    });

    it('sửa cũng bổ sung `locationId` và `uomCode`', async () => {
      await update(MobileStockDocumentKind.GOODS_RECEIPT);

      const sent = receiptUpdate.mock.calls[0][1];
      expect(sent.lines[0].locationId).toBe('loc-1');
      expect(sent.lines[0].uomCode).toBe('đôi');
    });
  });
});
