import type {
  PromotionItem,
  PromotionStatusInfo,
} from "@erp/pos/interfaces/promotion.interface";
import type {
  PromotionKind,
  PromotionStatusTone,
} from "@erp/pos/constants/checkout.constant";
import {
  PromotionKindEnum,
  PromotionStatusEnum,
  PromotionStatusToneEnum,
} from "@erp/pos/constants/checkout.constant";
import type {
  AppliedProgram,
  EvaluateCartResponse,
  SkippedProgram,
  SkippedProgramReason,
} from "@erp/shared-interfaces";
import { PromotionDiscountMode, PromotionProgramType } from "@erp/shared-interfaces";

const KIND_LABELS: Record<PromotionKind, string> = {
  [PromotionKindEnum.AMOUNT_OFF]: "Giảm tiền",
  [PromotionKindEnum.PERCENT_OFF]: "Giảm %",
  [PromotionKindEnum.GIFT]: "Tặng quà",
  [PromotionKindEnum.VOUCHER]: "Voucher",
  [PromotionKindEnum.LOYALTY]: "Tích / dùng điểm",
  [PromotionKindEnum.CUSTOM]: "Khác",
};

const STATUS_TONE_DEFAULT: Record<
  PromotionStatusInfo["value"],
  PromotionStatusTone
> = {
  [PromotionStatusEnum.ACTIVE]: PromotionStatusToneEnum.SUCCESS,
  [PromotionStatusEnum.SCHEDULED]: PromotionStatusToneEnum.INFO,
  [PromotionStatusEnum.PAUSED]: PromotionStatusToneEnum.WARNING,
  [PromotionStatusEnum.EXPIRED]: PromotionStatusToneEnum.MUTED,
};

const STATUS_LABEL_DEFAULT: Record<PromotionStatusInfo["value"], string> = {
  [PromotionStatusEnum.ACTIVE]: "Đang áp dụng",
  [PromotionStatusEnum.SCHEDULED]: "Sắp diễn ra",
  [PromotionStatusEnum.PAUSED]: "Tạm dừng",
  [PromotionStatusEnum.EXPIRED]: "Đã kết thúc",
};

export const TONE_CLASS: Record<PromotionStatusTone, string> = {
  [PromotionStatusToneEnum.SUCCESS]: "bg-emerald-50 text-emerald-700",
  [PromotionStatusToneEnum.WARNING]: "bg-amber-50 text-amber-700",
  [PromotionStatusToneEnum.MUTED]: "bg-gray-100 text-gray-600",
  [PromotionStatusToneEnum.INFO]: "bg-indigo-50 text-indigo-700",
};

export function kindLabel(item: PromotionItem): string {
  return item.kindLabel ?? KIND_LABELS[item.kind] ?? "—";
}

export function resolvePromotionStatus(promotion: PromotionItem): {
  tone: PromotionStatusTone;
  label: string;
  hasStatus: boolean;
} {
  const status = promotion.status;
  if (!status) {
    return { tone: PromotionStatusToneEnum.MUTED, label: "—", hasStatus: false };
  }
  return {
    tone: status.tone ?? STATUS_TONE_DEFAULT[status.value],
    label: status.label ?? STATUS_LABEL_DEFAULT[status.value],
    hasStatus: true,
  };
}

/**
 * Nhãn "Hình thức" cho từng loại CTKM trả về từ `POST /v2/promotions/evaluate`.
 * `PromotionItem.kind` luôn set `CUSTOM` cho các dòng này — `PromotionProgramType`
 * (INVOICE_DISCOUNT/ITEM_DISCOUNT/…) không map 1-1 vào `PromotionKindEnum`
 * (AMOUNT_OFF/PERCENT_OFF/…, vốn dành cho voucher/loyalty), nên đi qua `kindLabel`.
 */
const PROGRAM_TYPE_LABELS: Record<PromotionProgramType, string> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: "Giảm giá hoá đơn",
  [PromotionProgramType.ITEM_DISCOUNT]: "Giảm giá mặt hàng",
  [PromotionProgramType.TIERED_DISCOUNT]: "Giảm giá theo bậc",
  [PromotionProgramType.GIFT_ITEM]: "Tặng quà",
  [PromotionProgramType.BUY_M_GET_N]: "Mua kèm ưu đãi",
};

