import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CounterpartyKind } from '../../counterparty/dto/search-counterparties.dto';

/**
 * Loại đối tượng mà PHIẾU KHO nhận được.
 *
 * Cố ý KHÔNG có `customer`, dù `CounterpartyKind` của backend có. Lý do là một
 * ràng buộc cứng ở tầng dưới — `resolveDocCounterparty` ném thẳng
 * *"Đối tượng phiếu kho chỉ bao gồm nhà cung cấp và nhân viên"* khi gặp
 * `customer`. Cho nó lên danh sách là bày ra một lựa chọn mà chọn xong sẽ 400.
 */
export const MOBILE_DOC_COUNTERPARTY_KINDS = [
  CounterpartyKind.SUPPLIER,
  CounterpartyKind.EMPLOYEE,
] as const;

export class MobileCounterpartyListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Thu hẹp còn một loại. Bỏ trống thì trả cả hai loại phiếu kho nhận được.
   *
   * Màn "Nhân viên mua hàng" truyền `employee`; màn "Đối tượng" không truyền gì
   * — bạn đã chốt nó là MỘT danh sách phẳng, không chia tab.
   *
   * Nhận mảng (`?kinds=supplier&kinds=employee`) chứ không một giá trị: hợp
   * đồng bên dưới đã có `types[]`, và một ngày nào đó màn Đối tượng cần đúng
   * hai loại trong ba thì không phải đổi hình dạng tham số.
   */
  @ApiPropertyOptional({ enum: MOBILE_DOC_COUNTERPARTY_KINDS, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsEnum(MOBILE_DOC_COUNTERPARTY_KINDS, { each: true })
  kinds?: CounterpartyKind[];
}
