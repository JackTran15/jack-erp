# POS Web

React 18 + Vite + TypeScript + Zustand + TailwindCSS. UI thu ngân tại quầy.

---

## 1. Cấu trúc src

```
src/
├── components/
│   ├── common/              # Tái sử dụng 2+ trang, prefix "Pos"
│   ├── layout/              # Header/Sidebar/Footer, prefix "Pos"
│   └── page-components/
│       ├── Home/
│       ├── Product/
│       ├── Order/
│       └── Customer/
├── pages/                   # File route, đặt tên *Page.tsx
├── hooks/
│   ├── common/             # hook dùng chung, KHÔNG dính React Query
│   ├── react-query/        # hook wrap useQuery/useMutation (1 file/domain, đặt tên use-query-<domain>.ts)
│   └── page-hooks/
│       ├── home/
│       ├── product/
│       ├── order/
│       └── customer/
├── stores/
│   ├── common/
│   └── page-stores/
│       ├── home/
│       ├── product/
│       ├── order/
│       └── customer/
├── services/               # 1 file = 1 module dữ liệu, gọi API qua http
│   ├── account.service.ts
│   └── invoice.service.ts
├── dtos/                   # Payload/arg/return của function, request/response body, params (transient)
│   ├── account.dto.ts
│   └── invoice.dto.ts
├── interfaces/             # Entity (dữ liệu domain: InvoiceRow, CustomerRow…) + interface dùng chung
│   ├── invoice.interface.ts
│   └── paginated.interface.ts
├── types/                  # type-alias / union không phải entity/dto (1 file = 1 domain, đuôi .type.ts)
│   ├── invoice.type.ts
│   └── customer.type.ts
└── constants/
    ├── common.constant.ts
    ├── home.constant.ts
    ├── product.constant.ts
    ├── order.constant.ts
    ├── customer.constant.ts
    └── react-query-key.constant.ts   # tập trung toàn bộ React Query key
```

---

## 2. Quy tắc đặt tên

| Loại | Case | Ví dụ |
|---|---|---|
| Folder chứa component | **PascalCase** | `ProductList/`, `OrderItem/` |
| Folder khác (hooks, stores, page-components con) | **kebab-case** | `page-hooks/`, `order/`, `customer/` |
| File component | `<Name>.tsx` | `ProductList.tsx` |
| File hook (react-query) | `use-query-<domain>.ts` | `use-query-account.ts` |
| File hook (common/page) | `use-<name>.ts` | `use-cart-items.ts` |
| File store | `<name>.store.ts` | `cart.store.ts` |
| File constant | `<name>.constant.ts` | `order.constant.ts` |
| File page | `<Name>Page.tsx` | `OrderPage.tsx` |
| File service | `<module>.service.ts` | `account.service.ts` |
| Service (trong code) | camelCase, suffix `Service` | `accountService` |
| File DTO | `<module>.dto.ts` | `account.dto.ts` |
| File interface | `<domain>.interface.ts` | `invoice.interface.ts` |
| File type | `<domain>.type.ts` | `invoice.type.ts` |
| DTO / interface / type (trong code) | PascalCase | `CreateInvoiceBody`, `InvoiceRow`, `InvoiceStatus` |
| Component (trong code) | PascalCase | `export const ProductList` |
| Hook (trong code) | camelCase, prefix `use` | `useCartItems` |
| Store (trong code) | camelCase, prefix `use`, suffix `Store` | `useCartStore` |
| Constant value | UPPER_SNAKE_CASE | `MAX_CART_ITEMS` |
| React Query key group | UPPER_SNAKE_CASE, suffix `_KEYS`, object `as const` | `ACCOUNT_KEYS.LIST` |

⚠️ Lưu ý folder `page-components/Home/`, `page-components/Product/`... dùng **PascalCase** vì là folder gom component theo trang. Folder `page-hooks/home/`, `page-stores/order/`... dùng **kebab-case** vì không chứa component.

---

## 3. Cây quyết định đặt component

