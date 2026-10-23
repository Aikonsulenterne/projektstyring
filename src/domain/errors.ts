export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_MISMATCH'
  | 'INVALID_REFERENCE'
  | 'ARCHIVED'
  | 'STORAGE_CORRUPT'
  | 'STORAGE_UNAVAILABLE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'NETWORK'
  | 'UNEXPECTED';

export interface DomainErrorDetails {
  fieldErrors?: Record<string, string>;
  currentVersion?: number;
  requestId?: string;
}

/** Errors with a stable code and a Danish, user-facing message. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: DomainErrorDetails;

  constructor(code: DomainErrorCode, message: string, details: DomainErrorDetails = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export const MESSAGES = {
  saveFailed: 'Kunne ikke gemme. Din tekst er bevaret. Prøv igen.',
  taskConflict: 'Opgaven er blevet opdateret af en anden. Din kladde er bevaret.',
  conflict: 'Den er blevet opdateret af en anden. Din kladde er bevaret.',
  notFound: 'Vi kunne ikke finde den. Den kan være slettet eller du har ikke adgang.',
  invalidReference: 'Det valgte projekt, område eller person findes ikke i dette arbejdsrum.',
  storageCorrupt: 'Gemte data kunne ikke læses. De bliver ikke overskrevet. Eksportér dem, eller gendan en gyldig backup.',
  storageUnavailable: 'Browserens lager er ikke tilgængeligt. Ændringer gemmes ikke.',
  unexpected: 'Noget gik galt. Prøv igen.',
} as const;

export function conflict(currentVersion: number, message: string = MESSAGES.conflict): DomainError {
  return new DomainError('VERSION_CONFLICT', message, { currentVersion });
}

export function notFound(): DomainError {
  return new DomainError('NOT_FOUND', MESSAGES.notFound);
}

export function invalidReference(field: string): DomainError {
  return new DomainError('INVALID_REFERENCE', MESSAGES.invalidReference, {
    fieldErrors: { [field]: MESSAGES.invalidReference },
  });
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
