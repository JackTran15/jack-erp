Tạo hook mới cho pos-web.

Hỏi:
1. Tên hook (sẽ tự thêm prefix `use` nếu thiếu)
2. Scope: `common` hay `page-hook`?
   - Nếu page-hook: hỏi trang nào

Tạo file `use-<kebab-name>.ts` ở:
- `src/hooks/common/` nếu chọn common
- `src/hooks/page-hooks/<trang>/` nếu chọn page-hook

Nội dung:
- Named export
- Skeleton với JSDoc mô tả mục đích
- KHÔNG tạo index.ts
