import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../../../auth/user.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';

/** Code + display name of the staff member recorded on a voucher. */
export interface VoucherStaff {
  code: string | null;
  name: string;
}

/**
 * Resolves `collected_by` / `paid_by` user ids into a code + display name.
 *
 * Vouchers store only the user id, and the client used to resolve the name via
 * `GET /admin/users/:id` — which requires `iam.user.read`, a permission treasury
 * staff generally do not hold, so the name silently came back empty. Resolving it
 * server-side alongside the voucher removes both the extra round-trip and the
 * permission coupling; the deposit ledger already joins the same two tables.
 */
@Injectable()
export class VoucherStaffResolver {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profileRepo: Repository<EmployeeProfileEntity>,
  ) {}

  /** One batched query per table, keyed by user id. Unknown ids are simply absent. */
  async resolveMany(
    userIds: (string | null | undefined)[],
    organizationId: string,
  ): Promise<Map<string, VoucherStaff>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    const result = new Map<string, VoucherStaff>();
    if (ids.length === 0) return result;

    const [users, profiles] = await Promise.all([
      this.userRepo.find({ where: { id: In(ids), organizationId } }),
      this.profileRepo.find({ where: { userId: In(ids), organizationId } }),
    ]);
    const codeByUserId = new Map(profiles.map((p) => [p.userId, p.code]));

    for (const user of users) {
      const name =
        `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
      result.set(user.id, { code: codeByUserId.get(user.id) ?? null, name });
    }
    return result;
  }

  async resolveOne(
    userId: string | null | undefined,
    organizationId: string,
  ): Promise<VoucherStaff | null> {
    if (!userId) return null;
    const map = await this.resolveMany([userId], organizationId);
    return map.get(userId) ?? null;
  }
}
