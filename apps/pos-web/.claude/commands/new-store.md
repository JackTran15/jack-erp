Tạo Zustand store mới cho pos-web.

Hỏi:
1. Tên store (kebab-case, ví dụ: `cart`, `order-filter`)
2. Scope: `common` hay `page-store`?
3. Liệt kê state và action cơ bản

Tạo file `<name>.store.ts` ở:
- `src/stores/common/` nếu common
- `src/stores/page-stores/<trang>/` nếu page-store

Nội dung:
- Interface `<Name>State` định nghĩa state + actions
- `export const use<Name>Store = create<...State>(...)` 
- Named export, KHÔNG default
- KHÔNG tạo index.ts
