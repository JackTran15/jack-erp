import { BadRequestException } from '@nestjs/common';
import { DomainValidationError } from '../domain/model/domain-error';

/** Maps a DomainValidationError to a 400 carrying every violated field at once; rethrows anything else unchanged. */
export function rethrowDomainError(error: unknown): never {
  if (error instanceof DomainValidationError) {
    throw new BadRequestException({ message: 'Invalid promotion configuration', issues: error.issues });
  }
  throw error;
}
