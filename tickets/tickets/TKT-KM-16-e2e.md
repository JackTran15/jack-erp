# TKT-KM-16 E2E + test plan

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Cổng chặn cuối của epic: e2e chạy trên DB thật phủ vòng đời CTKM và toàn bộ tiêu chí nghiệm thu AC-01…AC-11 của REQ, cộng checklist QA thủ công cho phần FE không có test runner.

## Deliverables

- `apps/api/test/e2e/promotion-crud.e2e-spec.ts` — vòng đời: tạo 5 hình thức → search → get → sửa → nhân bản → đổi trạng thái → xóa.
- `apps/api/test/e2e/promotion-evaluate.e2e-spec.ts` — AC-01…AC-09 + BR-001 + BR-002 chạy qua HTTP thật.
- `apps/api/test/e2e/voucher-crud.e2e-spec.ts` — FR-050/FR-051.
- `docs/26-promotion-design.md` — bổ sung mục "Kịch bản kiểm thử" (checklist QA thủ công cho FE).

## Acceptance Criteria

### E2E backend

- [ ] **Vòng đời**: tạo đủ 5 hình thức qua `POST /v2/promotions`; mỗi cái `GET` lại và so **deep-equal** phần cấu hình đã gửi (bắt lỗi mất dữ liệu ở tầng mapper/repository).
- [ ] `PUT` đổi `type` → 400 `PROMOTION_TYPE_IMMUTABLE`.
- [ ] `POST /:id/duplicate` → CTKM mới có `code` khác, `status = TRACKING`, số group/line/tier **bằng** bản gốc.
- [ ] `DELETE` → soft delete: `GET` trả 404, search không thấy, nhưng dòng vẫn còn trong DB với `deleted_at`.
- [ ] **Cross-tenant**: org B `GET`/`PUT`/`DELETE` CTKM của org A → 404 (không phải 403).
- [ ] **Idempotency**: `POST /v2/promotions` hai lần cùng `X-Idempotency-Key` + cùng body → lần 2 trả `X-Idempotency-Status: REPLAYED`, DB chỉ có 1 dòng. Cùng key + body khác → 409.
- [ ] **Branch scope**: CTKM không có `promotion_branches` hiện ở mọi chi nhánh; CTKM giới hạn chi nhánh A **không** hiện khi search với `X-Branch-Id` = chi nhánh B.
- [ ] Search sắp đúng `priority ASC`; phân trang đúng; mỗi filter một case.

### E2E evaluate — bám mục 10 của REQ

- [ ] **AC-01** `ITEM_DISCOUNT` 30% trên SKU `685.000` → `discountAmount = 205.500`, `unitPriceAfter = 479.500`.
- [ ] **AC-03** CTKM `STOPPED` → không áp dụng, có trong `skippedPrograms` `reason = STOPPED`.
- [ ] **AC-04** `daysOfWeek = [1..5]`, `at` = Chủ nhật → `reason = DAY_OF_WEEK`.
- [ ] **AC-05** khung giờ `18:00–21:00`, `at = 15:00` → `reason = TIME_OF_DAY`. Ca qua đêm `22:00–02:00`, `at = 01:00` → **áp dụng**.
- [ ] **AC-06** bậc `[5,9] → 10%`, `[10,null] → 20%`; mua 7 → giảm 10%.
- [ ] **AC-07** `GIFT_ITEM` + `MIN_INVOICE_AMOUNT 200.000` + `multiplyGift`; hóa đơn `650.000` → 3 phần quà.
- [ ] **AC-08** `calcBasis = ITEM_CATEGORIES`, `groupMatchMode = ALL`, 2 nhóm, giỏ chỉ có nhóm 1 → `reason = CONDITION_NOT_MET`.
- [ ] **AC-09** `BUY_M_GET_N` + `CHEAPEST`, mua 3 tặng 1; giỏ `100k/200k/300k` → giảm đúng `100.000`.
- [ ] **BR-001** 2 CTKM cùng SKU `priority` 10 (30%) và 20 (50%) → 30% thắng; 50% có `reason = RESOURCE_TAKEN` + `takenBy`.
- [ ] **BR-002** `ITEM_DISCOUNT` (prio 10) + `INVOICE_DISCOUNT` `NON_PROMO_ONLY` (prio 20) → giảm hóa đơn chỉ tính trên dòng chưa bị chiếm.
- [ ] `autoApply = false` không tự chạy; truyền `selectedProgramIds` thì chạy.
- [ ] **Không ghi DB**: đếm số dòng mọi bảng trước/sau 10 lần gọi evaluate → không đổi.
- [ ] `itemId` lạ → 400 `UNKNOWN_ITEM`; `customerId` lạ → 400 `UNKNOWN_CUSTOMER`; `lines` rỗng → 400.
- [ ] Nhóm hàng cha: CTKM đặt ở nhóm cha áp dụng được cho item thuộc nhóm con (kiểm chứng `categoryPathIds`).

