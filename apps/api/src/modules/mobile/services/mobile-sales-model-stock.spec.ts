import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { PosCatalogProductService } from '../../pos/services/pos-catalog-product.service';
import { MobileSalesItemService } from './mobile-sales-item.service';

/**
 * `GET /mobile/sales-items/models/:productId/stock`.
 *
 * Hai vế, và vế thứ hai mới là lý do đường này tồn tại thay vì cho app gọi thẳng POS:
 *
 * 1. Nó UỶ QUYỀN — không tự tính. Mọi luật khó (kho tồn 0 vẫn liệt kê, kho chính lên đầu,
 *    balance của kho đã ngưng thì bỏ, chi nhánh không ACTIVE thì không tính) nằm ở
 *    `PosCatalogProductService` và chỉ ở đó.
 * 2. Nó THU HẸP — `PosProductDetailDto` còn mang `locations`, `sellableQuantity`,
 *    `mainShowroomQuantity`, `imageUrl`, `purchasePrice`. Không trường nào trong số đó được
 *    lọt ra `/mobile`, đúng ranh giới mà mọi DTO khác ở đây đang giữ.
 *
 * Vế 2 là thứ KHÔNG có gì khác canh: thêm một dòng vào phép map là rò, và `tsc` im lặng.
 */
describe('MobileSalesItemService.getModelStock', () => {
  let service: MobileSalesItemService;
  const getProductDetail = jest.fn();

  const actor = { organizationId: 'org-1', branchId: 'branch-1', userId: 'u-1', roles: [] } as ActorContext;

  const detail = {
    id: 'p-1',
    imageUrl: null,
    variants: [
      {
        itemId: 'i-1',
        code: 'ABA-D-39',
        quantityOnHand: 9,
        sellableQuantity: 7,
        mainShowroomQuantity: 4,
        otherBranchQuantity: 5,
        purchasePrice: 111_000,
        locations: [{ locationId: 'L1', quantity: 9 }],
        storages: [
          { storageId: 'S1', name: 'Kho A', quantity: 9, isMainShowroom: true },
          { storageId: 'S2', name: 'Kho B', quantity: 0, isMainShowroom: false },
        ],
        otherBranches: [
          {
            branchId: 'branch-2',
            name: 'Chi nhánh 2',
            quantity: 5,
            storages: [{ storageId: 'S9', name: 'Kho CN2', quantity: 5, isMainShowroom: false }],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    getProductDetail.mockReset();

    const module = await Test.createTestingModule({
      providers: [
        MobileSalesItemService,
        { provide: getRepositoryToken(ItemEntity), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: PosCatalogProductService, useValue: { getProductDetail } },
      ],
    }).compile();

    service = module.get(MobileSalesItemService);
  });

  it('hỏi service POS bằng chi nhánh của phiên và kind=PRODUCT', async () => {
    getProductDetail.mockResolvedValue(detail);

    await service.getModelStock('p-1', actor);

    // `PRODUCT` tường minh: `id` ở đây luôn là `products.id`. Để service tự dò sang `items`
    // khi không thấy sẽ biến một mã sai thành một kết quả trông như đúng.
    expect(getProductDetail).toHaveBeenCalledWith('branch-1', 'p-1', 'PRODUCT', actor);
  });

  it('giữ đủ ba chiều tồn kho mà màn chi tiết cần', async () => {
    getProductDetail.mockResolvedValue(detail);

    const res = await service.getModelStock('p-1', actor);

    expect(res).toEqual({
      productId: 'p-1',
      variants: [
        {
          itemId: 'i-1',
          quantity: 9,
          storages: [
            // Kho tồn 0 VẪN có mặt — vắng mặt đọc thành "không có kho đó".
            { storageId: 'S1', name: 'Kho A', quantity: 9 },
            { storageId: 'S2', name: 'Kho B', quantity: 0 },
          ],
          otherBranches: [
            {
              branchId: 'branch-2',
              name: 'Chi nhánh 2',
              quantity: 5,
              storages: [{ storageId: 'S9', name: 'Kho CN2', quantity: 5 }],
            },
          ],
        },
      ],
    });
  });

  it('KHÔNG rò trường nào mà /mobile đang cố ý giấu', async () => {
    getProductDetail.mockResolvedValue(detail);

    const res = await service.getModelStock('p-1', actor);
    const flat = JSON.stringify(res);

    for (const leaked of ['purchasePrice', 'locations', 'sellableQuantity', 'mainShowroomQuantity', 'imageUrl']) {
      expect(flat).not.toContain(leaked);
    }
    // `isMainShowroom` cũng bị cắt: app chỉ cần TÊN và SỐ, còn cờ đó là khái niệm của bề mặt kho.
    expect(flat).not.toContain('isMainShowroom');
  });

  it('chưa chọn cửa hàng thì 400, không phải một danh sách rỗng', async () => {
    // Rỗng đọc thành "hết hàng ở mọi kho" — một câu trả lời SAI cho một câu hỏi chưa hỏi được.
    await expect(service.getModelStock('p-1', { ...actor, branchId: undefined })).rejects.toThrow(
      BadRequestException,
    );
    expect(getProductDetail).not.toHaveBeenCalled();
  });
});
