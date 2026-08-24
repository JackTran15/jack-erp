---
feature: pos-salesman-picker-branch-scope
environments: [local-pos]
viewports: [desktop]
---

# Verification — Ô "NV bán hàng" (POS Checkout) theo chi nhánh

Chạy bằng `LOCAL_POS_*` = `admin@erp.local` (`iam.user.read.all`). Tài khoản này thuộc 3/6 chi
nhánh: **HCM**, **Chi nhánh kiểm thử**, **Chi nhánh 2** — nên chọn được cả hai chi nhánh cần đối
chiếu.

Trước khi sửa, `GET /branches/:id/salesmen` trả **toàn bộ `employee_profiles` của tổ chức** bất
kể chi nhánh nào trên path — 6 dòng ở mọi chi nhánh. Sau khi sửa, nó chỉ trả hồ sơ của user được
gán chi nhánh đó:

```sql
SELECT b.name, count(DISTINCT e.id)
FROM branches b
LEFT JOIN user_branch_assignments uba ON uba.branch_id = b.id
LEFT JOIN employee_profiles e ON e.user_id = uba.user_id
GROUP BY b.name;
--  HCM          -> 6
--  Chi nhánh 2  -> 2   (Admin User, Quản lý CN Test)
SELECT count(*) FROM employee_profiles;   -- 6  ← con số cũ, ở mọi chi nhánh
```

**HCM một mình không chứng minh được gì**: tập của nó tình cờ bằng đúng tập org-wide (6 = 6), nên
ảnh chụp ở HCM giống hệt nhau trước và sau khi sửa. Chi nhánh 2 mới là bước có sức nặng — 6 → 2,
và bốn người biến mất là bốn người không làm ở đó.

Vì `POST /auth/switch-branch` cấp token mới và reload (đã thử, nó giết sạch phần còn lại của lần
chạy — xem `pos-employee-picker-branch-scope/07-verification.md`), hai chi nhánh phải là **hai
lần chạy riêng**, ghim bằng `LOCAL_POS_BRANCH_ID`. File này hiện là bản cho **Chi nhánh 2**; bản HCM đã chạy trước và ảnh giữ ở
`evidence/contact-sheet-hcm.png` cùng `evidence/run-hcm.json`.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Ô "NV bán hàng" ở Chi nhánh 2 chỉ còn 2 người của chi nhánh đó — bốn người của HCM biến mất | `/pos/` | `click input[aria-label="Chọn nhân viên bán hàng"]; wait li[role="option"]` | AC-S1 | `text=Admin User; text=Quản lý CN Test; no-text=Sales HCM; no-text=NV Kho HCM; count li[role="option"] = 2` |

## Not verified here

Nửa "trước khi sửa" không chụp lại được — code cũ đã không còn. Mốc đối chiếu là truy vấn SQL ở
trên (`employee_profiles` toàn tổ chức = 6 ở mọi chi nhánh) cộng với chính bước Chi nhánh 2.
