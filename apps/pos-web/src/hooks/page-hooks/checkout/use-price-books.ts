import { useMemo } from "react";

export interface PriceBook {
  id: string;
  name: string;
}

// TODO: replace with API call
const PRICE_BOOK_OPTIONS: ReadonlyArray<PriceBook> = [
  { id: "default", name: "Bảng giá chuẩn" },
  { id: "vip", name: "Bảng giá VIP" },
  { id: "wholesale", name: "Bảng giá sỉ" },
];

export interface UsePriceBooksResult {
  priceBooks: ReadonlyArray<PriceBook>;
  isLoading: boolean;
  error: string | null;
}

export const usePriceBooks = (): UsePriceBooksResult => {
  return useMemo(
    () => ({
      priceBooks: PRICE_BOOK_OPTIONS,
      isLoading: false,
      error: null,
    }),
    [],
  );
};
