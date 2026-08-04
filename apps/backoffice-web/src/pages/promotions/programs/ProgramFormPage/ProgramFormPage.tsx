import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../../../components/layout/AdminPageShell";
import { PageHeader } from "../../../../components/layout/PageHeader";
import { ConfirmActionModal } from "../../../../components/table/ConfirmActionModal";
import { FormActionBar } from "./FormActionBar/FormActionBar";
import {
  PROMOTION_VARIANTS,
  parsePromotionForm,
} from "./PromotionVariant/promotion-variant.registry";
import { PromotionIssuesProvider } from "./promotion-issues.context";
import { PromotionFormModeProvider } from "./promotion-form-mode.context";
import { buildInitialFormState } from "../program-form.constants";
import { PromotionForm, PROMOTION_FORM_LABELS } from "../programs.constants";
import type { ProgramFormState } from "../program-form.types";
import type { PromotionProgramDetail } from "@erp/shared-interfaces";
import {
  programTypeToPromotionForm,
  promotionFormToProgramType,
  toCreateDto,
  toFormState,
} from "../../api/promotion.mapper";
import {
  getPromotionIssues,
  useChangePromotionStatus,
  useCreatePromotion,
  usePromotionQuery,
  useUpdatePromotion,
  type PromotionValidationIssue,
} from "../../api/use-promotions";

/**
 * Trường đã có ô nhập hiển thị được lỗi ngay tại chỗ. Lỗi của trường **ngoài**
 * danh sách này hiện ở banner đầu trang — thà thừa một dòng còn hơn để một lỗi
 * biến mất im lặng. Bind thêm trường nào thì thêm vào đây.
 */
const FIELDS_BOUND_TO_INPUTS = new Set(["name", "cardTierId"]);

/**
 * CTKM bậc thang có các bậc dùng `discountMode` khác nhau — hợp lệ phía API,
 * nhưng form chỉ có một ô "đơn vị giảm" dùng chung (A-23), nên mở ra rồi Lưu sẽ
 * ép mọi bậc về cùng một đơn vị.
 */
function hasMixedTierDiscountModes(detail: PromotionProgramDetail): boolean {
  const modes = new Set(
    detail.groups.flatMap((group) =>
      (group.tiers ?? []).map((tier) => tier.discountMode),
    ),
  );
  return modes.size > 1;
}

/**
 * Chặn trước những lỗi mà form biết chắc, để không phải đi một vòng mạng chỉ để
 * nhận về cùng một câu trả lời.
 *
 * `tierGroups[].tiers[].value` bắt buộc có mặt ở đây: mapper phải fallback ô
 * trống về `0` (vì `PromotionTierInputDto.discountValue` là trường bắt buộc phía
 * API), mà `0` là một mức giảm hợp lệ — không chặn ở form thì "để trống" sẽ âm
 * thầm biến thành "giảm 0%".
 */
function collectLocalIssues(
  form: ProgramFormState,
  type: PromotionForm,
): PromotionValidationIssue[] {
  const issues: PromotionValidationIssue[] = [];

  if (!form.name.trim()) {
    issues.push({
      field: "name",
      code: "NAME_REQUIRED",
      message: "Vui lòng nhập tên chương trình.",
    });
  }

  if (type === PromotionForm.TIERED_DISCOUNT) {
    for (const group of form.tierGroups) {
      for (const tier of group.tiers) {
        if (tier.value === "") {
          issues.push({
            field: `tiers[${tier.id}]`,
            code: "TIER_VALUE_REQUIRED",
            message: `Bậc thang trong "${group.name}" còn thiếu mức giảm.`,
          });
        }
      }
    }
  }

  return issues;
}

