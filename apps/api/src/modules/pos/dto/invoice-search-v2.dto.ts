import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../entities/invoice.entity';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class InvoiceSearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Số hóa đơn */
  /**
   * Free-text: matches invoice code OR customer name OR customer phone — the
   * same three columns SearchDraftInvoicesV2Handler searches, so the mobile
   * list finds what the POS draft grid finds. Applied through
   * `FilterBuilder.applyOrString`, which escapes `%`/`_` (a typed `%` matches a
   * percent sign, not every row).
   */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Status IN (...) — a set, unlike `status` which is a single equality. The
   * mobile list folds its three user-facing states into these values
   * (e.g. "debt" = pending + debt + partial_debt), so it needs the set form.
   */
  @IsOptional()
  @IsArray()
  @IsEnum(InvoiceStatus, { each: true })
  statuses?: InvoiceStatus[];

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Trạng thái */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Loại hóa đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  /** Ngày hóa đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt?: DateRangeFilterDto;

  /** Ngày tạo đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Mã / tên khách hàng — filter by customer UUID */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Số điện thoại */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerPhone?: StringFilterDto;

  /** Mã khách hàng */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerCode?: StringFilterDto;

  /** Tên khách hàng */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerName?: StringFilterDto;

  /** Tổng thanh toán */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amountDue?: CompareFilterDto;

  /**
   * Nhân viên được ghi công bán — `employee_profiles.id`, KHÔNG phải `users.id`.
   *
   * Thêm cho `/mobile/invoices`, nơi vai tư vấn chỉ được thấy hoá đơn của chính
   * mình. Đường mobile tra `employee_profiles` từ `actor.userId` rồi đặt trường
   * này; **client không đặt được nó** vì DTO của đường mobile không phơi ra.
   *
   * Ở đường web thì nó là một bộ lọc bình thường như mọi bộ lọc khác — phạm vi
   * ở đó vẫn do tổ chức và chi nhánh quyết, không do trường này.
   */
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  /**
   * Người TẠO hoá đơn (`users.id`), ghép với [salespersonId] bằng **OR**.
   *
   * Không phải một bộ lọc thứ hai mà là vế còn lại của CÙNG một câu hỏi: *"hoá
   * đơn nào là của tôi"*. Vai tư vấn nhận diện bằng `salesperson_id`; vai thu
   * ngân thì không — hoá đơn họ lập tại quầy, phiếu trả hàng và phiếu đổi hàng
   * đều để `salesperson_id` TRỐNG (đo trên dev 2026-09-15: 23/23 phiếu trả và
   * 2/2 phiếu đổi đều trống). Chỉ lọc theo vế đầu thì mọi chứng từ của thu ngân
   * biến mất khỏi danh sách của chính họ — Loc rà 2026-09-15.
   *
   * **Chỉ có tác dụng khi đi CÙNG [salespersonId]**; đứng một mình thì bị bỏ
   * qua, để đường web không vô tình đổi phạm vi vì một tham số lạ.
   */
  @IsOptional()
  @IsUUID()
  createdByUserId?: string;

  /** Ghi chú */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  note?: StringFilterDto;
}
