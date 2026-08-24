import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import { BranchStatus } from "@erp/shared-interfaces";
import { CacheService } from "../redis/cache.service";
import { BranchEntity } from "./branch.entity";

const CACHE_NAMESPACE = "branch-status";

/**
 * Deliberately short. `CacheService.getOrSet` is read-through with no lock, so a
 * reader that missed the cache just before a suspend can write its stale set
 * back afterwards. This TTL is the ceiling on how long that stale set survives,
 * and this cache gates `AuthGuard` — a 5-minute ceiling would mean a closed
 * store keeps selling for 5 minutes, which is the thing ADR-02 exists to stop.
 */
const CACHE_TTL_SECONDS = 30;

/** Shown for every rejected destination — an id from another organization must
 * not be distinguishable from one that simply does not exist. */
export const INVALID_DESTINATION_BRANCH_MESSAGE =
  "Cửa hàng đích không hợp lệ hoặc đã ngừng hoạt động.";

/**
 * The single answer to "which branches are operating right now".
 *
 * Every surface that hides a deactivated branch — the JWT branch list, the
 * branch pickers, the report filters, the cross-branch write paths — asks here
 * rather than spelling out `status = 'ACTIVE'` for itself.
 */
@Injectable()
export class BranchStatusService {
  private readonly logger = new Logger(BranchStatusService.name);

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly cache: CacheService,
  ) {}

  /** Ids of every operating branch in the organization. */
  async activeBranchIds(organizationId: string): Promise<string[]> {
    const rows = await this.branchRepo.find({
      where: { organizationId, status: BranchStatus.ACTIVE },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Ids of every branch whose status is anything other than ACTIVE — suspended
   * *and* archived. Cached per organization.
   *
   * Read on the hot path (`AuthGuard`, once per request), so it must not touch
   * Postgres on a cache hit. Non-operating branches are the small side of the
   * set; caching those rather than the active ones keeps the payload tiny.
   */
  async nonOperatingBranchIds(organizationId: string): Promise<Set<string>> {
    const ids = await this.cache.getOrSet<string[]>(
      CACHE_NAMESPACE,
      organizationId,
      async () => {
        const rows = await this.branchRepo.find({
          where: { organizationId, status: Not(BranchStatus.ACTIVE) },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      },
      CACHE_TTL_SECONDS,
    );
    return new Set(ids);
  }

  /** True for a suspended *or* archived branch — anything not operating. */
  async isNotOperating(
    organizationId: string,
    branchId: string,
  ): Promise<boolean> {
    return (await this.nonOperatingBranchIds(organizationId)).has(branchId);
  }

  /**
   * Guard for a branch id arriving in a request body — a transfer destination,
   * a treasury counterparty. Missing, foreign and deactivated all fail the same
   * way on purpose.
   */
  async assertActiveBranch(
    branchId: string,
    organizationId: string,
  ): Promise<BranchEntity> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, organizationId },
    });
    if (!branch || branch.status !== BranchStatus.ACTIVE) {
      throw new BadRequestException(INVALID_DESTINATION_BRANCH_MESSAGE);
    }
    return branch;
  }

  /** Called inside the same operation that writes `status`, never after it. */
  async invalidate(organizationId: string): Promise<void> {
    await this.cache.invalidate(CACHE_NAMESPACE, organizationId);
    this.logger.debug(`Branch status cache invalidated for org ${organizationId}`);
  }
}
