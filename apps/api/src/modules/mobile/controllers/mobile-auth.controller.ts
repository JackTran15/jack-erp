import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import type {
  LoginResponse,
  RefreshResponse,
  SessionInfo,
} from '@erp/shared-interfaces';
import { AuthService } from '../../auth/auth.service';
import { Public } from '../../auth/decorators/public.decorator';
import { MobileLoginDto } from '../dto/mobile-login.dto';
import { MobileRefreshDto } from '../dto/mobile-refresh.dto';

/**
 * Facade thuần: mọi route ủy quyền thẳng cho `AuthService`, không có logic
 * nghiệp vụ nào ở đây. Route phẳng `/auth/*` giữ nguyên cho backoffice/POS.
 *
 * Dùng `@Req()` + `user.jti` thay vì `@Actor()` vì `ActorContext` không mang
 * `jti`, mà `logout`/`getSession` khoá theo đúng trường đó.
 */
@ApiTags('mobile')
@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập từ app mobile' })
  login(@Body() dto: MobileLoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password, dto.organizationId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cấp lại cặp token từ refresh token' })
  refresh(@Body() dto: MobileRefreshDto): Promise<RefreshResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Thu hồi phiên hiện tại' })
  async logout(@Req() req: Request): Promise<void> {
    const jti = (req as any).user?.jti;
    if (!jti) {
      throw new UnauthorizedException('No active session');
    }
    await this.authService.logout(jti);
  }

  @Get('session')
  @ApiOperation({ summary: 'Thông tin phiên: user, tổ chức, vai trò, quyền' })
  async getSession(@Req() req: Request): Promise<SessionInfo> {
    const jti = (req as any).user?.jti;
    if (!jti) {
      throw new UnauthorizedException('No active session');
    }
    const session = await this.authService.getSession(jti);
    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }
    return session;
  }
}
