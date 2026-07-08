import { useCallback, useMemo } from "react";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  CheckoutPane,
  selectActiveSession,
  selectCatalogDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";
import type {
  CartLine,
  CartLineDiscount,
  CatalogProduct,
} from "@erp/pos/interfaces/checkout.interface";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import {
  isCartLineWarning,
  locationQtyFor,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  clampPosCheckoutQtyNumber,
  POS_CHECKOUT_QTY_MIN,
  safePosCheckoutQtyFromRaw,
} from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
import { clampReturnQty } from "@erp/pos/lib/page-libs/return-goods/returnGoodsMath";
import { netSessionGrandTotal } from "@erp/pos/lib/page-libs/checkout/checkoutSessionTotals";

export function useCheckoutSessionCart() {
  const announce = usePosCheckoutUiStore((s) => s.setAnnouncement);
  const cartError = usePosCheckoutUiStore((s) => s.cartError);
  const setCartError = usePosCheckoutUiStore((s) => s.setCartError);

  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);

  const session = usePosCheckoutSessionStore(selectActiveSession);

  const variant: CheckoutVariantEnum =
    session?.checkoutVariant ?? CheckoutVariantEnum.SALE;
  const purchaseCart = session?.purchaseCart ?? [];
  const returnCart = session?.returnCart ?? [];
  const activeCheckoutPane = session?.activeCheckoutPane ?? CheckoutPane.RETURN;

  const updatePurchaseCart = usePosCheckoutSessionStore(
    (s) => s.updatePurchaseCart,
  );
  const updateReturnCart = usePosCheckoutSessionStore(
    (s) => s.updateReturnCart,
  );
  const setSelectedLinePurchaseId = usePosCheckoutSessionStore(
    (s) => s.setSelectedLinePurchaseId,
  );
  const setSelectedLineReturnId = usePosCheckoutSessionStore(
    (s) => s.setSelectedLineReturnId,
  );

  // QUICK_EXCHANGE: hiển thị GỘP hàng trả + mua thêm cùng lúc (trả trước, mua sau).
  // SALE / INVOICE_RETURN: 1 cart (IR đã gộp sẵn return-credit + mua thêm).
  const cart = useMemo(() => {
    if (!session) return [];
    if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...returnCart, ...purchaseCart];
    }
    return purchaseCart;
  }, [session, variant, returnCart, purchaseCart]);

  // Id các dòng hàng trả của QUICK_EXCHANGE (nằm ở returnCart) — dùng để định
  // tuyến sửa/chọn theo từng dòng khi hiển thị gộp.
  const returnLineIds = useMemo(
    () =>
      variant === CheckoutVariantEnum.QUICK_EXCHANGE
        ? new Set(returnCart.map((l) => l.lineId))
        : new Set<string>(),
    [variant, returnCart],
  );

  /** Dòng có style hàng trả (nền hồng + SL âm): QE → thuộc returnCart; IR → isReturnCredit. */
  const isReturnLine = useCallback(
    (line: CartLine) =>
      Boolean(line.isReturnCredit) || returnLineIds.has(line.lineId),
    [returnLineIds],
  );

  /** Khóa sửa/xóa: chỉ dòng return-credit của INVOICE_RETURN. */
  const isLineLocked = useCallback(
    (line: CartLine) =>
      variant === CheckoutVariantEnum.INVOICE_RETURN &&
      Boolean(line.isReturnCredit),
    [variant],
  );

  const selectedLineId = useMemo(() => {
    if (!session) return null;
    if (
      variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
      activeCheckoutPane === CheckoutPane.RETURN
    ) {
      return session.selectedLineReturnId;
    }
    return session.selectedLinePurchaseId;
  }, [session, variant, activeCheckoutPane]);

  const setSelectedLineId = useCallback(
    (id: string | null) => {
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeCheckoutPane === CheckoutPane.RETURN
      ) {
        setSelectedLineReturnId(id);
        return;
      }
      setSelectedLinePurchaseId(id);
    },
    [
      variant,
      activeCheckoutPane,
      setSelectedLineReturnId,
      setSelectedLinePurchaseId,
    ],
  );

  const grandTotal = useMemo(
    () => netSessionGrandTotal(variant, purchaseCart, returnCart),
    [variant, purchaseCart, returnCart],
  );

  const targetCartUpdater = useCallback(
    (updater: (prev: CartLine[]) => CartLine[]) => {
      if (!session) return;
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeCheckoutPane === CheckoutPane.RETURN
      ) {
        updateReturnCart(session.id, updater);
        return;
      }
      updatePurchaseCart(session.id, updater);
    },
    [
      session,
      variant,
      activeCheckoutPane,
      updateReturnCart,
      updatePurchaseCart,
    ],
  );

  // Định tuyến SỬA theo từng dòng (không theo pane) — cần khi QE hiển thị gộp:
  // sửa 1 dòng hàng trả phải ghi vào returnCart dù pane đang là "Mua thêm".
  const updateCartForLine = useCallback(
    (lineId: string, updater: (prev: CartLine[]) => CartLine[]) => {
      if (!session) return;
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        returnLineIds.has(lineId)
      ) {
        updateReturnCart(session.id, updater);
        return;
      }
      updatePurchaseCart(session.id, updater);
    },
    [session, variant, returnLineIds, updateReturnCart, updatePurchaseCart],
  );

  const addProduct = useCallback(
    (product: PosCatalogLine, qtyToAdd = 1): string | null => {
      if (!session) return null;
      // Cho phép bán khống: KHÔNG chặn khi hết tồn. `atLocation` chỉ còn dùng làm
      // `maxQty` (snapshot tồn) để đánh dấu cảnh báo vượt tồn + bật dialog xác nhận
      // bán khống lúc thanh toán.
      const atLocation = locationQtyFor(product);
      const delta = clampPosCheckoutQtyNumber(Number(qtyToAdd) || 0);

      // Read the latest cart state from the store so we can compute the
      // affected lineId BEFORE dispatching the update — caller (POS flow)
      // needs the id to focus the qty input of the just-added line.
      const latest = selectActiveSession(usePosCheckoutSessionStore.getState());
      const targetList =
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeCheckoutPane === CheckoutPane.RETURN
          ? (latest?.returnCart ?? [])
          : (latest?.purchaseCart ?? []);
      const splitLine =
        selectCatalogDraft(usePosCheckoutSessionStore.getState()).toolbar
          .splitLine === true;
      // KHÔNG merge vào dòng đổi trả (INVOICE_RETURN, isReturnCredit) — dòng
      // đó bất biến theo hóa đơn gốc; sản phẩm trùng phải thành dòng mua riêng.
      const existing = splitLine
        ? undefined
        : targetList.find(
            (l) => l.itemId === product.itemId && !l.isReturnCredit,
          );
      const affectedLineId = existing ? existing.lineId : crypto.randomUUID();

      const apply = (prev: CartLine[]) => {
        const existingInPrev = splitLine
          ? undefined
          : prev.find((l) => l.itemId === product.itemId && !l.isReturnCredit);
        if (existingInPrev) {
          setCartError("");
          return prev.map((l) =>
            l.lineId === existingInPrev.lineId
              ? { ...l, qty: l.qty + delta }
              : l,
          );
        }
        const newLine: CartLine = {
          lineId: affectedLineId,
          itemId: product.itemId,
          name: product.name,
          code: product.code,
          unit: product.unit,
          unitPrice: product.sellingPrice ?? 0,
          qty: delta,
          locationId: product.defaultLocationId,
          maxQty: atLocation,
        };
        if (activeCheckoutPane === CheckoutPane.RETURN) {
          if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
            setSelectedLineReturnId(newLine.lineId);
          }
        } else {
          setSelectedLinePurchaseId(newLine.lineId);
        }
        return [...prev, newLine];
      };
      targetCartUpdater(apply);
      announce(`Đã thêm ${product.name} vào giỏ hàng.`);
      return affectedLineId;
    },
    [
      session,
      variant,
      activeCheckoutPane,
      targetCartUpdater,
      announce,
      setSelectedLinePurchaseId,
      setSelectedLineReturnId,
    ],
  );

  const handleCatalogSelect = useCallback(
    (product: CatalogProduct, catalog: PosCatalogLine[]): string | null => {
      const found = catalog.find((p) => p.itemId === product.id);
      if (!found) return null;
      return addProduct(found);
    },
    [addProduct],
  );

  const updateUnitPrice = useCallback(
    (lineId: string, raw: string) => {
      const n = Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0);
      updateCartForLine(lineId, (prev) =>
        prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n } : l)),
      );
    },
    [updateCartForLine],
  );

  const updateQty = useCallback(
    (lineId: string, raw: string) => {
      updateCartForLine(lineId, (prev) => {
        const line = prev.find((l) => l.lineId === lineId);
        if (!line) return prev;
        // SL âm cho mọi dòng hàng trả (QE returnCart hoặc IR return-credit) —
        // theo từng dòng, không theo pane (vì hiển thị gộp).
        const signedReturnUi = isReturnLine(line);
        const safe = safePosCheckoutQtyFromRaw(raw, {
          treatAsSignedReturnMagnitude: signedReturnUi,
        });
        let nextQty = safe;
        if (line.isReturnCredit) {
          const capped = clampReturnQty(safe, line.maxQty);
          nextQty = capped > 0 ? capped : POS_CHECKOUT_QTY_MIN;
        }
        return prev.map((l) =>
          l.lineId === lineId ? { ...l, qty: nextQty } : l,
        );
      });
    },
    [updateCartForLine, isReturnLine],
  );

  const bumpQty = useCallback(
    (lineId: string, delta: number) => {
      updateCartForLine(lineId, (prev) => {
        const line = prev.find((x) => x.lineId === lineId);
        if (!line) return prev;
        let next = line.qty + delta;
        if (next < 1) return prev;
        if (line.isReturnCredit) {
          next = Math.min(next, Math.max(line.maxQty, 1));
        }
        return prev.map((x) => (x.lineId === lineId ? { ...x, qty: next } : x));
      });
    },
    [updateCartForLine],
  );

  const updateLineDiscount = useCallback(
    (lineId: string, next: CartLineDiscount | null) => {
      updateCartForLine(lineId, (prev) =>
        prev.map((l) =>
          l.lineId === lineId
            ? { ...l, lineDiscount: next ?? undefined }
            : l,
        ),
      );
    },
    [updateCartForLine],
  );

  const updateLineNote = useCallback(
    (lineId: string, raw: string) => {
      const trimmed = raw.trim();
      updateCartForLine(lineId, (prev) =>
        prev.map((l) =>
          l.lineId === lineId
            ? { ...l, note: trimmed.length > 0 ? trimmed : undefined }
            : l,
        ),
      );
    },
    [updateCartForLine],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      const isReturnCartLine =
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        returnLineIds.has(lineId);
      updateCartForLine(lineId, (prev) => {
        const target = prev.find((l) => l.lineId === lineId);
        if (target) announce(`Đã xóa ${target.name} khỏi giỏ hàng.`);
        return prev.filter((l) => l.lineId !== lineId);
      });
      if (isReturnCartLine) {
        if (session?.selectedLineReturnId === lineId) {
          setSelectedLineReturnId(null);
        }
      } else if (session?.selectedLinePurchaseId === lineId) {
        setSelectedLinePurchaseId(null);
      }
    },
    [
      updateCartForLine,
      announce,
      session,
      variant,
      returnLineIds,
      setSelectedLineReturnId,
      setSelectedLinePurchaseId,
    ],
  );

  const isLineWarning = useCallback(
    (line: CartLine) => {
      // Dòng hàng trả không cảnh báo vượt tồn.
      if (isReturnLine(line)) return false;
      return isCartLineWarning(line);
    },
    [isReturnLine],
  );

  // Chọn / kiểm tra dòng đang chọn theo từng dòng (route theo cart của dòng).
  const selectLine = useCallback(
    (line: CartLine) => {
      // Bảng QE hiển thị gộp 2 nhóm → chỉ tô sáng 1 dòng tại 1 thời điểm.
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        returnLineIds.has(line.lineId)
      ) {
        setSelectedLineReturnId(line.lineId);
        setSelectedLinePurchaseId(null);
        return;
      }
      setSelectedLinePurchaseId(line.lineId);
      if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
        setSelectedLineReturnId(null);
      }
    },
    [variant, returnLineIds, setSelectedLineReturnId, setSelectedLinePurchaseId],
  );

  const isLineSelected = useCallback(
    (line: CartLine) => {
      if (!session) return false;
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        returnLineIds.has(line.lineId)
      ) {
        return session.selectedLineReturnId === line.lineId;
      }
      return session.selectedLinePurchaseId === line.lineId;
    },
    [session, variant, returnLineIds],
  );

  /** Combined line count for payment badge (sale / invoice_return). */
  const itemCountForPayment = useMemo(() => {
    if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return purchaseCart.length + returnCart.length;
    }
    return purchaseCart.length;
  }, [variant, purchaseCart, returnCart]);

  /** All purchase lines for draft save / receipt when single-table semantics. */
  const linesForDraftSingle = useMemo(() => {
    if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...returnCart, ...purchaseCart];
    }
    return purchaseCart;
  }, [variant, returnCart, purchaseCart]);

  return {
    activeSessionId,
    checkoutVariant: variant,
    purchaseCart,
    returnCart,
    activeCheckoutPane,
    cart,
    setCart: (next: CartLine[] | ((prev: CartLine[]) => CartLine[])) => {
      if (!session) return;
      const resolved = typeof next === "function" ? next(cart) : next;
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeCheckoutPane === CheckoutPane.RETURN
      ) {
        updateReturnCart(session.id, () => resolved);
      } else {
        updatePurchaseCart(session.id, () => resolved);
      }
    },
    selectedLineId,
    setSelectedLineId,
    setCartError,
    grandTotal,
    addProduct,
    handleCatalogSelect,
    updateUnitPrice,
    updateQty,
    bumpQty,
    updateLineDiscount,
    updateLineNote,
    removeLine,
    isLineWarning,
    isReturnLine,
    isLineLocked,
    selectLine,
    isLineSelected,
    itemCountForPayment,
    linesForDraftSingle,
  };
}
