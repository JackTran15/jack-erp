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
import { SwitchBranchDto } from './dto/switch-branch.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateHandoffDto } from './dto/create-handoff.dto';
import { ExchangeHandoffDto } from './dto/exchange-handoff.dto';
import type {
  CreateHandoffResponse,
  ExchangeHandoffResponse,
  JwtPayload,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  SessionInfo,
  SwitchBranchResponse,
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

  @Post('switch-branch')
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Req() req: Request,
    @Body() body: SwitchBranchDto,
  ): Promise<SwitchBranchResponse> {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user?.jti) {
      throw new UnauthorizedException('No active session');
    }
    return this.authService.switchBranch(user, body.branchId);
  }

  /**
   * Hand the signed-in user to a sibling SPA (backoffice → POS) without a second
   * login. No @RequirePermission: opening POS is not a privileged act — the code
   * only ever grants the caller's own access, and the receiving app is still
   * gated by that user's permissions.
   */
  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  async createHandoff(
    @Req() req: Request,
    @Body() body: CreateHandoffDto,
  ): Promise<CreateHandoffResponse> {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user?.userId || !user?.organizationId) {
      throw new UnauthorizedException('No active session');
    }
    return this.authService.createHandoffCode(user, body.branchId);
  }

  /**
   * @Public because the receiving app has no session yet — that is the point.
   * The code itself is the credential: single-use and valid for a minute.
   */
  @Public()
  @Post('handoff/exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeHandoff(
    @Body() body: ExchangeHandoffDto,
  ): Promise<ExchangeHandoffResponse> {
    return this.authService.exchangeHandoffCode(body.code);
  }

  /**
   * Self-service, so no @RequirePermission: staff roles hold no `iam.*` key yet
   * must be able to rotate their own password. Resetting someone else's is a
   * different route (POST /admin/users/:id/reset-password).
   */
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user?.userId || !user?.organizationId) {
      throw new UnauthorizedException('No active session');
    }
    await this.authService.changeOwnPassword(
      user.userId,
      user.organizationId,
      body.currentPassword,
      body.newPassword,
    );
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
