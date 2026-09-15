import { ConflictException, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerGroupEntity } from '../../customer/customer-group.entity';
import { CustomerGroupService } from '../../customer/customer-group.service';
import {
  MobileCustomerGroupListDto,
  MobileCustomerGroupResponseDto,
} from '../dto/mobile-customer-group.response.dto';
import { MobileCustomerGroupCreateDto } from '../dto/mobile-customer-group-write.dto';

/**
 * Danh mục nhóm khách hàng cho app mobile.
 *
 * **Uỷ quyền TRỌN VẸN cho `CustomerGroupService`** — khác
 * `MobileSupplierGroupService` vốn phải tự đọc bằng repository. Lý do: service
 * của khách hàng đã sẵn đúng thứ app cần (`findAll` scope theo tổ chức, sắp
 * theo `name`, không phân trang), và `create` đã tự cấp mã qua
 * `DocumentNumberingService`. Ở nhánh nhà cung cấp thì đường đọc có sẵn bắt
 * phân trang nên không dùng lại được.
 *
 * Việc còn lại của lớp này đúng hai thứ: **cắt bớt hình dạng** (bản ghi gốc lộ
 * cả `organizationId`, `branchId`, `createdBy`, `createdAt` — app không cần và
 * không nên thấy) và **dịch lỗi trùng sang tiếng Việt**.
 */
@Injectable()
export class MobileCustomerGroupService {
  constructor(private readonly groups: CustomerGroupService) {}

  async list(actor: ActorContext): Promise<MobileCustomerGroupListDto> {
    const rows = await this.groups.findAll(actor);

    return { data: rows.map(toMobileCustomerGroup) };
  }

  async create(
    dto: MobileCustomerGroupCreateDto,
    actor: ActorContext,
  ): Promise<MobileCustomerGroupResponseDto> {
    const name = dto.name.trim();

    const created = await this.groups
      .create({ name, description: dto.description }, actor)
      .catch((err) => rethrowDuplicateGroupName(err, name));

    return toMobileCustomerGroup(created);
  }
}

/**
 * `?? null` chứ không `?? ''`: cột nullable mang nghĩa "chưa từng có", và
 * `code` thật sự có thể vắng ở các nhóm tạo trước migration backfill.
 */
function toMobileCustomerGroup(
  row: CustomerGroupEntity,
): MobileCustomerGroupResponseDto {
  return {
    id: row.id,
    code: row.code ?? null,
    name: row.name,
    description: row.description ?? null,
  };
}

/**
 * Dịch trùng TÊN sang 409 nói TIẾNG VIỆT.
 *
 * Khoá bị đụng là `uq_customer_group_org_name` — **tên**, không phải mã, khác
 * hẳn nhánh nhà cung cấp. `CustomerGroupService.create` không bắt `23505` nên
 * lỗi thô của Postgres sẽ nổi lên thành 500; app hiện thẳng `message` của
 * server lên toast nên phải chặn ở đây.
 *
 * Đọc `err.code` rồi mới tới `driverError.code`: TypeORM gói lỗi driver ở độ
 * sâu khác nhau tuỳ phiên bản.
 */
function rethrowDuplicateGroupName(err: unknown, name: string): never {
  const pgCode =
    err instanceof QueryFailedError
      ? ((err as QueryFailedError & { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code)
      : undefined;

  if (pgCode === '23505') {
    throw new ConflictException(`Nhóm khách hàng "${name}" đã tồn tại.`);
  }
  throw err;
}
