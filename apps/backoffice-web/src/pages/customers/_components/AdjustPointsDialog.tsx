import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppModal, Input } from "@erp/ui";
import { toast } from "sonner";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { getUserFacingApiErrorMessage } from "../../../lib/user-facing-api-error";

interface Props {
  customerId: string;
  currentPoints: number;
  open: boolean;
  onClose: () => void;
}

const MAX_POINTS = 1_000_000_000;

/**
 * Đặt số dư điểm mới. Server ghi chênh lệch thành một dòng "Điều chỉnh" trong
 * sổ cái điểm, nên lý do là bắt buộc.
 */
export function AdjustPointsDialog({ customerId, currentPoints, open, onClose }: Props) {
  const qc = useQueryClient();
  const [points, setPoints] = useState(String(currentPoints));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setPoints(String(currentPoints));
    setNote("");
  }, [open, currentPoints]);

  const parsed = Number(points);
  const pointsValid = points.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_POINTS;
  const noteValid = note.trim() !== "";

  const save = useMutation({
    mutationFn: async () =>
      requireErpData(
        await erpApi.PUT("/customers/{id}/membership-card/points", {
          params: { path: { id: customerId } },
          body: { points: parsed, note: note.trim() },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer-summary", customerId] });
      void qc.invalidateQueries({ queryKey: ["customer-point-history", customerId] });
      toast.success("Đã cập nhật điểm");
      onClose();
    },
    onError: (err) => toast.error(getUserFacingApiErrorMessage(err)),
  });

  const delta = pointsValid ? parsed - currentPoints : 0;

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Điều chỉnh điểm"
      onSave={() => save.mutate()}
      onCancel={onClose}
      saveLabel={save.isPending ? "Đang lưu…" : "Lưu"}
      cancelLabel="Huỷ"
      saveDisabled={save.isPending || !pointsValid || !noteValid}
      defaultWidth={440}
    >
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Điểm hiện tại: <span className="font-medium text-foreground">{currentPoints.toLocaleString("vi-VN")}</span>
        </p>
        <div>
          <label htmlFor="adjust-points-value" className="mb-1 block text-xs font-medium text-muted-foreground">
            Điểm mới
          </label>
          <Input
            id="adjust-points-value"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_POINTS}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
          {!pointsValid ? (
            <p className="mt-1 text-xs text-destructive">Nhập số nguyên từ 0 trở lên.</p>
          ) : delta !== 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Chênh lệch: {delta > 0 ? "+" : ""}
              {delta.toLocaleString("vi-VN")} điểm
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="adjust-points-note" className="mb-1 block text-xs font-medium text-muted-foreground">
            Lý do <span className="text-destructive">*</span>
          </label>
          <Input
            id="adjust-points-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Vd: Bù điểm hóa đơn cũ"
          />
        </div>
      </div>
    </AppModal>
  );
}
