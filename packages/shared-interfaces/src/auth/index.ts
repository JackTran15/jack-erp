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
