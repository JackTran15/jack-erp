import { useCallback, useMemo, useState } from "react";
import type { PosCatalogLine } from "@erp/pos/lib/posCatalogApi";
import {
  ExchangePane,
  selectActiveSession,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/usePosCheckoutSessionStore";
import {
  type CartLine,
  type CatalogProduct,
  CheckoutVariantEnum,
} from "../components/types";
import { locationQtyFor } from "../lib/checkoutUtils";
import { netSessionGrandTotal } from "../lib/checkoutSessionTotals";

interface UseCheckoutSessionCartInput {
  announce: (message: string) => void;
}

export function useCheckoutSessionCart({
  announce,
}: UseCheckoutSessionCartInput) {
  const [cartError, setCartError] = useState("");

  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const session = usePosCheckoutSessionStore(selectActiveSession);

  const variant: CheckoutVariantEnum =
    session?.checkoutVariant ?? CheckoutVariantEnum.SALE;
  const purchaseCart = session?.purchaseCart ?? [];
  const returnCart = session?.returnCart ?? [];
  const activeExchangePane = session?.activeExchangePane ?? ExchangePane.RETURN;

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
      return activeExchangePane === ExchangePane.RETURN
        ? returnCart
        : purchaseCart;
    }
    return purchaseCart;
  }, [session, variant, activeExchangePane, returnCart, purchaseCart]);

  const selectedLineId = useMemo(() => {
    if (!session) return null;
    if (
      variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
      activeExchangePane === ExchangePane.RETURN
    ) {
      return session.selectedLineReturnId;
    }
    return session.selectedLinePurchaseId;
  }, [session, variant, activeExchangePane]);

  const setSelectedLineId = useCallback(
    (id: string | null) => {
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeExchangePane === ExchangePane.RETURN
      ) {
        setSelectedLineReturnId(id);
        return;
      }
      setSelectedLinePurchaseId(id);
    },
    [
      variant,
      activeExchangePane,
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
        activeExchangePane === ExchangePane.RETURN
      ) {
        updateReturnCart(session.id, updater);
        return;
      }
      updatePurchaseCart(session.id, updater);
    },
    [
      session,
      variant,
      activeExchangePane,
      updateReturnCart,
      updatePurchaseCart,
    ],
  );

  const addProduct = useCallback(
    (product: PosCatalogLine): string | null => {
      if (!session) return null;
      const atLocation = locationQtyFor(product);
      if (atLocation < 1) {
        setCartError("Hết tồn tại vị trí ưu tiên bán. Kiểm tra kho hàng.");
        return null;
      }

      // Read the latest cart state from the store so we can compute the
      // affected lineId BEFORE dispatching the update — caller (POS flow)
      // needs the id to focus the qty input of the just-added line.
      const latest = selectActiveSession(
        usePosCheckoutSessionStore.getState(),
      );
      const targetList =
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeExchangePane === ExchangePane.RETURN
          ? (latest?.returnCart ?? [])
          : (latest?.purchaseCart ?? []);
      const existing = targetList.find((l) => l.itemId === product.itemId);
      let affectedLineId: string;
      if (existing) {
        if (existing.qty + 1 > existing.maxQty) {
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
          if (existingInPrev.qty + 1 > existingInPrev.maxQty) return prev;
          setCartError("");
          return prev.map((l) =>
            l.itemId === product.itemId ? { ...l, qty: l.qty + 1 } : l,
          );
        }
        setCartError("");
        const newLine: CartLine = {
          lineId: affectedLineId,
          itemId: product.itemId,
          name: product.name,
          code: product.code,
          unit: product.unit,
          unitPrice: product.sellingPrice ?? 0,
          qty: 1,
          locationId: product.defaultLocationId,
          maxQty: atLocation,
        };
        if (activeExchangePane === ExchangePane.RETURN) {
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
      activeExchangePane,
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
      const n = Math.floor(Number.parseFloat(raw.replace(",", ".")) || 0);
      targetCartUpdater((prev) => {
        const line = prev.find((l) => l.lineId === lineId);
        if (!line) return prev;
        if (line.isReturnCredit) {
          const abs = Math.abs(n);
          const safe = Math.max(1, Math.min(line.maxQty, abs));
          return prev.map((l) =>
            l.lineId === lineId ? { ...l, qty: safe } : l,
          );
        }
        const safe = Math.max(1, Math.min(line.maxQty, n));
        return prev.map((l) => (l.lineId === lineId ? { ...l, qty: safe } : l));
      });
    },
    [targetCartUpdater],
  );

  const bumpQty = useCallback(
    (lineId: string, delta: number) => {
      targetCartUpdater((prev) => {
        const line = prev.find((x) => x.lineId === lineId);
        if (!line) return prev;
        const next = line.qty + delta;
        if (next < 1) return prev;
        if (next > line.maxQty) {
          setCartError("Số lượng vượt tồn kho.");
          return prev;
        }
        setCartError("");
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
          activeExchangePane === ExchangePane.RETURN
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
      activeExchangePane,
      setSelectedLineReturnId,
      setSelectedLinePurchaseId,
    ],
  );

  const isLineWarning = useCallback((line: CartLine) => {
    if (line.isReturnCredit) {
      return line.qty > line.maxQty || line.unitPrice <= 0;
    }
    return line.qty >= line.maxQty || line.unitPrice <= 0;
  }, []);

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
    activeExchangePane,
    cart,
    setCart: (next: CartLine[] | ((prev: CartLine[]) => CartLine[])) => {
      if (!session) return;
      const resolved = typeof next === "function" ? next(cart) : next;
      if (
        variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
        activeExchangePane === ExchangePane.RETURN
      ) {
        updateReturnCart(session.id, () => resolved);
      } else {
        updatePurchaseCart(session.id, () => resolved);
      }
    },
    selectedLineId,
    setSelectedLineId,
    cartError,
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
