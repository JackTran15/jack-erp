import { TransferDifferenceDetailReport } from './transfer-difference-detail.report';
import { TransferDocumentDetailReport } from './transfer-document-detail.report';

describe('TransferDifferenceDetailReport', () => {
  const build = () => {
    const engine = {
      detail: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, totals: { qty: 0, value: 0 } }),
    };
    const branches = { find: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) };
    return {
      engine,
      report: new TransferDifferenceDetailReport(
        engine as never,
        branches as never,
      ),
    };
  };

  const dto = {
    reportType: 'inventory-transfer-difference-detail',
    columns: ['date', 'documentNumber', 'reference', 'qty'],
    filters: {
      period: { from: '2026-07-09', to: '2026-08-30' },
      sourceStoreId: 'a',
      receivingStoreIds: ['b'],
    },
  } as never;
  const actor = {
    organizationId: 'org-1',
    userId: 'u1',
    roles: [],
    branchIds: ['a', 'b'],
    branchId: 'a',
  } as never;

  /**
   * The whole point of the dialog. `unmatched` must not be reachable through a
   * filter, or the export file says "chênh lệch" over someone else's rows.
   */
  it('always asks the engine for the unmatched leg', async () => {
    const { engine, report } = build();

    await report.buildData(dto, actor);

    expect(engine.detail).toHaveBeenCalledWith(
      expect.objectContaining({ leg: 'unmatched' }),
    );
  });

  it('ignores a transferLeg filter trying to redirect it', async () => {
    const { engine, report } = build();

    await report.buildData(
      { ...(dto as object), filters: { ...(dto as never as { filters: object }).filters, transferLeg: 'out' } } as never,
      actor,
    );

    expect(engine.detail).toHaveBeenCalledWith(
      expect.objectContaining({ leg: 'unmatched' }),
    );
  });

  /** A shipment nobody has received yet has no destination warehouse to name. */
  it('drops the warehouse column that L2 carries', async () => {
    const l3 = (await build().report.buildColumns()).map((h) => h.col);
    const l2 = (
      await new TransferDocumentDetailReport(
        null as never,
        null as never,
      ).buildColumns()
    ).map((h) => h.col);

    expect(l2).toContain('warehouse');
    expect(l3).not.toContain('warehouse');
    expect(l3).toEqual(l2.filter((c) => c !== 'warehouse'));
  });

  /**
   * AC-11. Every row here is an issue whose LATERAL found no paired receipt, so
   * `reference` is null by construction — the dialog's empty Tham chiếu column
   * IS the finding, not a rendering gap.
   */
  it('returns rows whose reference is always null', async () => {
    const engine = {
      detail: jest.fn().mockResolvedValue({
        total: 2,
        totals: { qty: 9, value: 0 },
        data: [
          { date: '2026-08-01', documentNumber: 'XK1', reference: null, referenceDate: null, warehouse: null, sku: 'A', name: 'a', unit: 'Đôi', qty: 7, unitPrice: 0, value: 0, parentSku: null, parentName: null, group: null },
          { date: '2026-08-02', documentNumber: 'XK2', reference: null, referenceDate: null, warehouse: null, sku: 'B', name: 'b', unit: 'Đôi', qty: 2, unitPrice: 0, value: 0, parentSku: null, parentName: null, group: null },
        ],
      }),
    };
    const branches = { find: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) };
    const report = new TransferDifferenceDetailReport(engine as never, branches as never);

    const result = await report.buildData(
      { ...(dto as object), columns: ['date', 'documentNumber', 'reference', 'qty'] } as never,
      actor,
    );

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) expect(row.reference).toBeNull();
  });

  it('counts the whole set for the export cap', async () => {
    const { engine, report } = build();

    await report.countRows(dto, actor);

    expect(engine.detail).toHaveBeenCalledWith(
      expect.objectContaining({ leg: 'unmatched', pageSize: 1 }),
    );
  });
});
