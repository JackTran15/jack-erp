export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  session: SessionInfo;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SwitchBranchRequest {
  branchId: string;
}

/** Same shape as login: new tokens carry the active branch, plus refreshed session info. */
export type SwitchBranchResponse = LoginResponse;

export interface CreateHandoffRequest {
  /** Branch the receiving app should open on; defaults to the caller's active branch. */
  branchId?: string;
}

export interface CreateHandoffResponse {
  /** Single-use code to put in the target app's URL. */
  code: string;
  /** Seconds the code stays valid. */
  expiresIn: number;
}

export interface ExchangeHandoffRequest {
  code: string;
}

/**
 * Same shape as login: the exchange mints a brand-new session for the receiving
 * app, so both apps hold independent sessions and neither logs the other out.
 */
export type ExchangeHandoffResponse = LoginResponse;

export interface SessionInfo {
  userId: string;
  organizationId: string;
  roles: string[];
  branchIds: string[];
  /** Resolved permission keys for the user (e.g. iam.role.read). */
  permissions: string[];
}

export interface JwtPayload {
  userId: string;
  organizationId: string;
  roles: string[];
  /** Branches the user may access. */
  branchIds: string[];
  /** Currently active branch (subset of branchIds). */
  branchId?: string;
  jti: string;
  iat: number;
  exp: number;
}

export enum AuthErrorCode {
  TOKEN_MALFORMED = '4014001',
  SESSION_REVOKED = '4014002',
  TOKEN_EXPIRED = '4014003',
  REFRESH_TOKEN_INVALID = '4014004',
}
