import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import {
  findImportStorage,
  findImportStorageUnaccented,
} from "./resolve-import-storage.util";

describe("resolve-import-storage", () => {
  const actor = {
    organizationId: "org-1",
    branchId: "branch-1",
    userId: "user-1",
  } as ActorContext;

  describe("findImportStorage", () => {
    it("matches the warehouse code before falling back to the name", async () => {
      const repo = {
        findOne: jest.fn(({ where }: any) =>
          Promise.resolve(where.code ? { id: "storage-1" } : null),
        ),
      };

      const found = await findImportStorage(repo as never, "KHOKT", actor);

      expect(found).toEqual({ id: "storage-1" });
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it("falls back to the name when no code matches", async () => {
      const repo = {
        findOne: jest.fn(({ where }: any) =>
          Promise.resolve(where.name ? { id: "storage-2" } : null),
        ),
      };

      const found = await findImportStorage(repo as never, "Kho chính", actor);

      expect(found).toEqual({ id: "storage-2" });
      expect(repo.findOne).toHaveBeenCalledTimes(2);
    });

    it("skips both queries for a blank cell", async () => {
      const repo = { findOne: jest.fn() };

      expect(await findImportStorage(repo as never, "   ", actor)).toBeNull();
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe("findImportStorageUnaccented", () => {
    /** Chainable query-builder stub that records the matched column. */
    const repoMatching = (column: "code" | "name", result: unknown) => {
      const calls: string[] = [];
      const qb: Record<string, unknown> = {};
      Object.assign(qb, {
        where: () => qb,
        andWhere: (sql: string) => {
          calls.push(sql);
          return qb;
        },
        getOne: () =>
          Promise.resolve(
            calls.some((sql) => sql.includes(`s.${column}`)) ? result : null,
          ),
      });
      return { repo: { createQueryBuilder: () => qb } };
    };

    it("matches the warehouse code", async () => {
      const { repo } = repoMatching("code", { id: "storage-1" });

      expect(
        await findImportStorageUnaccented(repo as never, "KHOKT", actor),
      ).toEqual({ id: "storage-1" });
    });

    it("falls back to the name", async () => {
      const { repo } = repoMatching("name", { id: "storage-2" });

      expect(
        await findImportStorageUnaccented(repo as never, "Kho chính", actor),
      ).toEqual({ id: "storage-2" });
    });

    it("returns null for a blank cell without querying", async () => {
      const createQueryBuilder = jest.fn();

      expect(
        await findImportStorageUnaccented(
          { createQueryBuilder } as never,
          "",
          actor,
        ),
      ).toBeNull();
      expect(createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