Khi tạo component mới, trả lời theo thứ tự:

**Câu 1: Component này là layout shell (header/sidebar/footer/topbar)?**
- Có → `components/layout/<Name>/<Name>.tsx`, prefix **Pos** bắt buộc
- Ví dụ: `components/layout/PosHeader/PosHeader.tsx`

**Câu 2: Component này được dùng ở 2+ trang khác nhau?**
- Có → `components/common/<Name>/<Name>.tsx`, prefix **Pos** bắt buộc
- Ví dụ: `components/common/PosButton/PosButton.tsx`

**Câu 3: Component chỉ phục vụ 1 trang?**
- Có → `components/page-components/<Trang>/<Name>/<Name>.tsx`
- **KHÔNG prefix Pos**
- Ví dụ: `components/page-components/Product/ProductFilterBar/ProductFilterBar.tsx`

**Câu 4: Component là child, chỉ dùng trong 1 component cha?**
- Có → nest vào folder cha
- Ví dụ: `ProductList/ProductItem/ProductItem.tsx`

### Cấm tuyệt đối
- ❌ Đặt component đặc thù 1 trang vào `common/` hoặc `layout/`
- ❌ Prefix `Pos` cho component trong `page-components/`
- ❌ Tạo component trực tiếp trong `pages/` (folder này CHỈ chứa file *Page.tsx)
- ❌ Tạo file `index.ts` ở bất kỳ đâu (xem mục 4)

---

## 4. Quy tắc import/export (CỰC KỲ QUAN TRỌNG)

### 4.1 Không dùng index.ts

**Dự án này KHÔNG sử dụng index.ts để re-export.** Mọi import phải trỏ trực tiếp đến file component.

```tsx
// ✅ ĐÚNG
import { ProductList } from '@/components/page-components/Product/ProductList/ProductList';
import { PosButton } from '@/components/common/PosButton/PosButton';
import { useCartStore } from '@/stores/common/cart.store';

// ❌ SAI - không có index.ts để re-export
import { ProductList } from '@/components/page-components/Product/ProductList';
import { PosButton } from '@/components/common/PosButton';
```

**Không được tự ý tạo `index.ts`** dù import trông có vẻ lặp. Đây là quyết định kiến trúc có chủ đích.

### 4.2 Named export, cấm default export

```tsx
// ✅ ĐÚNG
export const ProductList = ({ items }: ProductListProps) => { ... };

// ❌ SAI
const ProductList = ({ items }: ProductListProps) => { ... };
export default ProductList;
```

### 4.3 Path alias

Luôn dùng `@/` thay vì relative path nhiều cấp:

```tsx
// ✅ ĐÚNG
import { PosButton } from '@/components/common/PosButton/PosButton';

// ❌ SAI
import { PosButton } from '../../../components/common/PosButton/PosButton';
```

### 4.4 Cấu trúc file component

```tsx
// ProductList.tsx
import { useState } from 'react';
import { PosButton } from '@/components/common/PosButton/PosButton';

export interface ProductListProps {
  items: Product[];
  onSelect: (id: string) => void;
}

export const ProductList = ({ items, onSelect }: ProductListProps) => {
  // ...
  return ( /* ... */ );
};
```

Quy tắc:
- Interface props tên `<Component>Props`, **export named**
- Component dùng arrow function + named export
- 1 file = 1 component chính (child nest folder riêng)

---

## 5. Folder structure mẫu cho component

### Component không có child
```
PosButton/
└── PosButton.tsx
```

### Component có child
```
ProductList/
├── ProductList.tsx
└── ProductItem/
    └── ProductItem.tsx
```

### Component nhiều child
```
OrderSummary/
├── OrderSummary.tsx
├── OrderSummaryHeader/
│   └── OrderSummaryHeader.tsx
├── OrderSummaryItem/
│   └── OrderSummaryItem.tsx
└── OrderSummaryFooter/
    └── OrderSummaryFooter.tsx
```

---

## 6. Hooks

