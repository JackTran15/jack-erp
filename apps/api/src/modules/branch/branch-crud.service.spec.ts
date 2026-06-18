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

    service = new BranchCrudService(
      repository as never,
      dataSource,
      {} as BranchService,
    );
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
