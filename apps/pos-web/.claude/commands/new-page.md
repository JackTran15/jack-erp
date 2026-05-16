Tạo page mới cho pos-web.

Hỏi tôi:
1. Tên trang (PascalCase, sẽ tự thêm suffix `Page`)
2. Có cần tạo sẵn folder page-components/hooks/stores tương ứng không?

Tạo:
- `src/pages/<Name>Page.tsx` với named export, dùng PosHeader layout

Nếu user chọn "có" ở câu 2, tạo thêm các folder rỗng:
- `src/components/page-components/<Name>/`
- `src/hooks/page-hooks/<name-kebab>/`
- `src/stores/page-stores/<name-kebab>/`
- `src/constants/<name-kebab>.constant.ts` (file rỗng với comment placeholder)

Nhắc tôi đăng ký route ở file router (hỏi tôi đường dẫn file router nếu chưa biết).