```
hooks/common/use-debounce.ts                  ← utility, KHÔNG dính React Query, dùng nhiều trang
hooks/react-query/use-query-account.ts        ← wrap useQuery / useMutation, gom theo domain
hooks/page-hooks/order/use-order-total.ts     ← logic UI / state chỉ dùng trong 1 trang
```

Quy tắc chung:
- 1 file = 1 hook
- Tên file kebab-case, tên hook camelCase prefix `use`
- Named export

### Cây quyết định đặt hook

Khi tạo hook mới, trả lời theo thứ tự:

**Câu 1: Hook này wrap React Query (`useQuery` / `useMutation` / `useInfiniteQuery` / `useSubscription`)?**
- Có → `src/hooks/react-query/use-query-<domain>.ts`
  - Đặt theo domain dữ liệu, **bắt buộc prefix `use-query-`**: `use-query-account.ts`, `use-query-invoice.ts`, `use-query-customer-group.ts`...
  - queryKey **bắt buộc** lấy từ `src/constants/react-query-key.constant.ts`, không hard-code chuỗi tại chỗ.
  - queryFn / mutationFn **bắt buộc** gọi service trong `src/services/<module>.service.ts`. Không tự gọi `http.get/post/...` bên trong hook.

**Câu 2: Hook không dính React Query và dùng ở 2+ trang?**
- Có → `src/hooks/common/use-<name>.ts`
- Ví dụ: `use-debounce.ts`, `use-hotkeys.ts`.

**Câu 3: Hook chỉ phục vụ 1 trang (state UI, focus manager, hotkey trang...)?**
- Có → `src/hooks/page-hooks/<trang>/use-<name>.ts`

### Cấm tuyệt đối

- ❌ Để hook React Query trong `common/` hoặc `page-hooks/`.
- ❌ Hard-code queryKey string trực tiếp ở hook hoặc component (phải đi qua `react-query-key.constant.ts`).
- ❌ Gọi `http.get / http.post / fetch / axios` trực tiếp trong hook React Query (phải đi qua service trong `src/services/`).
- ❌ Đặt hook utility (debounce, hotkey...) vào `react-query/`.

### Skeleton hook React Query

```ts
// src/hooks/react-query/use-query-account.ts
import { useQuery } from '@tanstack/react-query';
import { accountService } from '@erp/pos/services/account.service';
import { ACCOUNT_KEYS } from '@erp/pos/constants/react-query-key.constant';

export const usePaymentAccounts = () => {
  return useQuery({
    queryKey: ACCOUNT_KEYS.PAYMENT_LIST,
    queryFn: () => accountService.listPaymentAccounts(),
  });
};
```

### Skeleton hook utility / page-hook

```ts
// src/hooks/common/use-cart-items.ts
import { useMemo } from 'react';

export const useCartItems = () => {
  // ...
  return { items, total };
};
```

---

## 7. Stores (Zustand)

```
stores/common/cart.store.ts                   ← dùng nhiều trang
stores/page-stores/order/order-filter.store.ts ← chỉ trang Order
```

Quy tắc:
- 1 store = 1 file, đặt tên `<name>.store.ts`
- Hook trả về tên `use<Name>Store`
- Named export
- Tách type ra interface riêng trong cùng file

```ts
// cart.store.ts
import { create } from 'zustand';

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  clearCart: () => set({ items: [] }),
}));
```

Store dùng chung (auth, cart, user...) → `common/`. Store đặc thù 1 trang (filter UI, pagination state...) → `page-stores/<trang>/`.

---

## 8. Constants

- 1 file = 1 trang: `home.constant.ts`, `product.constant.ts`, ...
- Dùng chung: `common.constant.ts`
- UPPER_SNAKE_CASE cho giá trị, `as const` cho object

```ts
// order.constant.ts
export const MAX_ORDER_ITEMS = 99;

export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
```

### 8.1 React Query keys

Toàn bộ key React Query (query, mutation, subscription) **bắt buộc** tập trung tại `src/constants/react-query-key.constant.ts`. Mục tiêu: dễ quản lý, tránh trùng key, invalidate by prefix theo convention TanStack Query của monorepo (xem CLAUDE.md gốc — queryKey arrays start with the resource name).

