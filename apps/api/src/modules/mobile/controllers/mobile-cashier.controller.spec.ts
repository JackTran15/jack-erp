import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { REQUIRE_PERMISSION_KEY } from '../../auth/decorators';
import { MobileCheckoutDto, MobileCheckoutPreviewDto } from '../dto/mobile-checkout.dto';
import { MobileCashierController } from './mobile-cashier.controller';

/**
 * Thu tiền + xem trước của thu ngân (T-03-02).
 *
 * Thân hàm mỏng — việc thật (saga, map kết quả) nằm ở `MobileCashierService`
 * và được kiểm ở spec của nó. Ở đây chốt ba thứ mà chỉ controller quyết định
 * và `tsc` không bắt được: header idempotency đi tới service, đường preview
 * tồn tại đúng chỗ, và khoá quyền. Gỡ nhầm một decorator thì mọi test khác vẫn
 * xanh.
 */
describe('MobileCashierController — thu tiền qua checkout saga', () => {
  const actor = { userId: 'u-1', organizationId: 'org-1', branchId: 'br-1', roles: [] } as ActorContext;

  function build() {
    const service = {
      checkout: jest.fn(async () => ({ invoiceId: 'inv-1' })),
      previewCheckout: jest.fn(async () => ({ amountDue: 1249000, appliedPrograms: [] })),
    };
    return { service, controller: new MobileCashierController(service as never, {} as never) };
  }

  it('checkout chuyển nguyên header x-idempotency-key xuống service (service rơi về invoiceId khi vắng)', async () => {
    const { service, controller } = build();
    const dto = { payments: [] } as MobileCheckoutDto;

    await controller.checkout('inv-1', dto, 'client-key-1', actor);
    await controller.checkout('inv-1', dto, undefined, actor);

    expect(service.checkout).toHaveBeenNthCalledWith(1, 'inv-1', dto, 'client-key-1', actor);
    expect(service.checkout).toHaveBeenNthCalledWith(2, 'inv-1', dto, undefined, actor);
  });

  it('checkout đọc đúng header `x-idempotency-key`', () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, MobileCashierController, 'checkout') as Record<
      string,
      { index: number; data?: string }
    >;
    const header = Object.values(args).find((a) => a.data === 'x-idempotency-key');
    expect(header?.index).toBe(2);
  });

  it('preview: POST drafts/:invoiceId/checkout/preview, trả nguyên thứ service tính', async () => {
    const { service, controller } = build();
    const handler = MobileCashierController.prototype.previewCheckout;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('drafts/:invoiceId/checkout/preview');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);

    const result = await controller.previewCheckout('inv-1', { selectedProgramIds: ['p-1'] }, actor);

    expect(service.previewCheckout).toHaveBeenCalledWith('inv-1', { selectedProgramIds: ['p-1'] }, actor);
    expect(result).toEqual({ amountDue: 1249000, appliedPrograms: [] });
  });

  it('khoá lớp vẫn là `accounting.cash.create`, và checkout/preview KHÔNG có khoá method đè lên nó', () => {
    // Khoá method THAY THẾ khoá lớp (`getAllAndOverride`) — một
    // `@RequirePermission('pos.invoice.write')` ở đây sẽ mở đường thu tiền cho
    // cả tư vấn (seed cấp quyền đó cho hai vai).
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MobileCashierController)).toBe('accounting.cash.create');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MobileCashierController.prototype.checkout)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MobileCashierController.prototype.previewCheckout)).toBeUndefined();
  });

  it('DTO: id CTKM phải là UUID v4 — cùng luật với CheckoutV2Dto của web', async () => {
    const good = plainToInstance(MobileCheckoutDto, {
      payments: [],
      keptChangeAmount: 20000,
      selectedProgramIds: ['7f1c2b8e-4a3d-4c5e-9f10-2b3c4d5e6f70'],
    });
    expect(await validate(good)).toHaveLength(0);

    const badCheckout = plainToInstance(MobileCheckoutDto, { payments: [], excludedProgramIds: ['nope'] });
    expect((await validate(badCheckout)).map((e) => e.property)).toEqual(['excludedProgramIds']);

    const badKept = plainToInstance(MobileCheckoutDto, { payments: [], keptChangeAmount: -1 });
    expect((await validate(badKept)).map((e) => e.property)).toEqual(['keptChangeAmount']);

    const badPreview = plainToInstance(MobileCheckoutPreviewDto, { selectedProgramIds: ['nope'] });
    expect((await validate(badPreview)).map((e) => e.property)).toEqual(['selectedProgramIds']);
  });
});
