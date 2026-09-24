import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body của `POST /auth/refresh`.
 *
 * **Route này KHÔNG hỏng trước khi có class này** — nói rõ để người sau không
 * đọc nhầm thành một lỗ hổng đã vá. `AuthService.refresh` bọc `jwt.verify`
 * trong `try/catch`, nên token vắng, rỗng hay rác đều đã ra
 * **401 `Invalid refresh token`**; đo lại cả ba ca ngày 2026-09-24 đều đúng
 * vậy. Khác hẳn `POST /auth/login`, nơi thiếu `organizationId` từng trả 200
 * kèm một token thiếu claim — xem `LoginDto`.
 *
 * Giá trị của class này là hai thứ còn thiếu, không phải chuyện xác thực:
 *
 * 1. **Whitelist.** `@Body()` khai bằng type (`RefreshRequest`) thì
 *    `ValidationPipe` không có metatype để kiểm và cho qua mọi key thừa, kể cả
 *    khi `main.ts` đã bật `forbidNonWhitelisted`. Đây là `@Body()` cuối cùng
 *    của `AuthController` còn khai bằng type.
 * 2. **Schema trong `/docs`.** Type không sinh ra schema nào.
 *
 * **KHÔNG thêm guard `if (!refreshToken)` vào `AuthService.refresh`** —
 * `jwt.verify` đã ném với mọi đầu vào không phải chuỗi hợp lệ và `catch` đã
 * dịch thành 401. Một guard nữa ở đó là nhánh không bao giờ chạy tới. (Guard
 * tương ứng trong `login` thì cần, vì ở đó `orgId` rỗng đi thẳng vào `findOne`
 * mà không ai ném.)
 */
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token đã cấp ở lần đăng nhập trước' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
