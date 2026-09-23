import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { asUuid } from '../notification.types';

export interface RecipientQuery {
  organizationId: string;
  /** Event branch; undefined = organization-level (no branch filter). */
  branchId?: string;
  /** Recipient must hold ANY of these permission keys. */
  permissions: readonly string[];
  /** Excluded from the result (the actor), when set. */
  excludeUserId?: string;
}

/**
 * "Who may be told about this?" — active users of the organization holding the
 * document's read permission AND (for branch events) assigned to that branch.
 *
 * Branch access mirrors `AuthService.resolveUserBranches`: a user reaches a
 * branch only through `user_branch_assignments` (there is no implicit
 * "all branches" role), and the branch must be ACTIVE.
 *
 * Joins cast explicitly: business tables store ids as varchar, the RBAC
 * tables as uuid.
 */
@Injectable()
export class NotificationRecipientResolver {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(query: RecipientQuery): Promise<string[]> {
    const organizationId = asUuid(query.organizationId);
    if (!organizationId || query.permissions.length === 0) return [];

    const branchId = query.branchId === undefined ? null : asUuid(query.branchId);
    // A branch-level event with a malformed branch id reaches nobody rather than everybody.
    if (query.branchId !== undefined && !branchId) return [];

    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT DISTINCT u."id"
         FROM "users" u
         JOIN "user_roles" ur       ON ur."user_id" = u."id" AND ur."organization_id" = $1
         JOIN "role_permissions" rp ON rp."role_id" = ur."role_id"
         JOIN "permissions" p       ON p."id" = rp."permission_id" AND p."key" = ANY($2::text[])
        WHERE u."organization_id" = $1
          AND u."is_active" = true
          AND ($4::uuid IS NULL OR u."id" <> $4::uuid)
          AND (
            $3::uuid IS NULL OR EXISTS (
              SELECT 1
                FROM "user_branch_assignments" uba
                JOIN "branches" b ON b."id"::text = uba."branch_id"::text
               WHERE uba."user_id" = u."id"
                 AND uba."branch_id" = $3::uuid
                 AND b."status" = 'ACTIVE'
            )
          )`,
      [organizationId, [...query.permissions], branchId, asUuid(query.excludeUserId) ?? null],
    );
    return rows.map((r) => r.id);
  }

  /**
   * Every active user holding one of `permissions`, with the ACTIVE branches
   * they are assigned to — for definitions that aggregate per user (a
   * chain-wide total must only add up branches that user may see).
   * Users with no active branch are left out.
   */
  async assignedBranches(query: { organizationId: string; permissions: readonly string[] }): Promise<Map<string, string[]>> {
    const organizationId = asUuid(query.organizationId);
    if (!organizationId || query.permissions.length === 0) return new Map();

    const rows: Array<{ user_id: string; branch_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT u."id" AS user_id, uba."branch_id"::text AS branch_id
         FROM "users" u
         JOIN "user_roles" ur       ON ur."user_id" = u."id" AND ur."organization_id" = $1
         JOIN "role_permissions" rp ON rp."role_id" = ur."role_id"
         JOIN "permissions" p       ON p."id" = rp."permission_id" AND p."key" = ANY($2::text[])
         JOIN "user_branch_assignments" uba ON uba."user_id" = u."id"
         JOIN "branches" b          ON b."id"::text = uba."branch_id"::text AND b."status" = 'ACTIVE'
        WHERE u."organization_id" = $1 AND u."is_active" = true`,
      [organizationId, [...query.permissions]],
    );

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.branch_id]);
    }
    return byUser;
  }
}
