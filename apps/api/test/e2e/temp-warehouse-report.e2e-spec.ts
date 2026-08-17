import 'reflect-metadata';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
} from '@erp/shared-interfaces';
import {
  TempWarehouseIssueRow,
  TempWarehouseReportService,
} from '../../src/modules/inventory-reports/services/temp-warehouse-report.service';
import { TempWarehouseSessionEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-line.entity';
import { ItemEntity } from '../../src/modules/inventory/location/item.entity';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../../src/modules/pos/entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../../src/modules/pos/entities/invoice-item.entity';

/**
 * E2E cho báo cáo "Hàng hóa xuất kho tạm" — chạy SQL THẬT trên `erp_test`.
 *
 * Vì sao không dùng unit spec: `temp-warehouse-report.service.spec.ts` mock
 * `dataSource.query`, nên nó chỉ assert được chuỗi SQL, không chạy SQL. Nhãn
 * trạng thái, cách render ngày/giờ và tính chất "footer mô tả toàn tập" đều là
 * ngữ nghĩa — chỉ chứng minh được bằng cách chạy thật.
 *
 * Mỗi kịch bản dùng mã hàng riêng và lọc báo cáo qua `search`, nên các kịch bản
 * không nhìn thấy dữ liệu của nhau mà không phải reset DB giữa từng test.
 *
 * KHÔNG dựng cả NestJS app: service này chỉ cần một `DataSource`. Bỏ app boot
 * là bỏ luôn Kafka/Redis khỏi đường chạy — vốn đang làm mọi e2e khác của repo
 * treo ở hook (xác nhận: `temp-warehouse-fulfillment.e2e-spec.ts` cũng timeout
 * y hệt trên máy này, không liên quan tới thay đổi của tính năng này).
 */

/** Tên DB phải mang chữ "test": suite này gọi synchronize(true), tức DROP mọi bảng. */
const TEST_DB_NAME = process.env.E2E_DB_NAME || 'erp_test';
if (!/test/i.test(TEST_DB_NAME)) {
  throw new Error(
    `Refusing to run against "${TEST_DB_NAME}": this suite drops every table.`,
  );
}

describe('Temp-warehouse out-goods report (e2e)', () => {
  let ds: DataSource;
  let report: TempWarehouseReportService;
  let sessionId: string;
  let seed: { organizationId: string; branchId: string; userId: string };

  const PERIOD_START = new Date('2026-08-01T00:00:00.000Z');
  const PERIOD_END = new Date('2026-09-01T00:00:00.000Z');
  const IN_PERIOD = new Date('2026-08-15T03:00:00.000Z');
  const BEFORE_PERIOD = new Date('2026-07-20T03:00:00.000Z');

  let invoiceSeq = 0;

  const createItem = async (code: string): Promise<string> => {
    const repo = ds.getRepository(ItemEntity);
    const item = await repo.save(
      repo.create({
        organizationId: seed.organizationId,
        code,
        name: `Hàng ${code}`,
        unit: 'đôi',
        isActive: true,
        isPosVisible: true,
        purchasePrice: 100,
        sellingPrice: 200,
        createdBy: seed.userId,
      }),
    );
    return item.id;
  };

  /**
   * Một dòng kho tạm. `createdAt` ghi đè sau khi lưu vì nó là @CreateDateColumn.
   *
   * `transferId` mô phỏng đúng thứ `markLinesTransferred` ghi khi người dùng bấm
   * "Xử lý chuyển kho" (status TRANSFERRED + transfer_id, invoice_id để NGUYÊN
   * NULL) — không cần dựng Kafka để tái hiện.
   */
  const addLine = async (opts: {
    itemId: string;
    createdAt: Date;
    direction?: TempWarehouseDirection;
    invoiceId?: string;
    invoiceNumber?: string;
    transferId?: string;
    carrierUserId?: string;
    quantity?: string;
    lineStatus?: TempWarehouseLineStatus;
  }): Promise<string> => {
    const repo = ds.getRepository(TempWarehouseLineEntity);
    const line = await repo.save(
      repo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        sessionId,
        itemId: opts.itemId,
        direction: opts.direction ?? TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        quantity: opts.quantity ?? '1.00',
        carrierUserId: opts.carrierUserId ?? seed.userId,
        status:
          opts.lineStatus ??
          (opts.invoiceId || opts.transferId
            ? TempWarehouseLineStatus.TRANSFERRED
            : TempWarehouseLineStatus.ACTIVE),
        invoiceId: opts.invoiceId ?? null,
        invoiceNumber: opts.invoiceNumber ?? null,
        transferId: opts.transferId ?? null,
        createdBy: seed.userId,
      }),
    );
    // `created_at` là `timestamp WITHOUT time zone` giữ giờ UTC (kiểm chứng trên
    // erp_dev: dòng lúc 05:09:48 khớp hóa đơn 05:10:06+00). Truyền thẳng một
    // Date qua node-postgres sẽ ghi giờ LOCAL của máy chạy test, làm fixture
    // lệch production ở mọi múi giờ khác UTC — nên ép chuỗi UTC naive.
    await ds.query(
      'UPDATE temp_warehouse_lines SET created_at = $1::timestamp WHERE id = $2',
      [opts.createdAt.toISOString().slice(0, 19).replace('T', ' '), line.id],
    );
    return line.id;
  };

  /** Dòng "Xuất đi" — giữ tên cũ cho các kịch bản đã có. */
  const addIssueLine = (opts: Parameters<typeof addLine>[0]) => addLine(opts);

  /** Dòng "Trả lại" (showroom → kho). */
  const addReturnLine = (opts: Parameters<typeof addLine>[0]) =>
    addLine({ ...opts, direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE });

  /** Một hóa đơn cùng các dòng của nó. `lines` cho phép nhiều dòng cùng itemId (nút "Tách dòng"). */
  const createInvoice = async (opts: {
    lines: { itemId: string; itemCode: string; quantity: number }[];
    issuedAt?: Date;
    status?: InvoiceStatus;
    isDraft?: boolean;
    direction?: ItemDirection;
  }): Promise<{ id: string; code: string }> => {
    const code = `E2E-${String(++invoiceSeq).padStart(4, '0')}`;
    const invRepo = ds.getRepository(InvoiceEntity);
    const invoice = await invRepo.save(
      invRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        code,
        issuedAt: opts.issuedAt ?? IN_PERIOD,
        status: opts.status ?? InvoiceStatus.PAID,
        type: InvoiceType.SALE,
        isDraft: opts.isDraft ?? false,
        sessionId: 'e2e-session',
        staffId: seed.userId,
        createdBy: seed.userId,
      }),
    );
    const itemRepo = ds.getRepository(InvoiceItemEntity);
    for (const [i, l] of opts.lines.entries()) {
      await itemRepo.save(
        itemRepo.create({
          organizationId: seed.organizationId,
          branchId: seed.branchId,
          invoiceId: invoice.id,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: `Hàng ${l.itemCode}`,
          unit: 'đôi',
          quantity: l.quantity,
          unitPrice: 200,
          lineTotal: 200 * l.quantity,
          direction: opts.direction ?? ItemDirection.OUT,
          sortOrder: i,
          createdBy: seed.userId,
        }),
      );
    }
    return { id: invoice.id, code };
  };

  const runReport = (search: string, pageSize = 100) =>
    report.list({
      organizationId: seed.organizationId,
      startDate: PERIOD_START,
      endDate: PERIOD_END,
      search,
      page: 1,
      pageSize,
    });

  const sumSale = (rows: TempWarehouseIssueRow[]) =>
    rows.reduce((acc, r) => acc + r.saleQty, 0);

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433', 10),
      database: TEST_DB_NAME,
      username: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASS || 'erp_secret',
    };

    // Dọn sạch schema trước khi synchronize: `erp_test` giữ lại enum của lần
    // chạy trước, và synchronize không DROP nổi kiểu còn cột phụ thuộc.
    const cleaner = await new DataSource(connection).initialize();
    const [{ current_database: live }]: Array<{ current_database: string }> =
      await cleaner.query('SELECT current_database()');
    // Kiểm tra lại tên DB THẬT ngay trước lệnh hủy, không tin biến đã tính.
    if (!/test/i.test(live)) {
      await cleaner.destroy();
      throw new Error(`Refusing to drop schema on "${live}".`);
    }
    await cleaner.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await cleaner.destroy();

    ds = await new DataSource({
      ...connection,
      entities: [path.join(__dirname, '..', '..', 'src', '**', '*.entity.{ts,js}')],
      synchronize: true,
      logging: false,
    }).initialize();

    report = new TempWarehouseReportService(ds);
    seed = {
      organizationId: randomUUID(),
      branchId: randomUUID(),
      userId: randomUUID(),
    };

    const sessionRepo = ds.getRepository(TempWarehouseSessionEntity);
    const session = await sessionRepo.save(
      sessionRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        status: TempWarehouseSessionStatus.ACTIVE,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        // Snapshot vị trí trên session là NOT NULL nhưng báo cáo không đọc nó —
        // cột "Mã vị trí" resolve lại qua hai LATERAL trên item_storage_locations
        // / stock_balances. UUID bất kỳ là đủ cho fixture.
        warehouseLocationId: randomUUID(),
        showroomLocationId: randomUUID(),
        openedBy: seed.userId,
        openedAt: IN_PERIOD,
        createdBy: seed.userId,
      }),
    );
    sessionId = session.id;
  }, 180_000);

  afterAll(async () => {
    await ds?.destroy();
  });

  // AC-01 — dòng xuất kho tạm đã bán đọc là "Bán hàng kho tạm", trên SQL thật.
  it('không thiếu không trùng khi kho tạm nhận trọn số lượng bán', async () => {
    const code = 'SOLD-VIA-TEMP-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 1 }] });
    await addIssueLine({
      itemId,
      createdAt: IN_PERIOD,
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]!.status).toBe('Bán hàng kho tạm');
    expect(sumSale(data)).toBe(1);
  });

  // Kho tạm chỉ nhận một phần: phần dư ra dòng trưng bày, tổng vẫn khớp hóa đơn.
  it('chia đôi khi kho tạm chỉ nhận một phần', async () => {
    const code = 'SPLIT-CLAIM-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 3 }] });
    await addIssueLine({
      itemId,
      createdAt: IN_PERIOD,
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const { data } = await runReport(code);

    const tempRows = data.filter((r) => r.status === 'Bán hàng kho tạm');
    const showroomRows = data.filter((r) => r.status === 'Bán hàng trưng bày');
    expect(tempRows).toHaveLength(1);
    expect(tempRows[0]!.saleQty).toBe(1);
    expect(showroomRows).toHaveLength(1);
    expect(showroomRows[0]!.saleQty).toBe(2);
    expect(sumSale(data)).toBe(3);
  });

  // Dòng trưng bày không được bịa số liệu kho tạm.
  it('dòng bán trưng bày có SL xuất / SL trả / SL tồn bằng 0', async () => {
    const code = 'SHOWROOM-ONLY-SKU';
    const itemId = await createItem(code);
    await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 2 }] });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      status: 'Bán hàng trưng bày',
      outQty: 0,
      returnQty: 0,
      saleQty: 2,
      remainingQty: 0,
    });
  });

  // Dòng kho tạm stage TRƯỚC kỳ nhưng bán TRONG kỳ. Nhánh kho tạm không thấy nó
  // (base lọc theo created_at), nhưng tw_claimed phải thấy — nếu không, phần SL
  // đó sẽ sinh thêm một dòng trưng bày và bị đếm hai lần.
  it('dòng kho tạm stage ngoài kỳ vẫn chặn được đếm trùng', async () => {
    const code = 'STAGED-BEFORE-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 1 }] });
    await addIssueLine({
      itemId,
      createdAt: BEFORE_PERIOD,
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const { data } = await runReport(code);

    expect(data).toHaveLength(0);
    expect(sumSale(data)).toBe(0);
  });

  // Hóa đơn nháp / đã hủy / dòng IN đều không sinh dòng trưng bày.
  it.each([
    ['hóa đơn nháp', { isDraft: true }],
    ['hóa đơn đã hủy', { status: InvoiceStatus.CANCELLED }],
    ['dòng nhập lại (IN)', { direction: ItemDirection.IN }],
  ])('%s không sinh dòng bán trưng bày', async (label, override) => {
    const code = `EXCLUDED-${String(label).length}-SKU`;
    const itemId = await createItem(code);
    await createInvoice({
      lines: [{ itemId, itemCode: code, quantity: 2 }],
      ...(override as Record<string, unknown>),
    });

    const { data } = await runReport(code);

    expect(data).toHaveLength(0);
  });

  // Defect từng lọt qua toàn bộ spec mock: LEFT JOIN gắn tw_claimed vào TỪNG
  // dòng hóa đơn, nên nút "Tách dòng" ở POS làm phần kho tạm bị trừ một lần cho
  // mỗi dòng. Tái hiện INV-202608-00018 của erp_dev.
  it('hóa đơn tách nhiều dòng cùng mặt hàng chỉ bị trừ phần kho tạm một lần', async () => {
    const code = 'SPLIT-LINES-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({
      lines: [
        { itemId, itemCode: code, quantity: 2 },
        { itemId, itemCode: code, quantity: 2 },
        { itemId, itemCode: code, quantity: 1 },
      ],
    });
    for (let i = 0; i < 3; i++) {
      await addIssueLine({
        itemId,
        createdAt: IN_PERIOD,
        invoiceId: inv.id,
        invoiceNumber: inv.code,
      });
    }

    const { data } = await runReport(code);

    const tempRows = data.filter((r) => r.status === 'Bán hàng kho tạm');
    const showroomRows = data.filter((r) => r.status === 'Bán hàng trưng bày');
    expect(tempRows).toHaveLength(3);
    expect(showroomRows).toHaveLength(1);
    // 5 bán − 3 kho tạm đã nhận = 2. Trừ theo từng dòng sẽ ra 2−3, 2−3, 1−3:
    // âm cả ba, bị HAVING > 0 nuốt sạch, và tổng chỉ còn 3.
    expect(showroomRows[0]!.saleQty).toBe(2);
    expect(sumSale(data)).toBe(5);
  });

  // Ngày/giờ render theo giờ VN cho CẢ HAI nguồn. temp_warehouse_lines.created_at
  // là naive-UTC còn invoices.issued_at là timestamptz; nếu nhánh showroom không
  // ép về naive, UNION ALL nâng cả hai lên timestamptz và biểu thức render đổi
  // overload — trừ 7h thay vì cộng. Mốc 19:00Z chọn cố ý vì nó vắt qua nửa đêm:
  // sai chiều thì cả NGÀY cũng lệch, không chỉ giờ.
  it('render ngày/giờ theo giờ VN, giống nhau ở cả hai nguồn', async () => {
    const code = 'TZ-SKU';
    const itemId = await createItem(code);
    const crossesMidnight = new Date('2026-08-15T19:00:00.000Z');
    const inv = await createInvoice({
      lines: [{ itemId, itemCode: code, quantity: 2 }],
      issuedAt: crossesMidnight,
    });
    await addIssueLine({
      itemId,
      createdAt: crossesMidnight,
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const { data } = await runReport(code);

    expect(data).toHaveLength(2);
    for (const row of data) {
      expect(row.date).toBe('16/08/2026');
      expect(row.time).toBe('02:00:00');
    }
  });

  // Footer mô tả toàn tập kết quả lọc, không phải trang đang xem.
  it('totals không đổi theo kích thước trang', async () => {
    const code = 'PAGING-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 2 }] });
    // Hai dòng xuất kho tạm đã bán + một dòng chưa bán ⇒ 3 dòng, SL bán = 2.
    await addIssueLine({ itemId, createdAt: IN_PERIOD, invoiceId: inv.id, invoiceNumber: inv.code });
    await addIssueLine({ itemId, createdAt: IN_PERIOD, invoiceId: inv.id, invoiceNumber: inv.code });
    await addIssueLine({ itemId, createdAt: IN_PERIOD });

    const onePerPage = await runReport(code, 1);
    const allOnOnePage = await runReport(code, 100);

    expect(onePerPage.data).toHaveLength(1);
    expect(allOnOnePage.data).toHaveLength(3);
    expect(onePerPage.total).toBe(3);
    expect(onePerPage.total).toBe(allOnOnePage.total);
    expect(onePerPage.totals).toEqual(allOnOnePage.totals);
    expect(onePerPage.totals.saleQty).toBe(2);
    expect(onePerPage.totals.outQty).toBe(3);
  });

  // ── Lưới trạng thái: chiều (Xuất đi / Trả lại) × đã hạch toán chưa ──────────
  //
  // Kho tạm không có tồn kho riêng: lúc quét vào, sổ vẫn ghi hàng ở kho nguồn.
  // Nó chỉ dịch chuyển khi một phiếu chuyển kho được post — qua bán hàng, hoặc
  // qua nút "Xử lý chuyển kho". Bốn kịch bản dưới đây là bốn ô của lưới mà trước
  // đó chưa dữ liệu nào chạm tới (erp_dev có 0 dòng showroom_to_warehouse và 0
  // dòng chuyển kho thủ công).

  // "Xử lý chuyển kho" ở tab Xuất đi: hàng đã hạch toán sang showroom, không bán.
  // SL tồn PHẢI là 0 — đây là phần sửa D1; trước đó nó báo 1, tức nhãn nói đã
  // chuyển đi mà con số nói còn nằm trong kho tạm.
  it('dòng Xuất đi đã xử lý chuyển kho: đọc "Chuyển kho xuất đi", hết treo ở kho tạm', async () => {
    const code = 'TRANSFER-OUT-SKU';
    const itemId = await createItem(code);
    await addLine({ itemId, createdAt: IN_PERIOD, transferId: randomUUID() });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      status: 'Chuyển kho xuất đi',
      outQty: 1,
      returnQty: 0,
      saleQty: 0,
      remainingQty: 0,
    });
  });

  // "Xử lý chuyển kho" ở tab Trả lại: hàng đã hạch toán về kho.
  it('dòng Trả lại đã xử lý chuyển kho: đọc "Chuyển kho trả lại"', async () => {
    const code = 'TRANSFER-BACK-SKU';
    const itemId = await createItem(code);
    await addReturnLine({ itemId, createdAt: IN_PERIOD, transferId: randomUUID() });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      status: 'Chuyển kho trả lại',
      outQty: 0,
      returnQty: 1,
    });
  });

  // Trả lẻ: hàng về nhưng không khớp lần xuất nào trong kỳ. SL tồn âm là CÓ CHỦ
  // ĐÍCH — nó bù cho lần xuất nằm ngoài kỳ, để tổng cột cân bằng.
  it('dòng Trả lại lẻ: đọc "Trả hàng trưng bày", SL tồn âm để tổng cân bằng', async () => {
    const code = 'LONE-RETURN-SKU';
    const itemId = await createItem(code);
    await addReturnLine({ itemId, createdAt: IN_PERIOD });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      status: 'Trả hàng trưng bày',
      outQty: 0,
      returnQty: 1,
      saleQty: 0,
      remainingQty: -1,
    });
  });

  // Xuất rồi trả lại nguyên trạng: hai sự kiện gộp thành MỘT dòng trạng thái rỗng.
  it('xuất rồi trả cùng người vận chuyển: gộp một dòng, trạng thái rỗng', async () => {
    const code = 'BALANCED-SKU';
    const itemId = await createItem(code);
    await addLine({ itemId, createdAt: IN_PERIOD });
    await addReturnLine({ itemId, createdAt: IN_PERIOD });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      status: '',
      outQty: 1,
      returnQty: 1,
      remainingQty: 0,
    });
  });

  // Ghép cặp FIFO khoá theo (mặt hàng, NGƯỜI VẬN CHUYỂN). Khác người thì không
  // ghép — ra hai dòng chứ không phải một dòng cân bằng.
  it('xuất và trả khác người vận chuyển thì không ghép cặp', async () => {
    const code = 'TWO-CARRIERS-SKU';
    const itemId = await createItem(code);
    await addLine({ itemId, createdAt: IN_PERIOD, carrierUserId: seed.userId });
    await addReturnLine({ itemId, createdAt: IN_PERIOD, carrierUserId: randomUUID() });

    const { data } = await runReport(code);

    expect(data).toHaveLength(2);
    expect(data.map((r) => r.status).sort()).toEqual([
      'Trả hàng trưng bày',
      'Xuất không bán',
    ]);
  });

  // Thứ tự nhánh CASE: dòng đã bán mang CẢ transfer_id LẪN invoice_id
  // (fulfillInvoiceFromTempWarehouse ghi cùng lúc). Nhánh invoice phải thắng,
  // nếu không mọi dòng đã bán sẽ đọc nhầm thành "Chuyển kho xuất đi".
  it('dòng vừa có transfer_id vừa có invoice_id đọc là đã bán, không phải đã chuyển kho', async () => {
    const code = 'SOLD-AND-TRANSFERRED-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({ lines: [{ itemId, itemCode: code, quantity: 1 }] });
    await addLine({
      itemId,
      createdAt: IN_PERIOD,
      transferId: randomUUID(),
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]!.status).toBe('Bán hàng kho tạm');
    // Trừ đúng một lần: SL tồn = 1 − 0 − 1(bán) − 0(vế transfer bị chặn bởi
    // `invoice_id IS NULL`) = 0. Bỏ vế chặn đó thì ra −1.
    expect(data[0]!.remainingQty).toBe(0);
  });

  // "Đóng kho tạm" chế độ NET_OFFSET chèn dòng AUTO_BALANCED. Báo cáo lọc bỏ
  // đúng status đó, nên đóng kho tạm KHÔNG đổi được dòng nào — điều này hay bị
  // hiểu nhầm, nên khoá lại thành hợp đồng.
  it('dòng AUTO_BALANCED do đóng kho tạm sinh ra không vào báo cáo', async () => {
    const code = 'AUTO-BALANCED-SKU';
    const itemId = await createItem(code);
    await addLine({ itemId, createdAt: IN_PERIOD });
    await addReturnLine({
      itemId,
      createdAt: IN_PERIOD,
      quantity: '3.00',
      lineStatus: TempWarehouseLineStatus.AUTO_BALANCED,
    });

    const { data } = await runReport(code);

    // Chỉ còn dòng xuất; dòng auto-balanced biến mất hoàn toàn.
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ status: 'Xuất không bán', returnQty: 0 });
  });

  // Defect có sẵn từ trước tính năng này: báo cáo KHÔNG join `invoices`, tín hiệu
  // "đã bán" chỉ là `temp_warehouse_lines.invoice_id IS NOT NULL`. Nên hóa đơn bị
  // hủy vẫn tính là đã bán — `cancel-invoice.service.ts` không đụng bảng đó.
  //
  // Test này là CHANGE-DETECTOR, không phải bằng chứng: nó xanh dù hóa đơn ở
  // trạng thái nào, đúng vì đó là điều nó khẳng định. Assert lại status đọc từ DB
  // để fixture không âm thầm trở nên vô nghĩa. Ai sửa defect bằng cách thêm vị từ
  // status sẽ thấy nó đỏ và phải quyết định có chủ đích.
  it('báo cáo không tra trạng thái hóa đơn: đơn đã hủy vẫn tính là đã bán', async () => {
    const code = 'CANCEL-AFTER-SKU';
    const itemId = await createItem(code);
    const inv = await createInvoice({
      lines: [{ itemId, itemCode: code, quantity: 1 }],
      status: InvoiceStatus.CANCELLED,
    });
    await addIssueLine({
      itemId,
      createdAt: IN_PERIOD,
      invoiceId: inv.id,
      invoiceNumber: inv.code,
    });

    const stored = await ds
      .getRepository(InvoiceEntity)
      .findOneByOrFail({ id: inv.id });
    expect(stored.status).toBe(InvoiceStatus.CANCELLED);

    const { data } = await runReport(code);

    expect(data).toHaveLength(1);
    expect(data[0]!.status).toBe('Bán hàng kho tạm');
    expect(data[0]!.saleQty).toBe(1);
  });
});
