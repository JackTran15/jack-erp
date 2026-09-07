import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import {
  ProviderEntity,
  ProviderType,
} from '../../inventory/location/provider.entity';
import {
  MobileSupplierPageDto,
  MobileSupplierResponseDto,
} from '../dto/mobile-supplier.response.dto';
import { MobileSupplierSort } from '../dto/mobile-supplier-list.query.dto';
import {
  MobileSupplierCreateDto,
  MobileSupplierUpdateDto,
} from '../dto/mobile-supplier-write.dto';

/**
 * Đọc và ghi nhà cung cấp cho app mobile.
 *
 * Inject THẲNG repository thay vì dùng lại `InventoryProviderCrudService` —
 * đúng khuôn `SearchProvidersV2Handler` và `SearchCounterpartiesHandler` đang
 * dùng khi cần đọc provider từ module khác. Ba lý do không tái sử dụng được:
 *
 * 1. `InventoryProviderCrudService` KHÔNG được export khỏi module của nó; chỉ
 *    tới được bằng `ModuleRef.get('InventoryProviderCrudService')`, tức bám vào
 *    một chuỗi token.
 * 2. Mọi đường đọc có sẵn đều vứt `group` và chỉ giữ `groupName`, trong khi
 *    `SupplierEntity` phía Dart cần `groupCode`.
 * 3. Không đường nào sắp được theo `name`/`code` — v2 search khoá cứng
 *    `createdAt DESC`.
 * 4. Đường GHI cũng vậy: `POST /admin/entities/inventory-providers/records`
 *    nhận `Record<string, any>` không DTO, không whitelist, và ném
 *    `ConflictException` bằng TIẾNG ANH. App mobile hiện thẳng `message` của
 *    server lên toast, nên phải có một đường ghi nói tiếng Việt.
 *
 * Provider scope theo TỔ CHỨC, không theo chi nhánh: `X-Branch-Id` không ảnh
 * hưởng gì ở đây.
 */
