export enum FastStockTransferModeEnum {
  OUTBOUND = "outbound",
  RETURN = "return",
}

export interface FastStockTransferFilters {
  sourceWarehouse: string;
  destinationWarehouse: string;
  transporter: string;
  product: string;
  location: string;
  showRowsNeedingReview: boolean;
}

export interface FastStockTransferRow {
  id: string;
  timestamp: string;
  transporter: string;
  sku: string;
  productName: string;
  location: string;
  unit: string;
  quantity: number;
  isTransferSelected: boolean;
}

export interface FastStockTransferDialogRow {
  id: string;
  productName: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  quantity: number;
}
