Tạo hook mới cho pos-web. Tuân thủ `apps/pos-web/CLAUDE.md` mục 6.

Hỏi tuần tự:

1. Tên hook (sẽ tự thêm prefix `use` nếu thiếu).

2. Hook này có wrap React Query (`useQuery` / `useMutation` / `useInfiniteQuery` / `useSubscription`) không?

   **Nếu CÓ → React Query hook:**
   - Tạo file `src/hooks/react-query/use-<kebab-name>.ts`.
   - Hỏi tiếp: module dữ liệu nào (account / invoice / customer / ...)?
   - Skeleton bắt buộc:
     - Import `queryKey` từ `@/constants/react-query-key.constant.ts` (vd `ACCOUNT_KEYS.PAYMENT_LIST`).
     - `queryFn` / `mutationFn` gọi service trong `@/services/<module>.service.ts`.
     - **KHÔNG** hard-code queryKey string.
     - **KHÔNG** gọi `http.*` trực tiếp trong hook.
   - Nếu key chưa tồn tại trong `react-query-key.constant.ts` → BÁO cho user, gợi ý thêm vào file constant. KHÔNG tự đẻ key ngầm bên trong hook.
   - Nếu service module chưa tồn tại → BÁO cho user, gợi ý chạy `/new-service` trước. KHÔNG tự gọi `http` để workaround.

   **Nếu KHÔNG → hook utility / page-hook:**
   - Hỏi scope: `common` hay `page-hook`?
   - Page-hook: hỏi tên trang.
   - Tạo file ở:
     - `src/hooks/common/use-<kebab-name>.ts` nếu common.
     - `src/hooks/page-hooks/<trang>/use-<kebab-name>.ts` nếu page-hook.

Yêu cầu chung của mọi file hook:
- Named export, KHÔNG default.
- JSDoc 1 dòng mô tả mục đích.
- KHÔNG tạo `index.ts`.
