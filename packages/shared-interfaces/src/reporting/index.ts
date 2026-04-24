export interface DashboardSummary {
  organizationId: string;
  branchId?: string;
  totalSalesToday: number;
  totalReturnsToday: number;
  netRevenue: number;
  openPosSessionCount: number;
  lowStockItemCount: number;
  pendingPayables: number;
  pendingReceivables: number;
  generatedAt: string;
}

export interface SalesSummary {
  organizationId: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  totalReturns: number;
  netRevenue: number;
  saleCount: number;
  returnCount: number;
  averageSaleValue: number;
}

export interface InventoryValuation {
  organizationId: string;
  branchId?: string;
  itemId: string;
  itemName: string;
  sku: string;
  quantityOnHand: number;
  unitCost: number;
  totalValue: number;
  generatedAt: string;
}

export interface AgingReport {
  organizationId: string;
  branchId?: string;
  type: 'PAYABLE' | 'RECEIVABLE';
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
  generatedAt: string;
}

export interface CashReconciliation {
  organizationId: string;
  branchId: string;
  sessionId: string;
  expectedBalance: number;
  actualBalance: number;
  discrepancy: number;
  reconciledAt: string;
}
