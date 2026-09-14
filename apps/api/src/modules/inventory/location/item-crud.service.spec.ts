import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InventoryItemCrudService } from "./item-crud.service";
import { ItemEntity } from "./item.entity";
import { ItemCategoryEntity } from "./item-category.entity";
import { BrandEntity } from "./brand.entity";
import { LocationEntity } from "./location.entity";
import { ProductEntity } from "../product/product.entity";
import { ProductAttributeDefinitionEntity } from "../product/product-attribute-definition.entity";
import { ProductAttributeOptionEntity } from "../product/product-attribute-option.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import { StockLedgerService } from "../ledger/stock-ledger.service";
import { MediaLinkService } from "../../media/media-link.service";
import { MediaQueryService } from "../../media/media-query.service";
import { MediaOwnerType } from "../../media/media-object.entity";
import { MediaException } from "../../media/media.exception";

/**
 * T-02-01: covers only the image behaviour added to InventoryItemCrudService
 * (imageIds in/out, media attach/detach, afterDelete). Nested provider/unit/
 * barcode reconcile, variant generation and lookup are covered by the sibling
 * specs in this directory.
 */
describe("InventoryItemCrudService (images)", () => {
  let service: InventoryItemCrudService;
  let itemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let mediaLink: { syncOwner: jest.Mock; detachAll: jest.Mock };
  let mediaQuery: { resolvePublicUrls: jest.Mock };
  let stockLedger: { recordMovement: jest.Mock };

  const actor = {
    userId: "u1",
    organizationId: "org-1",
    branchId: "b1",
    roles: [],
    permissions: [],
  };

  const uuid1 = "11111111-1111-4111-8111-111111111111";
  const uuid2 = "22222222-2222-4222-8222-222222222222";

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
    qb.getCount = jest.fn().mockResolvedValue(0);
    return qb;
  };

  const attrRepo = () => ({
    createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
    create: jest.fn().mockImplementation((d) => ({ ...d })),
    save: jest
      .fn()
      .mockImplementation((e) => Promise.resolve({ ...e, id: "attr-1" })),
    findOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(async () => {
    itemRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest
        .fn()
        .mockImplementation((e) => Promise.resolve({ ...e, id: e.id ?? "item-1" })),
      merge: jest
        .fn()
        .mockImplementation((existing, updates) => ({ ...existing, ...updates })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
    };
    productRepo = {
      exist: jest.fn().mockResolvedValue(false),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest
        .fn()
        .mockImplementation((e) => Promise.resolve({ ...e, id: "prod-1" })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity, data) => {
        if (entity === ItemEntity) {
          return Promise.resolve({ ...data, id: data.id ?? "item-1" });
        }
        return Promise.resolve(data);
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockManager)),
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === ProductEntity) return productRepo;
        return itemRepo;
      }),
    };
    mediaLink = {
      syncOwner: jest.fn().mockResolvedValue([]),
      detachAll: jest.fn().mockResolvedValue([]),
    };
    mediaQuery = {
      resolvePublicUrls: jest.fn().mockResolvedValue(new Map()),
    };
    stockLedger = { recordMovement: jest.fn().mockResolvedValue({}) };

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
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(LocationEntity),
          useValue: {
            createQueryBuilder: jest.fn().mockImplementation(() => {
              const qb = qbNull();
              qb.getOne = jest.fn().mockResolvedValue({ id: "location-1" });
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
        { provide: MediaLinkService, useValue: mediaLink },
        { provide: MediaQueryService, useValue: mediaQuery },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  describe("create (standalone item)", () => {
    it("attaches images inside the create transaction, with the txn manager", async () => {
      const saved = await service.create(
        { name: "Item A", unit: "Cái", imageIds: [uuid1, uuid2] },
        actor,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.ITEM,
        "item-1",
        [uuid1, uuid2],
        actor,
        mockManager,
      );
      expect(saved.id).toBe("item-1");
    });

    it("does not call syncOwner when imageIds is not sent", async () => {
      await service.create({ name: "Item B", unit: "Cái" }, actor);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("never lets imageIds reach the created ItemEntity fields", async () => {
      await service.create(
        { name: "Item D", unit: "Cái", imageIds: [uuid1] },
        actor,
      );
      const createCall = mockManager.create.mock.calls.find(
        (c) => c[0] === ItemEntity,
      );
      expect(createCall![1]).not.toHaveProperty("imageIds");
    });

    it("rejects imageIds: null before opening the create transaction (null is not 'unchanged')", async () => {
      await expect(
        service.create({ name: "Item C", unit: "Cái", imageIds: null }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("propagates a syncOwner rejection (e.g. cross-org media → 404) instead of swallowing it", async () => {
      mediaLink.syncOwner.mockRejectedValueOnce(
        new NotFoundException("Media not found"),
      );
      await expect(
        service.create({ name: "Item E", unit: "Cái", imageIds: [uuid1] }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it("does not record initial stock when syncOwner rejects (post-save side effect is skipped)", async () => {
      mediaLink.syncOwner.mockRejectedValueOnce(
        new NotFoundException("Media not found"),
      );
      await expect(
        service.create(
          {
            name: "Item G",
            unit: "Cái",
            imageIds: [uuid1],
            initialStock: 5,
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(stockLedger.recordMovement).not.toHaveBeenCalled();
    });

    it("rejects a non-array imageIds (e.g. a bare string) with 400", async () => {
      await expect(
        service.create(
          { name: "Item H", unit: "Cái", imageIds: "abc" as any },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("accepts an uppercase UUID and passes it through to syncOwner unchanged", async () => {
      const upper = uuid1.toUpperCase();
      await service.create({ name: "Item I", unit: "Cái", imageIds: [upper] }, actor);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.ITEM,
        "item-1",
        [upper],
        actor,
        mockManager,
      );
    });
  });

  describe("create (product with variants)", () => {
    it("attaches images to the product after save, outside any transaction", async () => {
      const result = await service.create(
        { name: "Prod A", unit: "Đôi", colors: ["Đen"], imageIds: [uuid1] },
        actor,
      );

      expect(result.productId).toBe("prod-1");
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        [uuid1],
        actor,
      );
      expect(mediaLink.syncOwner.mock.calls[0]).toHaveLength(4);
    });

    it("does not call syncOwner when imageIds is not sent", async () => {
      await service.create(
        { name: "Prod B", unit: "Đôi", colors: ["Đen"] },
        actor,
      );
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("rejects more than 10 DISTINCT imageIds with MEDIA_LIMIT_EXCEEDED (400) before creating the product", async () => {
      const tooMany = Array.from(
        { length: 11 },
        (_, i) => `11111111-1111-4111-8111-${(i + 1).toString().padStart(12, "0")}`,
      );
      await expect(
        service.create(
          { name: "Prod C", unit: "Đôi", colors: ["Đen"], imageIds: tooMany },
          actor,
        ),
      ).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" } as Partial<MediaException>);
      expect(productRepo.save).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("does not reject 11 copies of the same UUID — the limit counts distinct ids like syncOwner does", async () => {
      const duplicated = Array.from({ length: 11 }, () => uuid1);
      await expect(
        service.create(
          { name: "Prod J", unit: "Đôi", colors: ["Đen"], imageIds: duplicated },
          actor,
        ),
      ).resolves.toMatchObject({ productId: "prod-1" });
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        duplicated,
        actor,
      );
    });

    it("rejects a non-UUID imageIds entry before creating the product", async () => {
      await expect(
        service.create(
          {
            name: "Prod F",
            unit: "Đôi",
            colors: ["Đen"],
            imageIds: ["not-a-uuid"],
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(productRepo.save).not.toHaveBeenCalled();
    });

    it("keeps imageIds out of productRepo.save and every variant itemRepo.create/save call (pickProductVariantSharedItemFields)", async () => {
      await service.create(
        { name: "Prod E", unit: "Đôi", colors: ["Đen"], imageIds: [uuid1] },
        actor,
      );

      expect(productRepo.save).toHaveBeenCalled();
      for (const call of productRepo.save.mock.calls) {
        expect(call[0]).not.toHaveProperty("imageIds");
      }

      expect(itemRepo.create).toHaveBeenCalled();
      for (const call of itemRepo.create.mock.calls) {
        expect(call[0]).not.toHaveProperty("imageIds");
      }
      expect(itemRepo.save).toHaveBeenCalled();
      for (const call of itemRepo.save.mock.calls) {
        expect(call[0]).not.toHaveProperty("imageIds");
      }
    });
  });

  describe("update (standalone item)", () => {
    beforeEach(() => {
      productRepo.exist.mockResolvedValue(false);
      itemRepo.findOne.mockResolvedValue({
        id: "item-1",
        organizationId: "org-1",
        code: "SKU1",
        name: "Item",
        unit: "Cái",
      });
    });

    it("syncs images inside the reconcile transaction, with the txn manager", async () => {
      await service.update("item-1", { imageIds: [uuid1] }, actor);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.ITEM,
        "item-1",
        [uuid1],
        actor,
        mockManager,
      );
    });

    it("detaches every image when imageIds is an empty array", async () => {
      await service.update("item-1", { imageIds: [] }, actor);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.ITEM,
        "item-1",
        [],
        actor,
        mockManager,
      );
    });

    it("does not call syncOwner nor open a transaction when imageIds is absent and nothing nested changed", async () => {
      await service.update("item-1", { name: "Renamed" }, actor);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("never lets imageIds reach repository.merge", async () => {
      await service.update(
        "item-1",
        { name: "Renamed", imageIds: [uuid1] },
        actor,
      );
      expect(itemRepo.merge).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ imageIds: expect.anything() }),
      );
    });

    it("rejects imageIds: null before touching the item", async () => {
      await expect(
        service.update("item-1", { imageIds: null }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(itemRepo.merge).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("returns freshly loaded images, not the pre-sync getById snapshot, when imageIds changes", async () => {
      const stale = [{ id: "old-id", url: "http://x/old.jpg", fileName: "old.jpg" }];
      const fresh = [{ id: uuid1, url: "http://x/1.jpg", fileName: "a.jpg" }];
      mediaQuery.resolvePublicUrls
        // called once inside super.update()'s getById(), before syncOwner runs
        .mockResolvedValueOnce(new Map([["item-1", stale]]))
        // called again after syncOwner, to build the response
        .mockResolvedValueOnce(new Map([["item-1", fresh]]));

      const result = await service.update("item-1", { imageIds: [uuid1] }, actor);

      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledTimes(2);
      expect(result.images).toEqual(fresh);
    });

    it("does not reload images when imageIds is absent (no extra query)", async () => {
      await service.update("item-1", { name: "Renamed" }, actor);
      // only the one call inside super.update()'s getById()
      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledTimes(1);
    });
  });

  describe("update (product with variants)", () => {
    beforeEach(() => {
      productRepo.exist.mockResolvedValue(true);
      productRepo.findOne.mockResolvedValue({
        id: "prod-1",
        code: "P1",
        name: "Prod",
        isActive: true,
      });
    });

    it("attaches images to the product after updateProductWithVariants, outside a transaction", async () => {
      await service.update(
        "prod-1",
        { colors: ["Đen"], imageIds: [uuid1, uuid2] },
        actor,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        [uuid1, uuid2],
        actor,
      );
      expect(mediaLink.syncOwner.mock.calls[0]).toHaveLength(4);
    });

    it("does not call syncOwner when imageIds is absent", async () => {
      await service.update("prod-1", { colors: ["Đen"] }, actor);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it("keeps imageIds out of productRepo.update and the shared-field itemRepo.update call (pickProductVariantSharedItemFields)", async () => {
      await service.update(
        "prod-1",
        {
          name: "Prod renamed",
          unit: "Đôi",
          colors: ["Đen"],
          imageIds: [uuid1],
        },
        actor,
      );

      expect(productRepo.update).toHaveBeenCalled();
      for (const call of productRepo.update.mock.calls) {
        expect(call[1]).not.toHaveProperty("imageIds");
      }

      expect(itemRepo.update).toHaveBeenCalled();
      for (const call of itemRepo.update.mock.calls) {
        expect(call[1]).not.toHaveProperty("imageIds");
      }
    });
  });

  describe("update (product id, patch has no product-level fields)", () => {
    // isProductUuid is true but hasProductLevelPatch(normalized) is false, so
    // update() falls into the "single item" write path below — the owner
    // type for images must still follow isProductUuid, not which branch ran.
    beforeEach(() => {
      productRepo.exist.mockResolvedValue(true);
      const repQb = qbNull();
      repQb.getOne = jest.fn().mockResolvedValue({
        id: "item-1",
        code: "SKU1",
        name: "Item",
        // A real ItemEntity carries both the FK column and the loaded
        // relation; `saved.productId` (checked after super.update()) comes
        // from the column, not from `product.id`.
        productId: "prod-1",
        product: { id: "prod-1", code: "P1", name: "Prod" },
      });
      itemRepo.createQueryBuilder.mockReturnValue(repQb);
    });

    it("syncs PRODUCT (not ITEM) images when imageIds: [] is the only change", async () => {
      await service.update("prod-1", { imageIds: [] }, actor);
      expect(mediaLink.syncOwner).toHaveBeenCalledTimes(1);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        [],
        actor,
        mockManager,
      );
    });

    it("syncs PRODUCT (not ITEM) images when the patch also carries item-shaped fields", async () => {
      await service.update("prod-1", { name: "X", imageIds: [uuid1] }, actor);
      expect(mediaLink.syncOwner).toHaveBeenCalledTimes(1);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        [uuid1],
        actor,
        mockManager,
      );
    });
  });

  describe("update (variant item belonging to a product)", () => {
    beforeEach(() => {
      // 'item-9' is a real item id (not itself a product id) — isProductUuid
      // is false — but the item's own productId column points at 'prod-1'.
      productRepo.exist.mockResolvedValue(false);
      itemRepo.findOne.mockResolvedValue({
        id: "item-9",
        organizationId: "org-1",
        code: "SKU9",
        name: "Item 9",
        unit: "Cái",
        productId: "prod-1",
      });
    });

    it("syncs the parent PRODUCT's images, not ITEM, for a variant item id (A-08/A-25)", async () => {
      await service.update("item-9", { imageIds: [uuid1] }, actor);
      expect(mediaLink.syncOwner).toHaveBeenCalledTimes(1);
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        [uuid1],
        actor,
        mockManager,
      );
    });
  });

  describe("getById", () => {
    it("returns a standalone item's images from resolvePublicUrls, in the given order", async () => {
      itemRepo.findOne.mockResolvedValue({
        id: "item-1",
        organizationId: "org-1",
        code: "SKU1",
        name: "Item",
        unit: "Cái",
      });
      const images = [
        { id: uuid1, url: "http://x/1.jpg", fileName: "a.jpg" },
        { id: uuid2, url: "http://x/2.jpg", fileName: "b.jpg" },
      ];
      mediaQuery.resolvePublicUrls.mockResolvedValue(
        new Map([["item-1", images]]),
      );

      const record = await service.getById("item-1", actor);

      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledTimes(1);
      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledWith(
        ["item-1"],
        "org-1",
      );
      expect(record.images).toEqual(images);
    });

    it("returns an empty array when the item has no attached image", async () => {
      itemRepo.findOne.mockResolvedValue({
        id: "item-1",
        organizationId: "org-1",
        code: "SKU1",
        name: "Item",
        unit: "Cái",
      });
      const record = await service.getById("item-1", actor);
      expect(record.images).toEqual([]);
    });

    it("returns the parent product's images for a variant item id, not its own (A-08/A-25)", async () => {
      itemRepo.findOne.mockResolvedValue({
        id: "item-9",
        organizationId: "org-1",
        code: "SKU9",
        name: "Item 9",
        unit: "Cái",
        productId: "prod-1",
      });
      const images = [{ id: uuid1, url: "http://x/1.jpg", fileName: "a.jpg" }];
      mediaQuery.resolvePublicUrls.mockResolvedValue(
        new Map([["prod-1", images]]),
      );

      const record = await service.getById("item-9", actor);

      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledTimes(1);
      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledWith(
        ["prod-1"],
        "org-1",
      );
      expect(record.images).toEqual(images);
    });

    it("returns the product's images for a grouped (product) row", async () => {
      itemRepo.findOne.mockResolvedValueOnce(null);
      const repQb = qbNull();
      repQb.getOne = jest.fn().mockResolvedValue({
        id: "item-1",
        code: "SKU1",
        name: "Item",
        productId: "prod-1",
        product: { id: "prod-1", code: "P1", name: "Prod" },
      });
      itemRepo.createQueryBuilder.mockReturnValueOnce(repQb);
      const images = [{ id: uuid1, url: "http://x/1.jpg", fileName: "a.jpg" }];
      mediaQuery.resolvePublicUrls.mockResolvedValue(
        new Map([["prod-1", images]]),
      );

      const record = await service.getById("prod-1", actor);

      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledTimes(1);
      expect(mediaQuery.resolvePublicUrls).toHaveBeenCalledWith(
        ["prod-1"],
        "org-1",
      );
      expect(record.images).toEqual(images);
    });
  });

  describe("afterDelete (A-19)", () => {
    it("detaches ITEM media when the deleted id is a standalone item", async () => {
      productRepo.exist.mockResolvedValue(false);
      await (service as any).afterDelete("item-1", actor);
      expect(mediaLink.detachAll).toHaveBeenCalledWith(
        MediaOwnerType.ITEM,
        "item-1",
        "org-1",
      );
    });

    it("detaches PRODUCT media when the deleted id is a product", async () => {
      productRepo.exist.mockResolvedValue(true);
      await (service as any).afterDelete("prod-1", actor);
      expect(mediaLink.detachAll).toHaveBeenCalledWith(
        MediaOwnerType.PRODUCT,
        "prod-1",
        "org-1",
      );
    });
  });
});
