import { BadRequestException, ConflictException } from "@nestjs/common";
import { DataSource, EntityManager, QueryFailedError } from "typeorm";
import { BranchStatus } from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import { BranchEntity } from "./branch.entity";
import { BranchCrudService } from "./branch-crud.service";
import { BranchService } from "./branch.service";

const actor: ActorContext = {
  userId: "user-1",
  organizationId: "org-1",
  roles: ["admin"],
};

const branchStub = (overrides: Partial<BranchEntity> = {}): BranchEntity =>
  ({
    id: "branch-1",
    organizationId: "org-1",
    name: "Chi nhánh Hà Nội",
    status: BranchStatus.ACTIVE,
    isMainBranch: false,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as BranchEntity;

describe("BranchCrudService", () => {
  let repository: {
    findOne: jest.Mock;
  };
  let manager: {
    query: jest.Mock;
  };
  let service: BranchCrudService;
  let branchStatus: { invalidate: jest.Mock };

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
    };
    manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("to_regclass")) {
          return [{ name: params?.[0] }];
        }
        if (sql.startsWith("SELECT COUNT")) {
          return [{ count: 0 }];
        }
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
      ),
    } as unknown as DataSource;

    branchStatus = { invalidate: jest.fn().mockResolvedValue(undefined) };
    service = new BranchCrudService(
      repository as never,
      dataSource,
      {} as BranchService,
      branchStatus as never,
    );
  });

  describe("create", () => {
    const makeSvc = (branchService: { create?: jest.Mock }) =>
      new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

    it("strips columns nobody may POST, including the id that would make save an update", async () => {
      const branchService = { create: jest.fn().mockResolvedValue(branchStub()) };
      const svc = makeSvc(branchService);

      await svc.create(
        {
          name: "Hà Nội",
          id: "uuid-of-another-orgs-branch",
          isMainBranch: true,
          organizationId: "org-attacker",
          status: "SUSPENDED",
        } as never,
        actor,
      );

      const [forwarded] = branchService.create.mock.calls[0];
      expect(forwarded).not.toHaveProperty("id");
      expect(forwarded).not.toHaveProperty("isMainBranch");
      expect(forwarded).not.toHaveProperty("organizationId");
      expect(forwarded).not.toHaveProperty("status");
      expect(forwarded.name).toBe("Hà Nội");
    });

    it("rejects an over-length address in Vietnamese, so update cannot be trapped by it", async () => {
      const branchService = { create: jest.fn() };
      const svc = makeSvc(branchService);

      await expect(
        svc.create({ name: "Hà Nội", address: "x".repeat(501) } as never, actor),
      ).rejects.toThrow("Địa chỉ tối đa 500 ký tự.");
      expect(branchService.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("routes through BranchService so lifecycle rules and cache invalidation run", async () => {
      const branchService = { update: jest.fn().mockResolvedValue(branchStub()) };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await svc.update("branch-1", { name: "Hà Nội 2" }, actor);

      expect(branchService.update).toHaveBeenCalledWith(
        "branch-1",
        { name: "Hà Nội 2" },
        actor,
      );
    });

    it("strips columns nobody may PATCH, so the main-branch guard cannot be disarmed", async () => {
      // CrudController takes an untyped body, so without a whitelist this
      // clears isMainBranch and the next PATCH suspends the head office.
      const branchService = { update: jest.fn().mockResolvedValue(branchStub()) };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await svc.update(
        "branch-1",
        {
          name: "Hà Nội",
          isMainBranch: false,
          organizationId: "org-attacker",
          id: "other-id",
        } as never,
        actor,
      );

      const [, forwarded] = branchService.update.mock.calls[0];
      expect(forwarded).toEqual({ name: "Hà Nội" });
      expect(forwarded).not.toHaveProperty("isMainBranch");
      expect(forwarded).not.toHaveProperty("organizationId");
      expect(forwarded).not.toHaveProperty("id");
    });

    it("clears an emptied email instead of rejecting it", async () => {
      // @IsOptional() skips null/undefined but not "", so without the
      // blank-to-null step @IsEmail() turns "clear the email box" into a 400.
      const branchService = { update: jest.fn().mockResolvedValue(branchStub()) };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await svc.update(
        "branch-1",
        { name: "Hà Nội", email: "", phone: "", address: "" } as never,
        actor,
      );

      const [, forwarded] = branchService.update.mock.calls[0];
      expect(forwarded.email).toBeNull();
      expect(forwarded.phone).toBeNull();
      expect(forwarded.address).toBeNull();
    });

    it("still rejects a blank name rather than nulling a NOT NULL column", async () => {
      const branchService = { update: jest.fn() };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await expect(
        svc.update("branch-1", { name: "" } as never, actor),
      ).rejects.toThrow(BadRequestException);
      expect(branchService.update).not.toHaveBeenCalled();
    });

    it("rejects a payload that fails DTO validation", async () => {
      const branchService = { update: jest.fn() };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await expect(
        svc.update("branch-1", { email: "not-an-email" } as never, actor),
      ).rejects.toThrow(BadRequestException);
      expect(branchService.update).not.toHaveBeenCalled();
    });

    it("speaks Vietnamese when validation fails", async () => {
      const branchService = { update: jest.fn() };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await expect(
        svc.update("branch-1", { email: "not-an-email" } as never, actor),
      ).rejects.toThrow("Email không hợp lệ.");
    });

    it("maps a duplicate name to 409 instead of letting it surface as a 500", async () => {
      const duplicate = new QueryFailedError("", [], {} as Error);
      (duplicate as QueryFailedError & { code?: string }).code = "23505";
      const branchService = { update: jest.fn().mockRejectedValue(duplicate) };
      const svc = new BranchCrudService(
        repository as never,
        {} as DataSource,
        branchService as never,
        branchStatus as never,
      );

      await expect(
        svc.update("branch-1", { name: "Trùng tên" }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  it("still deletes when the status cache cannot be invalidated", async () => {
    // The hard delete is already committed at that point; a Redis outage must
    // not report failure for a branch that is genuinely gone.
    branchStatus.invalidate.mockRejectedValue(new Error("redis down"));
    repository.findOne.mockResolvedValue(branchStub({ isMainBranch: false }));

    await expect(service.remove("branch-1", actor)).resolves.toBeUndefined();
  });

  it("rejects deleting the main branch", async () => {
    repository.findOne.mockResolvedValue(branchStub({ isMainBranch: true }));

    await expect(service.remove("branch-1", actor)).rejects.toThrow(
      "Không thể xoá cửa hàng chính của tổ chức.",
    );

    expect(manager.query).not.toHaveBeenCalled();
  });

  it("rejects deleting a branch with operational data", async () => {
    repository.findOne.mockResolvedValue(branchStub());
    manager.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("to_regclass")) {
        return [{ name: params?.[0] }];
      }
      if (sql.includes("FROM invoices")) {
        return [{ count: 1 }];
      }
      if (sql.startsWith("SELECT COUNT")) {
        return [{ count: 0 }];
      }
      return [];
    });

    await expect(service.remove("branch-1", actor)).rejects.toMatchObject({
      response: {
        message: "Cửa hàng đã có phát sinh dữ liệu liên quan, không thể xoá.",
      },
      status: 400,
    });

    expect(
      manager.query.mock.calls.some(
        ([sql]) => typeof sql === "string" && sql.startsWith("DELETE FROM branches"),
      ),
    ).toBe(false);
  });

  it("deletes bootstrap rows before deleting a clean branch", async () => {
    repository.findOne.mockResolvedValue(branchStub());

    await service.remove("branch-1", actor);

    const deleteStatements = manager.query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.startsWith("DELETE FROM"));

    expect(deleteStatements).toContain(
      "DELETE FROM user_branch_assignments WHERE organization_id::text = $2 AND branch_id::text = $1",
    );
    expect(deleteStatements).toContain(
      "DELETE FROM locations WHERE organization_id::text = $2 AND branch_id::text = $1",
    );
    expect(deleteStatements).toContain(
      "DELETE FROM showrooms WHERE organization_id::text = $2 AND branch_id::text = $1",
    );
    expect(deleteStatements).toContain(
      "DELETE FROM storages WHERE organization_id::text = $2 AND branch_id::text = $1",
    );
    expect(deleteStatements[deleteStatements.length - 1]).toBe(
      "DELETE FROM branches WHERE organization_id::text = $2 AND id::text = $1",
    );
  });

  it("maps wrapped foreign key failures to the operational data message", async () => {
    const driverError = Object.assign(new Error("violates foreign key constraint"), {
      code: "23503",
    });
    repository.findOne.mockResolvedValue(branchStub());
    manager.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("to_regclass")) {
        return [{ name: params?.[0] }];
      }
      if (sql.startsWith("SELECT COUNT")) {
        return [{ count: 0 }];
      }
      if (sql.startsWith("DELETE FROM branches")) {
        throw {
          cause: new QueryFailedError("DELETE", [], driverError),
        };
      }
      return [];
    });

    await expect(service.remove("branch-1", actor)).rejects.toMatchObject({
      response: {
        message: "Cửa hàng đã có phát sinh dữ liệu liên quan, không thể xoá.",
      },
      status: 400,
    });
  });
});
