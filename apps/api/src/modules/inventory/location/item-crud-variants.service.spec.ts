import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { InventoryItemCrudService } from "./item-crud.service";
import { ItemEntity } from "./item.entity";
import { ItemCategoryEntity } from "./item-category.entity";
import { BrandEntity } from "./brand.entity";
import { LocationEntity } from "./location.entity";
import { ProductEntity } from "../product/product.entity";
import { ItemBarcodeEntity } from "./item-barcode.entity";
import { ProductAttributeDefinitionEntity } from "../product/product-attribute-definition.entity";
import { ProductAttributeOptionEntity } from "../product/product-attribute-option.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import { StockLedgerService } from "../ledger/stock-ledger.service";

/** Proves createProductWithVariants persists per-variant price/SKU/barcode. */
describe("InventoryItemCrudService.create (product with variants)", () => {
  let service: InventoryItemCrudService;
  let itemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let barcodeRepo: Record<string, jest.Mock>;
  let stockLedger: { recordMovement: jest.Mock };

  const actor = {
    userId: "u1",
    organizationId: "org-1",
    branchId: "b1",
    roles: [],
    permissions: [],
  };

  const qbNull = () => {
    const qb: Record<string, jest.Mock> = {};
    [
      "where",
      "andWhere",
      "select",
      "innerJoin",
      "leftJoinAndSelect",
      "groupBy",
      "having",
      "distinct",
      "orderBy",
      "limit",
    ].forEach((m) => (qb[m] = jest.fn().mockReturnValue(qb)));
    qb.getOne = jest.fn().mockResolvedValue(null);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getCount = jest.fn().mockResolvedValue(1);
    return qb;
  };

  const idGen = (prefix: string) => {
    let n = 0;
    return jest
      .fn()
      .mockImplementation((e: Record<string, unknown>) =>
        Promise.resolve({ ...e, id: `${prefix}-${++n}` }),
      );
  };

  beforeEach(async () => {
    itemRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen("item"),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
    };
    productRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest
        .fn()
        .mockImplementation((e) => Promise.resolve({ ...e, id: "prod-1" })),
      findOne: jest
        .fn()
        .mockResolvedValue({
          id: "prod-1",
          code: "P1",
          name: "Prod",
          isActive: true,
        }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      exist: jest.fn().mockResolvedValue(true),
    };
    barcodeRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen("bc"),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    stockLedger = { recordMovement: jest.fn().mockResolvedValue({}) };
    const attrRepo = () => ({
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen("attr"),
      findOne: jest.fn().mockResolvedValue(null),
    });

    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === ProductEntity) return productRepo;
        if (entity === ItemBarcodeEntity) return barcodeRepo;
        return itemRepo;
      }),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCrudService,
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: "cat" }) },
        },
        {
          provide: getRepositoryToken(BrandEntity),
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue({ id: "brand-1", name: "Nike" }),
          },
        },
        {
          provide: getRepositoryToken(LocationEntity),
          useValue: {
            createQueryBuilder: jest.fn().mockImplementation(() => {
              const qb = qbNull();
              qb.getOne.mockResolvedValue({ id: "location-1" });
              return qb;
            }),
          },
        },
        {
          provide: getRepositoryToken(ProductAttributeDefinitionEntity),
          useValue: attrRepo(),
        },
        {
          provide: getRepositoryToken(ProductAttributeOptionEntity),
          useValue: attrRepo(),
        },
        {
          provide: getRepositoryToken(ItemAttributeValueEntity),
          useValue: attrRepo(),
        },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: stockLedger },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  it("uses each variant own price/SKU, not the top-level price", async () => {
    await service.create(
      {
        code: "P1",
        name: "Prod",
        unit: "Giày",
        purchasePrice: 100,
        sellingPrice: 300,
        colors: ["Den", "do"],
        sizes: ["38", "39"],
        variants: [
          {
            color: "Den",
            size: "38",
            sku: "P1-DEN-38",
            barcode: "BC-1",
            purchasePrice: 300,
            sellPrice: 500,
          },
          {
            color: "Den",
            size: "39",
            sku: "P1-DEN-39",
            purchasePrice: 310,
            sellPrice: 510,
          },
          {
            color: "do",
            size: "38",
            sku: "P1-DO-38",
            purchasePrice: 320,
            sellPrice: 520,
          },
          {
            color: "do",
            size: "39",
            sku: "P1-DO-39",
            purchasePrice: 330,
            sellPrice: 530,
          },
        ],
      },
      actor,
    );

    const savedItems = itemRepo.save.mock.calls.map((c) => c[0]);
    expect(savedItems).toHaveLength(4);
    const byCode = Object.fromEntries(savedItems.map((i) => [i.code, i]));
    // Per-variant prices win over the top-level 100/300.
    expect(byCode["P1-DEN-38"]).toMatchObject({
      purchasePrice: 300,
      sellingPrice: 500,
    });
    expect(byCode["P1-DEN-39"]).toMatchObject({
      purchasePrice: 310,
      sellingPrice: 510,
    });
    expect(byCode["P1-DO-39"]).toMatchObject({
      purchasePrice: 330,
      sellingPrice: 530,
    });
    // No variant kept the top-level price.
    expect(savedItems.every((i) => i.purchasePrice !== 100)).toBe(true);

    expect(barcodeRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: "item-1",
        code: "BC-1",
        organizationId: "org-1",
      }),
    ]);
  });

  it("copies shared item fields to every created variant item", async () => {
    await service.create(
      {
        code: "P2",
        name: "Prod 2",
        unit: "Đôi",
        categoryId: "cat-1",
        brand: "Nike",
        brandId: "brand-1",
        itemType: "Giày",
        purchasePrice: 100,
        sellingPrice: 300,
        isPosVisible: false,
        weightGram: 250,
        lengthCm: 30,
        widthCm: 12,
        heightCm: 10,
        manufactureYear: 2026,
        composition: "Da",
        packageWeightGram: 350,
        packageLengthCm: 35,
        packageWidthCm: 18,
        packageHeightCm: 14,
        oddSize: "33-35",
        isGoldSilver: true,
        manageBarcodePerUnit: true,
        colors: ["Den"],
        sizes: ["38"],
      },
      actor,
    );

    expect(itemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "P2-38-Den",
        categoryId: "cat-1",
        brand: "Nike",
        brandId: "brand-1",
        itemType: "Giày",
        isPosVisible: false,
        weightGram: 250,
        lengthCm: 30,
        widthCm: 12,
        heightCm: 10,
        manufactureYear: 2026,
        composition: "Da",
        packageWeightGram: 350,
        packageLengthCm: 35,
        packageWidthCm: 18,
        packageHeightCm: 14,
        oddSize: "33-35",
        isGoldSilver: true,
        manageBarcodePerUnit: true,
      }),
    );
  });

  it("records opening stock for each variant using the shared opening unit price", async () => {
    await service.create(
      {
        code: "P3",
        name: "Prod 3",
        unit: "Đôi",
        initialStockUnitPrice: 45000,
        colors: ["Den"],
        sizes: ["38", "39"],
        variants: [
          { color: "Den", size: "38", sku: "P3-DEN-38", initialStock: 2 },
          { color: "Den", size: "39", sku: "P3-DEN-39", initialStock: 3 },
        ],
      },
      actor,
    );

    expect(stockLedger.recordMovement).toHaveBeenCalledTimes(2);
    expect(stockLedger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        locationId: "location-1",
        quantity: 2,
        unitCost: 45000,
        referenceType: "INITIAL_STOCK",
      }),
    );
    expect(stockLedger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-2",
        quantity: 3,
        unitCost: 45000,
      }),
    );
  });

  it("updates isPosVisible on all variants without colors/sizes or _productId", async () => {
    await service.update("prod-1", { isPosVisible: false }, actor);

    expect(itemRepo.update).toHaveBeenCalledWith(
      { productId: "prod-1", organizationId: "org-1" },
      { isPosVisible: false },
    );
  });

  it("updates shared item fields on existing product variants", async () => {
    await service.update(
      "prod-1",
      {
        code: "P1",
        name: "Prod renamed",
        _productId: "prod-1",
        unit: "Đôi",
        categoryId: "cat-2",
        brand: "Nike",
        brandId: "brand-2",
        itemType: "Giày",
        purchasePrice: 120,
        sellingPrice: 320,
        isPosVisible: false,
        isActive: false,
        weightGram: 260,
        lengthCm: 31,
        widthCm: 13,
        heightCm: 11,
        manufactureYear: 2025,
        composition: "Vải",
        packageWeightGram: 360,
        packageLengthCm: 36,
        packageWidthCm: 19,
        packageHeightCm: 15,
        oddSize: "34-36",
        isGoldSilver: true,
        manageBarcodePerUnit: true,
        colors: ["Den"],
        sizes: ["38"],
      },
      actor,
    );

    expect(itemRepo.update).toHaveBeenCalledWith(
      { productId: "prod-1", organizationId: "org-1" },
      expect.objectContaining({
        unit: "Đôi",
        categoryId: "cat-2",
        brand: "Nike",
        brandId: "brand-2",
        itemType: "Giày",
        purchasePrice: 120,
        sellingPrice: 320,
        isPosVisible: false,
        isActive: false,
        weightGram: 260,
        lengthCm: 31,
        widthCm: 13,
        heightCm: 11,
        manufactureYear: 2025,
        composition: "Vải",
        packageWeightGram: 360,
        packageLengthCm: 36,
        packageWidthCm: 19,
        packageHeightCm: 15,
        oddSize: "34-36",
        isGoldSilver: true,
        manageBarcodePerUnit: true,
      }),
    );
  });

  it("updates an existing variant row from variants payload by itemId", async () => {
    await service.update(
      "prod-1",
      {
        _productId: "prod-1",
        colors: ["Den"],
        sizes: ["38"],
        variants: [
          {
            itemId: "item-1",
            name: "Giày đổi tên",
            unit: "Đôi",
            sku: "SKU-NEW",
            barcode: "BC-NEW",
            purchasePrice: 155,
            sellPrice: 255,
          },
        ],
      },
      actor,
    );

    expect(itemRepo.update).toHaveBeenCalledWith(
      { id: "item-1", organizationId: "org-1" },
      expect.objectContaining({
        name: "Giày đổi tên",
        unit: "Đôi",
        code: "SKU-NEW",
        purchasePrice: 155,
        sellingPrice: 255,
      }),
    );
    expect(barcodeRepo.delete).toHaveBeenCalledWith({
      itemId: "item-1",
      organizationId: "org-1",
    });
    expect(barcodeRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: "item-1",
        code: "BC-NEW",
        organizationId: "org-1",
      }),
    ]);
  });
});
