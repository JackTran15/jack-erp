import { PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { REQUIRE_PERMISSION_KEY } from '../../auth/decorators';
import { CancelInvoiceDto } from '../../pos/dto/cancel-invoice.dto';
import { MobileInvoiceController } from './mobile-invoice.controller';

/**
 * Đường **huỷ chứng từ** của app.
 *
 * Thân hàm mỏng — nó chuyển tiếp cho `MobileInvoiceService.cancel`, nơi phép
 * NHÌN THẤY và phép rẽ theo loại chứng từ đã có test riêng. Phần đáng khẳng
 * định ở đây là **decorator**: chúng là ranh giới an toàn, và gỡ nhầm một cái
 * thì `tsc` vẫn sạch, mọi test khác vẫn xanh, và một thu ngân huỷ được hoá đơn
 * của cả cửa hàng.
 */
describe('MobileInvoiceController — huỷ chứng từ', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const cancel = MobileInvoiceController.prototype.cancel;

  it('uỷ quyền cho service, không tự quyết gì', async () => {
    const service = { cancel: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'cancelled' }) };
    const controller = new MobileInvoiceController(service as never);

    await controller.cancel('inv-1', { reason: 'Khách đổi ý' }, actor);

    expect(service.cancel).toHaveBeenCalledWith('inv-1', { reason: 'Khách đổi ý' }, actor);
  });

  it('gác bằng ĐÚNG khoá `pos.invoice.cancel` — cùng khoá pos-web và app gác', async () => {
    // Ba mặt tiền đọc cùng một khoá: guard ở đây, `canCancelInvoice` của
    // pos-web, và `InvoicePermissionHelper` của app. Đổi khoá ở một nơi mà quên
    // hai nơi kia thì hoặc nút hiện rồi nhận 403, hoặc nút biến mất trong khi
    // người dùng vẫn có quyền — cả hai đều không có gì báo.
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, cancel)).toBe('pos.invoice.cancel');
    // KHÔNG phải quyền GHI: `pos.invoice.write` thì thu ngân và nhân viên bán
    // hàng đều có, và huỷ là thao tác không hoàn tác được.
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, cancel)).not.toBe('pos.invoice.write');
  });

  it('treo đúng ở `mobile/invoices/:id/cancel`', () => {
    // Module mobile chạy `VERSION_NEUTRAL`; thêm `@Version()` là ra
    // `/v1/mobile/...` và phá đường dẫn khai trong `ApiEndpoints` phía Dart.
    expect(Reflect.getMetadata(PATH_METADATA, MobileInvoiceController)).toBe('mobile/invoices');
    expect(Reflect.getMetadata(PATH_METADATA, cancel)).toBe(':id/cancel');
  });

  it('DTO đòi lý do ≥5 ký tự — app kiểm trước, máy chủ vẫn là nơi quyết định', async () => {
    const tooShort = plainToInstance(CancelInvoiceDto, { reason: 'abc' });
    const ok = plainToInstance(CancelInvoiceDto, { reason: 'Khách đổi ý' });

    expect(await validate(tooShort)).not.toHaveLength(0);
    expect(await validate(ok)).toHaveLength(0);
  });
});
