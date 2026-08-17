import { UnauthorizedException } from '@nestjs/common';
import { AuthErrorCode } from '@erp/shared-interfaces';

export class AuthException extends UnauthorizedException {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
