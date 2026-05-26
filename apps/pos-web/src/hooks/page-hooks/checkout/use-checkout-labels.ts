import { useCallback } from "react";

import {
  selectSelectedLabelIds,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import {
  usePosCheckoutLabelsStore,
  type LabelTag,
} from "@erp/pos/stores/page-stores/checkout/checkout-labels.store";

export interface UseCheckoutLabelsResult {
  labels: LabelTag[];
  selectedLabelIds: string[];
  setSelectedLabelIds: (ids: string[]) => void;
  addLabel: (name: string) => LabelTag;
  updateLabel: (
    id: string,
    patch: Partial<Pick<LabelTag, "name" | "color">>,
  ) => void;
  deleteLabel: (id: string) => void;
}

/**
 * Adapter cho nhãn. Định nghĩa nhãn (`labels`, add/update/delete) dùng chung toàn
 * cục; còn nhãn ĐÃ GÁN cho đơn (`selectedLabelIds`) là per-tab (session draft).
 */
export function useCheckoutLabels(): UseCheckoutLabelsResult {
  const labels = usePosCheckoutLabelsStore((s) => s.labels);
  const addLabel = usePosCheckoutLabelsStore((s) => s.addLabel);
  const updateLabel = usePosCheckoutLabelsStore((s) => s.updateLabel);
  const deleteLabelDef = usePosCheckoutLabelsStore((s) => s.deleteLabel);

  const selectedLabelIds = usePosCheckoutSessionStore(selectSelectedLabelIds);
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  const setSelectedLabelIds = useCallback(
    (ids: string[]) => {
      // Chỉ giữ id còn tồn tại trong định nghĩa nhãn (giống logic store cũ).
      const known = new Set(
        usePosCheckoutLabelsStore.getState().labels.map((l) => l.id),
      );
      const filtered = ids.filter((id) => known.has(id));
      updateDraftSlice("labels", () => ({ selectedLabelIds: filtered }));
    },
    [updateDraftSlice],
  );

  const deleteLabel = useCallback(
    (id: string) => {
      deleteLabelDef(id);
      // Bỏ nhãn khỏi danh sách đã gán của tab hiện tại.
      updateDraftSlice("labels", (l) => ({
        selectedLabelIds: l.selectedLabelIds.filter((sid) => sid !== id),
      }));
    },
    [deleteLabelDef, updateDraftSlice],
  );

  return {
    labels,
    selectedLabelIds,
    setSelectedLabelIds,
    addLabel,
    updateLabel,
    deleteLabel,
  };
}
