import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { NotificationScope } from '../notification.types';

export interface PreferenceQuery {
  userIds: string[];
  type: string;
  /** Branch of the notification; undefined = organization-level. */
  branchId?: string;
  defaultEnabled: boolean;
  /** See `NotificationContext.scope`. Default `any`. */
  scope?: NotificationScope;
}

/**
 * Filters recipients by their "Thiết lập thông báo" preference:
 *
 * | setting                          | notification from branch B |
 * |----------------------------------|----------------------------|
 * | scope = chain, type on           | kept                       |
 * | scope = branch X, type on        | kept only if B = X         |
 * | type off                         | dropped                    |
 * | no row (never saved)             | `defaultEnabled`           |
 *
 * Organization-level notifications (no branch) ignore the scope.
 *
 * `scope` narrows it further for firings built per scope (daily revenue):
 * `branchOnly` keeps only users scoped to exactly this branch, `chainOnly`
 * only chain-scoped users (a never-saved user counts as chain-scoped — that is
 * the screen's default).
 */
@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly dataSource: DataSource) {}

  async filter(query: PreferenceQuery): Promise<string[]> {
    if (query.userIds.length === 0) return [];

    const rows: Array<{ user_id: string; scope_branch_id: string | null; enabled_types: string[] }> =
      await this.dataSource.query(
        `SELECT "user_id", "scope_branch_id", "enabled_types"
           FROM "user_notification_settings"
          WHERE "user_id" = ANY($1::uuid[])`,
        [query.userIds],
      );
    const byUser = new Map(rows.map((r) => [r.user_id, r]));

    const scope = query.scope ?? 'any';

    return query.userIds.filter((userId) => {
      const row = byUser.get(userId);
      const enabled = row ? row.enabled_types.includes(query.type) : query.defaultEnabled;
      if (!enabled) return false;

      const userScope = row?.scope_branch_id ?? null;
      if (scope === 'chainOnly') return userScope === null;
      if (scope === 'branchOnly') return userScope !== null && userScope === query.branchId;
      if (userScope === null || query.branchId === undefined) return true;
      return userScope === query.branchId;
    });
  }
}
