import { ApiProperty } from '@nestjs/swagger';
import { MobilePaymentSplitDto } from '../../mobile/dto/mobile-store-detail.response.dto';

// ── Row 1: hoạt động trong ngày ─────────────────────────────────────────────

export class OverviewCashInDto {
  /** Thanh toán trên hoá đơn trong kỳ (RETURN âm) — `SALES_PAYMENTS_SQL`. */
  @ApiProperty({ type: MobilePaymentSplitDto })
  sales!: MobilePaymentSplitDto;

  /** Thu nợ sau bán theo `paid_at` — `DEBT_PAYMENTS_SQL`. */
  @ApiProperty({ type: MobilePaymentSplitDto })
  debt!: MobilePaymentSplitDto;

  /** Thu khác: phiếu thu tiền mặt (→ `cash`) và tiền gửi (→ `transfer`) POSTED, vế "thu khác" của KQKD. */
  @ApiProperty({ type: MobilePaymentSplitDto })
  other!: MobilePaymentSplitDto;
}

export class OverviewRevenueSplitDto {
  @ApiProperty() total!: number;
  @ApiProperty() invoiceCount!: number;
  @ApiProperty() paidAmount!: number;
  @ApiProperty() paidCount!: number;
  @ApiProperty() unpaidAmount!: number;
  @ApiProperty() unpaidCount!: number;
}

export class OverviewCancelledDto {
  @ApiProperty() count!: number;
  @ApiProperty() amount!: number;
}

export class OverviewDailyActivityResponseDto {
  @ApiProperty({ type: OverviewCashInDto })
  cashIn!: OverviewCashInDto;

  /** Doanh thu trên CTE `lines` (loại huỷ, nháp), tách đã/chưa thanh toán — như chi tiết cửa hàng mobile. */
  @ApiProperty({ type: OverviewRevenueSplitDto })
  revenue!: OverviewRevenueSplitDto;

  @ApiProperty({ type: OverviewCancelledDto })
  cancelled!: OverviewCancelledDto;
}

// ── Row 2 ───────────────────────────────────────────────────────────────────

export class OverviewStoreResultDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() cost!: number;
  @ApiProperty() profit!: number;
}

export class OverviewResultTotalsDto {
  @ApiProperty() revenue!: number;
  @ApiProperty() cost!: number;
  @ApiProperty() profit!: number;
}

export class OverviewRevenueCostProfitResponseDto {
  @ApiProperty({ type: OverviewResultTotalsDto })
  totals!: OverviewResultTotalsDto;

  @ApiProperty({ type: [OverviewStoreResultDto] })
  stores!: OverviewStoreResultDto[];
}

/**
 * Mốc của mọi chuỗi thời gian: khoá do `TIME_BUCKET_SQL` sinh — `hour` →
 * `'0'..'23'`, `weekday` → `'1'..'7'` (1 = thứ Hai), còn lại →
 * `yyyy-MM-ddT00:00:00` của đầu mốc. Chỉ mốc CÓ phát sinh; client tự lấp 0.
 */
export class OverviewCashFlowPointDto {
  @ApiProperty() bucket!: string;
  @ApiProperty() cashIn!: number;
  @ApiProperty() cashOut!: number;
}

export class OverviewCashFlowResponseDto {
  @ApiProperty({ type: [OverviewCashFlowPointDto] })
  points!: OverviewCashFlowPointDto[];
}

// ── Row 3 phải ──────────────────────────────────────────────────────────────

export class OverviewRevenuePointDto {
  @ApiProperty() bucket!: string;
  @ApiProperty() revenue!: number;
}

export class OverviewRevenueTimelineResponseDto {
  @ApiProperty({ type: [OverviewRevenuePointDto] })
  points!: OverviewRevenuePointDto[];
}

export class OverviewResultPointDto {
  /** Đầu tháng `yyyy-MM-01T00:00:00` — client tự gộp quý/năm. */
  @ApiProperty() bucket!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() cost!: number;
  @ApiProperty() profit!: number;
}

export class OverviewRevenueCostProfitTimelineResponseDto {
  @ApiProperty({ type: [OverviewResultPointDto] })
  points!: OverviewResultPointDto[];
}

export class OverviewProductProfitPointDto {
  @ApiProperty() bucket!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() cogs!: number;
  @ApiProperty() profit!: number;
}

export class OverviewProductProfitResponseDto {
  @ApiProperty({ type: [OverviewProductProfitPointDto] })
  points!: OverviewProductProfitPointDto[];
}

// ── Row 3 trái ──────────────────────────────────────────────────────────────

/** Một dòng hàng hoá gộp — nhóm hàng, mẫu mã hoặc hàng hoá tuỳ endpoint. */
export class OverviewSubjectRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() revenue!: number;
}

export class OverviewSubjectListResponseDto {
  @ApiProperty({ type: [OverviewSubjectRowDto] })
  rows!: OverviewSubjectRowDto[];
}
