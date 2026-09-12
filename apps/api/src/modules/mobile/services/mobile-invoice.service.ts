import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EmployeeProfileEntity } from '../../rbac/employee/employee-profile.entity';
import { InvoiceSearchV2Dto } from '../../pos/dto/invoice-search-v2.dto';
import { InvoiceService } from '../../pos/services/invoice.service';
import { SearchInvoicesV2Query } from '../../pos/queries/search-invoices-v2.query';
import { MobileInvoiceListQueryDto } from '../dto/mobile-invoice-list.query.dto';

/**
 * Hoá đơn mà NGƯỜI GỌI được ghi công bán.
 *
 * Uỷ quyền cho `SearchInvoicesV2Query` — cùng truy vấn mà lưới hoá đơn của web
 * dùng, nên loại trừ hoá đơn nháp, tổng tiền và phần đính khách hàng đều không
 * phải viết lại.
 *
 * **Phạm vi ép ở đây, không ở client** (ADR-24). Đây là khác biệt đáng kể duy
 * nhất so với đường web, và là lý do đường mobile tồn tại thay vì gọi thẳng.
 */
@Injectable()
export class MobileInvoiceService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly invoices: InvoiceService,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profiles: Repository<EmployeeProfileEntity>,
  ) {}

  async list(query: MobileInvoiceListQueryDto, actor: ActorContext) {
    const salespersonId = await this.salespersonIdOf(actor);

    if (!salespersonId) {
      // Tài khoản chưa được gán hồ sơ nhân viên. Trả trang RỖNG chứ KHÔNG bỏ bộ
      // lọc: bỏ lọc là phơi trọn hoá đơn của cả chi nhánh cho đúng tài khoản mà
      // ta không xác định được danh tính nghiệp vụ.
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totals: { totalAmount: 0 },
      };
    }

    const dto: InvoiceSearchV2Dto = {
      page: query.page,
      limit: query.limit,
      salespersonId,
    };

    // Khoảng ngày chỉ gắn khi có ÍT NHẤT một đầu: một `DateRangeFilterDto` rỗng
    // đi vào `FilterBuilder` là một mệnh đề thừa trên mọi lượt gọi.
    if (query.from || query.to) {
      dto.createdAt = {
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
      } as InvoiceSearchV2Dto['createdAt'];
    }

    return this.queryBus.execute(new SearchInvoicesV2Query(dto, actor));
  }

  /**
   * Một hoá đơn theo `id`, **kèm dòng hàng và các khoản thanh toán**.
   *
   * Uỷ quyền cho `InvoiceService.findOneWithItems` — nó đã gom sẵn đúng thứ tờ
   * hoá đơn cần: dòng hàng, khách, tên thu ngân, các khoản đã thu, công nợ còn
   * lại và ảnh chụp chương trình khuyến mại đã chạy lúc thanh toán.
   *
   * **Hoá đơn của người khác trả 404, KHÔNG phải 403.** Chúng nói hai điều
   * khác nhau: 403 nói *"nó tồn tại, bạn không được xem"* — tức xác nhận sự tồn
   * tại của một hoá đơn cho người không được biết nó tồn tại. 404 không xác
   * nhận gì. Với một đường mà id đoán được thì khác biệt đó là thật.
   */
  async getById(id: string, actor: ActorContext) {
    const salespersonId = await this.salespersonIdOf(actor);

    // Tra hoá đơn TRƯỚC rồi mới so: `findOneWithItems` đã ép phạm vi tổ chức và
    // ném 404 cho id không tồn tại, nên hai ca "không có" và "của người khác"
    // ra cùng một phản hồi mà không cần dựng thêm nhánh nào.
    const invoice = await this.invoices.findOneWithItems(id, actor);

    if (!salespersonId || invoice.salespersonId !== salespersonId) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return Object.assign(invoice, {
      salespersonName: await this.salespersonNameOf(invoice.salespersonId, actor),
    });
  }

  /**
   * Tên nhân viên bán, cho dòng *NVBH* của tờ hoá đơn.
   *
   * Trước đây đường này chỉ trả `salespersonId` — một uuid — nên app để dòng đó
   * TRỐNG thay vì bày mã nội bộ cho người dùng cuối. Đây là chỗ vá đúng: tên
   * người là thứ backend biết, không phải thứ client suy ra được.
   *
   * **Tra theo `salespersonId` của HOÁ ĐƠN, không theo người đang gọi**, dù ở
   * đường này hai thứ đó luôn trùng nhau (`getById` đã chặn hoá đơn của người
   * khác ngay phía trên). Suy từ người gọi là gài một quả bom hẹn giờ: ngày
   * phạm vi nới ra — quản lý xem hoá đơn của nhân viên chẳng hạn — tờ hoá đơn
   * sẽ ghi tên SAI mà không có gì đổ.
   *
   * Ghép `firstName lastName` đúng như `InvoiceService` đang ghép `staffName`:
   * hai dòng nằm cạnh nhau trên cùng một tờ hoá đơn, khác quy tắc ghép là lộ ra
   * ngay ở chỗ người dùng nhìn.
   */
  private async salespersonNameOf(
    salespersonId: string | null | undefined,
    actor: ActorContext,
  ): Promise<string | null> {
    if (!salespersonId) return null;

    const profile = await this.profiles.findOne({
      where: { id: salespersonId, organizationId: actor.organizationId },
      relations: { user: true },
    });
    const user = profile?.user;
    if (!user) return null;

    // `|| null` chứ không `?? null`: hai tên cùng rỗng cho ra chuỗi rỗng, mà
    // một chuỗi rỗng đẩy xuống app sẽ thành một dòng NVBH trống trơn thay vì
    // dấu "—" nói rõ là không có dữ liệu.
    return `${user.firstName} ${user.lastName}`.trim() || null;
  }

  /**
   * `employee_profiles.id` của người gọi.
   *
   * `salespersonId` của hoá đơn trỏ **`employee_profiles.id`**, không phải
   * `users.id` — xem comment ngay trên cột đó. So thẳng `actor.userId` vào nó là
   * so hai khoá từ hai bảng khác nhau: không bao giờ khớp, danh sách luôn rỗng,
   * và không có lỗi nào để lần ra.
   *
   * Bảng có `@Index(unique)` trên `user_id` nên tra ra tối đa một dòng.
   */
  private async salespersonIdOf(actor: ActorContext): Promise<string | undefined> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });

    return profile?.id;
  }
}
