import { useCallback, useMemo, useState } from "react";
import type { CatalogProduct, CartLine } from "../components/types";
import type { PosCatalogLine } from "@erp/pos/lib/posCatalogApi";
import { lineTotal, locationQtyFor } from "../lib/checkoutUtils";

interface UseCheckoutCartInput {
  announce: (message: string) => void;
}

export function useCheckoutCart({ announce }: UseCheckoutCartInput) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [cartError, setCartError] = useState("");

  const grandTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart],
  );

  const addProduct = useCallback(
    (product: PosCatalogLine) => {
      const atLocation = locationQtyFor(product);
      if (atLocation < 1) {
        setCartError("Hết tồn tại vị trí ưu tiên bán. Kiểm tra kho hàng.");
        return;
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.itemId === product.itemId);
        if (existing) {
          if (existing.qty + 1 > existing.maxQty) {
            setCartError("Đã đạt tối đa tồn tại vị trí bán cho mặt hàng này.");
            return prev;
          }
          setCartError("");
          return prev.map((l) =>
            l.itemId === product.itemId ? { ...l, qty: l.qty + 1 } : l,
          );
        }
        setCartError("");
        const newLine: CartLine = {
          lineId: crypto.randomUUID(),
          itemId: product.itemId,
          name: product.name,
          code: product.code,
          unit: product.unit,
          unitPrice: product.sellingPrice ?? 0,
          qty: 1,
          locationId: product.defaultLocationId,
          maxQty: atLocation,
        };
        setSelectedLineId(newLine.lineId);
        return [...prev, newLine];
      });
      announce(`Đã thêm ${product.name} vào giỏ hàng.`);
    },
    [announce],
  );

  const handleCatalogSelect = useCallback(
    (product: CatalogProduct, catalog: PosCatalogLine[]) => {
      const found = catalog.find((p) => p.itemId === product.id);
      if (!found) return;
      addProduct(found);
    },
    [addProduct],
  );

  const updateUnitPrice = useCallback((lineId: string, raw: string) => {
    const n = Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n } : l)),
    );
  }, []);

  const updateQty = useCallback((lineId: string, raw: string) => {
    const n = Math.floor(Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) => {
      const line = prev.find((l) => l.lineId === lineId);
      if (!line) return prev;
      const safe = Math.max(1, Math.min(line.maxQty, n));
      return prev.map((l) => (l.lineId === lineId ? { ...l, qty: safe } : l));
    });
  }, []);

  const bumpQty = useCallback((lineId: string, delta: number) => {
    setCart((prev) => {
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
  }, []);

  const removeLine = useCallback(
    (lineId: string) => {
      setCart((prev) => {
        const target = prev.find((l) => l.lineId === lineId);
        if (target) announce(`Đã xóa ${target.name} khỏi giỏ hàng.`);
        return prev.filter((l) => l.lineId !== lineId);
      });
      setSelectedLineId((id) => (id === lineId ? null : id));
    },
    [announce],
  );

  const isLineWarning = useCallback(
    (line: CartLine) => line.qty >= line.maxQty || line.unitPrice <= 0,
    [],
  );

  return {
    cart,
    setCart,
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
  };
}
