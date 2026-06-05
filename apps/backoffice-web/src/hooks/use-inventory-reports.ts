import { useQuery } from "@tanstack/react-query";
import {
  listStockByBranch,
  listStockDocumentDetails,
  listStockQuantityDetails,
  listStockSummary,
  listStockSummaryByBranch,
  listTransferByBranch,
  listTransferSummary,
  type InventoryReportFilters,
  type TransferByBranchFilters,
} from "../api/inventory-reports";

const KEY = "inventory-report";

export function useStockSummaryReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "stock-summary", filters],
    queryFn: () => listStockSummary(filters),
    placeholderData: (prev) => prev,
  });
}

export function useStockDocumentDetailsReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "stock-document-details", filters],
    queryFn: () => listStockDocumentDetails(filters),
    placeholderData: (prev) => prev,
  });
}

export function useStockQuantityDetailsReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "stock-quantity-details", filters],
    queryFn: () => listStockQuantityDetails(filters),
    placeholderData: (prev) => prev,
  });
}

export function useStockSummaryByBranchReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "stock-summary-by-branch", filters],
    queryFn: () => listStockSummaryByBranch(filters),
    placeholderData: (prev) => prev,
  });
}

export function useStockByBranchReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "stock-by-branch", filters],
    queryFn: () => listStockByBranch(filters),
    placeholderData: (prev) => prev,
  });
}

export function useTransferSummaryReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: [KEY, "transfer-summary", filters],
    queryFn: () => listTransferSummary(filters),
    placeholderData: (prev) => prev,
  });
}

export function useTransferByBranchReport(filters: TransferByBranchFilters) {
  return useQuery({
    queryKey: [KEY, "transfer-by-branch", filters],
    queryFn: () => listTransferByBranch(filters),
    placeholderData: (prev) => prev,
  });
}
