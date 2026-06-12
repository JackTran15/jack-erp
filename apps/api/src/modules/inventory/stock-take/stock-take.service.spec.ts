import { Test, TestingModule } from "@nestjs/testing";
import * as ExcelJS from "exceljs";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { StockTakeStatus } from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { DocumentNumberingService } from "../../document-numbering/document-numbering.service";
import { GoodsIssueEntity } from "../goods-issue/goods-issue.entity";
import { GoodsReceiptEntity } from "../goods-receipt/goods-receipt.entity";
import { ItemEntity } from "../location/item.entity";
import { LocationEntity } from "../location/location.entity";
import { StorageEntity } from "../location/storage.entity";
import { ItemCostSnapshotService } from "../location/item-cost-snapshot.service";
import { StockBalanceEntity } from "../ledger/stock-balance.entity";
import { StockLedgerService } from "../ledger/stock-ledger.service";
import { StockTakeEntity } from "./stock-take.entity";
import { StockTakeLineEntity } from "./stock-take-line.entity";
import { StockTakeMemberEntity } from "./stock-take-member.entity";
import { StockTakeService } from "./stock-take.service";

const actor: ActorContext = {
  userId: "user-1",
  organizationId: "org-1",
  branchId: "branch-1",
  roles: ["admin"],
};

