import {
  FastStockTransferFilters,
  FastStockTransferModeEnum,
  FastStockTransferRow,
} from "../types";

export const EMPTY_FAST_STOCK_TRANSFER_FILTERS: FastStockTransferFilters = {
  sourceWarehouse: "",
  destinationWarehouse: "",
  transporter: "",
  product: "",
  location: "",
  showRowsNeedingReview: true,
  sku: "",
  unit: "",
  productName: "",
};

export const FAST_STOCK_TRANSFER_WAREHOUSE_OPTIONS = [
  "KHO CẦN THƠ",
  "SHOWROOM CẦN THƠ",
] as const;

export const FAST_STOCK_TRANSFER_MOCK_ROWS: Record<
  FastStockTransferModeEnum,
  ReadonlyArray<FastStockTransferRow>
> = {
  [FastStockTransferModeEnum.OUTBOUND]: [
    {
      id: "outbound-1",
      timestamp: "08/05/2026 - 16:45",
      transporter: "Phan Thanh Hà",
      sku: "MY1231-DO-36",
      productName: "Giày thể thao MY1231-DO-36",
      location: "G29.01",
      unit: "Đôi",
      quantity: 1,
      isTransferSelected: false,
    },
  ],
  [FastStockTransferModeEnum.RETURN]: [
    {
      id: "return-1",
      timestamp: "08/05/2026 - 10:46",
      transporter: "Phan Thanh Hà",
      sku: "AKSK3625-TR-40",
      productName: "Giày thể thao AKSK3625-TR-40",
      location: "G29.01",
      unit: "Đôi",
      quantity: 1,
      isTransferSelected: false,
    },
  ],
};