### QA thủ công FE

- [ ] Tạo → lưu → mở lại đủ **5 hình thức**, đối chiếu từng trường (đặc biệt `TIERED_DISCOUNT` nhiều nhóm, `BUY_M_GET_N` hai lưới).
- [ ] **AC-10** chip bộ lọc `Đang theo dõi` hiện rõ, click 1 lần xóa lọc, CTKM đã ngừng hiện ra.
- [ ] **AC-11** đổi tab sang "Điều kiện áp dụng", chọn một điều kiện → checkbox "Tự động áp dụng" **giữ nguyên** giá trị.
- [ ] **AC-02** lưu CTKM bỏ trống Tên chương trình → chặn lưu, báo lỗi **tại trường**.
- [ ] Lưu CTKM không có ngày kết thúc → hiện cảnh báo, vẫn lưu được (BR-003).
- [ ] Voucher: tạo → danh sách → dòng tổng cộng đúng → sửa → nhân bản → xóa.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` xanh (toàn bộ unit).
- [ ] `pnpm --filter @erp/api test:e2e` xanh — **đọc output thật**, không tin dòng exit: kafkajs consumer để hở handle nên teardown treo có thể giả dạng "suite failed".
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] `pnpm build` toàn workspace xanh.
- [ ] Checklist QA thủ công đã chạy hết, có ảnh chụp màn hình cho ≥ 2 hình thức phức tạp nhất đính kèm PR.
- [ ] Mọi mục `[Q]` của REQ đã có quyết định trong `docs/26-promotion-design.md` và được test tương ứng (nếu là quy tắc tính toán).

## Tech Approach

E2E chạy trên DB riêng `erp_test`: `apps/api/test/e2e/setup/global-setup.ts` nạp `apps/api/.env`, tự tạo DB và chạy migration trước suite. Chạy tuần tự (`maxWorkers: 1`, `forceExit: true`).

Hai điều đã biết về môi trường e2e của repo này, đừng mất thời gian tìm lại:
1. Cần **env DB tường minh** — thiếu là suite fail với lỗi kết nối khó hiểu.
2. Login trong test cần **`organizationId`**; `actor.branchId` lấy theo thứ tự **JWT trước, header sau** — set sai sẽ ra 403 branch scope tưởng như lỗi permission.

Seed cho `promotion-evaluate.e2e-spec.ts`: dựng tối thiểu 1 org + 1 branch + cây nhóm 2 cấp + 4 item với giá cụ thể (`685.000`, `100.000`, `200.000`, `300.000` — khớp các AC). Đặt trong helper seed dùng chung cho 2 spec evaluate/crud, không copy-paste.

Đặt tên test theo mã AC để truy vết ngược REQ:
```ts
it('AC-06: tiered QUANTITY 5→10%, 10→20%; buying 7 yields 10%', async () => { ... });
```

## Testing Strategy

Đây *là* ticket test. Nguyên tắc: e2e phủ **tích hợp và dữ liệu thật**; logic tính tiền đã được phủ ở unit của TKT-KM-05, không lặp lại toàn bộ ma trận ở e2e — chỉ chạy các AC làm bằng chứng đầu-cuối rằng engine, repository, catalog reader và HTTP layer khớp nhau.

## Dependencies

- Depends on: TKT-KM-13, TKT-KM-14, TKT-KM-15
- Blocks: —
