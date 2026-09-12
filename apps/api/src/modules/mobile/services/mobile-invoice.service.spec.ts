import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SearchInvoicesV2Query } from '../../pos/queries/search-invoices-v2.query';
import { MobileInvoiceListQueryDto } from '../dto/mobile-invoice-list.query.dto';
import { MobileInvoiceService } from './mobile-invoice.service';

/**
 * Phạm vi *"chỉ hoá đơn của mình"* — thứ đắt nhất ở đường này.
 *
 * Nó hỏng theo hai kiểu, và **cả hai đều im lặng**: lọc theo nhầm khoá thì danh
 * sách luôn rỗng (trông y hệt một người bán chưa bán gì), còn không lọc thì
 * người bán đọc được doanh số của đồng nghiệp. Không kiểu nào tự báo.
 */
describe('MobileInvoiceService', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const page = { data: [], total: 0, page: 1, limit: 20, totals: { totalAmount: 0 } };

  function build({
    profileId,
    invoice,
    salespersonUser,
  }: {
    profileId?: string;
    invoice?: { id: string; salespersonId?: string };
    /** `users` row đứng sau `salespersonId` của HOÁ ĐƠN. */
    salespersonUser?: { firstName: string; lastName: string } | null;
  }) {
    const execute = jest.fn().mockResolvedValue(page);

    // MỘT repository phục vụ hai lượt tra khác nhau — theo `userId` (người
    // gọi) và theo `id` (nhân viên bán của hoá đơn). Rẽ theo `where` chứ không
    // trả cùng một thứ cho cả hai: trả bừa là test vẫn xanh khi service tra
    // nhầm khoá, tức mất đúng thứ đang cần khoá lại.
    const findOne = jest.fn().mockImplementation((options: { where: Record<string, unknown> }) => {
      if ('userId' in options.where) {
        return Promise.resolve(profileId ? { id: profileId } : null);
      }

      return Promise.resolve(
        salespersonUser === undefined ? null : { id: options.where.id, user: salespersonUser },
      );
    });
    const findOneWithItems = jest.fn().mockResolvedValue(invoice);
    const service = new MobileInvoiceService(
      { execute } as never,
      { findOneWithItems } as never,
      { findOne } as never,
    );

    return { service, execute, findOne, findOneWithItems };
  }

  it('lọc theo `employee_profiles.id`, KHÔNG theo `users.id`', async () => {
    // `invoices.salesperson_id` trỏ `employee_profiles.id` — comment ngay trên
    // cột nói vậy. Gán `actor.userId` vào đó là so hai khoá từ hai bảng khác
    // nhau: không bao giờ khớp, và không có lỗi nào để lần ra.
    const { service, execute, findOne } = build({ profileId: 'profile-9' });

    await service.list({}, actor);

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', organizationId: 'org-1' } }),
    );

    const query = execute.mock.calls[0][0] as SearchInvoicesV2Query;
    expect(query.dto.salespersonId).toBe('profile-9');
    expect(query.dto.salespersonId).not.toBe(actor.userId);
  });

  it('chưa có hồ sơ nhân viên → trang RỖNG, KHÔNG bỏ bộ lọc', async () => {
    // Bỏ lọc ở đây là phơi trọn hoá đơn của cả chi nhánh cho đúng tài khoản mà
    // ta không xác định được danh tính nghiệp vụ. Trang rỗng là chiều sai an
    // toàn duy nhất.
    const { service, execute } = build({});

    const result = await service.list({ page: 3, limit: 50 }, actor);

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], total: 0, page: 3, limit: 50, totals: { totalAmount: 0 } });
  });

  it('KHÔNG đọc `salespersonId` từ query', async () => {
    // DTO không khai trường đó, nhưng test này khoá cả đường: một `...query`
    // vô tình thêm vào service sẽ làm client tự chọn xem hoá đơn của ai.
    const { service, execute } = build({ profileId: 'profile-9' });

    await service.list({ salespersonId: 'profile-KHÁC' } as MobileInvoiceListQueryDto, actor);

    const query = execute.mock.calls[0][0] as SearchInvoicesV2Query;
    expect(query.dto.salespersonId).toBe('profile-9');
  });

  it('chuyển khoảng ngày thành bộ lọc `createdAt`', async () => {
    const { service, execute } = build({ profileId: 'profile-9' });

    await service.list({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' }, actor);

    const query = execute.mock.calls[0][0] as SearchInvoicesV2Query;
    expect(query.dto.createdAt).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
  });

  it('không có khoảng ngày thì KHÔNG gắn bộ lọc rỗng', async () => {
    const { service, execute } = build({ profileId: 'profile-9' });

    await service.list({}, actor);

    const query = execute.mock.calls[0][0] as SearchInvoicesV2Query;
    expect(query.dto.createdAt).toBeUndefined();
  });

  it('chuyển NGUYÊN actor xuống query — phạm vi tổ chức/chi nhánh vẫn của lớp dưới', async () => {
    const { service, execute } = build({ profileId: 'profile-9' });

    await service.list({}, actor);

    expect((execute.mock.calls[0][0] as SearchInvoicesV2Query).actor).toBe(actor);
  });

  describe('getById', () => {
    it('trả hoá đơn khi nó thuộc về người gọi', async () => {
      const { service } = build({
        profileId: 'profile-9',
        invoice: { id: 'inv-1', salespersonId: 'profile-9' },
      });

      await expect(service.getById('inv-1', actor)).resolves.toMatchObject({ id: 'inv-1' });
    });

    it('hoá đơn của NGƯỜI KHÁC → 404, không phải 403', async () => {
      // 403 nói "nó tồn tại, bạn không được xem" — tức xác nhận sự tồn tại của
      // một hoá đơn cho người không được biết nó tồn tại. Với một đường mà id
      // đoán được thì khác biệt đó là thật.
      const { service } = build({
        profileId: 'profile-9',
        invoice: { id: 'inv-1', salespersonId: 'profile-KHÁC' },
      });

      await expect(service.getById('inv-1', actor)).rejects.toThrow(NotFoundException);
    });

    it('hoá đơn KHÔNG gán nhân viên bán cũng → 404', async () => {
      // `salespersonId` nullable. `undefined !== 'profile-9'` là đúng, nhưng ca
      // này đáng có test riêng: một `!=` lỏng hay một `?? profileId` lọt vào đây
      // sẽ mở nó ra cho mọi người.
      const { service } = build({ profileId: 'profile-9', invoice: { id: 'inv-1' } });

      await expect(service.getById('inv-1', actor)).rejects.toThrow(NotFoundException);
    });

    it('người gọi chưa có hồ sơ nhân viên → 404', async () => {
      const { service } = build({ invoice: { id: 'inv-1', salespersonId: 'profile-9' } });

      await expect(service.getById('inv-1', actor)).rejects.toThrow(NotFoundException);
    });

    it('kèm TÊN nhân viên bán cho dòng *NVBH* của tờ hoá đơn', async () => {
      // Trước đây đường này chỉ trả `salespersonId` — một uuid — nên app để
      // dòng NVBH TRỐNG thay vì bày mã nội bộ ra chứng từ.
      const { service, findOne } = build({
        profileId: 'profile-9',
        invoice: { id: 'inv-1', salespersonId: 'profile-9' },
        salespersonUser: { firstName: 'Nguyễn Thị', lastName: 'Hồng Nhung' },
      });

      await expect(service.getById('inv-1', actor)).resolves.toMatchObject({
        salespersonName: 'Nguyễn Thị Hồng Nhung',
      });

      // Tra theo `salespersonId` của HOÁ ĐƠN, không theo người đang gọi. Ở
      // đường này hai thứ luôn trùng nhau, nên chỉ khẳng định này mới phân biệt
      // được hai cách viết — và ngày phạm vi nới ra, cách kia sẽ ghi tên SAI
      // lên chứng từ mà không có gì đổ.
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'profile-9', organizationId: 'org-1' } }),
      );
    });

    it('hồ sơ không có `users` đi kèm → tên `null`, KHÔNG phải chuỗi rỗng', async () => {
      // `null` để tầng UI bày dấu "—". Một chuỗi rỗng cho ra dòng NVBH trống
      // trơn, tức trông y hệt lỗi cũ mà không ai biết là vì sao.
      const { service } = build({
        profileId: 'profile-9',
        invoice: { id: 'inv-1', salespersonId: 'profile-9' },
        salespersonUser: null,
      });

      await expect(service.getById('inv-1', actor)).resolves.toMatchObject({
        salespersonName: null,
      });
    });
  });

  describe('MobileInvoiceListQueryDto', () => {
    const check = (payload: Record<string, unknown>) =>
      validate(plainToInstance(MobileInvoiceListQueryDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('TỪ CHỐI `salespersonId` — client không tự chọn xem hoá đơn của ai', async () => {
      expect(await check({ salespersonId: '3f1e9c8a-1b2c-4d5e-8f90-a1b2c3d4e5f6' })).not.toHaveLength(0);
    });

    it('nhận bốn tham số hợp lệ', async () => {
      expect(
        await check({ page: 2, limit: 50, from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' }),
      ).toHaveLength(0);
    });

    it('TỪ CHỐI `limit` vượt trần', async () => {
      expect(await check({ limit: 500 })).not.toHaveLength(0);
    });

    it('TỪ CHỐI ngày không phải ISO-8601', async () => {
      expect(await check({ from: '01/09/2026' })).not.toHaveLength(0);
    });
  });
});
