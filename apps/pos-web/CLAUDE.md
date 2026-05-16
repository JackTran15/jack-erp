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
│   ├── common/
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
└── constants/
    ├── common.constant.ts
    ├── home.constant.ts
    ├── product.constant.ts
    ├── order.constant.ts
    └── customer.constant.ts
```

---

## 2. Quy tắc đặt tên

| Loại | Case | Ví dụ |
|---|---|---|
| Folder chứa component | **PascalCase** | `ProductList/`, `OrderItem/` |
| Folder khác (hooks, stores, page-components con) | **kebab-case** | `page-hooks/`, `order/`, `customer/` |
| File component | `<Name>.tsx` | `ProductList.tsx` |
| File hook | `use-<name>.ts` | `use-cart-items.ts` |
| File store | `<name>.store.ts` | `cart.store.ts` |
| File constant | `<name>.constant.ts` | `order.constant.ts` |
| File page | `<Name>Page.tsx` | `OrderPage.tsx` |
| Component (trong code) | PascalCase | `export const ProductList` |
| Hook (trong code) | camelCase, prefix `use` | `useCartItems` |
| Store (trong code) | camelCase, prefix `use`, suffix `Store` | `useCartStore` |
| Constant value | UPPER_SNAKE_CASE | `MAX_CART_ITEMS` |

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
hooks/common/use-debounce.ts                  ← dùng nhiều trang
hooks/page-hooks/order/use-order-total.ts     ← chỉ trang Order
```

Quy tắc:
- 1 file = 1 hook
- Tên file kebab-case, tên hook camelCase prefix `use`
- Named export

```ts
// use-cart-items.ts
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

## 10. Checklist trước khi tạo file

Trước khi tạo file mới, Claude PHẢI verify:

- [ ] Đã chạy cây quyết định ở mục 3?
- [ ] Folder component dùng PascalCase, các folder khác kebab-case?
- [ ] Component trong `common/` hoặc `layout/` có prefix `Pos`?
- [ ] Component trong `page-components/` KHÔNG có prefix `Pos`?
- [ ] File đặt tên đúng pattern (xem bảng mục 2)?
- [ ] Named export, không default?
- [ ] **KHÔNG tạo file `index.ts`?**
- [ ] Import dùng `@/` và trỏ đến file đầy đủ?
- [ ] Page không chứa business logic, đã tách ra hook/store?

Nếu phát hiện code cũ vi phạm rule, **báo cho tôi biết, không tự ý refactor** trừ khi tôi yêu cầu.