Quy tắc:
- Group theo module dữ liệu, mỗi group là 1 object `<ENTITY>_KEYS as const`.
- Key trong group viết UPPER_SNAKE_CASE.
- Key có tham số → khai báo dạng function trả tuple `as const`, để TypeScript giữ literal type.
- **Tên trong tuple phải bắt đầu bằng tên resource** (để `queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.ALL })` invalidate được mọi key con của resource đó).

```ts
// src/constants/react-query-key.constant.ts
export const ACCOUNT_KEYS = {
  ALL: ['accounts'] as const,
  PAYMENT_LIST: ['accounts', 'payment-list'] as const,
  LIST: (filters: Record<string, unknown>) =>
    ['accounts', 'list', filters] as const,
  DETAIL: (id: string) => ['accounts', 'detail', id] as const,
} as const;

export const INVOICE_KEYS = {
  ALL: ['invoices'] as const,
  DRAFTS: ['invoices', 'drafts'] as const,
  DETAIL: (id: string) => ['invoices', 'detail', id] as const,
} as const;
```

Cấm tuyệt đối:
- ❌ Viết queryKey inline tại hook hoặc component (vd `useQuery({ queryKey: ['accounts', id], ... })`).
- ❌ Đặt key React Query ở bất kỳ file constant nào khác.
- ❌ Trộn lẫn 2 module trong cùng 1 group key.

---

## 9. Pages

Folder `pages/` chỉ chứa file route, đặt tên `<Name>Page.tsx`:

```
pages/
├── HomePage.tsx
├── ProductPage.tsx
├── OrderPage.tsx
└── CustomerPage.tsx
```

Page component **chỉ làm 3 việc**:
1. Compose layout + page-components
2. Gọi hook trang (từ `hooks/page-hooks/<trang>/`)
3. Kết nối store trang (từ `stores/page-stores/<trang>/`)

**KHÔNG viết business logic trực tiếp trong Page**. Tách ra hook hoặc store.

```tsx
// OrderPage.tsx
import { PosHeader } from '@/components/layout/PosHeader/PosHeader';
import { OrderList } from '@/components/page-components/Order/OrderList/OrderList';
import { OrderFilter } from '@/components/page-components/Order/OrderFilter/OrderFilter';
import { useOrderList } from '@/hooks/page-hooks/order/use-order-list';

export const OrderPage = () => {
  const { orders, isLoading } = useOrderList();

  return (
    <>
      <PosHeader />
      <OrderFilter />
      <OrderList items={orders} isLoading={isLoading} />
    </>
  );
};
```

---

## 10. Services

`src/services/` là **chỗ duy nhất** chứa hàm gọi API của pos-web. Tổ chức theo module dữ liệu: `account.service.ts`, `invoice.service.ts`, `customer.service.ts`...

Quy tắc:
- 1 file = 1 module dữ liệu. Tên file `<module>.service.ts` (kebab-case).
- Mỗi file export **1 object** `<module>Service` chứa tất cả method của module đó; không export rời từng hàm.
- Method chỉ làm 2 việc: dựng request (params/body) và trả response đã typed. **Không** chứa logic UI, **không** đụng store, **không** gọi React Query.
- Dùng `http` từ `@erp/pos/lib/common/http` để gọi backend.
- Entity (`AccountRow`, `InvoiceRow`...) khai báo trong `src/interfaces/<domain>.interface.ts` (mục 12); payload/params (`CreateInvoiceBody`, `ListAccountsParams`...) trong `src/dtos/<module>.dto.ts` (mục 11); union/enum domain trong `src/types/<domain>.type.ts` (mục 12.1). Service file **chỉ import**, không tự định nghĩa type.
- Named export, không default; **KHÔNG** tạo `index.ts`.

### Skeleton

