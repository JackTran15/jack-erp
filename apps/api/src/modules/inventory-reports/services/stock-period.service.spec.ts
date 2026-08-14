import { StockPeriodService } from './stock-period.service';

describe('StockPeriodService pending transfers', () => {
  it('maps pending transfer quantities and values onto source and destination branch rows', async () => {
    const sourceRow = {
      item_id: 'item-1',
      sku: 'SKU-1',
      item_name: 'Hàng 1',
      unit: 'Cái',
      category_id: null,
      category_name: null,
      branch_id: 'branch-A',
      branch_code: null,
      branch_name: 'A',
      opening_qty: '10',
      opening_value: '1000',
      in_qty: '0',
      in_value: '0',
      out_qty: '4',
      out_value: '400',
      closing_qty: '6',
      closing_value: '600',
    };
    const destinationRow = {
      ...sourceRow,
      branch_id: 'branch-B',
      branch_name: 'B',
      opening_qty: '0',
      opening_value: '0',
      out_qty: '0',
      out_value: '0',
      closing_qty: '0',
      closing_value: '0',
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([sourceRow, destinationRow])
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            source_location_id: 'loc-A',
            source_branch_id: 'branch-A',
            destination_branch_id: 'branch-B',
            quantity: '4',
            value: '400',
          },
        ])
        // Truy vấn thứ 4: tập khoá (item, group) của toàn tập — mặc định rỗng,
        // các test này khẳng định giá trị theo từng dòng chứ không phải footer.
        .mockResolvedValue([]),
    };
    const service = new StockPeriodService(dataSource as never);

    const result = await service.aggregate({
      organizationId: 'org-1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T00:00:00.000Z'),
      groupBy: 'item_branch',
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        transferOutQty: 4,
        transferOutValue: 400,
        incomingQty: 0,
      }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({
        transferOutQty: 0,
        incomingQty: 4,
        incomingValue: 400,
      }),
    );
  });

  /**
   * Đặc tả **hiện trạng**, không phải hành vi mong muốn.
   *
   * `applyPendingTransfers` khử trùng cột "Sắp nhận về" theo cặp
   * (item, chi nhánh đích) và chỉ tính lượt pending **đầu tiên**. Cùng một mã
   * hàng được gửi tới một đích từ hai nguồn khác nhau vì thế bị đếm thiếu.
   *
   * Khoá lại ở đây trước khi nâng hai cột này lên SQL (T-06-02): tổng ở footer
   * phải khớp đúng con số đang hiển thị trong cột, kể cả khi con số đó sai theo
   * nghiệp vụ. Câu hỏi "quirk này có đúng không" là việc riêng.
   */
  it('chỉ tính lượt pending đầu tiên cho mỗi cặp (item, chi nhánh đích) — đếm thiếu khi nhiều nguồn', async () => {
    const baseRow = {
      item_id: 'item-1',
      sku: 'SKU-1',
      item_name: 'Hàng 1',
      unit: 'Cái',
      category_id: null,
      category_name: null,
      branch_code: null,
      opening_qty: '0',
      opening_value: '0',
      in_qty: '0',
      in_value: '0',
      out_qty: '0',
      out_value: '0',
      closing_qty: '0',
      closing_value: '0',
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { ...baseRow, branch_id: 'branch-B', branch_name: 'B' },
        ])
        .mockResolvedValueOnce([{ total: 1 }])
        // Hai lượt pending khác nguồn, cùng đích branch-B.
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            source_location_id: 'loc-A',
            source_branch_id: 'branch-A',
            destination_branch_id: 'branch-B',
            quantity: '4',
            value: '400',
          },
          {
            item_id: 'item-1',
            source_location_id: 'loc-C',
            source_branch_id: 'branch-C',
            destination_branch_id: 'branch-B',
            quantity: '7',
            value: '700',
          },
        ])
        // Truy vấn thứ 4: tập khoá (item, group) của toàn tập — mặc định rỗng,
        // các test này khẳng định giá trị theo từng dòng chứ không phải footer.
        .mockResolvedValue([]),
    };
    const service = new StockPeriodService(dataSource as never);

    const result = await service.aggregate({
      organizationId: 'org-1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T00:00:00.000Z'),
      groupBy: 'item_branch',
      page: 1,
      pageSize: 20,
    });

    // Tổng thật là 11; mã hiện tại trả 4 vì bỏ qua lượt thứ hai.
    expect(result.data[0].incomingQty).toBe(4);
    expect(result.data[0].incomingValue).toBe(400);
  });

  it('gộp theo hàng cha / nhóm thì hai cột điều chuyển luôn bằng 0', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            sku: 'SKU-1',
            item_name: 'Hàng 1',
            unit: 'Cái',
            category_id: null,
            category_name: null,
            // buildAggSqls NULL hoá branch_id/location_id ở chế độ gộp.
            branch_id: null,
            branch_code: null,
            branch_name: null,
            opening_qty: '0',
            opening_value: '0',
            in_qty: '5',
            in_value: '500',
            out_qty: '0',
            out_value: '0',
            closing_qty: '5',
            closing_value: '500',
          },
        ])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            source_location_id: 'loc-A',
            source_branch_id: 'branch-A',
            destination_branch_id: 'branch-B',
            quantity: '4',
            value: '400',
          },
        ])
        // Truy vấn thứ 4: tập khoá (item, group) của toàn tập — mặc định rỗng,
        // các test này khẳng định giá trị theo từng dòng chứ không phải footer.
        .mockResolvedValue([]),
    };
    const service = new StockPeriodService(dataSource as never);

    const result = await service.aggregate({
      organizationId: 'org-1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T00:00:00.000Z'),
      groupBy: 'item_branch',
      itemGroupBy: 'parent',
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0].transferOutQty).toBe(0);
    expect(result.data[0].incomingQty).toBe(0);
  });

  it('tổng hai cột điều chuyển tính trên toàn tập và tái hiện đúng quirk khử trùng', async () => {
    const row = {
      item_id: 'item-1',
      sku: 'SKU-1',
      item_name: 'Hàng 1',
      unit: 'Cái',
      category_id: null,
      category_name: null,
      branch_id: 'branch-B',
      branch_code: null,
      branch_name: 'B',
      opening_qty: '0',
      opening_value: '0',
      in_qty: '0',
      in_value: '0',
      out_qty: '0',
      out_value: '0',
      closing_qty: '0',
      closing_value: '0',
    };
    const dataSource = {
      query: jest
        .fn()
        // 1) trang hiện tại — chỉ 1 dòng
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            source_location_id: 'loc-A',
            source_branch_id: 'branch-A',
            destination_branch_id: 'branch-B',
            quantity: '4',
            value: '400',
          },
          {
            item_id: 'item-1',
            source_location_id: 'loc-C',
            source_branch_id: 'branch-C',
            destination_branch_id: 'branch-B',
            quantity: '7',
            value: '700',
          },
        ])
        // 4) tập khoá toàn tập: cả branch-A (nguồn) lẫn branch-B (đích) đều nằm
        //    trong kết quả, dù trang hiện tại chỉ hiển thị branch-B
        .mockResolvedValueOnce([
          { item_id: 'item-1', group_key: 'branch-A' },
          { item_id: 'item-1', group_key: 'branch-B' },
        ]),
    };
    const service = new StockPeriodService(dataSource as never);

    const result = await service.aggregate({
      organizationId: 'org-1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T00:00:00.000Z'),
      groupBy: 'item_branch',
      page: 1,
      pageSize: 1,
    });

    // branch-A là nguồn của lượt 4 → tổng "đang chuyển đi" thấy được cả dòng
    // không nằm trên trang hiện tại.
    expect(result.totals.transferOutQty).toBe(4);
    // "Sắp nhận về" giữ nguyên quirk: chỉ lượt đầu tiên cho (item-1, branch-B).
    expect(result.totals.incomingQty).toBe(4);
    expect(result.totals.incomingValue).toBe(400);
  });
});
