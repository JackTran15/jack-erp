import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { DocumentDetailRow } from '../../services/document-detail.service';
import { DocumentDetailReport } from './document-detail.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

function engineRow(overrides: Partial<DocumentDetailRow>): DocumentDetailRow {
  return {
    docKind: 'GOODS_RECEIPT',
    postedAt: new Date('2026-07-03T10:00:00Z'),
    documentNumber: 'PNK-26-0001',
    referenceNumber: 'ref-1',
    sku: 'SKU-1',
    itemName: 'Item 1',
    parentSku: null,
    parentName: null,
    unit: 'Cái',
    categoryId: 'cat-1',
    categoryName: 'Nhóm A',
    brand: null,
    color: null,
    size: null,
    branchId: 'b1',
    branchName: 'CN 1',
    receiverBranchId: null,
    receiverBranchName: null,
    locationId: 'loc-1',
    locationCode: 'A-01',
    locationName: 'Kho chính',
    inQty: 5,
    inUnitPrice: 100,
    inValue: 500,
    inSalePrice: null,
    outQty: 0,
    outUnitPrice: 0,
    outValue: 0,
    outSalePrice: null,
    customerName: 'NCC Alpha',
    notes: null,
    ...overrides,
  };
}

function build(rows: DocumentDetailRow[]) {
  const engine = {
    list: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return new DocumentDetailReport(engine as never, branches as never);
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-document-detail',
  columns: [
    'date', 'documentType', 'warehouse', 'documentNumber', 'reference',
    'customer', 'branchCode', 'inQty', 'inUnitPrice', 'inValue', 'inSalePrice',
  ],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('DocumentDetailReport', () => {
  it('exposes the full catalog with VI doc-kind bands', async () => {
    const cols = await build([]).buildColumns();
    expect(cols).toHaveLength(27);
    expect(cols.find((c) => c.col === 'inQty')!.group).toEqual({
      id: 'in',
      name: 'Nhập kho',
    });
    expect(cols.find((c) => c.col === 'date')!.pinned).toBe('left');
  });

  it('maps rows — VI doc labels, formatted date, null no-source columns', async () => {
    const result = await build([engineRow({})]).buildData(dto, actor);
    expect(result.rows).toEqual([
      {
        date: '03/07/2026',
        documentType: 'Phiếu nhập kho mua hàng',
        warehouse: 'Kho chính',
        documentNumber: 'PNK-26-0001',
        reference: 'ref-1',
        customer: 'NCC Alpha',
        branchCode: null,
        inQty: 5,
        inUnitPrice: 100,
        inValue: 500,
        inSalePrice: null,
      },
    ]);
  });

  it('sums totals but nulls non-additive unit prices', async () => {
    const rows = [engineRow({}), engineRow({ inQty: 3, inValue: 900, inUnitPrice: 300 })];
    const result = await build(rows).buildData(dto, actor);
    expect(result.totals!.inQty).toBe(8);
    expect(result.totals!.inValue).toBe(1400);
    expect(result.totals!.inUnitPrice).toBeNull();
    expect(result.totals!.documentNumber).toBeNull();
  });
});
