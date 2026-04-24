import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import type {
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  SessionInfo,
} from '@erp/shared-interfaces';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginRequest & { organizationId: string },
  ): Promise<LoginResponse> {
    return this.authService.login(
      body.email,
      body.password,
      body.organizationId,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshRequest): Promise<RefreshResponse> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request): Promise<void> {
    const user = (req as any).user;
    if (!user?.jti) {
      throw new UnauthorizedException('No active session');
    }
    await this.authService.logout(user.jti);
  }

  @Get('session')
  async getSession(@Req() req: Request): Promise<SessionInfo> {
    const user = (req as any).user;
    if (!user?.jti) {
      throw new UnauthorizedException('No active session');
    }
    const session = await this.authService.getSession(user.jti);
    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }
    return session;
  }
}
