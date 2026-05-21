import type { UserDetail } from "@erp/shared-interfaces";

/** Role-centric assignment: compute new roleIds per user. */
export function computeRoleAssignmentUpdates(
  allUsers: Pick<UserDetail, "id" | "roleIds">[],
  roleId: string,
  desiredUserIds: string[],
): Array<{ userId: string; roleIds: string[] }> {
  const desiredSet = new Set(desiredUserIds);
  const updates: Array<{ userId: string; roleIds: string[] }> = [];

  for (const user of allUsers) {
    const hasRole = user.roleIds.includes(roleId);
    const shouldHave = desiredSet.has(user.id);
    if (hasRole === shouldHave) continue;

    const next = shouldHave
      ? [...new Set([...user.roleIds, roleId])]
      : user.roleIds.filter((id) => id !== roleId);

    updates.push({ userId: user.id, roleIds: next });
  }

  return updates;
}
