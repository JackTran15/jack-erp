import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class MobileEvaluateCartLineDto {
  /**
   * Do CLIENT tự đặt và được trả lại nguyên trong `appliedPrograms[].lineDiscounts[]`,
   * nên app ghép kết quả về dòng mà không phải đoán theo thứ tự.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lineId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  /**
   * Giảm giá TAY cho riêng dòng này, tính bằng TIỀN (không phải %).
   *
   * Mở cho mobile ngày 2026-09-11 theo yêu cầu của Loc: màn Chi tiết đơn hàng
   * của vai tư vấn nay có thao tác vuốt dòng -> "Khuyến mại", đúng thứ mà
   * pos-web đã làm qua `LineDiscountDialog`.
   *
   * Engine trừ nó TRƯỚC khi áp chương trình tự động
   * (`discount-math.ts`: `quantity*unitPrice - manualLineDiscount`), nên nó
   * không cộng dồn lên trên giá đã giảm.
   *
   * Chỉ nhận SỐ TIỀN — giống hệt `EvaluateCartLineInputDto` của bản web. Client
   * nào muốn nhập theo % thì tự quy ra tiền trước khi gửi; mở thêm một trường
   * `%` ở đây là hai đường tính cho cùng một con số.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualLineDiscount?: number;
}

/**
 * TẬP CON của `EvaluateCartDto` (web), cố ý hẹp hơn — không phải một bản chép
 * thiếu.
 *
 * Ba trường của bản web KHÔNG có mặt ở đây:
 *
 * - **`at`** — bản web cho client chọn MỐC THỜI GIAN định giá. Với một token vai
 *   bán hàng thì đó là một cửa để định giá giỏ theo giá của tuần trước; app
 *   không có nhu cầu nào cần nó, nên bỏ hẳn thay vì tin là sẽ không ai dùng.
 * - **`excludedProgramIds`** — màn khuyến mại của app chỉ có thao tác TICK để
 *   CHỌN (`selectedProgramIds`); không có lối vào nào cho việc loại trừ.
 * (`manualLineDiscount` từng nằm trong danh sách này với lý do "giảm giá tay là
 * việc của thu ngân ở màn thanh toán". Đã MỞ ngày 2026-09-11: vai tư vấn cũng
 * cần nó ngay trên dòng đơn — xem chú thích tại chính trường đó.)
 *
 * `forbidNonWhitelisted: true` bật toàn cục, nên gửi thừa một khoá là **400 cho
 * cả lượt gọi** chứ không phải bị bỏ qua — đó chính là hiệu lực mong muốn của
 * việc khai hẹp, và cũng là lý do phải khai ĐỦ mọi trường app thật sự gửi.
 */
export class MobileEvaluateCartDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Bỏ trống = khách vãng lai' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Id các chương trình người dùng TỰ CHỌN. Hai nghĩa, và đó là chủ ý của bản
   * web (ADR-03 bên đó): bật một chương trình `auto_apply=false`, và cho một
   * chương trình thắng tranh chấp tài nguyên trước cả `priority`.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  /**
   * RỖNG là hợp lệ, có chủ ý: màn *Chương trình khuyến mại* của app bày danh
   * mục chương trình (`availablePrograms`) trước khi đơn có dòng nào.
   */
  @ApiProperty({ type: [MobileEvaluateCartLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileEvaluateCartLineDto)
  lines: MobileEvaluateCartLineDto[];
}
