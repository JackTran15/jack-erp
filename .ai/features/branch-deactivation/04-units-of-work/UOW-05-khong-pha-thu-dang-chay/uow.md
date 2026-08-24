---
id: UOW-05
slug: khong-pha-thu-dang-chay
title: Mất hết chi nhánh vẫn đăng nhập được, chứng từ cũ vẫn đọc được tên cửa hàng
demoable: true
duration: 1d
depends_on: [UOW-02, UOW-03, UOW-04]
requirements: [US-05]
verifies: [AC-20, AC-21, AC-22, AC-23, AC-24]
risk: medium
status: todo
rollback: chủ yếu là test và một trạng thái rỗng; revert không đổi hành vi nghiệp vụ
---

# UOW-05 — Không phá thứ đang chạy

Bốn lát trước đều là *lấy đi*. Lát này chứng minh những gì **không** được lấy đi.

Hai lằn ranh:

- **Người dùng mất hết chi nhánh vẫn phải vào được app.** Người dùng đã chốt ở vòng hỏi:
  không chặn thao tác ngừng vì lý do nhân sự (A-03). Vậy trạng thái "không có chi nhánh nào"
  phải là một màn hình tử tế, không phải màn trắng.
- **Chứng từ cũ vẫn phải đọc được tên cửa hàng.** ADR-05 nói đường tra tên không lọc; lát này
  là bằng chứng cho lời nói đó.

POS đã xử lý sẵn một nửa: `BranchSelectPage` có câu *"Tài khoản chưa được gán chi nhánh. Liên
hệ quản trị viên."* Việc còn lại là xác minh nó thật sự hiện ra chứ không bị `PosRequireBranch`
đá vòng vòng, và làm phần tương ứng cho backoffice (`BranchSelector` hiện chỉ trả `null`).

## Demo script

1. Tạo tài khoản chỉ được gán duy nhất Hà Nội, ngừng hoạt động Hà Nội
2. Đăng nhập backoffice bằng tài khoản đó → vào được, thấy thông báo chưa được gán cửa hàng
   kèm hướng dẫn liên hệ quản trị; không màn trắng, không vòng xoay vô tận
3. Đăng nhập POS bằng cùng tài khoản → thấy đúng thông báo đó, không lặp về màn chọn chi nhánh
4. Bằng tài khoản quản trị, mở danh sách **Lệnh điều chuyển** có phiếu cũ đi Hà Nội → cột chi
   nhánh đích vẫn ghi "Chi nhánh Hà Nội", không rỗng, không UUID
5. In một phiếu cũ → tên cửa hàng vẫn đúng
6. `curl GET /branches/:id` với id Hà Nội → 200, `status: SUSPENDED`
7. `pnpm --filter @erp/api test:e2e -- branch-deactivation` → xanh

## In scope

- Trạng thái rỗng trên backoffice; xác minh trạng thái rỗng có sẵn của POS
- Bộ e2e phủ AC-20, AC-23, AC-24 và các đường tra tên
- Sinh lại `@erp/api-client` sau khi hợp đồng API đã chốt

## Not in scope

- Tự động gán lại nhân viên sang chi nhánh khác — nghiệp vụ của người dùng

## Risks

| Risk | Mitigation |
|---|---|
| e2e chạy nối tiếp và kafkajs để hở handle, dễ đọc nhầm treo teardown thành suite fail | Đọc output thật, không đọc mỗi exit message (đã ghi trong CLAUDE.md) |
| Sinh lại api-client kéo theo diff lớn ở file generated | Không sửa tay file generated; commit kèm `openapi.snapshot.json` |

## Definition of done
- [ ] AC-20..AC-24 pass
- [ ] `pnpm --filter @erp/api test` và `test:e2e` xanh
- [ ] `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts` đã cập nhật
- [ ] Bằng chứng ảnh chụp từ `/ai-dlc-verify` trên cả ba môi trường
- [ ] Demo được chấp nhận ở G4
