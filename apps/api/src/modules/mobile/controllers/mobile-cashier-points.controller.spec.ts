import { PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { REQUIRE_PERMISSION_KEY } from '../../auth/decorators';
import { MobileRedeemPointsDto } from '../dto/mobile-cashier-draft.dto';
import { MobileCashierController } from './mobile-cashier.controller';

/**
 * Hai đường *Sử dụng điểm* của giỏ thu ngân.
 *
 * Thân hàm MỎNG — chúng chuyển tiếp cho `PointsRedemptionService`, và đó chính
 * là điều đáng khẳng định: luật đổi điểm (số dư, trần theo tiền hàng, việc trừ
 * điểm thật lúc checkout) chỉ được có MỘT bản. POS web gọi cùng service qua
 * `POST /invoices/:id/redeem-points`; một bản tính thứ hai ở tầng mobile là hai
 * con số sẽ phân kỳ mà không có gì báo.
 *
 * Phần còn lại kiểm **decorator**, vì chúng là ranh giới an toàn và không có gì
 * khác trong repo kiểm chúng: gỡ nhầm một `@RequirePermission` thì `tsc` vẫn
 * sạch và mọi test khác vẫn xanh.
 */
describe('MobileCashierController — Sử dụng điểm', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const redeem = MobileCashierController.prototype.redeemPoints;
  const remove = MobileCashierController.prototype.removeRedeemedPoints;

  it('uỷ quyền cho PointsRedemptionService, không tự tính gì', async () => {
    const points = {
      applyRedemption: jest.fn().mockResolvedValue({ pointsRedeemed: 20 }),
      removeRedemption: jest.fn().mockResolvedValue({ pointsRedeemed: 0 }),
    };
    const controller = new MobileCashierController({} as never, points as never);

    await controller.redeemPoints('inv-1', { points: 20 }, actor);
    await controller.removeRedeemedPoints('inv-1', actor);

    expect(points.applyRedemption).toHaveBeenCalledWith('inv-1', 20, actor);
    expect(points.removeRedemption).toHaveBeenCalledWith('inv-1', actor);
  });

  it('khoá ở METHOD **thay thế** khoá ở class — chỉ `pos.invoice.write` được kiểm', () => {
    // Tiêu đề cũ của test này là *"đòi thêm quyền GHI HOÁ ĐƠN, NGOÀI quyền vai
    // của cả controller"*, và câu đó SAI: `PermissionGuard` đọc bằng
    // `getAllAndOverride([handler, class])`, nên khoá ở method GHI ĐÈ khoá ở
    // class chứ không cộng vào.
    //
    // Đo 2026-09-16 bằng một tài khoản *Nhân viên bán hàng* thật: vai đó không
    // có `accounting.cash.create` — `GET /mobile/cashier/session` trả 403 — mà
    // vẫn đi qua được guard của đường này (404 vì id không tồn tại, tức đã qua
    // cửa). Seed cấp `pos.invoice.write` cho cả hai vai.
    //
    // Test KHÔNG nói hành vi đó là đúng; nó chốt rằng thứ ĐANG được kiểm là
    // `pos.invoice.write` và chỉ nó, để không ai tin vào một lớp bảo vệ thứ hai
    // không tồn tại.
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, redeem)).toBe('pos.invoice.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, remove)).toBe('pos.invoice.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MobileCashierController)).toBe('accounting.cash.create');
  });

  it('đường dẫn nằm dưới hoá đơn NHÁP, không mang tiền tố version', () => {
    // Module mobile chạy `VERSION_NEUTRAL`. Một `@Version()` lọt vào là
    // `/v1/mobile/...` và mọi hằng trong `ApiEndpoints` phía Dart trỏ hụt.
    expect(Reflect.getMetadata(PATH_METADATA, MobileCashierController)).toBe('mobile/cashier');
    expect(Reflect.getMetadata(PATH_METADATA, redeem)).toBe('drafts/:invoiceId/points');
    expect(Reflect.getMetadata(PATH_METADATA, remove)).toBe('drafts/:invoiceId/points');
  });

  describe('MobileRedeemPointsDto', () => {
    const build = (payload: Record<string, unknown>) =>
      validate(plainToInstance(MobileRedeemPointsDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('nhận một số điểm dương', async () => {
      expect(await build({ points: 20 })).toHaveLength(0);
    });

    it('từ chối 0, số âm và số lẻ', async () => {
      // `0` KHÔNG phải "gỡ điểm" — gỡ đi đường `DELETE`. Cho `0` qua ở đây là
      // hai đường cùng làm một việc, và `applyRedemption` sẽ ném ở tầng dưới.
      expect(await build({ points: 0 })).not.toHaveLength(0);
      expect(await build({ points: -5 })).not.toHaveLength(0);
      expect(await build({ points: 1.5 })).not.toHaveLength(0);
    });

    it('từ chối trường lạ — điểm là SỐ ĐIỂM, không phải số tiền', async () => {
      // Một client gửi `amount` thay vì `points` phải nhận 400 chứ không phải
      // lặng lẽ đổi 0 điểm.
      expect(await build({ points: 20, amount: 10000 })).not.toHaveLength(0);
    });
  });
});
