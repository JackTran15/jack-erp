import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { UsersService } from '../../rbac/users.service';
import { MobileMeResponseDto } from '../dto/mobile-me.response.dto';

/**
 * Chỉ có `@Get('me')`. Nếu sau này thêm `@Get(':id')` thì PHẢI khai sau `me`,
 * nếu không param sẽ nuốt mất route đó — đúng luật `UsersController` đang theo.
 */
@ApiTags('mobile')
@Controller('mobile/users')
export class MobileUserController {
  constructor(private readonly users: UsersService) {}

  /**
   * `UsersService.getMe` trả UserDetail + roles + permissions + profile HR.
   * App mobile chỉ hiển thị tên, nên cắt xuống ba trường và ghép `fullName` —
   * `UserModel` phía Dart đọc đúng `fullName`, không đọc firstName/lastName.
   */
  @Get('me')
  @ApiOperation({ summary: 'Người dùng đang đăng nhập (bản rút gọn cho mobile)' })
  async getMe(@Actor() actor: ActorContext): Promise<MobileMeResponseDto> {
    const me = await this.users.getMe(actor);
    return {
      id: me.id,
      email: me.email,
      fullName: [me.firstName, me.lastName].filter(Boolean).join(' ').trim(),
    };
  }
}
