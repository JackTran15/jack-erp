import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body của `POST /auth/login`, dùng bởi backoffice-web và pos-web.
 *
 * **Class này tồn tại vì `ValidationPipe` BỎ QUA một `@Body()` khai bằng
 * TYPE.** Trước đây controller nhận `LoginRequest & { organizationId: string }`
 * — một interface của `shared-interfaces` — nên pipe toàn cục không có
 * metatype để kiểm và cho qua mọi thứ. Hệ quả không hề im lặng một nửa mà im
 * lặng hoàn toàn: thiếu `organizationId` thì `AuthService.login` gọi
 * `findOne({ where: { email, organizationId: undefined } })`, TypeORM **bỏ
 * luôn** điều kiện `undefined`, user vẫn tìm thấy theo mỗi email, và lượt đăng
 * nhập **trả 200 kèm access token hợp lệ**. Token đó không mang claim
 * `organizationId`, nên mọi route có `PermissionGuard` sau đó trả
 * **403 `Authentication context missing`** — thông điệp nghe như thiếu Bearer,
 * trong khi Bearer vẫn đúng và phiên vẫn sống.
 *
 * Nhân ba lần nguy hiểm khi một email tồn tại ở nhiều tổ chức: `findOne` không
 * còn điều kiện nào để chọn, nên nó trả về hàng NÀO cũng được.
 *
 * **Cố ý KHÔNG dùng `@IsEmail()` / `@IsUUID()`** — cùng lý do đã ghi ở
 * `MobileLoginDto`, cộng một lý do riêng của route này: `@IsUUID()` sẽ tách
 * "org id sai định dạng" (400) khỏi "sai thông tin đăng nhập" (401), tức nói
 * cho người gọi biết chuỗi họ đoán có phải hình dạng một org id hay không.
 * Mọi thất bại xác thực trả cùng một câu là thứ đáng giữ. Giá trị của DTO này
 * là **whitelist + bắt buộc có mặt**, không phải kiểm định dạng.
 */
export class LoginDto {
  @ApiProperty({ description: 'Email đăng nhập' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'Mật khẩu' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  /** `format` chỉ ghi vào Swagger, không ép kiểu — xem chú thích đầu class. */
  @ApiProperty({ description: 'Id tổ chức (tenant)', format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
