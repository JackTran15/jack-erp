import { useMemo } from "react";

export interface Salesperson {
  id: string;
  name: string;
  code: string;
}

// TODO: replace with API call
const SALESPERSON_OPTIONS: ReadonlyArray<Salesperson> = [
  { id: "nv01", code: "NV01", name: "Nguyễn Văn A" },
  { id: "nv02", code: "NV02", name: "Trần Thị B" },
  { id: "nv03", code: "NV03", name: "Lê Văn C" },
];

export interface UseSalespersonsResult {
  salespersons: ReadonlyArray<Salesperson>;
  isLoading: boolean;
  error: string | null;
}

export const useSalespersons = (): UseSalespersonsResult => {
  return useMemo(
    () => ({
      salespersons: SALESPERSON_OPTIONS,
      isLoading: false,
      error: null,
    }),
    [],
  );
};
