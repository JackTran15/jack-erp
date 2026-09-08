---
id: UOW-01
slug: in-xuat-phieu-chuyen-kho
title: Thủ kho in và xuất Excel phiếu chuyển kho từ dialog
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert 1 commit — không có migration, không đổi contract sẵn có; enum mới không ai đọc nếu FE rollback
---

# UOW-01 — Thủ kho in và xuất Excel phiếu chuyển kho từ dialog

## Demo script
1. Đăng nhập backoffice, vào Kho hàng → Chuyển kho
2. Mở một phiếu chuyển kho đã ghi sổ (POSTED) có ít nhất một dòng
3. Hai nút **In** và **Xuất khẩu** trên thanh công cụ dialog đang bật
4. Bấm **Xuất khẩu** → tải `phieu-chuyen-kho.xlsx`; mở file: tiêu đề PHIẾU CHUYỂN KHO, cột như mẫu MISA, dòng Tổng, Số tiền viết bằng chữ, khối ký
5. Bấm **In** → hộp thoại in trình duyệt hiện phiếu A4 cùng bố cục
6. Bấm **Thêm mới** → hai nút In / Xuất khẩu tắt

## In scope
- Enum kind + bề rộng cột; mapper thuần + spec; service + 2 route + openapi; FE route map + bật nút; e2e cách ly org

## Not in scope
- Lệnh điều chuyển, renderer, PDF server-side, cột Serials

## Risks
| Risk                                                         | Mitigation                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Hộp thoại in treo phiên Playwright                            | Verify chỉ assert nút bật/tắt; In/Xuất kiểm bằng curl + ảnh HTML render (tiền lệ `transfer-receipt-cross-branch-reference`) |
| `getById` không nạp đủ quan hệ để in (A-09)                   | Spec mapper + gọi thử route trên dev; nếu thiếu thì thêm `relations` tại `findOrFail`    |

## Definition of done
- [x] AC-01..AC-08 pass (unit + e2e + xác minh trình duyệt/curl)
- [x] `pnpm --filter @erp/api test -- stock-transfer-print.mapper` xanh (9/9)
- [x] `pnpm --filter @erp/api test:e2e -- voucher-print-payload`: mọi case phiếu chuyển kho xanh (5 case NK/XK có sẵn đỏ 403 ở HEAD — xem T-01-05)
- [x] `tsc --noEmit` xanh ở api + backoffice-web; `openapi.snapshot.json` + `schema.ts` đã sinh lại
- [x] Demoed and accepted at gate G4 (verify.py 4/4, evidence/manual/*)

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [x] PR draft copied and contact sheets attached to the PR description