```ts
// src/services/account.service.ts
import { http } from '@erp/pos/lib/common/http';
import type { AccountRow } from '@erp/pos/interfaces/account.interface';
import type { ListAccountsParams } from '@erp/pos/dtos/account.dto';
import type { Paginated } from '@erp/pos/interfaces/paginated.interface';

export const accountService = {
  listPaymentAccounts: async (): Promise<Paginated<AccountRow>> => {
    const params: ListAccountsParams = {
      page: 1,
      pageSize: 200,
      filters: { type: 'ASSET', isActive: true },
    };
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set('page', String(params.page));
    if (params.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
    if (params.filters) qs.set('filters', JSON.stringify(params.filters));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return http.get<Paginated<AccountRow>>(`/accounts${suffix}`);
  },
};
```

### Cấm tuyệt đối

- ❌ Gọi API trực tiếp trong component, page, store hoặc hook utility. Hook React Query trong `src/hooks/react-query/` là chỗ **duy nhất** được phép tiêu thụ service.
- ❌ Tạo file API kiểu `src/lib/common/<x>Api.ts` mới. Convention cũ — code mới đi qua `src/services/`.
- ❌ Trộn 2 module dữ liệu vào cùng 1 file service.

Code cũ còn nằm ở `src/lib/common/*Api.ts` hoặc gọi API trong `page-hooks/` → **báo cho tôi biết, không tự ý refactor** trừ khi tôi yêu cầu.

---

## 11. DTOs

`src/dtos/` chứa các shape **transient/transport**: payload / tham số / kiểu trả về của function, request body, query params. Tổ chức theo module dữ liệu — 1 file = 1 module. **Entity** (dữ liệu chuẩn của 1 đối tượng domain như `InvoiceRow`, `AccountRow`, `CustomerRow`) KHÔNG thuộc đây mà thuộc `interfaces/` (xem mục 12).

Quy tắc:
- Tên file kebab-case, **suffix BẮT BUỘC `.dto.ts`**: `account.dto.ts`, `invoice.dto.ts`, `customer-group.dto.ts`...
- Mỗi type/interface PascalCase, named export. Quy ước tên:
  - `<Action>Body` cho request body (vd `CreateInvoiceBody`, `CheckoutInvoiceBody`).
  - `<Action>Params` cho query params (vd `ListAccountsParams`).
- KHÔNG default export, KHÔNG `index.ts`.

### Skeleton

```ts
// src/dtos/invoice.dto.ts
import type { ApiPaymentMethod } from '@erp/pos/types/invoice.type';

export interface CreateInvoiceItemBody {
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceBody {
  sessionId: string;
  customerId?: string;
  items?: CreateInvoiceItemBody[];
}

export interface InvoicePaymentLineBody {
  paymentMethod: ApiPaymentMethod;
  amount: number;
  accountId: string;
}
```

### Cấm tuyệt đối

- ❌ Khai báo shape payload/params API ngoài `src/dtos/` (đặc biệt: KHÔNG inline trong `*.service.ts`, hook, hoặc component).
- ❌ Đặt entity (dữ liệu domain như `InvoiceRow`, `CustomerRow`) vào `dtos/` — chúng thuộc `interfaces/`.
- ❌ Đặt interface dùng chung (`Paginated<T>`, `ApiError`...) trong `dtos/` — chúng thuộc `interfaces/`.
- ❌ Trộn 2 module dữ liệu vào cùng 1 file DTO.
- ❌ Bỏ suffix `.dto.ts` (vd `account.ts` là sai).

---

## 12. Interfaces

`src/interfaces/` chứa **entity** — dữ liệu chuẩn của 1 đối tượng domain (`InvoiceRow`, `AccountRow`, `CustomerRow`, `CartLine`...) — và interface **dùng chung** cho nhiều module (`Paginated<T>`, `ApiError`...). Interface đóng vai trò như entity. Không phải props component.

