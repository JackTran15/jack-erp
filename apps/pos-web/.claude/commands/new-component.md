Tạo component mới cho pos-web. Tuân thủ `apps/pos-web/CLAUDE.md`.

Hỏi tôi tuần tự:
1. Tên component (sẽ check PascalCase)
2. Loại: `layout` / `common` / `page-component`
   - Nếu page-component: hỏi tiếp trang nào (Home/Product/Order/Customer)
3. Có child component không? Nếu có, liệt kê tên

Sau đó tự verify:
- Nếu loại là `layout` hoặc `common` → tên phải bắt đầu bằng `Pos`. Nếu chưa, hỏi tôi có muốn thêm prefix không.
- Nếu loại là `page-component` → tên KHÔNG được bắt đầu bằng `Pos`.

Tạo file theo cấu trúc:
- `layout` → `src/components/layout/<Name>/<Name>.tsx`
- `common` → `src/components/common/<Name>/<Name>.tsx`
- `page-component` → `src/components/page-components/<Trang>/<Name>/<Name>.tsx`
- Child → nest trong folder cha

Mỗi file chứa:
- Interface `<Name>Props` (export named)
- Component arrow function (export named, KHÔNG default)
- Skeleton TypeScript hợp lý

**TUYỆT ĐỐI KHÔNG tạo file `index.ts`.**

Cuối cùng, báo cáo:
- Danh sách file đã tạo
- Path import đầy đủ để tôi copy vào nơi sử dụng