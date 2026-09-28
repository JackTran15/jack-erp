import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockDelay } from "../../../orders/_mock/mockDelay";
import {
  EINVOICE_DEFAULT_TEMPLATE,
  issueEInvoiceRecords,
  updateEInvoiceRecord,
} from "../_mock/einvoice.mock";
import type { EInvoiceRecord } from "./einvoice.interface";

export const EINVOICE_QUERY_KEY = "einvoices";

type EditPatch = Pick<EInvoiceRecord, "buyer" | "seller" | "templateNo" | "symbol">;

/** "Lưu" và "Phát hành" (mock) — ghi vào mảng mock rồi invalidate lưới. */
export function useEInvoiceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [EINVOICE_QUERY_KEY] });

  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EditPatch }) => {
      updateEInvoiceRecord(id, patch);
      await mockDelay(null);
    },
    onSuccess: () => {
      toast.success("Đã lưu hóa đơn");
      void invalidate();
    },
  });

  const issue = useMutation({
    mutationFn: async ({
      ids,
      template = EINVOICE_DEFAULT_TEMPLATE,
      patch,
    }: {
      ids: readonly string[];
      template?: { templateNo: string; symbol: string };
      /** Modal Sửa: ghi form trước rồi phát hành luôn. */
      patch?: EditPatch;
    }) => {
      if (patch) ids.forEach((id) => updateEInvoiceRecord(id, patch));
      return mockDelay(issueEInvoiceRecords(ids, template));
    },
    onSuccess: (count) => {
      toast.success(`Đã phát hành ${count} hóa đơn điện tử`);
      void invalidate();
    },
  });

  return { save, issue };
}

/** Các nút chưa có đặc tả / backend. */
export function notifyNotSupported(): void {
  toast.info("Chức năng chưa được hỗ trợ");
}
