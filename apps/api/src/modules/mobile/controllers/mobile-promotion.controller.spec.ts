import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  REQUIRE_BRANCH_SCOPE_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../../auth/decorators';
import { EvaluateCartQuery } from '../../promotion/application/queries/evaluate-cart.query';
import { MobileEvaluateCartDto } from '../dto/mobile-evaluate-cart.dto';
import { MobilePromotionController } from './mobile-promotion.controller';

/**
 * Controller này MỎNG — nó chuyển tiếp một lượt gọi và không có nhánh nào. Thứ
 * đáng kiểm ở đây KHÔNG phải thân hàm mà là **các decorator**: chúng là ranh
 * giới an toàn, và không có gì khác trong repo kiểm chúng. Gỡ nhầm
 * `@RequireBranchScope()` thì `tsc` vẫn sạch, mọi test khác vẫn xanh, và hậu
 * quả là người bán ở cửa hàng B lặng lẽ nhận giá khuyến mại của cửa hàng A.
 */
describe('MobilePromotionController', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const evaluate = MobilePromotionController.prototype.evaluate;

  it('uỷ quyền cho EvaluateCartQuery, không tự tính gì', async () => {
    const execute = jest.fn().mockResolvedValue({ promotionDiscount: 0 });
    const controller = new MobilePromotionController({ execute } as never);

    const dto: MobileEvaluateCartDto = { lines: [] };
    await controller.evaluate(dto, actor);

    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0][0] as EvaluateCartQuery;
    expect(query).toBeInstanceOf(EvaluateCartQuery);
    // DTO đi qua NGUYÊN VẸN: mọi việc nắn dữ liệu đều thuộc về handler dùng
    // chung, không phải một lớp nắn thứ hai chỉ mobile có.
    expect(query.dto).toBe(dto);
    expect(query.actor).toBe(actor);
  });

  it('đòi ĐÚNG quyền hẹp của vai bán hàng', () => {
    // `pos.promotion.evaluate` có sẵn trong `SALES_PERMISSION_KEYS`. Cố ý KHÔNG
    // nhận thêm `promotion.read` như đường web: quyền đó mở trọn danh mục
    // chương trình, rộng hơn mức một lượt định giá cần.
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, evaluate)).toBe(
      'pos.promotion.evaluate',
    );
  });

  it('đòi chi nhánh TƯỜNG MINH', () => {
    // `EvaluateCartHandler` đọc `actor.branchId!`. Không có guard này thì thiếu
    // `X-Branch-Id` sẽ rơi về `branchIds[0]` và định giá theo nhầm cửa hàng —
    // im lặng, không lỗi nào.
    expect(Reflect.getMetadata(REQUIRE_BRANCH_SCOPE_KEY, evaluate)).toBe(true);
  });

  it('trả 200 chứ không 201 — không có gì được tạo ra', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, evaluate)).toBe(HttpStatus.OK);
  });

  it('đường dẫn không mang tiền tố version', () => {
    // Module mobile chạy `VERSION_NEUTRAL`. Một `@Version('2')` lọt vào đây là
    // `/v1/mobile/...` và mọi hằng trong `ApiEndpoints` phía Dart trỏ hụt.
    expect(Reflect.getMetadata(PATH_METADATA, MobilePromotionController)).toBe(
      'mobile/promotions',
    );
    expect(Reflect.getMetadata(PATH_METADATA, evaluate)).toBe('evaluate');
  });

  describe('MobileEvaluateCartDto', () => {
    const build = (payload: Record<string, unknown>) =>
      validate(plainToInstance(MobileEvaluateCartDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('giỏ RỖNG là hợp lệ — màn khuyến mại bày danh mục trước khi có dòng nào', async () => {
      expect(await build({ lines: [] })).toHaveLength(0);
    });

    it('nhận một dòng đầy đủ', async () => {
      const errors = await build({
        lines: [
          {
            lineId: 'line-1',
            itemId: '3f1e9c8a-1b2c-4d5e-8f90-a1b2c3d4e5f6',
            quantity: 2,
            unitPrice: 100000,
          },
        ],
      });

      expect(errors).toHaveLength(0);
    });

    it('TỪ CHỐI `at` — client không được tự chọn mốc định giá', async () => {
      // Đây là lý do DTO này tồn tại thay vì dùng lại `EvaluateCartDto`. Một
      // token vai bán hàng không nên định giá được giỏ theo giá của tuần trước.
      const errors = await build({ at: '2026-01-01T00:00:00Z', lines: [] });

      expect(errors).not.toHaveLength(0);
    });

    it('TỪ CHỐI `excludedProgramIds` — app không có lối vào cho việc loại trừ', async () => {
      const errors = await build({
        excludedProgramIds: ['3f1e9c8a-1b2c-4d5e-8f90-a1b2c3d4e5f6'],
        lines: [],
      });

      expect(errors).not.toHaveLength(0);
    });

    it('TỪ CHỐI dòng số lượng 0 — một dòng như vậy không định giá được gì', async () => {
      const errors = await build({
        lines: [
          {
            lineId: 'line-1',
            itemId: '3f1e9c8a-1b2c-4d5e-8f90-a1b2c3d4e5f6',
            quantity: 0,
            unitPrice: 100000,
          },
        ],
      });

      expect(errors).not.toHaveLength(0);
    });
  });
});
