import { TempWarehouseReportService } from './temp-warehouse-report.service';

function serviceWith(queryImpl: jest.Mock) {
  return new TempWarehouseReportService({ query: queryImpl } as never);
}

/** So SQL theo cấu trúc, không theo cách xuống dòng của template literal. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Dòng như câu gộp trả về: giá trị của chính dòng + tổng toàn tập (w_*). */
const ROW = {
  sku: 'SKU-1',
  out_qty: '1',
  return_qty: '0',
  sale_qty: '1',
  remaining_qty: '0',
  w_total: 2,
  w_out_qty: '2',
  w_return_qty: '0',
  w_sale_qty: '1',
  w_remaining_qty: '1',
};

/** Hình dạng của câu đếm dự phòng, chỉ chạy khi trang rỗng mà offset > 0. */
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
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    // Trang có 1 dòng, nhưng footer mô tả cả 2 dòng của toàn tập.
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.totals).toEqual({
      outQty: 2,
      returnQty: 0,
      saleQty: 1,
      remainingQty: 1,
    });
  });

  // Đếm, cộng và lấy dòng trong MỘT câu. Trước đây là hai, và cả hai đều dựng
  // lại nguyên chuỗi CTE (base → paired, showroom, movements) — thứ lớn dần
  // theo dữ liệu, chứ không phải theo trang.
  it('counts, totals and pages in a single statement', async () => {
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    // Window: tính SAU bộ lọc và TRƯỚC LIMIT, nên mỗi dòng mang tổng toàn tập.
    expect(sql).toContain('COUNT(*) OVER ()::int AS w_total');
    expect(sql).toContain('SUM(out_qty) OVER ()::numeric AS w_out_qty');
  });

  it('applies a column filter to the rows and the totals alike', async () => {
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    await service.list({
      ...BASE_QUERY,
      columnFilters: { saleQty: { operator: '>=', value: 1 } },
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];

    // Một câu, một vị từ — nên footer không thể mô tả tập khác với các dòng
    // phía trên nó. Đây là tính chất mà bản hai-câu phải giữ bằng kỷ luật.
    expect(sql).toContain('(sale_qty) >= $7');
    expect(params).toContain(1);
    // LIMIT/OFFSET nối sau tham số của bộ lọc.
    expect(params.slice(-2)).toEqual([20, 0]);
  });

  // Trang rỗng mà offset > 0 (đang ở trang 4 rồi lọc còn 1 trang): không còn
  // dòng nào để chở tổng, nhưng tập KHÔNG rỗng và footer vẫn phải mô tả nó.
  // Chỉ đúng trường hợp này mới tốn thêm một câu đếm.
  it('still reports totals for a page past the end of the set', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([AGGREGATE_ROW]);
    const service = serviceWith(query);

    const result = await service.list({ ...BASE_QUERY, page: 4 });

    expect(query).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(2);
    expect(result.totals.outQty).toBe(2);
  });

  it('does not pay for a count when the first page is genuinely empty', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(0);
    expect(result.totals.outQty).toBe(0);
  });

  // Hai LATERAL giải mã kệ hàng là 65% chi phí của báo cáo (đo trên erp_dev:
  // 3079 → 1355 buffers rồi xuống nữa sau khi gộp câu). Chúng chỉ được chạy
  // cho TRANG được trả về — ai gộp lại vào `enriched` "cho gọn" thì chi phí
  // quay về bám theo toàn tập.
  it('resolves the shelf for the returned page only', async () => {
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    // LIMIT/OFFSET nằm TRONG nguồn của LATERAL, không phải sau nó: `src` là
    // trang đã cắt, và hai LATERAL chạy trên đúng nó.
    expect(flatten(sql)).toContain('LIMIT $7 OFFSET $8 ) src');
    expect(sql).toContain('LEFT JOIN LATERAL');
  });

  // Lọc theo chính cột kệ là ngoại lệ: bộ lọc không nhìn thấy `location` nếu kệ
  // chưa được giải mã, nên nhánh đó phải trả lại chi phí cũ — có chủ đích.
  it('falls back to resolving the shelf for the whole set when it is filtered on', async () => {
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    await service.list({
      ...BASE_QUERY,
      columnFilters: { location: { operator: '=', value: 'A10' } },
    });

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('LOWER(location) = LOWER($7)');
    // Kệ giải mã TRƯỚC bộ lọc, tức trước cả LIMIT — ngược với đường thường.
    expect(flatten(sql)).toContain('fallback ON preferred.code IS NULL ) e WHERE');
  });

  // D — `tw_claimed` chặn theo tập hóa đơn trong kỳ, KHÔNG theo created_at của
  // chính dòng kho tạm. Chặn theo ngày stage sẽ để lọt phần kho tạm đã nhận
  // xuống nhánh showroom → đếm trùng (có e2e riêng). Chặn theo hóa đơn thì an
  // toàn: dòng mang hóa đơn ngoài kỳ vốn không join được với gì.
  it('bounds the temp-warehouse claim by the invoices in scope, not by stage date', async () => {
    const query = jest.fn().mockResolvedValueOnce([ROW]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const sql = flatten(query.mock.calls[0][0] as string);
    const twClaimed = sql.slice(
      sql.indexOf('tw_claimed AS ('),
      sql.indexOf('showroom AS ('),
    );
    expect(twClaimed).toContain('JOIN scoped_invoices si ON si.id = l.invoice_id');
    // Vị từ partial index phải còn thành câu chữ, nếu không index không dùng được.
    expect(twClaimed).toContain('l.invoice_id IS NOT NULL');
    // Không được có vị từ nào trên created_at của dòng kho tạm.
    expect(twClaimed).not.toContain('created_at');
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
    // Phạm vi của tw_claimed được khoá riêng ở test "bounds the temp-warehouse
    // claim by the invoices in scope" — mốc cắt chuỗi ở đó bám theo tên CTE
    // thật, nên không âm thầm rỗng khi SQL đổi.
  });

  it('maps a raw row onto the report row shape', async () => {
    const query = jest.fn().mockResolvedValueOnce([
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
        w_total: 1,
        w_out_qty: '1',
        w_return_qty: '0',
        w_sale_qty: '1',
        w_remaining_qty: '0',
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

});