/**
 * Nhãn tiếng Việt cho `SkippedProgramReason`. `Record` (không phải `switch`) để
 * TypeScript báo lỗi ngay khi backend thêm reason mới mà nhãn chưa kịp cập nhật —
 * không được lặng lẽ rơi vào nhánh mặc định và lộ mã enum tiếng Anh ra UI.
 *
 * `RESOURCE_TAKEN` ở đây chỉ là fallback tĩnh; `skippedReasonLabel()` bên dưới mới
 * là chỗ interpolate tên chương trình đã giành mất từ `takenBy`.
 */
const SKIPPED_REASON_LABELS: Record<SkippedProgramReason, string> = {
  STOPPED: "Đã ngừng theo dõi",
  DATE_WINDOW: "Ngoài thời gian áp dụng",
  DAY_OF_WEEK: "Không áp dụng vào thứ này",
  TIME_OF_DAY: "Ngoài khung giờ áp dụng",
  BRANCH_SCOPE: "Không áp dụng cho chi nhánh này",
  CUSTOMER_SCOPE: "Không áp dụng cho khách này",
  CONDITION_NOT_MET: "Chưa đủ điều kiện",
  NOT_SELECTED: "Chưa được chọn",
  RESOURCE_TAKEN: "Đã bị chương trình khác giành mất",
};

/**
 * Nhãn lý do bị bỏ qua cho 1 CTKM. `RESOURCE_TAKEN` tra tên chương trình thắng từ
 * `takenBy` (là `programId`, không phải tên) trong `appliedPrograms` của cùng
 * response — không tìm thấy thì lùi về câu chung chung, không hiển thị uuid thô.
 */
export function skippedReasonLabel(
  skipped: SkippedProgram,
  appliedPrograms: AppliedProgram[],
): string {
  if (skipped.reason === "RESOURCE_TAKEN") {
    const winner = skipped.takenBy
      ? appliedPrograms.find((program) => program.programId === skipped.takenBy)
      : undefined;
    return winner
      ? `Đã bị chương trình ${winner.name} giành mất`
      : SKIPPED_REASON_LABELS.RESOURCE_TAKEN;
  }
  return SKIPPED_REASON_LABELS[skipped.reason];
}

/**
 * Gom 3 nguồn của `EvaluateCartResponse` (`appliedPrograms`, `availablePrograms`,
 * `skippedPrograms`) thành 1 danh sách hiển thị cho `PromotionSelectionModal`.
 * Hàm thuần — không gọi API, không side effect.
 */
export function mapEvaluateResponseToPromotionItems(
  data: EvaluateCartResponse,
): PromotionItem[] {
  const applied: PromotionItem[] = data.appliedPrograms.map((program) => ({
    id: program.programId,
    name: program.name,
    kind: PromotionKindEnum.CUSTOM,
    kindLabel: PROGRAM_TYPE_LABELS[program.type],
    selected: true,
  }));

  const available: PromotionItem[] = data.availablePrograms.map((program) => ({
    id: program.programId,
    name: program.name,
    kind: PromotionKindEnum.CUSTOM,
    kindLabel: PROGRAM_TYPE_LABELS[program.type],
  }));

  const skipped: PromotionItem[] = data.skippedPrograms.map((program) => ({
    id: program.programId,
    name: program.name,
    kind: PromotionKindEnum.CUSTOM,
    kindLabel: "—",
    disabled: true,
    reason: skippedReasonLabel(program, data.appliedPrograms),
  }));

  return [...applied, ...available, ...skipped];
}

/**
 * Nhãn cho dòng "Khuyến mại" ở panel thanh toán. Chỉ hiện "(X%)" khi đúng 1
 * chương trình đang áp và nó là `INVOICE_DISCOUNT` kiểu `PERCENT` — mọi
 * trường hợp khác (0, loại khác, hoặc ≥2 chương trình cộng dồn) trả về nhãn
 * phẳng, vì một con số % lẻ không mô tả đúng tổng đã cộng dồn. Không suy
 * diễn % gần đúng từ `discountAmount / subtotal` — chỉ dùng giá trị thật.
 */
export function buildPromotionRowLabel(data: EvaluateCartResponse): string {
  const [only] = data.appliedPrograms;
  const isSolePercentInvoiceDiscount =
    data.appliedPrograms.length === 1 &&
    only.type === PromotionProgramType.INVOICE_DISCOUNT &&
    only.discountMode === PromotionDiscountMode.PERCENT &&
    only.discountValue != null;

  return isSolePercentInvoiceDiscount
    ? `Khuyến mại (${only.discountValue}%)`
    : "Khuyến mại";
}

/** Guard cho dòng "Khuyến mại" — ẩn khi không có giảm giá thật. */
export function shouldShowPromotionRow(data: EvaluateCartResponse): boolean {
  return data.promotionDiscount > 0;
}
