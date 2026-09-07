import { ApiProperty } from '@nestjs/swagger';

/**
 * Bản rút gọn của `UsersService.getMe` cho app mobile. `roles`, `permissions`,
 * `branchIds` cố ý KHÔNG có ở đây — chúng đã nằm trong `SessionInfo` mà
 * `GET /mobile/auth/session` trả về và app đã lưu sẵn.
 */
export class MobileMeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  /** `firstName` + `lastName` ghép sẵn — app mobile chỉ hiển thị một dòng tên. */
  @ApiProperty()
  fullName!: string;
}
