import { BadRequestException } from "@nestjs/common";
import { Not } from "typeorm";
import { BranchStatus } from "@erp/shared-interfaces";
import { BranchEntity } from "./branch.entity";
import {
  BranchStatusService,
  INVALID_DESTINATION_BRANCH_MESSAGE,
} from "./branch-status.service";

const branchStub = (overrides: Partial<BranchEntity> = {}): BranchEntity =>
  ({
    id: "branch-1",
    organizationId: "org-1",
    name: "Chi nhánh Hà Nội",
    status: BranchStatus.ACTIVE,
    isMainBranch: false,
    ...overrides,
  }) as BranchEntity;

describe("BranchStatusService", () => {
  let branchRepo: { find: jest.Mock; findOne: jest.Mock };
  let cache: { getOrSet: jest.Mock; invalidate: jest.Mock };
  let service: BranchStatusService;

  beforeEach(() => {
    branchRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    cache = {
      // Read-through by default: run the loader so the predicate under test
      // is actually exercised rather than stubbed away.
      getOrSet: jest.fn(async (_ns, _key, loader) => loader()),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };
    service = new BranchStatusService(branchRepo as never, cache as never);
  });

  describe("activeBranchIds", () => {
    it("returns only operating branches, scoped to the organization", async () => {
      branchRepo.find.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);

      const ids = await service.activeBranchIds("org-1");

      expect(ids).toEqual(["b1", "b2"]);
      expect(branchRepo.find).toHaveBeenCalledWith({
        where: { organizationId: "org-1", status: BranchStatus.ACTIVE },
        select: { id: true },
      });
    });
  });

  describe("nonOperatingBranchIds", () => {
    it("asks for every status other than ACTIVE, scoped to the organization", async () => {
      branchRepo.find.mockResolvedValue([{ id: "b9" }]);

      const ids = await service.nonOperatingBranchIds("org-1");

      expect(ids).toEqual(new Set(["b9"]));
      expect(branchRepo.find).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          status: Not(BranchStatus.ACTIVE),
        },
        select: { id: true },
      });
    });

    it("caches under the namespace and key that invalidate() clears", async () => {
      await service.nonOperatingBranchIds("org-1");
      await service.invalidate("org-1");

      const [readNamespace, readKey, , ttl] = cache.getOrSet.mock.calls[0];
      const [writeNamespace, writeKey] = cache.invalidate.mock.calls[0];

      expect(readNamespace).toBe(writeNamespace);
      expect(readKey).toBe(writeKey);
      expect(readKey).toBe("org-1");
      // AuthGuard reads this set on every request; a long TTL is how a closed
      // store keeps selling after the read-through race writes a stale set.
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it("does not hit Postgres when the cache answers", async () => {
      cache.getOrSet.mockResolvedValue(["b9"]);

      const ids = await service.nonOperatingBranchIds("org-1");

      expect(ids).toEqual(new Set(["b9"]));
      expect(branchRepo.find).not.toHaveBeenCalled();
    });
  });

  describe("isNotOperating", () => {
    it("is true for an archived branch, not just a suspended one", async () => {
      cache.getOrSet.mockResolvedValue(["archived-1", "suspended-1"]);

      await expect(service.isNotOperating("org-1", "archived-1")).resolves.toBe(
        true,
      );
      await expect(service.isNotOperating("org-1", "branch-1")).resolves.toBe(
        false,
      );
    });
  });

  describe("assertActiveBranch", () => {
    it("returns the branch when it is operating", async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());

      await expect(
        service.assertActiveBranch("branch-1", "org-1"),
      ).resolves.toMatchObject({ id: "branch-1" });
    });

    it("rejects a suspended branch", async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED }),
      );

      await expect(
        service.assertActiveBranch("branch-1", "org-1"),
      ).rejects.toThrow(INVALID_DESTINATION_BRANCH_MESSAGE);
    });

    it("rejects an id from another organization with the same message", async () => {
      // Scoped lookup returns nothing, so a foreign id is indistinguishable
      // from a nonexistent one — that is the point.
      branchRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertActiveBranch("branch-1", "org-1"),
      ).rejects.toThrow(BadRequestException);
      expect(branchRepo.findOne).toHaveBeenCalledWith({
        where: { id: "branch-1", organizationId: "org-1" },
      });
    });
  });
});
