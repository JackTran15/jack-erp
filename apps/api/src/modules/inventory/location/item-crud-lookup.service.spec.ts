import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { InventoryItemCrudService } from "./item-crud.service";
import { ItemEntity } from "./item.entity";
import { ItemCategoryEntity } from "./item-category.entity";
import { BrandEntity } from "./brand.entity";
import { LocationEntity } from "./location.entity";
import { ProductAttributeDefinitionEntity } from "../product/product-attribute-definition.entity";
import { ProductAttributeOptionEntity } from "../product/product-attribute-option.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import { StockLedgerService } from "../ledger/stock-ledger.service";
import { CacheService } from "../../redis/cache.service";

/**
 * lookupByCode — tra cứu hàng hóa theo SKU/mã vạch cho ô quét mã vạch ERP.
 * Không có DB thật (mock DataSource.query), nên các ràng buộc "khác org không
 * lẫn" và "item inactive bị loại" được kiểm bằng cách khẳng định SQL sinh ra
 * đã scope org + lọc is_active và bind đúng tham số.
 */
describe("InventoryItemCrudService.lookupByCode", () => {
  let service: InventoryItemCrudService;
  let queryMock: jest.Mock;

  const actor = {
    userId: "u1",
    organizationId: "org-1",
    branchId: "b1",
    roles: [],
    permissions: [],
  };

  const row = {
    itemId: "item-1",
    productId: "prod-1",
    code: "SKU-1",
    name: "Giày Sneaker 39 · Nâu",
    unit: "Đôi",
    purchasePrice: 100,
    sellingPrice: 300,
    variantLabel: "39 · Nâu",
    categoryName: "Giày",
  };

  beforeEach(async () => {
    queryMock = jest.fn().mockResolvedValue([]);
    const repoStub = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    const dataSource = {
      query: queryMock,
      getRepository: jest.fn().mockReturnValue(repoStub),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCrudService,
        { provide: getRepositoryToken(ItemEntity), useValue: repoStub },
        { provide: getRepositoryToken(ItemCategoryEntity), useValue: {} },
        { provide: getRepositoryToken(BrandEntity), useValue: {} },
        { provide: getRepositoryToken(LocationEntity), useValue: {} },
        {
          provide: getRepositoryToken(ProductAttributeDefinitionEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ProductAttributeOptionEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ItemAttributeValueEntity),
          useValue: {},
        },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: { recordMovement: jest.fn() } },
        { provide: CacheService, useValue: { invalidate: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  const sqlOf = () => queryMock.mock.calls[0][0] as string;
  const paramsOf = () => queryMock.mock.calls[0][1] as unknown[];

  it("matches an item by its SKU code", async () => {
    queryMock.mockResolvedValueOnce([row]);

    const result = await service.lookupByCode("SKU-1", actor);

    expect(result).toEqual([row]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(paramsOf()).toEqual(["org-1", "SKU-1"]);
    // Cả SKU lẫn mã vạch cùng khớp trên một tham số.
    expect(sqlOf()).toContain("(i.code = $2 OR b.code = $2)");
  });

  it("matches an item by an attached barcode", async () => {
    queryMock.mockResolvedValueOnce([row]);

    const result = await service.lookupByCode("8938500123457", actor);

    expect(result).toEqual([row]);
    expect(paramsOf()).toEqual(["org-1", "8938500123457"]);
    expect(sqlOf()).toContain("LEFT JOIN item_barcodes b");
  });

  it("scopes the query to the actor organization (no cross-org match)", async () => {
    await service.lookupByCode("SKU-1", actor);

    expect(sqlOf()).toContain("i.organization_id = $1");
    expect(paramsOf()[0]).toBe("org-1");
  });

  it("excludes inactive items via the is_active filter", async () => {
    await service.lookupByCode("SKU-1", actor);

    expect(sqlOf()).toContain("i.is_active = true");
  });

  it("returns an empty array for an unknown code", async () => {
    queryMock.mockResolvedValueOnce([]);

    const result = await service.lookupByCode("KHONG-CO", actor);

    expect(result).toEqual([]);
  });

  it("trims the code and returns [] for blank input without querying", async () => {
    const blank = await service.lookupByCode("   ", actor);
    expect(blank).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();

    queryMock.mockResolvedValueOnce([row]);
    await service.lookupByCode("  SKU-1  ", actor);
    expect(paramsOf()).toEqual(["org-1", "SKU-1"]);
  });
});
