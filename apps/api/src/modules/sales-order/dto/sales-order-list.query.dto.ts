import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SalesOrderStatus } from '../entities/sales-order.entity';

/**
 * Giá trị lọc "chưa phân chi nhánh" của lưới Admin (`branch_id IS NULL`, A-03).
 *
 * Là một TỪ KHOÁ, cố ý không phải chuỗi rỗng: `?branchId=` (rỗng) không phân
 * biệt được với "không lọc chi nhánh", nên nếu nhận chuỗi rỗng thì một lần gõ
 * nhầm trên URL sẽ trả về toàn chuỗi thay vì đúng pool.
 */
export const UNASSIGNED_BRANCH_FILTER = 'UNASSIGNED';

/**
 * `branchId` hợp lệ = uuid, hoặc đúng từ khoá {@link UNASSIGNED_BRANCH_FILTER}.
 *
 * Một regex thay vì `@IsUUID()` + `@ValidateIf`: hai decorator điều kiện trên
 * cùng một trường thì thứ tự chạy quyết định thông báo lỗi, còn ở đây mọi giá
 * trị ngoài tập này — kể cả chuỗi rỗng — đều là 400 với cùng một câu.
 */
export const BRANCH_ID_FILTER_PATTERN =
  /^(UNASSIGNED|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/** Tập khoá ĐÓNG (`forbidNonWhitelisted`): trang, cỡ trang, trạng thái, khoảng ngày tạo. */
export class SalesOrderListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  /**
   * Chi nhánh cần xem, thay cho chi nhánh đang làm việc của người gọi.
   *
   * App quản lý mở đơn của MỘT cửa hàng từ màn chi tiết cửa hàng, mà cửa hàng
   * đó thường không phải cửa hàng đang chọn trên thanh điều hướng — tức không
   * phải `X-Branch-Id`. Vắng khoá này thì rơi về chi nhánh của người gọi, đúng
   * hành vi cũ của lưới POS.
   *
   * **KHÔNG nới quyền:** `BranchScopeGuard` đọc `query.branchId` TRƯỚC header
   * (`common/utils/branch-request.util.ts`) và vẫn đòi id đó nằm trong tập chi
   * nhánh được phân công; gửi chi nhánh lạ vẫn là 403.
   */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Hộp thư của thu ngân: đơn CHỜ thu ngân làm gì đó — `SENT` (chờ nhận) HOẶC
   * `PROCESSED` mà hoá đơn còn NHÁP (đã nhận, chưa thu). Thiếu vế sau thì đơn
   * rời hộp thư ngay khi *Nhận xử lý*, và rời giỏ trước khi thu là mất lối mở
   * lại nháp (Loc báo 2026-09-22). Có nó thì [status] bị bỏ qua.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  awaitingCashier?: boolean;
}
