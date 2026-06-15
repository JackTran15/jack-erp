import { getMetadataArgsStorage } from "typeorm";
import {
  InventoryImportJobEntity,
  ImportJobType,
} from "./inventory-import-job.entity";
import { InventoryImportJobRowEntity } from "./inventory-import-job-row.entity";

describe("inventory import job entities", () => {
  it("supports goods receipt import jobs", () => {
    expect(ImportJobType.GOODS_RECEIPT).toBe("GOODS_RECEIPT");
  });

  it("stores normalized data and warnings on import rows", () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === InventoryImportJobRowEntity)
      .map((column) => column.propertyName);

    expect(columns).toEqual(
      expect.arrayContaining(["normalizedData", "warningMessages"]),
    );
  });

  it("keeps import job entity metadata registered", () => {
    const table = getMetadataArgsStorage().tables.find(
      (candidate) => candidate.target === InventoryImportJobEntity,
    );
    expect(table?.name).toBe("inventory_import_jobs");
  });
});
