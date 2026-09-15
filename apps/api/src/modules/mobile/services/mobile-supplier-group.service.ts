import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderGroupCrudService } from '../../inventory/location/supplier-group-crud.service';
import { SupplierGroupEntity } from '../../inventory/location/supplier-group.entity';
import {
  MobileSupplierGroupListDto,
  MobileSupplierGroupResponseDto,
} from '../dto/mobile-supplier-group.response.dto';
import {
  MobileSupplierGroupCreateDto,
  MobileSupplierGroupUpdateDto,
} from '../dto/mobile-supplier-group-write.dto';

/**
 * Danh mục nhóm nhà cung cấp cho app mobile.
 *
 * Khuôn LAI, và hai nửa chọn khác nhau có lý do:
 * - **Đọc bằng repository** như `MobileSupplierService` — đường `/admin/entities`
 *   trả `PaginatedResponse` kèm `parentGroupName` và bắt phân trang, trong khi
 *   app cần trọn danh mục phẳng để dựng cây.
 * - **Ghi bằng uỷ quyền** `ProviderGroupCrudService` như
 *   `MobileInventoryCatalogService.createCategory` — ở đó có `beforeCreate`/
 *   `beforeUpdate` với phép kiểm nhóm cha và chặn vòng lặp cha-con, thứ không
 *   được nhân bản ra chỗ thứ hai.
 *
 * Nhóm scope theo TỔ CHỨC (`ScopingPolicy.ORGANIZATION`): `X-Branch-Id` không
 * dự phần.
 */
@Injectable()
export class MobileSupplierGroupService {
  constructor(
    @InjectRepository(SupplierGroupEntity)
    private readonly repo: Repository<SupplierGroupEntity>,
    private readonly groups: ProviderGroupCrudService,
  ) {}

  /**
   * Trọn danh mục, PHẲNG, KHÔNG phân trang, KHÔNG tham số.
   *
   * **Trả CẢ nhóm đã ngừng theo dõi.** Lọc `isActive` ở server sẽ làm nhãn của
   * một nhà cung cấp đang gắn nhóm đã ngừng biến thành khoảng trắng — app không
   * tra ra id đó trong danh mục nữa. `isActive` nằm trong mỗi dòng để app tự
   * loại chúng khỏi danh sách CHỌN mà vẫn hiện được giá trị ĐANG có.
   *
   * `where.organizationId` viết TAY vì đường này không đi qua `applyScoping`
   * của `BaseCrudService` — thiếu nó là rò rỉ danh mục giữa các tổ chức.
   *
   * Sắp `code -> name -> id`: khoá phụ `id` để thứ tự ổn định giữa hai lượt gọi
   * khi hai nhóm trùng cả mã lẫn tên (mã duy nhất theo tổ chức, nhưng câu
   * `ORDER BY` không được dựa vào một ràng buộc ở nơi khác).
   */
  async list(actor: ActorContext): Promise<MobileSupplierGroupListDto> {
    const rows = await this.repo.find({
      where: { organizationId: actor.organizationId },
      order: { code: 'ASC', name: 'ASC', id: 'ASC' },
    });

    return { data: rows.map(toMobileSupplierGroup) };
  }

  async create(
    dto: MobileSupplierGroupCreateDto,
    actor: ActorContext,
  ): Promise<MobileSupplierGroupResponseDto> {
    const code = dto.code.trim();

    const created = (await this.groups
      .create(
        {
          code,
          name: dto.name.trim(),
          // `?? undefined`: ở đường TẠO, "không có nhóm cha" là không gửi khoá.
          // Phân biệt `null` với `undefined` chỉ có nghĩa ở PATCH.
          parentGroupId: dto.parentGroupId ?? undefined,
          description: dto.description ?? undefined,
        },
        actor,
      )
      .catch((err) => rethrowDuplicateGroupCode(err, code))) as SupplierGroupEntity;

    return toMobileSupplierGroup(created);
  }

  /**
   * `undefined` (vắng khoá) = giữ nguyên; `null` = xoá trắng.
   *
   * Với `parentGroupId`, `null` nghĩa là **đưa nhóm này lên làm nhóm gốc** —
   * picker cho bỏ chọn nhóm cha, nên đây là thao tác có thật. Nó phải đi qua
   * NGUYÊN VẸN xuống `ProviderGroupCrudService.normalizePayload`, nơi `null`
   * được giữ nguyên chứ không nắn về `undefined` (nếu nắn thì `repository.merge`
   * của TypeORM bỏ qua nó và thao tác lặng lẽ không làm gì).
   */
  async update(
    id: string,
    dto: MobileSupplierGroupUpdateDto,
    actor: ActorContext,
  ): Promise<MobileSupplierGroupResponseDto> {
    const payload: Record<string, unknown> = {};

    if (dto.code !== undefined) payload.code = dto.code.trim();
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.parentGroupId !== undefined) {
      payload.parentGroupId = dto.parentGroupId;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description ?? null;
    }

    const saved = (await this.groups
      .update(id, payload, actor)
      .catch((err) =>
        rethrowDuplicateGroupCode(err, String(payload.code ?? '')),
      )) as SupplierGroupEntity;

    return toMobileSupplierGroup(saved);
  }
}

/**
 * `?? null` chứ không `?? ''`: cột nullable mang nghĩa "chưa từng nhập", và app
 * dựa vào đúng ranh giới đó (`parentGroupId == null` = nhóm gốc).
 */
function toMobileSupplierGroup(
  row: SupplierGroupEntity,
): MobileSupplierGroupResponseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentGroupId: row.parentGroupId ?? null,
    description: row.description ?? null,
    // `?? true` KHÔNG phải phòng thủ thừa: `is_active` là DEFAULT của CỘT, mà
    // `BaseCrudService.create` dựng entity từ payload rồi `save` — bản ghi trả
    // về ngay sau khi tạo có thể chưa mang giá trị đó. Cùng thủ thuật
    // `MobileInventoryCatalogService.createCategory` dùng cho `status`.
    isActive: row.isActive ?? true,
  };
}

/**
 * Dịch mã trùng sang 409 nói TIẾNG VIỆT — gương `rethrowDuplicateCode` của
 * `mobile-supplier.service.ts`.
 *
 * Bắt HAI hình dạng vì đường ghi ở đây đi qua `BaseCrudService`, nơi `23505` đã
 * được bọc sẵn thành `ConflictException` bằng TIẾNG ANH ("A record with the same
 * unique code already exists in this organization"). App hiện thẳng `message`
 * của server lên toast nên câu đó không dùng được; còn `QueryFailedError` trần
 * vẫn có thể lọt ra nếu lượt ghi không đi qua `BaseCrudService`.
 */
function rethrowDuplicateGroupCode(err: unknown, code: string): never {
  const pgCode =
    err instanceof QueryFailedError
      ? ((err as QueryFailedError & { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code)
      : undefined;

  if (pgCode === '23505' || err instanceof ConflictException) {
    throw new ConflictException(
      code
        ? `Mã nhóm nhà cung cấp "${code}" đã tồn tại.`
        : 'Mã nhóm nhà cung cấp đã tồn tại.',
    );
  }
  throw err;
}
