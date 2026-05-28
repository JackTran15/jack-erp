import { useEffect, useState } from "react";
import { AppModal } from "@erp/ui";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";

interface MembershipCardType {
  id: string;
  name: string;
  tier: string;
  description?: string;
  sortOrder: number;
}

export interface IssueMembershipCardDialogProps {
  customerId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TIER_BADGE_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-600",
  silver: "bg-slate-200 text-slate-700",
  gold: "bg-yellow-100 text-yellow-700",
  diamond: "bg-cyan-100 text-cyan-700",
};

export function IssueMembershipCardDialog({
  customerId,
  open,
  onClose,
  onSuccess,
}: IssueMembershipCardDialogProps) {
  const [cardTypes, setCardTypes] = useState<MembershipCardType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [issuedAt, setIssuedAt] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingTypes(true);
    apiClient
      .get<MembershipCardType[]>("/customers/membership-card-types")
      .then(({ data }) => {
        setCardTypes(data);
        if (data.length > 0) setSelectedTier(data[0].tier);
      })
      .catch((err) => {
        toast.error(getUserFacingApiErrorMessage(err));
      })
      .finally(() => setLoadingTypes(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedTier) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/customers/${customerId}/membership-card`, {
        tier: selectedTier,
        issuedAt,
      });
      toast.success("Cấp thẻ thành viên thành công");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Cấp thẻ thành viên"
      onSave={handleSubmit}
      onCancel={onClose}
      saveLabel={submitting ? "Đang xử lý…" : "Xác nhận cấp thẻ"}
      cancelLabel="Huỷ"
      saveDisabled={submitting || !selectedTier}
      defaultWidth={480}
    >
      <div className="space-y-4 py-2">
        {loadingTypes ? (
          <p className="text-sm text-muted-foreground">Đang tải danh sách loại thẻ…</p>
        ) : cardTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có loại thẻ nào được cấu hình. Vui lòng thêm loại thẻ trong phần Quản trị.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Chọn loại thẻ</p>
            <div className="space-y-2">
              {cardTypes.map((ct) => (
                <label
                  key={ct.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedTier === ct.tier
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="cardType"
                    value={ct.tier}
                    checked={selectedTier === ct.tier}
                    onChange={() => setSelectedTier(ct.tier)}
                    className="h-4 w-4 text-primary"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{ct.name}</span>
                      {ct.description && (
                        <p className="text-xs text-muted-foreground">{ct.description}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TIER_BADGE_COLORS[ct.tier] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ct.tier.toUpperCase()}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ngày cấp thẻ
          </label>
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </AppModal>
  );
}