describe("StockTakeService", () => {
  let service: StockTakeService;
  let stRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    createQueryBuilder: jest.Mock;
    softDelete: jest.Mock;
  };
  let lineRepo: {
    save: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  let memberRepo: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let balanceRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let locationRepo: { findOne: jest.Mock };
  let storageRepo: { findOne: jest.Mock };
  let itemCostSnapshotService: {
    snapshotCosts: jest.Mock;
    snapshotOne: jest.Mock;
  };
  let receiptRepo: object;
  let issueRepo: object;
  let documentNumbering: { generate: jest.Mock };
  let stockLedger: { recordBatchMovements: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const buildQb = (rows: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue(rows),
      getOne: jest.fn().mockResolvedValue(rows[0] ?? null),
    };
    for (const k of Object.keys(qb)) {
      if (!["getMany", "getOne"].includes(k)) qb[k].mockReturnValue(qb);
    }
    return qb;
  };

  beforeEach(async () => {
    stRepo = {
      create: jest.fn((dto) => ({ id: "st-new", lines: [], ...dto })),
      save: jest.fn((e) => Promise.resolve({ id: "st-new", ...e })),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
      softDelete: jest.fn(),
    };
    lineRepo = {
      save: jest.fn((e) => Promise.resolve({ id: "line-new", ...e })),
      delete: jest.fn(),
      findOne: jest.fn((args) =>
        Promise.resolve({ id: args?.where?.id ?? "line-new" }),
      ),
    };
    memberRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((e) => Promise.resolve(e)),
      delete: jest.fn(),
    };
    balanceRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    locationRepo = { findOne: jest.fn() };
    storageRepo = { findOne: jest.fn() };
    itemCostSnapshotService = {
      snapshotCosts: jest.fn().mockResolvedValue(
        new Map<string, number>([
          ["item-1", 3],
          ["item-3", 6],
        ]),
      ),
      snapshotOne: jest.fn().mockResolvedValue(3),
    };
    receiptRepo = {};
    issueRepo = {};
    documentNumbering = { generate: jest.fn().mockResolvedValue("KK000001") };
    stockLedger = { recordBatchMovements: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTakeService,
        { provide: getRepositoryToken(StockTakeEntity), useValue: stRepo },
        {
          provide: getRepositoryToken(StockTakeLineEntity),
          useValue: lineRepo,
        },
        {
          provide: getRepositoryToken(StockTakeMemberEntity),
          useValue: memberRepo,
        },
        {
          provide: getRepositoryToken(StockBalanceEntity),
          useValue: balanceRepo,
        },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: getRepositoryToken(StorageEntity), useValue: storageRepo },
        {
          provide: getRepositoryToken(GoodsReceiptEntity),
          useValue: receiptRepo,
        },
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: issueRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: stockLedger },
        { provide: DocumentNumberingService, useValue: documentNumbering },
        { provide: ItemCostSnapshotService, useValue: itemCostSnapshotService },
      ],
    }).compile();

    service = module.get(StockTakeService);
  });

  describe("create", () => {
    it("rejects when neither storageId nor locationId is given", async () => {
      await expect(service.create({}, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("creates empty stock-take (no auto-snapshot) when no lines are passed", async () => {
      stRepo.findOne.mockResolvedValue({
        id: "st-new",
        organizationId: actor.organizationId,
        status: StockTakeStatus.DRAFT,
        lines: [],
        documentNumber: "KK000001",
      } as unknown as StockTakeEntity);

      const result = await service.create({ storageId: "storage-1" }, actor);

      expect(documentNumbering.generate).toHaveBeenCalledWith(
        "STOCK_TAKE",
        "branch-1",
        actor,
      );
      // CRITICAL: no balance query — auto-snapshot is gone. Form dialog is the
      // only path that brings rows in, via the bundled `lines` payload.
      expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(stRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentNumber: "KK000001",
          status: StockTakeStatus.DRAFT,
          storageId: "storage-1",
          lines: [],
        }),
      );
      expect(result.documentNumber).toBe("KK000001");
    });

    it("resolves expected_qty for each bundled line via stock_balances lookup", async () => {
      // Service resolves location/qty per line via the same query-builder helper
      // as addLine — return a positive balance for item-1, none for item-2.
      let call = 0;
      balanceRepo.createQueryBuilder.mockImplementation(() => {
        call += 1;
        return call === 1
          ? buildQb([{ itemId: "item-1", locationId: "loc-A", quantity: 7 }])
          : buildQb([]);
      });
      // item-2 has no balance → fallback location lookup.
      locationRepo.findOne.mockResolvedValue({ id: "loc-fallback" });
      stRepo.findOne.mockResolvedValue({
        id: "st-new",
        organizationId: actor.organizationId,
        status: StockTakeStatus.DRAFT,
        lines: [],
        documentNumber: "KK000001",
      } as unknown as StockTakeEntity);

      await service.create(
        {
          storageId: "storage-1",
          lines: [
            { itemId: "item-1", countedQty: 5, reason: "thừa 2" },
            { itemId: "item-2" },
          ],
        },
        actor,
      );

      expect(stRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              itemId: "item-1",
              locationId: "loc-A",
              expectedQty: "7",
              countedQty: "5",
              reason: "thừa 2",
            }),
            expect.objectContaining({
              itemId: "item-2",
              locationId: "loc-fallback",
              expectedQty: "0",
              countedQty: null,
            }),
          ]),
        }),
      );
    });
  });

  describe("addLine", () => {
    const draftSt = {
      id: "st-1",
      organizationId: "org-1",
      branchId: "branch-1",
      status: StockTakeStatus.DRAFT,
      storageId: "storage-1",
      locationId: undefined,
      lines: [],
    } as unknown as StockTakeEntity;

    it("seeds expectedQty from stock_balance when an item is found in scope", async () => {
      stRepo.findOne.mockResolvedValue(draftSt);
      balanceRepo.createQueryBuilder.mockReturnValue(
        buildQb([{ itemId: "item-1", locationId: "loc-A", quantity: 7 }]),
      );

      await service.addLine("st-1", { itemId: "item-1" }, actor);

      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "item-1",
          locationId: "loc-A",
          expectedQty: "7",
          expectedValue: "21",
          countedQty: null,
          stockTakeId: "st-1",
        }),
      );
    });

    it("falls back to first location in storage when item has no balance", async () => {
      stRepo.findOne.mockResolvedValue(draftSt);
      balanceRepo.createQueryBuilder.mockReturnValue(buildQb([]));
      locationRepo.findOne.mockResolvedValue({ id: "loc-X" });

      await service.addLine("st-1", { itemId: "item-99" }, actor);

      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "item-99",
          locationId: "loc-X",
          expectedQty: "0",
        }),
      );
    });

    it("rejects when stock-take is not DRAFT", async () => {
      stRepo.findOne.mockResolvedValue({
        ...draftSt,
        status: StockTakeStatus.POSTED,
      });
      await expect(
        service.addLine("st-1", { itemId: "item-1" }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("updateLineCount", () => {
    it("refreshes expected quantity and value when a DRAFT line changes location", async () => {
      const line = {
        id: "line-1",
        itemId: "item-1",
        locationId: "loc-A",
        expectedQty: "7",
        expectedValue: "21",
      } as StockTakeLineEntity;
      stRepo.findOne.mockResolvedValue({
        id: "st-1",
        organizationId: actor.organizationId,
        status: StockTakeStatus.DRAFT,
        storageId: "storage-1",
        lines: [line],
      } as unknown as StockTakeEntity);
      locationRepo.findOne.mockResolvedValue({
        id: "loc-B",
        storageId: "storage-1",
      });
      balanceRepo.findOne.mockResolvedValue({ quantity: "4" });

      await service.updateLineCount(
        "st-1",
        "line-1",
        { locationId: "loc-B" },
        actor,
      );

      expect(locationRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: "loc-B",
          organizationId: actor.organizationId,
          isActive: true,
          storageId: "storage-1",
        },
      });
      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: "loc-B",
          expectedQty: "4",
          expectedValue: "12",
        }),
      );
    });
  });

  describe("process", () => {
    it("rejects when stock-take has no lines", async () => {
      stRepo.findOne.mockResolvedValue({
        id: "st-1",
        organizationId: "org-1",
        status: StockTakeStatus.DRAFT,
        lines: [],
      } as unknown as StockTakeEntity);
      await expect(service.process("st-1", actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("records balanced positive & negative variances and marks POSTED", async () => {
      const lines = [
        {
          id: "l-1",
          itemId: "item-1",
          locationId: "loc-1",
          expectedQty: "10",
          countedQty: "12",
        },
        {
          id: "l-2",
          itemId: "item-2",
          locationId: "loc-1",
          expectedQty: "5",
          countedQty: "5",
        },
        {
          id: "l-3",
          itemId: "item-3",
          locationId: "loc-1",
          expectedQty: "8",
          countedQty: "3",
        },
      ] as unknown as StockTakeLineEntity[];

      const stRow = {
        id: "st-1",
        organizationId: "org-1",
        branchId: "branch-1",
        status: StockTakeStatus.DRAFT,
        documentNumber: "KK000001",
        lines,
      } as unknown as StockTakeEntity;
      stRepo.findOne.mockResolvedValue(stRow);

      // Mock the transaction manager so process() runs the inner callback.
      const managerSave = jest.fn((e) =>
        Promise.resolve({ id: "fake-id", ...e }),
      );
      const managerCreate = jest.fn((_entity, dto) => ({
        id: "fake-id",
        ...dto,
      }));
      const managerUpdate = jest.fn();
      const managerFind = jest.fn().mockResolvedValue([
        { id: "item-1", unit: "Cái" },
        { id: "item-3", unit: "Hộp" },
      ]);
      const fakeManager = {
        save: managerSave,
        create: managerCreate,
        find: managerFind,
        update: managerUpdate,
      };
      dataSource.transaction.mockImplementation(
        async (cb: (m: typeof fakeManager) => unknown) => cb(fakeManager),
      );

      await service.process("st-1", actor);

      // Ledger should see exactly the 2 non-zero variances.
      const movementsArg = stockLedger.recordBatchMovements.mock.calls[0][0];
      expect(movementsArg).toHaveLength(2);
      const variances = movementsArg.map(
        (m: { quantity: number }) => m.quantity,
      );
      expect(variances).toEqual(expect.arrayContaining([2, -5]));

      // Each variance carries a unit_cost snapshot from items.purchase_price
      // (item-1 → 3.00, item-3 → 6.00). item-2 has zero variance and is
      // filtered out before the ledger call.
      const movementByItem = new Map<
        string,
        { quantity: number; unitCost?: number }
      >(
        movementsArg.map(
          (m: { itemId: string; quantity: number; unitCost?: number }) => [
            m.itemId,
            m,
          ],
        ),
      );
      expect(movementByItem.get("item-1")).toEqual(
        expect.objectContaining({ quantity: 2, unitCost: 3 }),
      );
      expect(movementByItem.get("item-3")).toEqual(
        expect.objectContaining({ quantity: -5, unitCost: 6 }),
      );

      // Status must flip to POSTED via manager.update (not a separate save call).
      expect(managerUpdate).toHaveBeenCalledWith(
        StockTakeEntity,
        "st-1",
        expect.objectContaining({ status: StockTakeStatus.POSTED }),
      );
      expect(managerFind).toHaveBeenCalledWith(ItemEntity, {
        where: { id: expect.anything(), organizationId: "org-1" },
      });
    });
  });

  describe("list with date range", () => {
    it("applies dynamic query filters", async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      stRepo.createQueryBuilder.mockReturnValue(qb);

      await service.list({
        organizationId: "org-1",
        branchId: "branch-1",
        page: 1,
        pageSize: 20,
        fromDate: "2026-05-01",
        toDate: "2026-05-31",
        documentNumber: "KK000001",
        storage: "main",
        purpose: "kiem",
      });

      expect(qb.where).toHaveBeenCalledWith("st.organization_id = :orgId", {
        orgId: "org-1",
      });
      expect(qb.andWhere).toHaveBeenCalledWith("st.branch_id = :branchId", {
        branchId: "branch-1",
      });
      expect(qb.andWhere).toHaveBeenCalledWith("st.created_at >= :fromDate", {
        fromDate: "2026-05-01T00:00:00.000Z",
      });
      expect(qb.andWhere).toHaveBeenCalledWith("st.created_at <= :toDate", {
        toDate: "2026-05-31T23:59:59.999Z",
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "LOWER(st.document_number) LIKE :documentNumber",
        { documentNumber: "%kk000001%" },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        "LOWER(storage.name) LIKE :storage",
        {
          storage: "%main%",
        },
      );
      expect(qb.orderBy).toHaveBeenCalledWith("st.createdAt", "DESC");
    });
  });

  describe("previewMerge", () => {
    beforeEach(() => {
      locationRepo.findOne.mockResolvedValue({
        id: "loc-1",
        storageId: "storage-1",
      });
    });

    const source = (id: string, countedQty: string, conclusion: string) =>
      ({
        id,
        organizationId: "org-1",
        branchId: "branch-1",
        status: StockTakeStatus.DRAFT,
        storageId: "storage-1",
        locationId: undefined,
        countByValue: false,
        conclusion,
        documentNumber: `KK-${id}`,
        lines: [
          {
            itemId: "item-1",
            locationId: "loc-1",
            countedQty,
            countedValue: "0",
            reason: conclusion,
            item: { id: "item-1", code: "SKU-1", name: "Item", unit: "pcs" },
            location: { id: "loc-1", code: "A1", name: "A1" },
          },
        ],
        members: [
          {
            fullName: "Nguyễn Văn A",
            title: "Thủ kho",
            representative: "Kho",
          },
        ],
      }) as unknown as StockTakeEntity;

    it("requires at least two vouchers", async () => {
      await expect(
        service.previewMerge(["st-1"], actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("aggregates matching lines, conclusions and members", async () => {
      stRepo.find.mockResolvedValue([
        source("st-1", "2", "Khu A"),
        source("st-2", "3", "Khu B"),
      ]);
      balanceRepo.findOne.mockResolvedValue({ quantity: "10" });

      const preview = await service.previewMerge(["st-1", "st-2"], actor);

      expect(preview.lines).toHaveLength(1);
      expect(preview.lines[0]).toEqual(
        expect.objectContaining({
          itemId: "item-1",
          locationId: "loc-1",
          expectedQty: "10",
          countedQty: "5",
        }),
      );
      expect(preview.conclusion).toBe("Khu A\nKhu B");
      expect(preview.members).toHaveLength(1);
      expect(preview.mergeSourceIds).toEqual(["st-1", "st-2"]);
    });

    it("rejects already merged sources", async () => {
      stRepo.find.mockResolvedValue([
        source("st-1", "2", "Khu A"),
        {
          ...source("st-2", "3", "Khu B"),
          mergedIntoId: "merged-id",
        },
      ]);

      await expect(
        service.previewMerge(["st-1", "st-2"], actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("allows processed sources when all have the same status", async () => {
      stRepo.find.mockResolvedValue([
        { ...source("st-1", "2", "Khu A"), status: StockTakeStatus.POSTED },
        { ...source("st-2", "3", "Khu B"), status: StockTakeStatus.POSTED },
      ]);
      balanceRepo.findOne.mockResolvedValue({ quantity: "10" });

      await expect(
        service.previewMerge(["st-1", "st-2"], actor),
      ).resolves.toEqual(
        expect.objectContaining({ mergeSourceIds: ["st-1", "st-2"] }),
      );
    });
  });

  describe("getById", () => {
    it("throws NotFoundException when missing", async () => {
      stRepo.findOne.mockResolvedValue(null);
      await expect(service.getById("missing", actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("enforces organizationId in lookup (cross-org isolation)", async () => {
      stRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getById("st-1", { ...actor, organizationId: "org-foreign" }),
      ).rejects.toThrow();
      expect(stRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: "st-1",
          organizationId: "org-foreign",
          branchId: actor.branchId,
        },
      });
    });
  });

  describe("buildImportTemplateBuffer", () => {
    it("adds MISA-compatible comments and number/date formats", async () => {
      const buffer = await service.buildImportTemplateBuffer(true);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as never);
      const sheet = workbook.worksheets[0];

      expect(sheet.getCell("A7").note).toBeTruthy();
      expect(sheet.getCell("G9").numFmt).toBe("dd/mm/yyyy");
      expect(sheet.getCell("K9").numFmt).toBe("#,##0.###");
      expect(sheet.getCell("N9").numFmt).toBe("#,##0.00");
    });
  });
});