@Injectable()
export class MobileSupplierService {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly repo: Repository<ProviderEntity>,
  ) {}

  async list(
    query: {
      page: number;
      limit: number;
      sort: MobileSupplierSort;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileSupplierPageDto> {
    const { page, limit, sort, search } = query;

    const qb = this.repo
      .createQueryBuilder('provider')
      .leftJoinAndSelect('provider.group', 'group')
      .where('provider.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    // Cả hai vế `OR` nằm trong MỘT cặp ngoặc và MỘT `andWhere`. Tách thành hai
    // lời gọi là `OR` leo ra ngoài và phá luôn điều kiện `organizationId` ở
    // trên — tức rò dữ liệu sang tổ chức khác, không phải chỉ sai kết quả.
    //
    // `search?.trim()` chứ không `search != null`: chuỗi toàn khoảng trắng thì
    // bỏ qua hẳn thay vì lọc theo `%   %`.
    if (search?.trim()) {
      qb.andWhere(
        '(provider.code ILIKE :search OR provider.name ILIKE :search)',
        { search: `%${escapeLikeTerm(search.trim())}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy(
        sort === MobileSupplierSort.CODE ? 'provider.code' : 'provider.name',
        'ASC',
      )
      // Tie-break BẮT BUỘC khi phân trang: trùng tên nhà cung cấp là chuyện có
      // thật, và Postgres không hứa thứ tự nào giữa các dòng bằng nhau — nên
      // không có nó thì một bản ghi có thể hiện ở cả trang 1 lẫn trang 2, hoặc
      // biến mất khỏi cả hai. `MobileItemService` đã làm đúng chỗ này.
      .addOrderBy('provider.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data: rows.map(toMobileSupplier), total, page, limit };
  }

  /**
   * Tra theo `id`, nhưng VẪN lọc `organizationId`.
   *
   * `id` là khoá chính toàn cục nên nghe như thừa — không thừa: bỏ nó đi thì
   * một uuid đoán trúng/rò rỉ đọc được nhà cung cấp của tổ chức khác. Lọc theo
   * tổ chức là ranh giới multi-tenant, không phải một phép tối ưu.
   *
   * Câu 404 KHÔNG nội suy uuid: nó là chuỗi máy, người dùng cuối đọc chỉ thấy
   * nhiễu. Mã thì ngược lại — 409 trùng mã vẫn nhắc mã, vì đó là thứ họ vừa gõ.
   */
  async findById(
    id: string,
    actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    const row = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['group'],
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp.');
    }
    return toMobileSupplier(row);
  }

  /**
   * Không tra trước xem mã đã tồn tại chưa: `UQ_inventory_providers_org_code`
   * là trọng tài DUY NHẤT đáng tin. Một phép SELECT rồi mới INSERT vẫn thua hai
   * request cùng gửi mã "RBK" trong cùng mili-giây, mà lại tốn thêm một vòng
   * xuống DB ở đường chạy bình thường.
   *
   * Ba trường scope lấy y hệt `BaseCrudService.create` để bản ghi tạo từ mobile
   * và từ web không phân biệt được nhau.
   */
  async create(
    dto: MobileSupplierCreateDto,
    actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    const code = dto.code.trim();

    const row = this.repo.create({
      organizationId: actor.organizationId,
      // Provider scope theo TỔ CHỨC nên không ai lọc theo cột này; vẫn ghi để
      // khớp `BaseCrudService.create` — nó là vết tích "tạo từ chi nhánh nào"
      // chứ không phải khoá phân vùng.
      branchId: actor.branchId,
      createdBy: actor.userId,
      code,
      name: dto.name.trim(),
      isActive: dto.status !== 'inactive',
      type: dto.type ?? ProviderType.ORGANIZATION,
      address: toColumnValue(dto.address),
      phone: toColumnValue(dto.phone),
      taxCode: toColumnValue(dto.taxCode),
    });

    const saved = await this.repo
      .save(row)
      .catch((err) => rethrowDuplicateCode(err, code));

    // Bản ghi mới chắc chắn chưa xếp nhóm (DTO không nhận `groupCode`), nên
    // không cần nạp lại quan hệ `group`: `toMobileSupplier` trả `groupCode:
    // null` là đúng sự thật.
    return toMobileSupplier(saved);
  }

  /**
   * Tra theo TỔ CHỨC + ID, đúng khuôn [findById] — `X-Branch-Id` không dự
   * phần. Nạp kèm `group` để response giữ nguyên `groupCode` của bản ghi: đợt
   * này không cho sửa nhóm, mà trả `null` thì app tưởng nhóm vừa bị xoá.
   *
   * Định danh là `id` nên `dto.code` là mã MỚI thuần tuý — không còn cảnh "mã
   * cũ trên path, mã mới trong body" như bản tra theo mã. Đổi mã xong, chính
   * đường dẫn này vẫn trỏ đúng bản ghi.
   *
   * `undefined` (vắng khoá) = giữ nguyên; `null` hoặc chuỗi rỗng = xoá trắng ô
   * đó. Hai nghĩa này KHÁC nhau và PATCH phải phân biệt được, nếu không người
   * dùng xoá số điện thoại rồi lưu sẽ thấy nó quay về.
   */
  async update(
    id: string,
    dto: MobileSupplierUpdateDto,
    actor: ActorContext,
  ): Promise<MobileSupplierResponseDto> {
    const row = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['group'],
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp.');
    }

    if (dto.code !== undefined) row.code = dto.code.trim();
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.status !== undefined) row.isActive = dto.status === 'active';
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.address !== undefined) row.address = toColumnValue(dto.address);
    if (dto.phone !== undefined) row.phone = toColumnValue(dto.phone);
    if (dto.taxCode !== undefined) row.taxCode = toColumnValue(dto.taxCode);

    // `row.code` là mã SAU khi đã áp `dto`: khi người dùng vừa đổi mã thì mã
    // ĐỤNG NHAU là mã mới, và câu báo lỗi phải nhắc đúng mã đó.
    const saved = await this.repo
      .save(row)
      .catch((err) => rethrowDuplicateCode(err, row.code));

    return toMobileSupplier(saved);
  }
}

/**
 * Nắn ba lệch giữa bảng `inventory_providers` và `SupplierEntity` phía Dart.
 *
 * `?? null` chứ không `?? ''`: cột nullable mang nghĩa "chưa từng nhập", khác
 * hẳn chuỗi rỗng — app dựa vào đúng ranh giới đó để biết có nên hiện dòng
 * thông tin hay không.
 */
function toMobileSupplier(row: ProviderEntity): MobileSupplierResponseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.isActive ? 'active' : 'inactive',
    type: row.type,
    address: row.address ?? null,
    phone: row.phone ?? null,
    taxCode: row.taxCode ?? null,
    groupCode: row.group?.code ?? null,
  };
}

/**
 * `null` và chuỗi rỗng đều nghĩa là "xoá trắng ô này" -> ghi NULL xuống cột.
 *
 * Trả `null` chứ KHÔNG trả `undefined`: `repository.save` trên một entity đã
 * nạp coi `undefined` là "không đổi" và giữ nguyên giá trị cũ — tức người dùng
 * xoá ô rồi lưu mà dữ liệu vẫn còn. Cột trong `ProviderEntity` khai
 * `string | undefined`, nên phép ép kiểu phải nằm đúng một chỗ, là đây.
 */
function toColumnValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return (trimmed ? trimmed : null) as unknown as string | undefined;
}

/**
 * Dịch `23505` của Postgres (`UQ_inventory_providers_org_code`) sang 409 nói
 * TIẾNG VIỆT và nhắc lại mã bị đụng.
 *
 * `BaseCrudService` cũng bắt đúng mã lỗi này nhưng trả câu tiếng Anh "A record
 * with the same unique code already exists in this organization"; app mobile
 * hiện thẳng `message` của server lên toast, nên câu đó không dùng được.
 *
 * Đọc `err.code` rồi mới tới `driverError.code`: TypeORM gói lỗi driver ở độ
 * sâu khác nhau tuỳ phiên bản.
 */
function rethrowDuplicateCode(err: unknown, code: string): never {
  const pgCode =
    err instanceof QueryFailedError
      ? ((err as QueryFailedError & { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code)
      : undefined;

  if (pgCode === '23505') {
    throw new ConflictException(`Mã nhà cung cấp "${code}" đã tồn tại.`);
  }
  throw err;
}