Quy tắc:
- Tên file kebab-case, **suffix BẮT BUỘC `.interface.ts`**: `invoice.interface.ts`, `customer.interface.ts`, `paginated.interface.ts`...
- 1 file = 1 domain (gom các entity/interface gắn bó của domain đó, vd `Paginated<T>` + `PageMeta`).
- PascalCase, named export. KHÔNG default, KHÔNG `index.ts`.

### Skeleton

```ts
// src/interfaces/invoice.interface.ts
import type { InvoiceStatus } from '@erp/pos/types/invoice.type';

export interface InvoiceRow {
  id: string;
  code: string;
  status: InvoiceStatus;
  amountDue: number;
  // ...
}

// src/interfaces/paginated.interface.ts
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

### Cấm tuyệt đối

- ❌ Đặt shape payload/params đi kèm 1 lời gọi API (request body, query params) vào `interfaces/` — chúng thuộc `dtos/`.
- ❌ Đặt props component vào `interfaces/` (props sống cạnh component, named `<Component>Props`).
- ❌ Bỏ suffix `.interface.ts`.

---

## 12.1. Types

`src/types/` chứa khai báo bằng keyword `type` (union / alias) **không phải** entity cũng **không phải** payload/dto — vd `InvoiceStatus`, `PosCatalogDirection`, `CustomerDialogMode`, hoặc enum domain (`CheckoutVariantEnum`).

Quy tắc:
- Tên file kebab-case, **suffix BẮT BUỘC `.type.ts`**, 1 file = 1 domain: `invoice.type.ts`, `customer.type.ts`...
- PascalCase, named export. KHÔNG default, KHÔNG `index.ts`.
- Nếu một `type` thực chất đóng vai trò entity → chuyển sang `interfaces/`; nếu là payload/params → chuyển sang `dtos/`.

```ts
// src/types/invoice.type.ts
export type ApiPaymentMethod = 'cash' | 'bank_transfer' | 'card';
export type InvoiceStatus =
  | 'draft' | 'pending' | 'paid' | 'debt' | 'partial_debt' | 'cancelled';
```

> Interface/type chỉ dùng để định nghĩa **props của component UI** thì sống cạnh component đó (named `<Component>Props`), KHÔNG đưa vào `interfaces/` hay `types/`.

---

## 13. Checklist trước khi tạo file

Trước khi tạo file mới, Claude PHẢI verify:

- [ ] Đã chạy cây quyết định ở mục 3 (component) / mục 6 (hook)?
- [ ] Folder component dùng PascalCase, các folder khác kebab-case?
- [ ] Component trong `common/` hoặc `layout/` có prefix `Pos`?
- [ ] Component trong `page-components/` KHÔNG có prefix `Pos`?
- [ ] File đặt tên đúng pattern (xem bảng mục 2)?
- [ ] Named export, không default?
- [ ] **KHÔNG tạo file `index.ts`?**
- [ ] Import dùng `@/` và trỏ đến file đầy đủ?
- [ ] Page không chứa business logic, đã tách ra hook/store?
- [ ] Hook React Query nằm trong `src/hooks/react-query/`, KHÔNG nằm trong `common/` hay `page-hooks/`?
- [ ] queryKey lấy từ `react-query-key.constant.ts`, KHÔNG hard-code chuỗi tại chỗ?
- [ ] Hàm gọi API nằm trong `src/services/<module>.service.ts`, KHÔNG nằm trong hook / component / `lib/common/*Api.ts` mới?
- [ ] Component / page / store / hook utility KHÔNG gọi `http` trực tiếp?
- [ ] File DTO đặt trong `src/dtos/`, đuôi `.dto.ts`?
- [ ] File interface dùng chung đặt trong `src/interfaces/`, đuôi `.interface.ts`?
- [ ] Type request/response API có nằm trong `src/dtos/`, KHÔNG khai báo inline trong service / hook / component?
- [ ] Interface dùng chung (`Paginated<T>`...) có nằm trong `src/interfaces/`, KHÔNG nằm trong `dtos/`?

Nếu phát hiện code cũ vi phạm rule, **báo cho tôi biết, không tự ý refactor** trừ khi tôi yêu cầu.