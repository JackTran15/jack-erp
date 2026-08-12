import { ILike, Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { StorageEntity } from "../location/storage.entity";

/**
 * Resolve the "Kho" column of an import file, which may hold either the
 * warehouse code (Mã kho, e.g. "KHOKT") or its name (Tên kho) — the same two
 * columns the warehouse pickers show. Code wins when both match, so a file that
 * uses codes is never ambiguous against an unrelated warehouse's name.
 */
export async function findImportStorage(
  repo: Repository<StorageEntity>,
  codeOrName: string,
  actor: ActorContext,
): Promise<StorageEntity | null> {
  const needle = codeOrName.trim();
  if (!needle) return null;
  const scope = {
    organizationId: actor.organizationId,
    branchId: actor.branchId,
  };
  return (
    (await repo.findOne({ where: { ...scope, code: ILike(needle) } })) ??
    (await repo.findOne({ where: { ...scope, name: ILike(needle) } }))
  );
}

/**
 * Same code-then-name resolution for the location importer, which differs on
 * two counts: it matches accent-insensitively via the unaccent extension (see
 * migration 1782500000000), and it falls back to an org-wide search when the
 * actor has no active branch.
 */
export async function findImportStorageUnaccented(
  repo: Repository<StorageEntity>,
  codeOrName: string,
  actor: ActorContext,
): Promise<StorageEntity | null> {
  const needle = codeOrName.trim();
  if (!needle) return null;
  const byField = (field: "code" | "name") =>
    repo
      .createQueryBuilder("s")
      .where("s.organizationId = :orgId", { orgId: actor.organizationId })
      .andWhere(
        actor.branchId ? "s.branchId = :branchId" : "1=1",
        actor.branchId ? { branchId: actor.branchId } : {},
      )
      .andWhere(`unaccent(LOWER(s.${field})) = unaccent(LOWER(:needle))`, {
        needle,
      })
      .getOne();
  return (await byField("code")) ?? (await byField("name"));
}
