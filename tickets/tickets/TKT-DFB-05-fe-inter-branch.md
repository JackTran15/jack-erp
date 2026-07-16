# TKT-DFB-05 FE — Chuyển liên chi nhánh + Báo cáo tiền đang chuyển + Dashboard số dư

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

Frontend backoffice cho GĐ4: (1) **luồng chuyển liên chi nhánh** — khởi tạo tại CN A → danh sách chờ (`DANG_CHUYEN`) → CN B xác nhận nhận tiền (hoặc A hủy khi chưa xác nhận); (2) **trang Báo cáo tiền đang chuyển**; (3) **trang Dashboard số dư toàn hệ thống** (per-branch + per-account, cross-branch). Đây là khu vực treasury **mới** nên thêm route (`App.tsx`) + mục nav (`navConfig.ts`). Chuỗi UI **tiếng Việt**; số/tiền format `Intl` `vi-VN`. Tiêu dùng API qua `@erp/api-client` (sinh ở TKT-DFB-04) bọc trong TanStack Query.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/deposit-transfer/DepositTransferListPage.tsx` — danh sách transfer + filter (trạng thái/chi nhánh/khoảng ngày); badge trạng thái (`DANG_CHUYEN`/`HOAN_TAT`/`DA_HUY`); nút "Chuyển tiền" mở dialog khởi tạo; với dòng `DANG_CHUYEN` mà chi nhánh đang chọn là **đích** → nút "Xác nhận nhận"; là **nguồn** → nút "Hủy".
- `.../deposit-transfer/DepositTransferCreateDialog.tsx` — form khởi tạo tại A: chọn `CN đích`, `tài khoản đích`, `số tiền`, `ghi chú`. Submit `POST /deposit-transfers` (`erpApi`, `requireErpData`).
- `.../deposit-transfer/ConfirmReceiptDialog.tsx` + `CancelTransferDialog.tsx` — xác nhận / hủy (lý do bắt buộc khi hủy).
- `apps/backoffice-web/src/pages/treasury/deposit-in-transit/DepositInTransitPage.tsx` — bảng báo cáo tiền đang chuyển (CN nguồn → đích, tài khoản, số tiền, số ngày treo, cờ **quá hạn** highlight), dòng tổng cuối bảng.
- `apps/backoffice-web/src/pages/treasury/deposit-dashboard/DepositBalanceDashboardPage.tsx` — thẻ tổng (Σ số dư tài khoản, Σ tiền đang chuyển, **Tổng cộng**), bảng per-branch expand ra per-account.
- `apps/backoffice-web/src/hooks/treasury/use-deposit-transfers.ts`, `use-deposit-in-transit.ts`, `use-deposit-dashboard.ts` — TanStack Query hooks (queryKey mở đầu bằng tên resource + filter; mutation invalidate theo prefix). Thêm keys vào `hooks/treasury/treasury-query-keys.ts`.
- `apps/backoffice-web/src/App.tsx` — route mới: `/treasury/deposit-transfers`, `/treasury/deposit-in-transit`, `/treasury/deposit-dashboard`.
- `apps/backoffice-web/src/components/layout/navConfig.ts` — thêm 3 `NavChild` dưới nhóm treasury (khu vực tiền gửi): "Chuyển liên chi nhánh", "Tiền đang chuyển", "Số dư toàn hệ thống".

## Acceptance Criteria

- [ ] Khởi tạo tại A: submit thành công → toast, danh sách refetch, dòng mới trạng thái **Đang chuyển**; số dư CN A giảm ngay (phản ánh BR-TRF-01 khi mở dashboard/ledger).
- [ ] Nút "Xác nhận nhận" **chỉ** hiện khi chi nhánh đang chọn (`X-Branch-Id`) là **đích** và trạng thái `DANG_CHUYEN`; xác nhận → trạng thái chuyển **Hoàn tất**, khoản rời khỏi trang Tiền đang chuyển.
- [ ] Nút "Hủy" **chỉ** hiện khi chi nhánh đang chọn là **nguồn** và còn `DANG_CHUYEN`; sau khi B đã xác nhận, nút hủy/sửa **không** khả dụng (BR-TRF-03) — nếu bấm vẫn bị BE chặn 409 và hiển thị lỗi rõ.
- [ ] Trang Tiền đang chuyển hiển thị đúng tổng = tổng các khoản `DANG_CHUYEN` thấy được; dòng **quá hạn** (isOverdue) được highlight (BR-TRF-04).
- [ ] Dashboard hiển thị **Tổng cộng = Σ số dư tài khoản + Σ tiền đang chuyển**; nhãn tiếng Việt; format tiền `vi-VN`.
- [ ] **BR-PERM-01**: user chỉ được gán 1 chi nhánh → dashboard/in-transit/list chỉ thấy dữ liệu chi nhánh đó (client không tự lọc — BE đã lọc; FE chỉ render những gì nhận được).
- [ ] Nav + route thêm đủ (mỗi route có `<Route>` trong `App.tsx` **và** `NavChild` trong `navConfig.ts`).
- [ ] Dùng `@erp/ui` primitives, icon `lucide-react`, `cn()` + semantic Tailwind tokens; named export; `interface Props` tách riêng.
- [ ] Không đặt server data vào Zustand — dùng TanStack Query; mọi call qua `erpApi` + `requireErpData`/`requireErpSuccess`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh (type-check với client mới từ DFB-04).
- [ ] `pnpm lint` (workspace) không lỗi mới.
- [ ] Chuỗi UI tiếng Việt; enum/ID giữ English.
- [ ] Verify hình ảnh: screenshot 3 trang + luồng khởi tạo→xác nhận (mô tả diff trước/sau số dư).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Hook (mẫu; theo `use-cash-receipts.ts` / `use-cash-ledger.ts`):

```ts
export function useDepositTransfers(filters: DepositTransferFilters) {
  return useQuery({
    queryKey: ['deposit-transfers', filters],
    queryFn: () => requireErpData(erpApi.GET('/deposit-transfers', { params: { query: filters } })),
  });
}
export function useCreateDepositTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDepositTransferBody) =>
      requireErpData(erpApi.POST('/deposit-transfers', { body })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deposit-transfers'] });
      qc.invalidateQueries({ queryKey: ['deposit-in-transit'] });
      qc.invalidateQueries({ queryKey: ['deposit-dashboard'] }); },
  });
}
export function useConfirmDepositTransfer() { /* POST /deposit-transfers/:id/confirm */ }
export function useCancelDepositTransfer() { /* POST /deposit-transfers/:id/cancel */ }
```

Điều kiện nút theo chi nhánh đang chọn (`X-Branch-Id`, lấy từ store branch hiện hành):

```tsx
const branchId = useActiveBranchId();
const canConfirm = row.status === 'DANG_CHUYEN' && row.toBranchId === branchId;   // B
const canCancel  = row.status === 'DANG_CHUYEN' && row.fromBranchId === branchId; // A
```

**Reuse**: FE treasury shell `pages/treasury/cash/*` (layout list + PageToolbar), `DebtCollectionPickDialog.tsx` (mẫu dialog), `lib/erp-api.ts` (`erpApi`/`requireErpData`), `hooks/treasury/treasury-query-keys.ts`. Nav: nhóm `treasury-deposit` đã reserved (3 link WIP) — GĐ4 **thêm** 3 link mới (không phá WIP của GĐ1-3; nếu WIP đã được GĐ1-3 thay bằng trang thật thì chỉ append 3 link inter-branch). Route WIP `/treasury/wip/:slug` giữ nguyên.

## Testing Strategy

- Build gate: `pnpm --filter @erp/backoffice-web build` (type-check là kiểm thử chính cho FE theo repo).
- Verify thủ công (skill `verify`/`run`): đăng nhập CN A → chuyển 10tr cho CN B → thấy dòng Đang chuyển + dashboard A giảm + Tiền đang chuyển hiện 10tr; chuyển context sang CN B → Xác nhận nhận → dòng Hoàn tất + Tiền đang chuyển clear + dashboard B tăng; grand total không đổi. Ảnh chụp trước/sau.

## Dependencies

- Depends on: TKT-DFB-04 (client + snapshot).
- Blocks: TKT-DFB-06 (E2E chạy sau khi bề mặt ổn định; hoặc song song — E2E là backend, không phụ thuộc FE build).