export function ProgramFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);

  /**
   * FR-008 — "Nhân bản" mở form **Thêm mới** đã điền sẵn từ một CTKM nguồn và
   * **không ghi gì** cho tới khi bấm Lưu. Cố ý không dùng `POST /:id/duplicate`
   * (endpoint đó ghi ngay và đốt luôn một mã KM, nên bấm nhầm rồi Hủy sẽ để lại
   * CTKM mồ côi). Endpoint vẫn thuộc API surface và được e2e AC-17 phủ.
   */
  const duplicateFromId = searchParams.get("duplicateFrom") ?? undefined;
  const sourceId = id ?? duplicateFromId;

  const { data: source, isLoading: isLoadingSource } = usePromotionQuery(sourceId);

  const [form, setForm] = useState<ProgramFormState>(() => buildInitialFormState());
  const [formNonce, setFormNonce] = useState(0);
  const [issues, setIssues] = useState<PromotionValidationIssue[]>([]);
  /** Trạng thái gốc của bản ghi — so để biết có cần gọi PATCH status không. */
  const [loadedStatus, setLoadedStatus] = useState<
    ProgramFormState["status"] | undefined
  >(undefined);
  const [seededFrom, setSeededFrom] = useState<string | undefined>(undefined);

  const createPromotion = useCreatePromotion();
  const updatePromotion = useUpdatePromotion();
  const changeStatus = useChangePromotionStatus();
  const isSaving =
    createPromotion.isPending || updatePromotion.isPending || changeStatus.isPending;

  // Hình thức: Thêm mới lấy từ `?type=`; Sửa/Nhân bản lấy từ chính bản ghi
  // (FR-006 — `type` bất biến, không tin tham số URL khi đã có bản ghi).
  const promotionForm = source
    ? programTypeToPromotionForm(source.type)
    : isEdit || duplicateFromId
      ? undefined
      : parsePromotionForm(searchParams.get("type"));

  // Seed form từ bản ghi nguồn đúng một lần, không đè lên thao tác đang gõ dở.
  useEffect(() => {
    if (!source || seededFrom === source.id) return;
    const seeded = toFormState(source);
    setForm(
      duplicateFromId
        ? { ...seeded, name: `${seeded.name} (sao chép)` }
        : seeded,
    );
    setLoadedStatus(duplicateFromId ? undefined : seeded.status);
    setSeededFrom(source.id);

    // A-23 — form chỉ có **một** ô "đơn vị giảm" cho toàn bộ bậc thang, trong khi
    // API cho phép mỗi bậc một `discountMode`. CTKM tạo qua Swagger/POS có thể
    // trộn mode; mở ra rồi Lưu sẽ ép hết về một mode. Cảnh báo trước khi người
    // dùng vô tình ghi đè, thay vì để họ phát hiện sau.
    if (hasMixedTierDiscountModes(source)) {
      toast.warning(
        "Chương trình này có các bậc thang dùng đơn vị giảm khác nhau. " +
          "Form chỉ hiển thị được một đơn vị — lưu lại sẽ áp cùng một đơn vị cho mọi bậc.",
        { duration: 10_000 },
      );
    }
  }, [source, seededFrom, duplicateFromId]);

  // Không có hình thức hợp lệ thì không có form nào để dựng — quay về danh sách
  // thay vì render một trang rỗng khó hiểu.
  useEffect(() => {
    if (sourceId || promotionForm) return;
    toast.error("Không xác định được hình thức khuyến mại.");
    navigate("/promotions/programs", { replace: true });
  }, [sourceId, promotionForm, navigate]);

  /** Đã xác nhận "lưu không có ngày kết thúc" rồi thì đừng hỏi lại mỗi lần Lưu. */
  const confirmedNoEndDate = useRef(false);
  /** Hành động chạy tiếp sau khi người dùng xác nhận ở modal BR-003. */
  const [pendingAfterSave, setPendingAfterSave] = useState<
    (() => void) | undefined
  >(undefined);

  const onChange = useCallback((patch: Partial<ProgramFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    // Người dùng vừa sửa — lỗi của lần lưu trước không còn mô tả đúng form nữa.
    setIssues([]);
    if (patch.endDate !== undefined) confirmedNoEndDate.current = false;
  }, []);

  /**
   * Lưu, rồi chạy `after`. Trả về `true` nếu lưu được.
   * Lỗi 400 kèm `issues[]` được gắn vào từng trường thay vì đổ ra một toast chung.
   */
  const performSave = useCallback(
    async (after: () => void): Promise<void> => {
      if (!promotionForm) return;

      const body = toCreateDto(form, promotionFormToProgramType(promotionForm));
      try {
        if (isEdit && id) {
          await updatePromotion.mutateAsync({ id, body });
          // `UpdatePromotionHandler` cố ý giữ nguyên `status` của bản ghi —
          // đổi trạng thái là endpoint riêng, nên chỉ gọi khi radio thật sự đổi.
          if (loadedStatus && form.status !== loadedStatus) {
            await changeStatus.mutateAsync({ id, status: form.status });
            setLoadedStatus(form.status);
          }
        } else {
          await createPromotion.mutateAsync(body);
        }
        setIssues([]);
        toast.success(
          isEdit ? "Đã lưu thay đổi chương trình." : "Đã tạo chương trình mới.",
        );
        after();
      } catch (error) {
        const fieldIssues = getPromotionIssues(error);
        if (fieldIssues?.length) {
          setIssues(fieldIssues);
          toast.error("Cấu hình chương trình chưa hợp lệ.");
          return;
        }
        toast.error(
          error instanceof Error ? error.message : "Lưu chương trình thất bại.",
        );
      }
    },
    [
      form,
      promotionForm,
      isEdit,
      id,
      loadedStatus,
      createPromotion,
      updatePromotion,
      changeStatus,
    ],
  );

  /**
   * Chặn ở form những lỗi biết chắc, rồi hỏi xác nhận BR-003 nếu thiếu ngày kết
   * thúc. CTKM vô thời hạn là **hợp lệ** — hỏi để người dùng biết mình đang tạo
   * cái chạy mãi, không phải để chặn.
   */
  const submit = useCallback(
    (after: () => void): void => {
      if (!promotionForm) return;

      const localIssues = collectLocalIssues(form, promotionForm);
      if (localIssues.length > 0) {
        setIssues(localIssues);
        toast.error("Vui lòng kiểm tra lại các trường được đánh dấu.");
        return;
      }

      if (!form.endDate && !confirmedNoEndDate.current) {
        setPendingAfterSave(() => after);
        return;
      }

      void performSave(after);
    },
    [form, promotionForm, performSave],
  );

  const confirmSaveWithoutEndDate = useCallback(() => {
    const after = pendingAfterSave;
    confirmedNoEndDate.current = true;
    setPendingAfterSave(undefined);
    if (after) void performSave(after);
  }, [pendingAfterSave, performSave]);

  const handleSave = useCallback(() => {
    submit(() => navigate("/promotions/programs"));
  }, [submit, navigate]);

  const handleSaveAndNew = useCallback(() => {
    submit(() => {
      setForm(buildInitialFormState());
      setFormNonce((n) => n + 1);
    });
  }, [submit]);

  const handleCancel = useCallback(() => {
    navigate("/promotions/programs");
  }, [navigate]);

  if (isLoadingSource) {
    return (
      <AdminPageShell>
        <PageHeader title="Chương trình KM" />
        <p className="p-6 text-sm text-muted-foreground">Đang tải chương trình…</p>
      </AdminPageShell>
    );
  }

  if (!promotionForm) return null;

  const Variant = PROMOTION_VARIANTS[promotionForm];
  const typeLabel = PROMOTION_FORM_LABELS[promotionForm].toLowerCase();
  const pageTitle = `Chương trình KM/ ${isEdit ? "Sửa" : "Thêm mới"} ${typeLabel}`;
  const unboundIssues = issues.filter(
    (issue) => !FIELDS_BOUND_TO_INPUTS.has(issue.field),
  );

  return (
    <AdminPageShell>
      <PageHeader title={pageTitle} />
      <FormActionBar
        position="top"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
        saveDisabled={isSaving}
      />

      {unboundIssues.length > 0 ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Cấu hình chương trình chưa hợp lệ
          </p>
          <ul className="mt-1 list-disc pl-5 text-destructive/90">
            {unboundIssues.map((issue) => (
              <li key={`${issue.field}:${issue.code}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <PromotionFormModeProvider isEdit={isEdit} promotionForm={promotionForm}>
        <PromotionIssuesProvider issues={issues}>
          <Variant key={formNonce} form={form} onChange={onChange} />
        </PromotionIssuesProvider>
      </PromotionFormModeProvider>

      <FormActionBar
        position="bottom"
        onSave={handleSave}
        onSaveAndNew={handleSaveAndNew}
        onCancel={handleCancel}
        saveDisabled={isSaving}
      />

      {pendingAfterSave ? (
        <ConfirmActionModal
          title="Chưa có ngày kết thúc"
          message="Chương trình sẽ áp dụng vô thời hạn cho tới khi bạn ngừng theo dõi. Vẫn lưu?"
          confirmLabel="Vẫn lưu"
          loading={isSaving}
          onConfirm={confirmSaveWithoutEndDate}
          onCancel={() => setPendingAfterSave(undefined)}
        />
      ) : null}
    </AdminPageShell>
  );
}
