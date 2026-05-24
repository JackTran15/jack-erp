import { useCallback, useMemo } from "react";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  CheckoutPane,
  selectActiveSession,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";
import type {
  CartLine,
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

function isSignedNegativeQtyCart(
  variant: CheckoutVariantEnum,
  activeCheckoutPane: CheckoutPane,
): boolean {
  return (
    variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
    activeCheckoutPane === CheckoutPane.RETURN
  );
}

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

  const cart = useMemo(() => {
    if (!session) return [];
    if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return activeCheckoutPane === CheckoutPane.RETURN
        ? returnCart
        : purchaseCart;
    }
    return purchaseCart;
  }, [session, variant, activeCheckoutPane, returnCart, purchaseCart]);

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

  const addProduct = useCallback(
    (product: PosCatalogLine, qtyToAdd = 1): string | null => {
      if (!session) return null;
      const atLocation = locationQtyFor(product);
      const delta = clampPosCheckoutQtyNumber(Number(qtyToAdd) || 0);
      if (atLocation < 1) {
        setCartError("Hết tồn tại vị trí ưu tiên bán. Kiểm tra kho hàng.");
        return null;
      }

      // Read the latest cart state from the store so we can compute the
      // affected lineId BEFORE dispatching the update — caller (POS flow)
      // needs the id to focus the qty input of the just-added line.
      const latest = selectActiveSession(usePosCheckoutSessionStore.getState());
      const targetList =
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeCheckoutPane === CheckoutPane.RETURN
          ? (latest?.returnCart ?? [])
          : (latest?.purchaseCart ?? []);
      const existing = targetList.find((l) => l.itemId === product.itemId);
      let affectedLineId: string;
      if (existing) {
        if (existing.qty + delta > existing.maxQty) {
          setCartError("Đã đạt tối đa tồn tại vị trí bán cho mặt hàng này.");
          return null;
        }
        affectedLineId = existing.lineId;
      } else {
        affectedLineId = crypto.randomUUID();
      }

      const apply = (prev: CartLine[]) => {
        const existingInPrev = prev.find((l) => l.itemId === product.itemId);
        if (existingInPrev) {
          if (existingInPrev.qty + delta > existingInPrev.maxQty) return prev;
          setCartError("");
          return prev.map((l) =>
            l.itemId === product.itemId ? { ...l, qty: l.qty + delta } : l,
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
      targetCartUpdater((prev) =>
        prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n } : l)),
      );
    },
    [targetCartUpdater],
  );

  const updateQty = useCallback(
    (lineId: string, raw: string) => {
      targetCartUpdater((prev) => {
        const line = prev.find((l) => l.lineId === lineId);
        if (!line) return prev;
        const signedReturnUi =
          Boolean(line.isReturnCredit) ||
          isSignedNegativeQtyCart(variant, activeCheckoutPane);
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
    [targetCartUpdater, variant, activeCheckoutPane],
  );

  const bumpQty = useCallback(
    (lineId: string, delta: number) => {
      targetCartUpdater((prev) => {
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
    [targetCartUpdater],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      targetCartUpdater((prev) => {
        const target = prev.find((l) => l.lineId === lineId);
        if (target) announce(`Đã xóa ${target.name} khỏi giỏ hàng.`);
        return prev.filter((l) => l.lineId !== lineId);
      });
      if (selectedLineId === lineId) {
        if (
          variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
          activeCheckoutPane === CheckoutPane.RETURN
        ) {
          setSelectedLineReturnId(null);
        } else {
          setSelectedLinePurchaseId(null);
        }
      }
    },
    [
      targetCartUpdater,
      announce,
      selectedLineId,
      variant,
      activeCheckoutPane,
      setSelectedLineReturnId,
      setSelectedLinePurchaseId,
    ],
  );

  const isLineWarning = useCallback(
    (line: CartLine) => {
      if (isSignedNegativeQtyCart(variant, activeCheckoutPane)) {
        return false;
      }
      return isCartLineWarning(line);
    },
    [variant, activeCheckoutPane],
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
    removeLine,
    isLineWarning,
    itemCountForPayment,
    linesForDraftSingle,
  };
}
