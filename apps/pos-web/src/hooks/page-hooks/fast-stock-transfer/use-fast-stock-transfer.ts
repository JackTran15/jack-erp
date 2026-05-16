import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_FAST_STOCK_TRANSFER_FILTERS,
  FAST_STOCK_TRANSFER_WAREHOUSE_OPTIONS,
  FAST_STOCK_TRANSFER_MOCK_ROWS,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/mockData";
import {
  FastStockTransferDialogRow,
  FastStockTransferFilters,
  FastStockTransferModeEnum,
  FastStockTransferRow,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";

type FastStockTransferEditableDraft = Pick<
  FastStockTransferRow,
  "transporter" | "sku" | "location"
>;

interface UseFastStockTransferResult {
  mode: FastStockTransferModeEnum;
  setMode: (mode: FastStockTransferModeEnum) => void;
  filters: FastStockTransferFilters;
  setFilter: <K extends keyof FastStockTransferFilters>(
    key: K,
    value: FastStockTransferFilters[K],
  ) => void;
  rows: ReadonlyArray<FastStockTransferRow>;
  editingRowId: string | null;
  editableDraft: FastStockTransferEditableDraft | null;
  isDialogOpen: boolean;
  selectedDialogRows: ReadonlyArray<FastStockTransferDialogRow>;
  canProcess: boolean;
  canCloseTransfer: boolean;
  warehouseOptions: ReadonlyArray<string>;
  handleAddRow: () => void;
  handleStartEdit: (rowId: string) => void;
  handleEditField: (
    key: keyof FastStockTransferEditableDraft,
    value: string,
  ) => void;
  handleSaveRow: (rowId: string) => void;
  handleToggleTransfer: (rowId: string, checked: boolean) => void;
  handleOpenProcessDialog: () => void;
  handleCloseProcessDialog: () => void;
  handleConfirmProcess: () => void;
  handleResetData: () => void;
}

function matchesText(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function createDraftFromRow(row: FastStockTransferRow) {
  return {
    transporter: row.transporter,
    sku: row.sku,
    location: row.location,
  };
}

export function useFastStockTransfer(): UseFastStockTransferResult {
  const [mode, setMode] = useState<FastStockTransferModeEnum>(
    FastStockTransferModeEnum.OUTBOUND,
  );
  const [filters, setFilters] = useState<FastStockTransferFilters>(
    EMPTY_FAST_STOCK_TRANSFER_FILTERS,
  );
  const [rowsByMode, setRowsByMode] = useState(() => ({
    [FastStockTransferModeEnum.OUTBOUND]: [
      ...FAST_STOCK_TRANSFER_MOCK_ROWS[FastStockTransferModeEnum.OUTBOUND],
    ],
    [FastStockTransferModeEnum.RETURN]: [
      ...FAST_STOCK_TRANSFER_MOCK_ROWS[FastStockTransferModeEnum.RETURN],
    ],
  }));
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editableDraft, setEditableDraft] =
    useState<UseFastStockTransferResult["editableDraft"]>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);

  const allRows = rowsByMode[mode];
  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (!matchesText(row.transporter, filters.transporter)) return false;
      if (
        !matchesText(row.sku, filters.product) &&
        !matchesText(row.productName, filters.product)
      ) {
        return false;
      }
      if (!matchesText(row.location, filters.location)) return false;
      return true;
    });
  }, [allRows, filters]);

  const setFilter = useCallback<UseFastStockTransferResult["setFilter"]>(
    (key, value) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleResetData = useCallback(() => {
    setRowsByMode({
      [FastStockTransferModeEnum.OUTBOUND]: [
        ...FAST_STOCK_TRANSFER_MOCK_ROWS[FastStockTransferModeEnum.OUTBOUND],
      ],
      [FastStockTransferModeEnum.RETURN]: [
        ...FAST_STOCK_TRANSFER_MOCK_ROWS[FastStockTransferModeEnum.RETURN],
      ],
    });
    setEditingRowId(null);
    setEditableDraft(null);
    setDialogOpen(false);
  }, []);

  const handleAddRow = useCallback(() => {
    const now = new Date();
    const rowId = `row-${now.getTime()}`;
    const newRow: FastStockTransferRow = {
      id: rowId,
      timestamp: `${now.toLocaleDateString("vi-VN")} - ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`,
      transporter: "",
      sku: "",
      productName: "",
      location: "",
      unit: "Đôi",
      quantity: 1,
      isTransferSelected: false,
    };

    setRowsByMode((prev) => ({
      ...prev,
      [mode]: [newRow, ...prev[mode]],
    }));
    setEditingRowId(rowId);
    setEditableDraft(createDraftFromRow(newRow));
  }, [mode]);

  const handleStartEdit = useCallback<
    UseFastStockTransferResult["handleStartEdit"]
  >(
    (rowId) => {
      const row = rowsByMode[mode].find((entry) => entry.id === rowId);
      if (!row) return;
      setEditingRowId(rowId);
      setEditableDraft(createDraftFromRow(row));
    },
    [mode, rowsByMode],
  );

  const handleEditField = useCallback<
    UseFastStockTransferResult["handleEditField"]
  >((key, value) => {
    setEditableDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSaveRow = useCallback<
    UseFastStockTransferResult["handleSaveRow"]
  >(
    (rowId) => {
      if (!editableDraft) return;
      setRowsByMode((prev) => ({
        ...prev,
        [mode]: prev[mode].map((row) =>
          row.id === rowId ? { ...row, ...editableDraft } : row,
        ),
      }));
      setEditingRowId(null);
      setEditableDraft(null);
    },
    [editableDraft, mode],
  );

  const handleToggleTransfer = useCallback<
    UseFastStockTransferResult["handleToggleTransfer"]
  >(
    (rowId, checked) => {
      setRowsByMode((prev) => ({
        ...prev,
        [mode]: prev[mode].map((row) =>
          row.id === rowId ? { ...row, isTransferSelected: checked } : row,
        ),
      }));
    },
    [mode],
  );

  const selectedDialogRows = useMemo<ReadonlyArray<FastStockTransferDialogRow>>(
    () =>
      rowsByMode[mode]
        .filter((row) => row.isTransferSelected)
        .map((row) => ({
          id: row.id,
          productName: row.productName,
          sourceWarehouse: filters.sourceWarehouse || "SHOWROOM CẦN THƠ",
          destinationWarehouse: filters.destinationWarehouse || "KHO CẦN THƠ",
          quantity: row.quantity,
        })),
    [filters.destinationWarehouse, filters.sourceWarehouse, mode, rowsByMode],
  );

  const canProcess = selectedDialogRows.length > 0 && !editingRowId;
  const canCloseTransfer =
    mode === FastStockTransferModeEnum.OUTBOUND && !editingRowId;

  const handleOpenProcessDialog = useCallback(() => {
    if (!canProcess) return;
    setDialogOpen(true);
  }, [canProcess]);

  const handleCloseProcessDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleConfirmProcess = useCallback(() => {
    setDialogOpen(false);
    setRowsByMode((prev) => ({
      ...prev,
      [mode]: prev[mode].map((row) => ({ ...row, isTransferSelected: false })),
    }));
  }, [mode]);

  return {
    mode,
    setMode,
    filters,
    setFilter,
    rows,
    editingRowId,
    editableDraft,
    isDialogOpen,
    selectedDialogRows,
    canProcess,
    canCloseTransfer,
    warehouseOptions: [...FAST_STOCK_TRANSFER_WAREHOUSE_OPTIONS],
    handleAddRow,
    handleStartEdit,
    handleEditField,
    handleSaveRow,
    handleToggleTransfer,
    handleOpenProcessDialog,
    handleCloseProcessDialog,
    handleConfirmProcess,
    handleResetData,
  };
}
