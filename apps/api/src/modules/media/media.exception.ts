import { HttpException } from '@nestjs/common';

export type MediaErrorCode =
  | 'MEDIA_TYPE_NOT_ALLOWED'
  | 'MEDIA_TOO_LARGE'
  | 'MEDIA_LIMIT_EXCEEDED'
  | 'MEDIA_INVALID'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_STATE_CONFLICT'
  | 'STORAGE_UNAVAILABLE';

/**
 * Same shape as `AuthException` (`common/exceptions/auth.exception.ts`): `code` is
 * a public property, not nested in the HttpException response body, because
 * `HttpExceptionFilter` only promotes `code` to the top level when it finds it as
 * a property of the exception itself (`http-exception.filter.ts:30-36`).
 */
export class MediaException extends HttpException {
  public readonly code: MediaErrorCode;

  constructor(status: number, code: MediaErrorCode, message?: string) {
    super(message ?? code, status);
    this.code = code;
  }
}
