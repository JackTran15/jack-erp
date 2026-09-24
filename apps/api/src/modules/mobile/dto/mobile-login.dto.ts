import { LoginDto } from '../../auth/dto/login.dto';

/**
 * Cùng ba field với `POST /auth/login`, nên **kế thừa thẳng `LoginDto`** thay
 * vì chép lại — `class-validator` và `@nestjs/swagger` đều đi theo chuỗi
 * nguyên mẫu, nên whitelist lẫn schema `/docs` giữ nguyên.
 *
 * Chiều phụ thuộc đúng: `mobile` là facade mỏng trên `auth`
 * (`mobile-auth.controller.ts` vốn đã import `AuthService`), không phải ngược
 * lại.
 *
 * Lý do CỐ Ý không dùng `@IsEmail()` / `@IsUUID()` — của riêng app mobile:
 * `LoginBloc` không có nhánh nào cho `BadRequestException` (nó rơi vào
 * `LoginError.unknown`), nên một validator chặt hơn chỉ đổi thông báo "Sai
 * thông tin đăng nhập" thành "Lỗi không xác định". `LoginDto` giữ cùng lựa
 * chọn đó vì một lý do khác, ghi ở chính nó.
 *
 * Giữ một class RIÊNG chứ không dùng thẳng `LoginDto`: tên hiện trong `/docs`
 * là tên class, và hợp đồng của hai route được quyền tách nhau về sau.
 */
export class MobileLoginDto extends LoginDto {}
