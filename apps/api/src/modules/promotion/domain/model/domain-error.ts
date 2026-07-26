export interface DomainValidationIssue {
  field: string;
  code: string;
  message: string;
}

/** Carries every invariant violation at once so the application layer can surface all of them to the form in one 400. */
export class DomainValidationError extends Error {
  constructor(public readonly issues: DomainValidationIssue[]) {
    super(`Promotion program validation failed: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'DomainValidationError';
  }
}
