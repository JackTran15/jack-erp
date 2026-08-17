import { TempWarehouseReportService } from './temp-warehouse-report.service';

function serviceWith(queryImpl: jest.Mock) {
  return new TempWarehouseReportService({ query: queryImpl } as never);
}

/** So SQL theo cấu trúc, không theo cách xuống dòng của template literal. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

const AGGREGATE_ROW = {
  total: '2',
  out_qty: '2',
  return_qty: '0',
  sale_qty: '1',
  remaining_qty: '1',
};

const BASE_QUERY = {
  organizationId: 'org-1',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-09-01T00:00:00.000Z'),
  page: 1,
  pageSize: 20,
};

describe('TempWarehouseReportService', () => {
  it('returns whole-set totals alongside the page', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(result.total).toBe(2);
    expect(result.totals).toEqual({
      outQty: 2,
      returnQty: 0,
      saleQty: 1,
      remainingQty: 1,
    });
  });

  it('counts and totals in one statement over the same stage the grid reads', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const [aggregateSql] = query.mock.calls[0] as [string, unknown[]];
    expect(aggregateSql).toContain('FROM enriched');
    expect(aggregateSql).toContain('COUNT(*)');
    expect(aggregateSql).toContain('SUM(out_qty)');
  });

  it('applies a column filter to the rows query and the totals query alike', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...AGGREGATE_ROW, total: '1' }])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list({
      ...BASE_QUERY,
      columnFilters: { saleQty: { operator: '>=', value: 1 } },
    });

    const [aggregateSql, aggregateParams] = query.mock.calls[0] as [
      string,
      unknown[],
    ];
    const [rowsSql, rowsParams] = query.mock.calls[1] as [string, unknown[]];

    // Same predicate on both sides — this is what stops the footer from
    // describing a different set than the rows above it.
    expect(aggregateSql).toContain('(sale_qty) >= $7');
    expect(rowsSql).toContain('(sale_qty) >= $7');
    expect(aggregateParams).toContain(1);
    // The rows query appends LIMIT/OFFSET after the filter's parameters.
    expect(rowsParams.slice(0, aggregateParams.length)).toEqual(aggregateParams);
  });

  // Khoá TOÀN BỘ khối CASE trong một assert: nhãn, điều kiện, nhánh rỗng và thứ
  // tự. Thứ tự là ràng buộc đúng-đắn: dòng nguồn showroom có out_qty =
  // return_qty = 0 nên nhánh `return_qty = out_qty` sẽ nuốt nó nếu `source`
  // không xét đầu tiên. Khoá từng mảnh rời sẽ để lọt đúng lỗi đó, và cả lỗi đảo
  // hai điều kiện transfer cho nhau mà thứ tự nhãn vẫn y nguyên.
  it('emits the status CASE with the right labels, conditions and order', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    expect(flatten(query.mock.calls[0][0] as string)).toContain(
      flatten(`
        CASE
          WHEN p.source = 'showroom' THEN 'Bán hàng trưng bày'
          WHEN p.invoice_id IS NOT NULL THEN 'Bán hàng kho tạm'
          WHEN p.exp_transfer_id IS NOT NULL THEN 'Chuyển kho xuất đi'
          WHEN p.ret_transfer_id IS NOT NULL THEN 'Chuyển kho trả lại'
          WHEN p.return_qty = p.out_qty THEN ''
          WHEN p.return_qty = 1 THEN 'Trả hàng trưng bày'
          ELSE 'Xuất không bán'
        END AS status
      `),
    );
  });

  // Công thức SL tồn. Assert đủ cả biểu thức chứ không chỉ alias: một dấu trừ
  // lật thành cộng phải đỏ.
  //
  // Vế `transfer_id ... AND invoice_id IS NULL` là phần sửa D1 — dòng đã "Xử lý
  // chuyển kho" hết treo ở kho tạm nên không còn tính vào SL tồn. Vế
  // `AND invoice_id IS NULL` chặn trừ hai lần với dòng đã bán: nó mang CẢ
  // transfer_id LẪN invoice_id vì fulfillInvoiceFromTempWarehouse ghi cùng lúc.
  it('computes remaining as issued minus returned, sold and transferred-out', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const sql = flatten(query.mock.calls[0][0] as string);
    expect(sql).toContain('(e.invoice_id IS NOT NULL)::int AS sale_qty');
    expect(sql).toContain(
      flatten(`(
        (e.id IS NOT NULL)::int
        - (r.id IS NOT NULL)::int
        - (e.invoice_id IS NOT NULL)::int
        - (e.transfer_id IS NOT NULL AND e.invoice_id IS NULL)::int
      ) AS remaining_qty`),
    );
    // `enriched` chỉ đọc lại, không tự suy lần nữa.
    expect(sql).toContain('p.remaining_qty AS remaining_qty');
  });

  // temp_warehouse_lines.created_at là naive-UTC, invoices.issued_at là
  // timestamptz. Không ép, UNION ALL nâng cả hai nhánh lên timestamptz và biểu
  // thức render `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'` đổi
  // overload — trừ 7h thay vì cộng 7h, sai ngày/giờ MỌI dòng của CẢ HAI nguồn.
  it('keeps the union naive-UTC so the +7h render stays a +7h render', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    expect(flatten(query.mock.calls[0][0] as string)).toContain(
      "COALESCE(inv.issued_at, inv.created_at) AT TIME ZONE 'UTC' AS event_at",
    );
  });

  // POS có nút "Tách dòng" tạo nhiều dòng giỏ cho cùng itemId. LEFT JOIN gắn
  // c.qty vào từng dòng, nên phải gộp trước khi trừ, nếu không phần kho tạm đã
  // nhận bị trừ một lần cho MỖI dòng → thiếu SL bán.
  it('aggregates invoice lines per (invoice, item) before subtracting the temp claim', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const sql = flatten(query.mock.calls[0][0] as string);
    expect(sql).toContain(
      'SUM(ii.quantity) - COALESCE(MAX(c.qty), 0) AS sale_qty',
    );
    expect(sql).toContain('GROUP BY ii.item_id, inv.id');
    expect(sql).toContain(
      'HAVING SUM(ii.quantity) - COALESCE(MAX(c.qty), 0) > 0',
    );
    // tw_claimed KHÔNG được chặn theo kỳ: dòng stage trước kỳ vẫn mang
    // invoice_id của hóa đơn trong kỳ, chặn theo kỳ sẽ đếm trùng.
    const claimed = sql.slice(
      sql.indexOf('tw_claimed AS ('),
      sql.indexOf('GROUP BY invoice_id, item_id'),
    );
    expect(claimed).not.toContain('$2');
    expect(claimed).not.toContain('$3');
  });

  it('maps a raw row onto the report row shape', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...AGGREGATE_ROW, total: '1' }])
      .mockResolvedValueOnce([
        {
          sku: 'TNV94-D-41',
          name: 'Giày nam TNV94-D-41',
          unit: 'Đôi',
          location: 'T10A.02',
          date: '15/08/2026',
          time: '09:11:00',
          staff: 'Admin User',
          out_qty: '1',
          return_qty: '0',
          sale_qty: '1',
          remaining_qty: '0',
          status: 'Bán hàng kho tạm',
          invoice: 'INV-202608-00165',
        },
      ]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      sku: 'TNV94-D-41',
      name: 'Giày nam TNV94-D-41',
      unit: 'Đôi',
      location: 'T10A.02',
      date: '15/08/2026',
      time: '09:11:00',
      staff: 'Admin User',
      outQty: 1,
      returnQty: 0,
      saleQty: 1,
      remainingQty: 0,
      status: 'Bán hàng kho tạm',
      invoice: 'INV-202608-00165',
    });
  });

  it('skips the rows query when nothing matches, but still reports zero totals', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { total: '0', out_qty: '0', return_qty: '0', sale_qty: '0', remaining_qty: '0' },
    ]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([]);
    expect(result.totals).toEqual({
      outQty: 0,
      returnQty: 0,
      saleQty: 0,
      remainingQty: 0,
    });
  });
});
